"use client"

import { Button } from "@/components/ui/button"
import { SOUND_NAMES, type Settings } from "@/lib/poe/types"
import { SOUND_LABELS, playSound } from "@/components/sounds"

export function OptionsModal({
  open,
  settings,
  onPatch,
  onClose,
}: {
  open: boolean
  settings: Settings
  onPatch: (patch: Partial<Settings>) => void
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Options</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <label className="flex items-center justify-between gap-3 py-1.5 text-xs">
          <span className="font-medium">Play a sound on match</span>
          <input
            type="checkbox"
            checked={settings.soundEnabled}
            onChange={(e) => onPatch({ soundEnabled: e.target.checked })}
            className="size-4 accent-emerald-500"
          />
        </label>

        <div className={`mt-2 space-y-1.5 ${settings.soundEnabled ? "" : "opacity-50"}`}>
          <p className="text-[11px] text-muted-foreground">Sound</p>
          {SOUND_NAMES.map((name) => (
            <div key={name} className="flex items-center gap-2">
              <label className="flex flex-1 items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="sound"
                  checked={settings.soundName === name}
                  disabled={!settings.soundEnabled}
                  onChange={() => onPatch({ soundName: name })}
                  className="accent-emerald-500"
                />
                {SOUND_LABELS[name]}
              </label>
              <button
                onClick={() => playSound(name)}
                disabled={!settings.soundEnabled}
                className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Test
              </button>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
