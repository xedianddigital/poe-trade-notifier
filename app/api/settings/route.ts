// Global settings: the auto-travel master switch, its cooldown, and sound.

import { getSettings, saveSettings } from "@/lib/poe/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  return Response.json(await getSettings())
}

export async function PATCH(req: Request): Promise<Response> {
  let body: { autoTravelEnabled?: boolean; autoTravelCooldownMs?: number; soundEnabled?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }

  const patch: typeof body = {}
  if (typeof body.autoTravelEnabled === "boolean") patch.autoTravelEnabled = body.autoTravelEnabled
  if (typeof body.soundEnabled === "boolean") patch.soundEnabled = body.soundEnabled
  if (typeof body.autoTravelCooldownMs === "number" && Number.isFinite(body.autoTravelCooldownMs)) {
    // Floor at 1s so an accidental 0 can't spam whispers.
    patch.autoTravelCooldownMs = Math.max(1000, Math.round(body.autoTravelCooldownMs))
  }

  return Response.json({ ok: true, settings: await saveSettings(patch) })
}
