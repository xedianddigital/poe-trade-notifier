"use client"

import { useCallback, useEffect, useState } from "react"
import { SessionPanel } from "@/components/session-panel"
import { SearchPanel } from "@/components/search-panel"
import { ListingFeed } from "@/components/listing-feed"
import { useLiveFeed } from "@/components/use-live-feed"
import { DEFAULT_SETTINGS, type Settings } from "@/lib/poe/types"

export function Dashboard() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [sessionKey, setSessionKey] = useState(0)

  const feed = useLiveFeed(settings.soundEnabled)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" })
        setSettings(await res.json())
      } catch {
        // Keep defaults.
      }
    })()
  }, [])

  const patchSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch })) // optimistic
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (data.settings) setSettings(data.settings)
    } catch {
      // The optimistic value stands; next load reconciles.
    }
  }, [])

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">PoE Trade Notifier</h1>
          <p className="text-xs text-muted-foreground">
            Runs locally. Your cookies never leave this machine.
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={`h-2 w-2 rounded-full ${
              feed.connected ? "bg-emerald-500" : "bg-destructive animate-pulse"
            }`}
          />
          {feed.connected ? "stream live" : "stream down"}
        </span>
      </header>

      {feed.sessionValid === false && feed.sessionMessage && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {feed.sessionMessage}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <SessionPanel key={sessionKey} onChanged={() => setSessionKey((k) => k + 1)} />

          <SearchPanel statuses={feed.statuses} autoTravelEnabled={settings.autoTravelEnabled} />

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Settings</h2>

            <label className="flex items-center justify-between gap-3 py-1 text-xs">
              <span>
                Auto-travel
                <span className="ml-1.5 text-muted-foreground">(master switch)</span>
              </span>
              <input
                type="checkbox"
                checked={settings.autoTravelEnabled}
                onChange={(e) => patchSettings({ autoTravelEnabled: e.target.checked })}
                className="accent-amber-500"
              />
            </label>

            <label className="flex items-center justify-between gap-3 py-1 text-xs">
              <span>Cooldown per search</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={Math.round(settings.autoTravelCooldownMs / 1000)}
                  onChange={(e) =>
                    patchSettings({ autoTravelCooldownMs: Number(e.target.value) * 1000 })
                  }
                  className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-xs outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-muted-foreground">s</span>
              </span>
            </label>

            <label className="flex items-center justify-between gap-3 py-1 text-xs">
              <span>Sound on new listing</span>
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={(e) => patchSettings({ soundEnabled: e.target.checked })}
                className="accent-amber-500"
              />
            </label>

            {settings.autoTravelEnabled && (
              <p className="mt-2 rounded-md bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-400">
                Auto-travel whispers sellers automatically on your account. Keep the cooldown
                sane and don't leave it running unattended.
              </p>
            )}
          </section>

          {feed.logs.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">Activity</h2>
              <ul className="space-y-1">
                {feed.logs.slice(0, 12).map((line) => (
                  <li
                    key={line.id}
                    className={`text-[11px] ${
                      line.level === "error"
                        ? "text-destructive"
                        : line.level === "warn"
                          ? "text-amber-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {line.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Feed</h2>
            <span className="text-xs text-muted-foreground">{feed.listings.length} listings</span>
          </div>
          <ListingFeed listings={feed.listings} onWhisperState={feed.setWhisperState} />
        </div>
      </div>
    </main>
  )
}
