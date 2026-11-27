import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Buffer } from 'node:buffer'
import { createServer, request } from 'node:http'

/**
 * A relay between the command line and a server of the tests, on the
 * loopback: it passes each request on, with the `host` header of the server,
 * and counts the requests of each token. A rule can cut the answer of a
 * request after the server wrote it, answer 503 without passing the request
 * on, take a field out of a JSON answer, or run a step before passing it on.
 */

export interface RelayedRequest {
  method: string
  /** The path with its query. */
  path: string
  token: string
}

export interface RelayRule {
  matches: (request: RelayedRequest) => boolean
  /** `cut`: the server answers, and the relay closes the connection of the client without the answer. */
  cut?: boolean
  /** Answers 503 without passing the request on. */
  refuse?: boolean
  /** Takes this field out of the JSON body of the answer. */
  strip?: string
  /** Runs before the request is passed on. */
  before?: () => Promise<void>
  /** How many requests the rule applies to; 1 by default. */
  times?: number
}

/** The message of the server for a token over its 300 requests in 5 minutes, as `personal-token.ts` writes it. */
const TOKEN_LIMIT = 'Too many requests with this token, try again later'

/** The requests of one token that one case may send, half the limit of the server, so that a retry of Playwright stays under it. */
export const CASE_REQUEST_LIMIT = 150

export interface Relay {
  /** The origin the command line calls. */
  origin: string
  requests: RelayedRequest[]
  /** Adds a rule, tried before the rules added earlier. */
  rule: (rule: RelayRule) => void
  /** The requests of this token, after a check of the budget of a case. */
  count: (token: string) => number
  close: () => Promise<void>
}

const isWrite = (method: string) => method === 'POST' || method === 'PUT' || method === 'DELETE'

/** A request that writes, for a rule. */
export function writes(path?: RegExp): RelayRule['matches'] {
  return request => isWrite(request.method) && (!path || path.test(request.path))
}

function readAll(stream: IncomingMessage): Promise<Buffer> {
  return new Promise((done, failed) => {
    const chunks: Buffer[] = []
    stream.on('data', chunk => chunks.push(chunk))
    stream.on('end', () => done(Buffer.concat(chunks)))
    stream.on('error', failed)
  })
}

/** Starts a relay to the server at `port` on 127.0.0.1, which answers on `host`. */
export async function startRelay(target: { port: number, host: string }): Promise<Relay> {
  const requests: RelayedRequest[] = []
  const rules: (RelayRule & { left: number })[] = []
  const limited = new Set<string>()

  const pass = (incoming: IncomingMessage, body: Buffer) => new Promise<{ status: number, headers: IncomingMessage['headers'], body: Buffer }>((done, failed) => {
    const outgoing = request({ host: '127.0.0.1', port: target.port, method: incoming.method, path: incoming.url, headers: { ...incoming.headers, host: target.host } }, async (answer) => {
      try {
        done({ status: answer.statusCode ?? 502, headers: answer.headers, body: await readAll(answer) })
      }
      catch (error) {
        failed(error)
      }
    })
    outgoing.on('error', failed)
    outgoing.end(body)
  })

  const handle = async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    const body = await readAll(incoming)
    const token = /^Bearer\s+(\S+)$/i.exec(incoming.headers.authorization ?? '')?.[1] ?? ''
    const relayed = { method: incoming.method ?? 'GET', path: incoming.url ?? '/', token }
    requests.push(relayed)
    const rule = rules.find(rule => rule.left > 0 && rule.matches(relayed))
    if (rule)
      rule.left -= 1
    await rule?.before?.()
    if (rule?.refuse) {
      outgoing.writeHead(503, { 'content-type': 'application/json' })
      outgoing.end(JSON.stringify({ statusCode: 503, statusMessage: 'Refused by the relay of the tests' }))
      return
    }
    const answer = await pass(incoming, body)
    if (answer.status === 429 && answer.body.toString().includes(TOKEN_LIMIT))
      limited.add(token)
    if (rule?.cut) {
      outgoing.socket?.destroy()
      return
    }
    let sent = answer.body
    if (rule?.strip) {
      const json = JSON.parse(sent.toString())
      delete json[rule.strip]
      sent = Buffer.from(JSON.stringify(json))
    }
    const { 'content-length': _length, 'transfer-encoding': _encoding, connection: _connection, ...headers } = answer.headers
    outgoing.writeHead(answer.status, { ...headers, 'content-length': String(sent.length) })
    outgoing.end(sent)
  }

  const server = createServer((incoming, outgoing) => {
    handle(incoming, outgoing).catch((error) => {
      outgoing.writeHead(502, { 'content-type': 'text/plain' })
      outgoing.end(`The relay of the tests failed: ${error}`)
    })
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo

  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    rule: rule => rules.unshift({ ...rule, left: rule.times ?? 1 }),
    count: (token) => {
      if (limited.has(token))
        throw new Error('The test server counted more than 300 requests of this token in 5 minutes: wait 5 minutes, or stop the test server so that the next run starts a new one.')
      const count = requests.filter(request => request.token === token).length
      if (count > CASE_REQUEST_LIMIT)
        throw new Error(`A case sent ${count} requests with its token, more than the ${CASE_REQUEST_LIMIT} it may send.`)
      return count
    },
    close: () => new Promise((done) => {
      server.closeAllConnections()
      server.close(() => done())
    }),
  }
}
