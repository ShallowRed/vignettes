import { randomBytes } from 'node:crypto'
import { serverConfig } from '../utils/config'
import { pagePolicy, STRICT_TRANSPORT_SECURITY } from '../utils/security-headers'

const SCRIPT_TAG = /<script\b/g

/**
 * The headers that depend on the request, next to the fixed ones of the `/**`
 * route rule.
 *
 * A rendered page gets a nonce policy. The renderer writes its own scripts in
 * the head and at the end of the body; the nonce goes on those two sections
 * only, since the body holds the rendered deck. The nuxt-security module puts
 * its nonce on every section, the body included, so a script written in a
 * deck's Markdown would carry it too:
 * https://github.com/Baroshem/nuxt-security/blob/main/src/runtime/nitro/plugins/40-cspSsrNonce.ts
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    if (getRequestProtocol(event) === 'https')
      setResponseHeader(event, 'Strict-Transport-Security', STRICT_TRANSPORT_SECURITY)
  })

  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const nonce = randomBytes(16).toString('base64')
    html.head = html.head.map(chunk => chunk.replace(SCRIPT_TAG, `<script nonce="${nonce}"`))
    html.bodyAppend = html.bodyAppend.map(chunk => chunk.replace(SCRIPT_TAG, `<script nonce="${nonce}"`))
    setResponseHeader(event, 'Content-Security-Policy', pagePolicy(nonce, serverConfig().telemetryOrigins))
  })

  nitroApp.hooks.hook('render:response', (response) => {
    delete response.headers?.['x-powered-by']
  })
})
