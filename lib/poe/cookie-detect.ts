// Best-effort, LOCAL-ONLY reader for the three pathofexile.com cookies plus a
// matching User-Agent, so the "Detect from browser" button can populate the
// session in one click.
//
// This reads your own browser's on-disk cookie store (the cookies are HttpOnly,
// so a page script cannot read them - only a local process can). It never sends
// anything anywhere. If a platform/browser combination isn't supported or is
// blocked (e.g. Chrome app-bound "v20" encryption), it returns a clear reason
// and the UI falls back to manual paste.

import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const WANTED = ["POESESSID", "POETOKEN", "cf_clearance"] as const
type WantedCookie = (typeof WANTED)[number]

export interface DetectedSession {
  poesessid?: string
  poetoken?: string
  cfClearance?: string
  userAgent?: string
  source: string
}

export interface DetectResult {
  ok: boolean
  session?: DetectedSession
  reason?: string
  /** Which cookies were found (helps the UI tell the user what's missing). */
  found: WantedCookie[]
}

const HOST_MATCH = (host: string) =>
  host === "pathofexile.com" ||
  host === ".pathofexile.com" ||
  host === "www.pathofexile.com" ||
  host.endsWith(".pathofexile.com")

// ---------- Chrome / Edge (Chromium) ----------

interface ChromiumPaths {
  userData: string
  label: string
}

function chromiumCandidates(): ChromiumPaths[] {
  const home = os.homedir()
  const platform = process.platform
  const out: ChromiumPaths[] = []
  if (platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local")
    out.push({ userData: path.join(local, "Google", "Chrome", "User Data"), label: "Chrome" })
    out.push({ userData: path.join(local, "Microsoft", "Edge", "User Data"), label: "Edge" })
    out.push({ userData: path.join(local, "BraveSoftware", "Brave-Browser", "User Data"), label: "Brave" })
  } else if (platform === "darwin") {
    const appSup = path.join(home, "Library", "Application Support")
    out.push({ userData: path.join(appSup, "Google", "Chrome"), label: "Chrome" })
    out.push({ userData: path.join(appSup, "Microsoft Edge"), label: "Edge" })
    out.push({ userData: path.join(appSup, "BraveSoftware", "Brave-Browser"), label: "Brave" })
  } else {
    const config = path.join(home, ".config")
    out.push({ userData: path.join(config, "google-chrome"), label: "Chrome" })
    out.push({ userData: path.join(config, "microsoft-edge"), label: "Edge" })
    out.push({ userData: path.join(config, "BraveSoftware", "Brave-Browser"), label: "Brave" })
  }
  return out
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function dpapiUnprotect(buf: Buffer): Promise<Buffer> {
  // Windows-only: unprotect via PowerShell + System.Security.Cryptography.ProtectedData.
  const b64 = buf.toString("base64")
  const script = [
    "Add-Type -AssemblyName System.Security;",
    `$b=[Convert]::FromBase64String('${b64}');`,
    "$o=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');",
    "[Convert]::ToBase64String($o)",
  ].join(" ")
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ])
  return Buffer.from(stdout.trim(), "base64")
}

async function getChromiumAesKey(userData: string): Promise<Buffer> {
  const localStatePath = path.join(userData, "Local State")
  const raw = await fs.readFile(localStatePath, "utf8")
  const json = JSON.parse(raw) as { os_crypt?: { encrypted_key?: string } }
  const encKeyB64 = json.os_crypt?.encrypted_key
  if (!encKeyB64) throw new Error("No os_crypt.encrypted_key in Local State.")
  const encKey = Buffer.from(encKeyB64, "base64")
  // Strip the "DPAPI" prefix (5 bytes) then DPAPI-unprotect (Windows only).
  if (process.platform !== "win32") {
    throw new Error("Chromium cookie decryption is only implemented for Windows in this build.")
  }
  const withoutPrefix = encKey.subarray(5)
  return dpapiUnprotect(withoutPrefix)
}

function decryptChromiumValue(encrypted: Buffer, aesKey: Buffer): string | null {
  if (encrypted.length === 0) return null
  const prefix = encrypted.subarray(0, 3).toString("latin1")
  if (prefix === "v10" || prefix === "v11") {
    const nonce = encrypted.subarray(3, 15)
    const tag = encrypted.subarray(encrypted.length - 16)
    const ciphertext = encrypted.subarray(15, encrypted.length - 16)
    const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, nonce)
    decipher.setAuthTag(tag)
    let out = decipher.update(ciphertext)
    out = Buffer.concat([out, decipher.final()])
    // Newer Chrome prepends a 32-byte header to the plaintext for some cookies.
    const text = out.toString("utf8")
    return text
  }
  if (prefix === "v20") {
    // App-bound encryption (Chrome 127+) - requires app-bound key we can't access.
    throw new Error("APP_BOUND")
  }
  // Legacy: DPAPI-encrypted directly (older Chrome) - handled by caller on win32.
  return null
}

async function readChromiumVersion(userData: string): Promise<string | null> {
  try {
    const v = await fs.readFile(path.join(userData, "Last Version"), "utf8")
    return v.trim()
  } catch {
    return null
  }
}

function buildChromeUA(version: string | null, label: string): string {
  const major = version ? version.split(".")[0] : "120"
  const platform = process.platform
  const osToken =
    platform === "win32"
      ? "Windows NT 10.0; Win64; x64"
      : platform === "darwin"
        ? "Macintosh; Intel Mac OS X 10_15_7"
        : "X11; Linux x86_64"
  const brand =
    label === "Edge"
      ? ` Edg/${major}.0.0.0`
      : label === "Brave"
        ? ""
        : ""
  return `Mozilla/5.0 (${osToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36${brand}`
}

async function tryChromium(): Promise<DetectResult> {
  const reasons: string[] = []
  let sqlite: typeof import("better-sqlite3") | null = null
  try {
    // Lazy-load: the app must not crash if the native binary isn't built.
    sqlite = (await import("better-sqlite3")).default as unknown as typeof import("better-sqlite3")
  } catch (err) {
    return {
      ok: false,
      found: [],
      reason: `Could not load the SQLite reader (${(err as Error).message}). Use manual paste.`,
    }
  }

  for (const cand of chromiumCandidates()) {
    if (!(await exists(cand.userData))) continue
    // Cookies live under the profile; check Default first, then Profile *.
    const profileDirs = ["Default", "Profile 1", "Profile 2", "Profile 3"]
    for (const profile of profileDirs) {
      const cookiesPath = path.join(cand.userData, profile, "Network", "Cookies")
      const legacyCookiesPath = path.join(cand.userData, profile, "Cookies")
      const dbPath = (await exists(cookiesPath))
        ? cookiesPath
        : (await exists(legacyCookiesPath))
          ? legacyCookiesPath
          : null
      if (!dbPath) continue

      try {
        const aesKey = await getChromiumAesKey(cand.userData)
        // Copy the (possibly locked) DB to a temp file before opening.
        const tmp = path.join(os.tmpdir(), `poe-cookies-${Date.now()}.db`)
        await fs.copyFile(dbPath, tmp)
        const found: Partial<Record<WantedCookie, string>> = {}
        let appBound = false
        try {
          const db = new sqlite(tmp, { readonly: true, fileMustExist: true })
          const rows = db
            .prepare("SELECT host_key, name, encrypted_value FROM cookies WHERE name IN (?,?,?)")
            .all(...WANTED) as { host_key: string; name: WantedCookie; encrypted_value: Buffer }[]
          db.close()
          for (const row of rows) {
            if (!HOST_MATCH(row.host_key)) continue
            try {
              const value = decryptChromiumValue(Buffer.from(row.encrypted_value), aesKey)
              if (value) found[row.name] = sanitize(value)
            } catch (e) {
              if ((e as Error).message === "APP_BOUND") appBound = true
            }
          }
        } finally {
          await fs.rm(tmp, { force: true })
        }

        const foundKeys = Object.keys(found) as WantedCookie[]
        if (foundKeys.length > 0) {
          const version = await readChromiumVersion(cand.userData)
          return {
            ok: true,
            found: foundKeys,
            session: {
              poesessid: found.POESESSID,
              poetoken: found.POETOKEN,
              cfClearance: found.cf_clearance,
              userAgent: buildChromeUA(version, cand.label),
              source: `${cand.label} (${profile})`,
            },
          }
        }
        if (appBound) {
          reasons.push(
            `${cand.label}: cookies use app-bound encryption (Chrome 127+) which can't be read externally.`,
          )
        }
      } catch (err) {
        reasons.push(`${cand.label} (${profile}): ${(err as Error).message}`)
      }
    }
  }

  return {
    ok: false,
    found: [],
    reason:
      reasons.length > 0
        ? reasons.join(" ")
        : "No Chromium cookie store with pathofexile.com cookies found.",
  }
}

// ---------- Firefox (unencrypted sqlite) ----------

function firefoxProfileRoots(): string[] {
  const home = os.homedir()
  if (process.platform === "win32") {
    return [path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Mozilla", "Firefox", "Profiles")]
  }
  if (process.platform === "darwin") {
    return [path.join(home, "Library", "Application Support", "Firefox", "Profiles")]
  }
  // Linux: plain, snap, and flatpak installs each keep their own profile tree.
  return [
    path.join(home, ".mozilla", "firefox"),
    path.join(home, "snap", "firefox", "common", ".mozilla", "firefox"),
    path.join(home, ".var", "app", "org.mozilla.firefox", ".mozilla", "firefox"),
  ]
}

async function tryFirefox(): Promise<DetectResult> {
  let sqlite: typeof import("better-sqlite3") | null = null
  try {
    sqlite = (await import("better-sqlite3")).default as unknown as typeof import("better-sqlite3")
  } catch (err) {
    return { ok: false, found: [], reason: `SQLite reader unavailable (${(err as Error).message}).` }
  }
  const roots: string[] = []
  for (const root of firefoxProfileRoots()) {
    if (await exists(root)) roots.push(root)
  }
  if (roots.length === 0) {
    return { ok: false, found: [], reason: "No Firefox profiles directory found." }
  }
  const entries: { root: string; name: string }[] = []
  for (const root of roots) {
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory()) entries.push({ root, name: entry.name })
    }
  }
  for (const entry of entries) {
    const cookiesPath = path.join(entry.root, entry.name, "cookies.sqlite")
    if (!(await exists(cookiesPath))) continue
    try {
      const tmp = path.join(os.tmpdir(), `poe-ff-${Date.now()}.db`)
      await fs.copyFile(cookiesPath, tmp)
      const found: Partial<Record<WantedCookie, string>> = {}
      try {
        const db = new sqlite(tmp, { readonly: true, fileMustExist: true })
        const rows = db
          .prepare("SELECT host, name, value FROM moz_cookies WHERE name IN (?,?,?)")
          .all(...WANTED) as { host: string; name: WantedCookie; value: string }[]
        db.close()
        for (const row of rows) {
          if (!HOST_MATCH(row.host)) continue
          found[row.name] = sanitize(row.value)
        }
      } finally {
        await fs.rm(tmp, { force: true })
      }
      const foundKeys = Object.keys(found) as WantedCookie[]
      if (foundKeys.length > 0) {
        const major = "121"
        const osToken =
          process.platform === "win32"
            ? "Windows NT 10.0; Win64; x64; rv:121.0"
            : process.platform === "darwin"
              ? "Macintosh; Intel Mac OS X 10.15; rv:121.0"
              : "X11; Linux x86_64; rv:121.0"
        return {
          ok: true,
          found: foundKeys,
          session: {
            poesessid: found.POESESSID,
            poetoken: found.POETOKEN,
            cfClearance: found.cf_clearance,
            userAgent: `Mozilla/5.0 (${osToken}) Gecko/20100101 Firefox/${major}.0`,
            source: `Firefox (${entry.name})`,
          },
        }
      }
    } catch {
      // try next profile
    }
  }
  return { ok: false, found: [], reason: "No Firefox profile had pathofexile.com cookies." }
}

function sanitize(value: string): string {
  // Some Chromium builds prepend a 32-byte binary header to the plaintext.
  // POESESSID is a 32-char hex string; cf_clearance/POETOKEN are URL-safe.
  // Strip any leading non-printable bytes.
  return value.replace(/^[\x00-\x1f]+/, "").trim()
}

/** Try all supported browsers, Chromium first. */
export async function detectSession(): Promise<DetectResult> {
  const chromium = await tryChromium()
  if (chromium.ok && chromium.session?.poesessid) return chromium

  const firefox = await tryFirefox()
  if (firefox.ok && firefox.session?.poesessid) return firefox

  // Merge reasons for a helpful message.
  const reason = [chromium.reason, firefox.reason].filter(Boolean).join(" | ")
  // If Chromium found *some* cookies but not POESESSID, surface that.
  if (chromium.ok || firefox.ok) {
    const partial = chromium.ok ? chromium : firefox
    return {
      ok: false,
      found: partial.found,
      reason: `Found ${partial.found.join(", ") || "no"} cookie(s), but POESESSID was missing. Make sure you're logged in at pathofexile.com. ${reason}`,
      session: partial.session,
    }
  }
  return { ok: false, found: [], reason: reason || "Auto-detect failed. Use manual paste." }
}
