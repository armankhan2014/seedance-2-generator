// Scrub any "music engine" / "sunoapi" mention out of strings before they
// reach the client. Applied to every error message that originates
// from the upstream music-engine API so the underlying vendor stays
// invisible to end users (white-label hygiene).
export function scrubVendor(s) {
  if (!s) return s;
  return String(s)
    .replace(/sunoapi\.org/gi, "music engine")
    .replace(/suno\s*api/gi, "music engine")
    .replace(/\bsuno\b/gi, "the music engine");
}

// Thin server-side wrapper around the sunoapi.org music engine API.
// Documentation: https://docs.sunoapi.org/
//
// Auth: SUNO_API_KEY (Bearer token in env). Never expose to the client.
//
// Endpoints used:
//   POST /api/v1/generate              — kick off music generation
//   GET  /api/v1/generate/record-info  — poll status (fallback if
//                                        webhook never fires)
//
// Generation flow is async: we POST and get back a taskId. music engine then
// POSTs to our callBackUrl twice — first with stream URL ready
// (~30–40s), then with the final mix ready (~2–3min). The callback
// handler at /api/music/callback persists those URLs + mirrors the
// final audio to R2 so the user's library survives music engine's 15-day
// retention.

const SUNO_BASE = process.env.SUNO_API_BASE || "https://api.sunoapi.org";

function ensureKey() {
  const key = process.env.SUNO_API_KEY;
  if (!key) {
    const err = new Error("SUNO_API_KEY missing — music generation disabled");
    err.code = "NO_SUNO_KEY";
    throw err;
  }
  return key;
}

// Generate a music track. Returns { taskId } on success.
//
// In NON-custom mode, music engine auto-picks style/title from the prompt
// (good for "just give me something" quick gens). In CUSTOM mode the
// caller supplies style + title + an optional richer prompt + lyrics
// for vocal tracks. We use custom mode whenever the user picked a
// specific genre or supplied lyrics.
//
// Models: V4 (4-min max, cheapest), V4_5 / V4_5PLUS / V4_5ALL (8-min),
// V5 / V5_5 (latest). We default to V5 because the demo / docs
// indicate it produces the cleanest output for cinematic content.
export async function generateMusic({
  prompt,
  style,
  title,
  instrumental,
  lyrics,
  model = "V5",
  vocalGender,
  callBackUrl,
  negativeTags,
}) {
  const apiKey = ensureKey();
  if (!callBackUrl) throw new Error("callBackUrl is required");

  const useCustom = !!(style || title || lyrics);
  const body = {
    customMode: useCustom,
    instrumental: !!instrumental,
    model,
    callBackUrl,
  };
  if (useCustom) {
    // In custom mode, "prompt" carries the lyrics when vocal, or the
    // creative direction when instrumental.
    body.prompt = instrumental ? (prompt || "") : (lyrics || prompt || "");
    body.style = style || "";
    body.title = title || "";
  } else {
    body.prompt = prompt || "";
  }
  if (vocalGender) body.vocalGender = vocalGender;
  if (negativeTags) body.negativeTags = negativeTags;

  const res = await fetch(`${SUNO_BASE}/api/v1/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 200) {
    const err = new Error(json.msg || `Music service error ${res.status}`);
    err.status = res.status;
    err.code = json.code;
    err.body = json;
    throw err;
  }
  return { taskId: json.data?.taskId, raw: json };
}

// Polling fallback — used by a cron sweep that picks up tracks stuck
// in "processing" for > 5 minutes (callback may have missed us if we
// were deploying at that exact second).
export async function getRecordInfo(taskId) {
  const apiKey = ensureKey();
  const url = `${SUNO_BASE}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.msg || `Music service status ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json.data || json;
}

// Helper for the /api/music/generate route — translates our UI-level
// preset (cinematic / ambient / rock / orchestral / electronic / jazz /
// folk / mystery) + mood + tempo into music engine's "style" string. Keeping
// this mapping in one place so we can tune it without touching the
// route handler.
export function buildStyleString({ genre, mood, tempo, isVocal }) {
  const genreMap = {
    cinematic:  "cinematic film score, orchestral, dramatic",
    ambient:    "ambient, atmospheric, slow-build, lo-fi pads",
    rock:       "rock, electric guitar, energetic drums",
    orchestral: "epic orchestral, sweeping strings, brass",
    electronic: "electronic, synthwave, dance, EDM",
    jazz:       "jazz, smooth, lounge, brushed drums",
    folk:       "folk acoustic, fingerpicked guitar, warm",
    mystery:    "mysterious, suspenseful, tense, dark strings",
  };
  const parts = [genreMap[genre] || genre || "cinematic"];
  if (mood) parts.push(mood.toLowerCase());
  if (tempo) {
    if (tempo < 80) parts.push("slow");
    else if (tempo > 130) parts.push("fast");
  }
  if (!isVocal) parts.push("instrumental");
  return parts.join(", ");
}

// Cost table — matches the demo's pricing section. Single source of
// truth, imported by /api/music/generate AND the page so the cost
// displayed to the user is exactly what gets charged.
export function creditsForTrack({ duration, isVocal }) {
  // Base credits by duration bucket.
  const base = duration <= 30 ? 4 : duration <= 60 ? 8 : duration <= 120 ? 14 : 20;
  // Vocal upcharge — +4 across the board.
  return base + (isVocal ? 4 : 0);
}
