// Read-only decode of the whisper JWT payload.
// We only inspect the `exp` (expiry) and `tok` (token type) claims to track
// when a Travel-to-Hideout token goes stale. No signature verification is done
// or needed - this token is created by and sent back to pathofexile.com.

export interface WhisperTokenClaims {
  tok?: string
  iss?: string
  iat?: number
  exp?: number
}

export function decodeWhisperToken(token: string | null | undefined): WhisperTokenClaims | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length < 2) return null
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4)
    const json = Buffer.from(padded, "base64").toString("utf8")
    return JSON.parse(json) as WhisperTokenClaims
  } catch {
    return null
  }
}

/** Unix ms of expiry, or null if unknown. */
export function tokenExpiryMs(token: string | null | undefined): number | null {
  const claims = decodeWhisperToken(token)
  if (!claims?.exp) return null
  return claims.exp * 1000
}

/** A token is considered stale if it expires within `graceMs`. */
export function isTokenStale(tokenExpMs: number | null, graceMs = 15_000): boolean {
  if (tokenExpMs == null) return false
  return Date.now() >= tokenExpMs - graceMs
}
