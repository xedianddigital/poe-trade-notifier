// Update (pause/resume, rename, toggle auto-travel) or delete a watched search.

import { removeSearch, updateSearch } from "@/lib/poe/config"
import { engine } from "@/lib/poe/live-engine"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface Context {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, ctx: Context): Promise<Response> {
  const { id } = await ctx.params

  let body: { title?: string; active?: boolean; autoTravel?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 })
  }

  const patch: { title?: string; active?: boolean; autoTravel?: boolean } = {}
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim()
  if (typeof body.active === "boolean") patch.active = body.active
  if (typeof body.autoTravel === "boolean") patch.autoTravel = body.autoTravel

  const search = await updateSearch(id, patch)
  if (!search) {
    return Response.json({ ok: false, error: "No such search." }, { status: 404 })
  }

  await engine.sync()
  return Response.json({ ok: true, search })
}

export async function DELETE(_req: Request, ctx: Context): Promise<Response> {
  const { id } = await ctx.params
  engine.stop(id)
  await removeSearch(id)
  return Response.json({ ok: true })
}
