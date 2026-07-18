// Server-Sent Events stream: every listing, status change and log line the
// engine produces, pushed to the UI over one long-lived connection.

import { engine } from "@/lib/poe/live-engine"
import type { ServerEvent } from "@/lib/poe/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Comment frame every 25s so proxies don't idle the connection out. */
const KEEPALIVE_MS = 25_000

export async function GET(req: Request): Promise<Response> {
  // Attaching a client is a good moment to reconcile sockets with config.
  await engine.sync()

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false

      const send = (event: ServerEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          closed = true
        }
      }

      const { listings, statuses } = engine.getState()
      send({ type: "snapshot", listings, statuses })

      const onEvent = (event: ServerEvent) => send(event)
      engine.events.on("event", onEvent)

      const keepalive = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"))
        } catch {
          closed = true
        }
      }, KEEPALIVE_MS)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(keepalive)
        engine.events.off("event", onEvent)
        try {
          controller.close()
        } catch {
          // Already closed by the client.
        }
      }

      req.signal.addEventListener("abort", cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering so events arrive immediately.
      "X-Accel-Buffering": "no",
    },
  })
}
