// Shared types for the PoE lean trade notifier.

export interface Session {
  poesessid: string
  poetoken: string
  cfClearance: string
  userAgent: string
  updatedAt: number
}

export type SearchStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"

export interface WatchedSearch {
  /** Internal id used by this app (not the PoE search id). */
  id: string
  /** Full URL the user pasted. */
  url: string
  /** League segment parsed from the URL, e.g. "Mirage". */
  league: string
  /** PoE trade search id parsed from the URL. */
  searchId: string
  /** Human label (defaults to league + short id). */
  title: string
  /** Whether the live search WebSocket should be running. */
  active: boolean
  /** Per-search opt-in: instantly fire Travel to Hideout on first match. */
  autoTravel: boolean
}

export interface Settings {
  /** Global master switch for auto-travel. When false, no search auto-travels. */
  autoTravelEnabled: boolean
  /** Minimum ms between auto-travels for a single search. */
  autoTravelCooldownMs: number
  /** Play a sound when a new listing arrives. */
  soundEnabled: boolean
}

export type WhisperState = "idle" | "sending" | "sent" | "error" | "expired"

export interface Listing {
  /** PoE listing id (result id from /fetch). */
  id: string
  /** Internal id of the search that surfaced this listing. */
  searchInternalId: string
  searchTitle: string
  itemName: string
  itemType: string
  priceAmount: number | null
  priceCurrency: string | null
  sellerAccount: string | null
  sellerCharacter: string | null
  listedAgo: string | null
  mods: string[]
  corrupted: boolean
  /** Token used for POST /api/trade/whisper (Travel to Hideout). */
  whisperToken: string | null
  /** Unix ms when the whisper token expires (parsed from the JWT). */
  tokenExpMs: number | null
  receivedAt: number
  whisperState: WhisperState
  autoTravelled: boolean
  note?: string
}

export interface AppConfig {
  session: Session | null
  searches: WatchedSearch[]
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  autoTravelEnabled: false,
  autoTravelCooldownMs: 10_000,
  soundEnabled: true,
}

// ---- SSE event payloads ----

export type ServerEvent =
  | { type: "listing"; listing: Listing }
  | { type: "status"; searchInternalId: string; status: SearchStatus; error?: string }
  | { type: "session"; valid: boolean; message?: string }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "whisper"; listingId: string; state: WhisperState; message?: string }
