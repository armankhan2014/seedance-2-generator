// Thin server-side wrapper around the LALAL.AI stem-separation API.
// Docs: https://www.lalal.ai/api/
//
// Studio Pro v2 uses LALAL because Suno's vocal-removal endpoint
// only operates on Suno-generated audio (gated by taskId+audioId);
// LALAL takes any audio file and returns higher-quality stems with
// finer instrument isolation (vocals / drum / piano / bass /
// electric_guitar / acoustic_guitar — up to 6 in one /multistem/
// call).
//
// Auth: X-License-Key header. Set LALAL_API_KEY in Vercel env.
//
// Flow used by /api/music/studio/stems/*:
//   1. uploadAudio(buffer, filename) → { source_id, expires, ... }
//   2. startMultistemSplit(source_id, stems[]) → { task_id }
//   3. checkTasks([task_id]) → progress|success|error per task
//   4. (optional) deleteSource(source_id) — cleanup
//
// LALAL files expire 24h after upload; their download URLs are
// stable for 1h after that. We mirror successful stem outputs to
// R2 in the check route so they survive long-term.

const LALAL_BASE = "https://www.lalal.ai/api/v1";

export function isLalalConfigured() {
  return !!process.env.LALAL_API_KEY;
}

function ensureKey() {
  const key = process.env.LALAL_API_KEY;
  if (!key) {
    const err = new Error(
      "Studio stems aren't configured yet — admin needs to set LALAL_API_KEY in env."
    );
    err.code = "NO_LALAL_KEY";
    throw err;
  }
  return key;
}

// Upload audio to LALAL. They want the binary body directly with a
// filename in the Content-Disposition header (NOT multipart/form-data
// — read their spec carefully).
//
// Returns: { id (source_id), name, size, duration, expires }
export async function uploadAudio(buffer, filename = "track.mp3") {
  const apiKey = ensureKey();
  const res = await fetch(`${LALAL_BASE}/upload/`, {
    method: "POST",
    headers: {
      "X-License-Key": apiKey,
      // RFC 6266: encode filename for safety (handles non-ASCII).
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Content-Type": "application/octet-stream",
    },
    body: buffer,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.detail || `LALAL upload error ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Start a multistem split job. `stems` is an array of up to 6 stem
// names from: ["vocals", "drum", "piano", "bass", "electric_guitar",
// "acoustic_guitar"]. extraction_level "clear_cut" minimises
// cross-bleed (better for clean stems); "deep_extraction" preserves
// more nuance.
//
// IMPORTANT: each stem in the list multiplies the duration billed
// (a 3-min song × 4 stems = 12 min consumed). Keep the default
// stem set small for cost control.
//
// Returns: { task_id }
export async function startMultistemSplit({ sourceId, stems, extractionLevel = "deep_extraction" }) {
  const apiKey = ensureKey();
  if (!Array.isArray(stems) || stems.length === 0) {
    throw new Error("stems must be a non-empty array");
  }
  const res = await fetch(`${LALAL_BASE}/split/multistem/`, {
    method: "POST",
    headers: {
      "X-License-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_id: sourceId,
      presets: {
        stem_list: stems,
        extraction_level: extractionLevel,
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.detail || `LALAL split error ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Check the status of one or more task IDs. Rate limit is 30/min;
// we poll once every 5-10s in the client so we stay well below.
//
// Returns: { result: { <taskId>: { status, progress|tracks|error, ... } } }
// status values: "progress" | "success" | "error" | "cancelled" | "server_error"
export async function checkTasks(taskIds) {
  const apiKey = ensureKey();
  const res = await fetch(`${LALAL_BASE}/check/`, {
    method: "POST",
    headers: {
      "X-License-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task_ids: Array.isArray(taskIds) ? taskIds : [taskIds] }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.detail || `LALAL check error ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Start a voice-clean job — removes background NOISE (wind / hum /
// traffic / crowd) from a vocal recording, leaving a clean voice
// stem. Distinct from multistem: this is for raw recordings that
// are otherwise unusable, not for splitting finished tracks.
//
// `noiseLevel` is 0 (light), 1 (medium), or 2 (aggressive). Higher
// strips more noise but can also chew into the voice itself —
// default to 1 unless the user knows the source is very noisy.
//
// Returns: { task_id }
export async function startVoiceClean({ sourceId, noiseLevel = 1 }) {
  const apiKey = ensureKey();
  const res = await fetch(`${LALAL_BASE}/split/voice_clean/`, {
    method: "POST",
    headers: {
      "X-License-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_id: sourceId,
      presets: {
        stem: "voice",
        noise_cancelling_level: noiseLevel,
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.detail || `LALAL voice-clean error ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Flat credit cost for voice cleaning. Cheaper than multistem
// because we only ask for ONE stem (the cleaned voice). LALAL
// bills 1× duration in minutes; we charge 6 credits which gives
// comfortable margin while staying obviously cheaper than the
// 20-credit multistem split.
export const VOICE_CLEAN_COST = 6;

// Start a lead-vs-backing vocals split using LALAL's stem_separator
// endpoint with multivocal="lead_back". Returns 4 stems in the
// /check/ response:
//   • vocals@0     (type:"stem")  — lead vocal isolated
//   • vocals@1     (type:"stem")  — backing vocals isolated (optional;
//                                   omitted when the engine can't
//                                   detect any backing harmonies)
//   • no_vocals    (type:"back")  — instrumental (no lead, no backing)
//   • mix_no_lead  (type:"back")  — instrumental + backing vocals
//                                   (everything except the lead)
//
// Use case: producers + mix engineers who want to A/B between
// "with backing harmonies" and "lead-only" mixes, OR isolate the
// backing vocals to layer them with a different lead.
//
// Returns: { task_id }
export async function startVocalsSplit({ sourceId }) {
  const apiKey = ensureKey();
  const res = await fetch(`${LALAL_BASE}/split/stem_separator/`, {
    method: "POST",
    headers: {
      "X-License-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_id: sourceId,
      presets: {
        stem: "vocals",
        multivocal: "lead_back",
        // deep_extraction preserves the most nuance — important for
        // backing harmonies which are subtle by nature.
        extraction_level: "deep_extraction",
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.detail || `LALAL vocals-split error ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Flat credit cost for the lead+backing vocals split. Cheaper than
// the 6-stem multistem because we're only extracting the vocal
// family (1 stem-minute charge upstream, but the engine returns 4
// resulting tracks). 10 credits gives healthy margin while keeping
// the option visibly cheaper than full multistem.
export const VOCALS_SPLIT_COST = 10;

// Best-effort delete of a source file from LALAL storage. Doesn't
// invalidate already-completed task download URLs immediately (CDN
// caches them for 1h), but stops the source from counting against
// quota. We call this after we've mirrored stems to R2.
export async function deleteSource(sourceId) {
  const apiKey = ensureKey();
  await fetch(`${LALAL_BASE}/delete/`, {
    method: "POST",
    headers: {
      "X-License-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source_id: sourceId }),
  }).catch(() => {});
}

// Flat credit cost for a Studio multistem split. Wholesale cost
// scales by duration × number_of_stems (LALAL bills per
// stem-minute). Bumped 2026-05-18 from 20 → 30 credits when we
// expanded the stem set from 4 → 6 (added electric_guitar +
// acoustic_guitar). 6 stems × 3-min track = 18 LALAL minutes;
// 30 credits gives ~2.5× margin at LALAL's standard tier — still
// notably cheaper than going to a third-party stem service.
//
// Note: the LALAL multistem endpoint maxes at 6 stems per call.
// Adding synthesizer / strings / wind would require 3 additional
// /split/stem_separator/ calls (different endpoint, phoenix
// splitter). Deferred to a future "Pro 9-stem" tier.
export const STUDIO_STEM_COST = 30;

// The default multistem set. Order matters — controls which lane
// each stem lands on after split. Keep this in sync with
// STEM_LANE_ORDER in StudioClient.jsx (same 6 entries, same order).
export const STUDIO_DEFAULT_STEMS = [
  "vocals",
  "drum",
  "bass",
  "piano",
  "electric_guitar",
  "acoustic_guitar",
];
