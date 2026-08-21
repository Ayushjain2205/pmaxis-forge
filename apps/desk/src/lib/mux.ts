export type MuxEnvelope = {
  type: string
  rpcId?: string
  method?: string
  payload?: Record<string, unknown>
}

export function connectMux(onFrame: (payload: Record<string, unknown>, rpcId?: string) => void) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}/api/events.mux`)
  ws.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as MuxEnvelope
      if (msg.payload && typeof msg.payload === 'object') {
        onFrame(msg.payload, msg.rpcId)
      }
    } catch {
      /* drop malformed frames */
    }
  })
  return ws
}
