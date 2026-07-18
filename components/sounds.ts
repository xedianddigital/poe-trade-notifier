"use client"

// Notification sounds, synthesised with WebAudio so nothing needs bundling.
// Each is a short, distinct cue the user can pick between in Options.

type Tone = { freq: number; start: number; dur: number; type?: OscillatorType }

const PATTERNS: Record<string, Tone[]> = {
  // Two rising notes.
  chime: [
    { freq: 660, start: 0, dur: 0.12 },
    { freq: 990, start: 0.1, dur: 0.16 },
  ],
  // Single clean high blip.
  ping: [{ freq: 1180, start: 0, dur: 0.14 }],
  // Quick "coin" — bright, two fast descending notes with a square edge.
  coin: [
    { freq: 1320, start: 0, dur: 0.07, type: "square" },
    { freq: 990, start: 0.06, dur: 0.14, type: "square" },
  ],
  // Insistent triple beep.
  alert: [
    { freq: 880, start: 0, dur: 0.09 },
    { freq: 880, start: 0.14, dur: 0.09 },
    { freq: 880, start: 0.28, dur: 0.12 },
  ],
}

export const SOUND_LABELS: Record<string, string> = {
  chime: "Chime",
  ping: "Ping",
  coin: "Coin",
  alert: "Alert",
}

export function playSound(name: string): void {
  const pattern = PATTERNS[name] ?? PATTERNS.chime
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    let end = now
    for (const t of pattern) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = t.type ?? "sine"
      osc.frequency.value = t.freq
      const s = now + t.start
      const e = s + t.dur
      gain.gain.setValueAtTime(0.0001, s)
      gain.gain.exponentialRampToValueAtTime(0.25, s + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, e)
      osc.connect(gain).connect(ctx.destination)
      osc.start(s)
      osc.stop(e + 0.02)
      end = Math.max(end, e)
    }
    setTimeout(() => void ctx.close(), Math.ceil((end - now) * 1000) + 120)
  } catch {
    // Autoplay policy blocked it, or no audio device. Not worth surfacing.
  }
}
