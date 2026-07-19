// Manual escape hatch for the purchase-window cooldown. See
// LiveEngine.resetCooldown for why this exists: whisper-based travel resolves
// inside the user's own game client, which this app can't see or detect a
// delay in, so there's no automatic fix - only a way for the user to force a
// clean state by hand.

import { engine } from "@/lib/poe/live-engine"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(): Promise<Response> {
  engine.resetCooldown()
  return Response.json({ ok: true })
}
