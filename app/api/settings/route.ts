// Global settings: the auto-travel master switch, its cooldown, and sound.

import { getSettings, saveSettings } from "@/lib/poe/config"
import { AUTO_TRAVEL_COOLDOWN_MAX_MS, AUTO_TRAVEL_COOLDOWN_MIN_MS, SOUND_NAMES } from "@/lib/poe/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  return Response.json(await getSettings())
}

interface SettingsPatch {
  autoTravelCooldownMs?: number
  soundEnabled?: boolean
  soundName?: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)))

export async function PATCH(req: Request): Promise<Response> {
  let body: SettingsPatch
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }

  const patch: SettingsPatch = {}
  if (typeof body.soundEnabled === "boolean") patch.soundEnabled = body.soundEnabled
  if (typeof body.soundName === "string" && (SOUND_NAMES as readonly string[]).includes(body.soundName)) {
    patch.soundName = body.soundName
  }

  // Clamp rather than reject: these are bounded to keep request rates sane, and
  // a slider out of range shouldn't fail the whole save.
  if (typeof body.autoTravelCooldownMs === "number" && Number.isFinite(body.autoTravelCooldownMs)) {
    patch.autoTravelCooldownMs = clamp(
      body.autoTravelCooldownMs,
      AUTO_TRAVEL_COOLDOWN_MIN_MS,
      AUTO_TRAVEL_COOLDOWN_MAX_MS,
    )
  }

  return Response.json({ ok: true, settings: await saveSettings(patch) })
}
