// Parse an official trade search URL into { league, searchId }.
// Accepts forms like:
//   https://www.pathofexile.com/trade/search/Mirage/X3m5erbecP
//   https://www.pathofexile.com/trade/search/Standard/abc123/live
//   pathofexile.com/trade/search/Hardcore%20Mirage/abc123

export interface ParsedSearch {
  league: string
  searchId: string
}

export function parseTradeUrl(input: string): ParsedSearch | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  let pathname: string
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    pathname = new URL(withProtocol).pathname
  } catch {
    return null
  }

  // Expect .../trade/search/{league}/{searchId}[/live]
  const marker = "/trade/search/"
  const idx = pathname.indexOf(marker)
  if (idx === -1) return null

  const rest = pathname.slice(idx + marker.length)
  const segments = rest.split("/").filter(Boolean)
  if (segments.length < 2) return null

  const league = decodeURIComponent(segments[0])
  const searchId = segments[1]
  if (!league || !searchId) return null

  return { league, searchId }
}
