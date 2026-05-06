// Google Gemini 2.5 Flash Image wrapper for the "Build my reference" feature.
// Gemini handles small-face identity preservation noticeably better than
// GPT-image-1 in turnaround-sheet style outputs, which is exactly our use case.
// Free tier covers a generous number of generations per day.

const GEMINI_MODEL = "gemini-2.5-flash-image-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

  const r = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
    }),
  });

  let data = {};
  try { data = await r.json(); } catch {}

  if (!r.ok) {
    const err = new Error(data?.error?.message || `Gemini returned ${r.status}`);
    err.status = r.status;
    throw err;
  }

  // Gemini may return finishReason without an image (safety, recitation, etc.)
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const err = new Error("Gemini returned no candidates.");
    err.status = 502;
    throw err;
  }

  const imagePart = candidate.content?.parts?.find((p) => p.inlineData?.data);
  if (!imagePart) {
    const reason = candidate.finishReason || "unknown";
    const err = new Error(`Gemini did not return an image (reason: ${reason}).`);
    err.status = reason === "IMAGE_SAFETY" || reason === "SAFETY" ? 400 : 502;
    throw err;
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
}
