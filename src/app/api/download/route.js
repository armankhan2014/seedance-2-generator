// Streaming download proxy.
//
// Why this exists: <a download="..."> works on desktop browsers and Android
// Chrome, but iOS Safari ignores the attribute. The only reliable cross-
// platform way to force a save dialog is to serve the file with the header
// Content-Disposition: attachment. R2's public r2.dev URLs don't honour
// that header, so we proxy the request through this route, which streams
// the bytes and rewrites the headers.
//
// Cost: each download adds Vercel egress equal to the file size. Acceptable
// at this traffic level; revisit if egress becomes material.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  const requestedName = searchParams.get("name") || "seedance-download";

  if (!target) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  // Allowlist (in order, fail closed):
  //   1. URLs on our R2 bucket — fast path, no DB hit.
  //   2. URLs stored in a Creation row — covers legacy videos that landed
  //      directly on MuAPI's CDN before R2 was wired up, plus anything the
  //      MuAPI fallback ever returned. Still tight: only URLs we ourselves
  //      saved are proxiable, so this is not an open bandwidth amplifier.
  const r2Public = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  const onR2 = r2Public && target.startsWith(r2Public + "/");

  if (!onR2) {
    const known = await prisma.creation.findFirst({
      where: {
        OR: [
          { videoFiles: { has: target } },
          { audioFiles: { has: target } },
          { imageUrl:   target          },
        ],
      },
      select: { id: true },
    });
    if (!known) {
      return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
    }
  }

  // Sanitize the filename so we can safely put it in a header value.
  const safeName = requestedName
    .replace(/[\r\n"\\]/g, "")
    .replace(/[^\w.\- ]/g, "_")
    .slice(0, 120) || "seedance-download";

  let upstream;
  try {
    upstream = await fetch(target);
  } catch (err) {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `Upstream returned ${upstream.status}` }, { status: 502 });
  }

  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("Content-Length", cl);
  headers.set("Content-Disposition", `attachment; filename="${safeName}"`);
  headers.set("Cache-Control", "private, max-age=0, must-revalidate");

  return new Response(upstream.body, { status: 200, headers });
}
