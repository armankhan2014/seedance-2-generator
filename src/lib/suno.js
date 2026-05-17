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

// ── Reference-audio generation (Phase A) ─────────────────────────────
//
// Two endpoints, two different products:
//
//   • generateCover()        — POST /api/v1/generate/upload-cover
//       Takes a reference audio URL + a text prompt. The engine
//       preserves the MELODY of the reference but generates new
//       instrumentation AND new vocals. Use case: "make me a new
//       song in the same raag as this one".
//
//   • addInstrumentalToVocal() — POST /api/v1/generate/add-instrumental
//       Takes an uploaded vocal recording + a tags string describing
//       desired instrumentation. The engine PRESERVES the original
//       vocals (audioWeight controls how strongly) and adds instruments
//       around them. Use case: "I sang this on my laptop — give me a
//       full band around it." Output keeps your voice intact.
//
// Both endpoints are async and use the same callback flow as the
// regular /generate endpoint: we POST and get back a taskId, the
// engine then POSTs to our callBackUrl with `first` (stream URL
// ready) and `complete` (final mix ready) stages.

// Cover mode — reference song → new music in the same raag/melody
// with fresh vocals. Mirrors the regular generateMusic() signature so
// the calling route can hand off the same params + add uploadUrl.
export async function generateCover({
  uploadUrl,
  prompt,
  style,
  title,
  instrumental,
  lyrics,
  model = "V5",
  vocalGender,
  audioWeight,
  styleWeight,
  negativeTags,
  callBackUrl,
}) {
  const apiKey = ensureKey();
  if (!uploadUrl) throw new Error("uploadUrl is required for cover mode");
  if (!callBackUrl) throw new Error("callBackUrl is required");

  // upload-cover ALWAYS uses customMode (per docs: customMode is a
  // required boolean; non-custom mode is only useful when you want
  // the engine to auto-pick everything from a prompt — which doesn't
  // help here since we already have rich style + title state).
  const body = {
    uploadUrl,
    customMode: true,
    instrumental: !!instrumental,
    model,
    callBackUrl,
    // Required-when-custom fields:
    style: style || "",
    title: title || "Cover",
  };
  // In custom + instrumental mode, prompt is optional. In custom +
  // vocal mode, prompt carries the lyrics (per the same convention as
  // generateMusic above).
  if (instrumental) {
    if (prompt) body.prompt = prompt;
  } else {
    body.prompt = lyrics || prompt || "";
  }
  if (vocalGender) body.vocalGender = vocalGender;
  if (negativeTags) body.negativeTags = negativeTags;
  if (typeof audioWeight === "number") body.audioWeight = audioWeight;
  if (typeof styleWeight === "number") body.styleWeight = styleWeight;

  const res = await fetch(`${SUNO_BASE}/api/v1/generate/upload-cover`, {
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

// Add-instrumental mode — user uploads their own vocal recording, the
// engine layers instruments around it while preserving the vocals
// (`audioWeight` controls preservation strength, default 1.0).
//
// Signature differs from generateMusic / generateCover because the
// engine's add-instrumental endpoint has a more focused param set:
// tags (instrument descriptors) + uploadUrl + title. No `prompt`,
// no `lyrics` — your vocals already contain those.
export async function addInstrumentalToVocal({
  uploadUrl,
  title,
  tags,
  negativeTags,
  vocalGender,
  audioWeight = 1.0,
  styleWeight,
  model = "V5",
  callBackUrl,
}) {
  const apiKey = ensureKey();
  if (!uploadUrl) throw new Error("uploadUrl is required for add-instrumental");
  if (!callBackUrl) throw new Error("callBackUrl is required");
  if (!tags) throw new Error("tags is required for add-instrumental");

  const body = {
    uploadUrl,
    title: title || "Vocal accompaniment",
    tags,
    negativeTags: negativeTags || "",
    callBackUrl,
    model,
  };
  if (vocalGender) body.vocalGender = vocalGender;
  if (typeof audioWeight === "number") body.audioWeight = audioWeight;
  if (typeof styleWeight === "number") body.styleWeight = styleWeight;

  const res = await fetch(`${SUNO_BASE}/api/v1/generate/add-instrumental`, {
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

// ── Extend a track (upload-extend) ───────────────────────────────────
//
// Takes an existing audio URL (must be publicly fetchable — we feed it
// the track's r2Url or audioUrl) and asks the engine to extend it.
// We use `defaultParamFlag: false` ("Default Mode") which inherits
// the original audio's style automatically — no need to pass style,
// prompt, or continueAt unless the user wants to override. Cleaner UX
// than asking them to retype the style.
//
// Returns the same taskId pattern as a regular generation; the
// callback fires through /api/music/callback with the FULL extended
// audio (original + new continuation merged into one file).
//
// Cost: flat EXTEND_COST credits (see below). Output duration is
// determined by the model + the original's length; we don't directly
// control it but typical extensions add 30-90s.
export async function extendTrack({
  uploadUrl,
  model = "V5",
  callBackUrl,
  prompt,
  style,
  title,
  instrumental,
  vocalGender,
  audioWeight,
  styleWeight,
  negativeTags,
  continueAt,
}) {
  const apiKey = ensureKey();
  if (!uploadUrl) throw new Error("uploadUrl is required");
  if (!callBackUrl) throw new Error("callBackUrl is required");

  // Default-mode body: just the upload + model + callback. The
  // engine sniffs the original track's style itself. Any explicit
  // style/prompt/title overrides flip us to custom-mode.
  const useCustom = !!(style || title || continueAt || prompt);
  const body = {
    uploadUrl,
    defaultParamFlag: useCustom,
    model,
    callBackUrl,
  };
  if (useCustom) {
    if (style) body.style = style;
    if (title) body.title = title;
    if (typeof continueAt === "number") body.continueAt = continueAt;
    if (typeof instrumental === "boolean") body.instrumental = instrumental;
    // In custom + vocal mode, prompt is the exact lyrics.
    if (prompt && instrumental === false) body.prompt = prompt;
  } else if (prompt) {
    body.prompt = prompt;
  }
  if (vocalGender) body.vocalGender = vocalGender;
  if (negativeTags) body.negativeTags = negativeTags;
  if (typeof audioWeight === "number") body.audioWeight = audioWeight;
  if (typeof styleWeight === "number") body.styleWeight = styleWeight;

  const res = await fetch(`${SUNO_BASE}/api/v1/generate/upload-extend`, {
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

// Flat credit cost for "extend this track". Wholesale cost is similar
// to a regular ~60s generation upstream; 8 credits gives us margin
// while staying cheaper than a fresh generation (since you're
// building on existing audio, not from scratch).
export const EXTEND_COST = 8;

// ── Stem split (vocal removal) ──────────────────────────────────────
//
// Suno's vocal-removal endpoint takes a previously-generated track
// (identified by its original generation taskId + audioId) and returns
// two separated stems: vocals-only and instrumental-only.
//
// Two modes available upstream:
//   • separate_vocal (default, ~10 wholesale credits) — 2 stems
//   • split_stem    (~50 wholesale credits)           — up to 12 stems
//     (drums, bass, guitar, keys, strings, brass, woodwinds, percussion,
//      synth, FX, plus lead + backing vocals)
//
// We ship `separate_vocal` only for now — it's by far the most
// common request (filmmakers want the instrumental under dialogue;
// musicians want the vocal stem for remixing). Adding `split_stem`
// later is a one-param change.
//
// Async: returns a stemTaskId immediately, the actual stem URLs
// arrive via callBackUrl webhook with payload data.vocal_removal_info.
export async function separateVocals({
  taskId,
  audioId,
  callBackUrl,
  type = "separate_vocal",
}) {
  const apiKey = ensureKey();
  if (!taskId) throw new Error("taskId is required");
  if (!audioId) throw new Error("audioId is required");
  if (!callBackUrl) throw new Error("callBackUrl is required");

  const body = {
    taskId,
    audioId,
    type,
    callBackUrl,
  };
  const res = await fetch(`${SUNO_BASE}/api/v1/vocal-removal/generate`, {
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
  return { stemTaskId: json.data?.taskId, raw: json };
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

// Flat credit cost for stem split. Two tiers:
//   • STEM_COST       — 2-stem mode (vocal + instrumental). Wholesale
//                       ~10 of the engine's credits; we charge 4.
//   • STEM_SPLIT_COST — 12-stem Pro mode (drums/bass/guitar/keys/
//                       strings/brass/woodwinds/percussion/synth/fx/
//                       lead+backing vocals). Wholesale ~50 upstream;
//                       we charge 18 (~3× margin, still notably
//                       cheaper than going to a third-party stem
//                       separation service).
// Single source of truth — imported by the kickoff route AND the
// callback (for refund-on-failure) so a price change touches one file.
export const STEM_COST = 4;
export const STEM_SPLIT_COST = 18;
