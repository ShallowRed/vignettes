import { MAX_MESSAGE_BYTES } from '../utils/collab'

/**
 * The default `maxPayload` of `ws` reads 100 MiB into memory before the /collab
 * route refuses a message past `MAX_MESSAGE_BYTES`. The configuration of Nitro 2
 * sets the WebSocket support by the boolean `experimental.websocket` alone. Its
 * node server builds the WebSocket server from the `websocket` options of the
 * h3 app once the plugins have run, and the node adapter of crossws hands their
 * `serverOptions` to `ws`: https://crossws.h3.dev/adapters/node
 */
export default defineNitroPlugin((nitroApp) => {
  const { options } = nitroApp.h3App
  Object.assign(options, { websocket: { ...options.websocket, serverOptions: { maxPayload: MAX_MESSAGE_BYTES } } })
})
