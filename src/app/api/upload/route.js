import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import config from "@/lib/config";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const apiKey = config.ai.seedance.apiKey;
    if (!apiKey) {
      console.error("[UPLOAD] SEEDANCE_V2_API_KEY is not set");
      return NextResponse.json({ error: "API key not configured — contact support" }, { status: 500 });
    }

    // Forward to MuAPI
    const muapiFormData = new FormData();
    muapiFormData.append("file", file);

    const response = await fetch("https://api.muapi.ai/api/v1/upload_file", {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: muapiFormData,
    });

    const responseText = await response.text();
    console.log("[UPLOAD] MuAPI status:", response.status, "body:", responseText);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upload service error (${response.status}): ${responseText.slice(0, 200)}` },
        { status: response.status }
      );
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: "Invalid response from upload service" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[UPLOAD_ERROR]", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
