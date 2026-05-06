// OpenAI gpt-image-1 wrapper for the "Build my reference" feature.
// Takes 1–3 reference photos + a text prompt and returns the generated
// image as a Buffer that the API route can upload to R2.

const OPENAI_EDITS_URL = "https://api.openai.com/v1/images/edits";

export async function buildReferenceImage({ referenceFiles, prompt, size = "1024x1024", quality = "high" }) {
  const apiKey = process.env.OPENAI_API_KEY;
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

  const fd = new FormData();
  fd.append("model", "gpt-image-1");
  fd.append("prompt", prompt.slice(0, 4000));
  fd.append("size", size);
  fd.append("quality", quality);
  fd.append("n", "1");
  for (const f of referenceFiles) {
    fd.append("image[]", f, f.name || "ref.jpg");
  }

  const r = await fetch(OPENAI_EDITS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });

  let data = {};
  try { data = await r.json(); } catch {}

  if (!r.ok) {
    const err = new Error(data?.error?.message || `OpenAI returned ${r.status}`);
    err.status = r.status;
    err.openaiCode = data?.error?.code;
    throw err;
  }

  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    const err = new Error("OpenAI returned no image.");
    err.status = 502;
    throw err;
  }
  return Buffer.from(b64, "base64");
}
