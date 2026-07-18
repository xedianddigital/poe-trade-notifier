// Manual "Travel to Hideout".
//
// Whisper tokens expire 300s after they are issued, so the engine always
// re-fetches the listing for a fresh token before sending. This posts exactly
// what the official trade site's own button posts.

import { engine } from "@/lib/poe/live-engine"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<Response> {
  let body: { listingId?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }

  const listingId = body.listingId?.trim()
  if (!listingId) {
    return Response.json({ ok: false, error: "listingId is required." }, { status: 400 })
  }

  const result = await engine.travelTo(listingId)
  return Response.json(result, { status: result.ok ? 200 : 409 })
}
