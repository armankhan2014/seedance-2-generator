// Google Gemini image-generation wrapper for the "Build my reference" feature.
// Gemini handles small-face identity preservation noticeably better than
// GPT-image-1 in turnaround-sheet style outputs, which is exactly our use case.

// Try-order of image-generation model names. Google has shipped multiple
// names over time and they may differ per API key / region. We try the
// newest first and fall back, caching whichever one worked for this process.
const MODEL_CANDIDATES = [
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.0-flash-exp",
];

let cachedModel = null;

async function callGemini(model, apiKey, parts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
  });
  let data = {};
  try { data = await r.json(); } catch {}
  return { status: r.status, ok: r.ok, data };
}

export async function buildReferenceImage({ referenceFiles, prompt }) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("Image builder is not configured.");
    err.code = "NOT_CONFIGURED";
    err.status = 503;
    throw err;
  }
  if (!referenceFiles?.length) {
    const err = new Error("At least one reference image is required.");
    err.status = 400;
    throw err;
  }
  if (!prompt?.trim()) {
    const err = new Error("Prompt is required.");
    err.status = 400;
    throw err;
  }

  // Build parts array: text first, then each reference image as inline base64.
  const parts = [{ text: prompt.slice(0, 8000) }];
  for (const f of referenceFiles) {
    const buf = Buffer.from(await f.arrayBuffer());
    parts.push({
      inlineData: {
        mimeType: f.type || "image/jpeg",
        data: buf.toString("base64"),
      },
    });
  }

  // Try the cached working model first, then the rest of the candidates.
  const tryOrder = cachedModel
    ? [cachedModel, ...MODEL_CANDIDATES.filter((m) => m !== cachedModel)]
    : MODEL_CANDIDATES;

  let lastNotFound = null;
  for (const model of tryOrder) {
    const { status, ok, data } = await callGemini(model, apiKey, parts);

    if (ok) {
      cachedModel = model;
      const candidate = data?.candidates?.[0];
      if (!candidate) {
        const err = new Error("Gemini returned no candidates.");
        err.status = 502;
        throw err;
      }
      const imagePart = candidate.content?.parts?.find((p) => p.inlineData?.data);
      if (!imagePart) {
        const reason = candidate.finishReason || "unknown";
        const err = new Error(`Gemini did not return an image (reason: ${reason}). Try a different photo or look description.`);
        err.status = reason === "IMAGE_SAFETY" || reason === "SAFETY" ? 400 : 502;
        throw err;
      }
      return Buffer.from(imagePart.inlineData.data, "base64");
    }

    const msg = data?.error?.message || `${status}`;
    // "Model not found / not supported" → try the next candidate.
    if (status === 404 || /not found|not supported|not available/i.test(msg)) {
      lastNotFound = msg;
      continue;
    }
    // Real error (auth, quota, rate-limit, etc.) — bail immediately.
    const err = new Error(msg);
    err.status = status;
    throw err;
  }

  // All candidates failed with "not found".
  const err = new Error(`No image-generation model is available for this API key. Last error: ${lastNotFound || "unknown"}. Check that your Google AI Studio key has access to gemini-2.5-flash-image or gemini-2.0-flash-preview-image-generation.`);
  err.status = 503;
  throw err;
}
