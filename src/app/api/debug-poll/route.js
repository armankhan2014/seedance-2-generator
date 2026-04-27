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
  const results = {};

  const urls = [
    `https://api.muapi.ai/api/v1/predictions/${requestId}/result`,
    `https://api.muapi.ai/api/v1/predictions/${requestId}`,
    `https://api.muapi.ai/api/v1/result/${requestId}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "x-api-key": apiKey },
      });
      const text = await res.text();
      results[url] = { status: res.status, body: text.slice(0, 1000) };
    } catch (e) {
      results[url] = { error: e.message };
    }
  }

  return NextResponse.json(results);
}
