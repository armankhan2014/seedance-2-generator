import { NextResponse } from "next/server";
import config from "@/lib/config";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const requestId = searchParams.get("id");

  if (secret !== "seedance2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requestId) {
    return NextResponse.json({ error: "id param required" }, { status: 400 });
  }

  const apiKey = config.ai.seedance.apiKey;
  const url = `https://api.muapi.ai/api/v1/predictions/${requestId}/result`;

  try {
    const res = await fetch(url, {
      headers: { "x-api-key": apiKey },
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch(e) {}

    return NextResponse.json({
      http_status: res.status,
      full_raw: text,        // complete response, no truncation
      parsed: parsed,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message });
  }
}
