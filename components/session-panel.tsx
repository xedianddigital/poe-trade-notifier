"use client"

// Session setup: one-click detection from the local browser profile, with
// manual paste as the always-available fallback (Chrome 127+ on Windows cannot
// be read externally at all, by design).

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

interface SessionInfo {
  configured: boolean
  valid?: boolean
  reason?: string
  userAgent?: string
  updatedAt?: number
  has?: { poesessid: boolean; poetoken: boolean; cfClearance: boolean }
}

export function SessionPanel({ onChanged }: { onChanged: () => void }) {
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [form, setForm] = useState({ poesessid: "", poetoken: "", cfClearance: "" })

  const refresh = async () => {
    try {
      const res = await fetch("/api/session", { cache: "no-store" })
      setInfo(await res.json())
    } catch {
      setInfo(null)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const detect = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch("/api/session/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The real UA beats any reconstruction: cf_clearance is bound to it.
        body: JSON.stringify({ userAgent: navigator.userAgent }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setNotice({ kind: "error", text: data.error ?? "Detection failed." })
      } else if (data.warning) {
        setNotice({ kind: "warn", text: data.warning })
      } else {
        setNotice({
          kind: data.valid ? "ok" : "warn",
          text: data.valid
            ? `Found ${data.found.join(", ")} in ${data.source}. Session is valid.`
            : `Read cookies from ${data.source}, but the API rejected them: ${data.reason ?? "unknown"}`,
        })
      }
      await refresh()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const saveManual = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, userAgent: navigator.userAgent }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setNotice({ kind: "error", text: data.error ?? "Could not save." })
      } else {
        setNotice({
          kind: data.valid ? "ok" : "warn",
          text: data.valid ? "Session saved and validated." : `Saved, but rejected: ${data.reason}`,
        })
        setForm({ poesessid: "", poetoken: "", cfClearance: "" })
        setManualOpen(false)
      }
      await refresh()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      await fetch("/api/session", { method: "DELETE" })
      setNotice(null)
      await refresh()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Session</h2>
        <StatusPill info={info} />
      </div>

      {info?.configured && (
        <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <dt>Cookies</dt>
          <dd className="font-mono">
            {[
              info.has?.poesessid && "POESESSID",
              info.has?.poetoken && "POETOKEN",
              info.has?.cfClearance && "cf_clearance",
            ]
              .filter(Boolean)
              .join(" · ") || "none"}
          </dd>
          <dt>User-Agent</dt>
          <dd className="truncate font-mono" title={info.userAgent}>
            {info.userAgent || "—"}
          </dd>
        </dl>
      )}

      {notice && (
        <p
          className={`mb-3 rounded-md px-3 py-2 text-xs ${
            notice.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-400"
              : notice.kind === "warn"
                ? "bg-amber-500/10 text-amber-400"
                : "bg-destructive/10 text-destructive"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={detect} disabled={busy}>
          {busy ? "Working…" : "Detect from browser"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setManualOpen((v) => !v)}>
          {manualOpen ? "Hide manual" : "Paste manually"}
        </Button>
        {info?.configured && (
          <Button size="sm" variant="ghost" onClick={clear} disabled={busy}>
            Clear
          </Button>
        )}
      </div>

      {manualOpen && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            In your browser on pathofexile.com: DevTools → Application → Cookies. Copy the values.
            POETOKEN is optional.
          </p>
          {(
            [
              ["poesessid", "POESESSID (required)"],
              ["cfClearance", "cf_clearance"],
              ["poetoken", "POETOKEN (optional)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
              <input
                type="text"
                spellCheck={false}
                autoComplete="off"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          ))}
          <Button size="sm" onClick={saveManual} disabled={busy || !form.poesessid.trim()}>
            Save session
          </Button>
        </div>
      )}
    </section>
  )
}

function StatusPill({ info }: { info: SessionInfo | null }) {
  if (!info) return <Pill tone="muted">checking…</Pill>
  if (!info.configured) return <Pill tone="muted">not configured</Pill>
  if (info.valid) return <Pill tone="ok">valid</Pill>
  return <Pill tone="error">{info.reason ? "invalid" : "unvalidated"}</Pill>
}

function Pill({ tone, children }: { tone: "ok" | "error" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-400"
      : tone === "error"
        ? "bg-destructive/15 text-destructive"
        : "bg-muted text-muted-foreground"
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}
