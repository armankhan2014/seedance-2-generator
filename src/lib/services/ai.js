import config from "@/lib/config";
import { UserService } from "./user";
import { prisma } from "@/lib/prisma";
import { uploadVideoFromUrl, isR2Configured } from "@/lib/storage";

const MUAPI_RESULT_URL = "https://api.muapi.ai/api/v1/predictions";

export const AIService = {
  getCreditCost(mode, duration, quality, resolution) {
    // Base credits for 720p basic quality (at 80 credits per $1):
    //   5s  = 120 credits = $1.50
    //   10s = 200 credits = $2.50
    //   15s = 320 credits = $4.00
    const BASE = { 5: 120, 10: 200, 15: 320 };
    const base = BASE[duration] ?? Math.ceil((duration / 15) * 320);

    // 1080p + high = 450cr for 15s, scales proportionally for other durations
    let mult = 1.0;
    if (resolution === "480p") mult = 0.7;
    else if (resolution === "1080p" && quality === "high") mult = 1.40625;
    else if (resolution === "1080p") mult = 1.2;
    else if (quality === "high") mult = 1.15;
    if (mode === "reference-to-video") mult *= 1.1;

    return Math.ceil(base * mult);
  },

  async generate(userId, { mode, prompt, aspect_ratio = "16:9", resolution = "720p", duration = 5, quality = "basic", images_list = [], video_files = [], audio_files = [] }) {
    const cost = this.getCreditCost(mode, duration, quality, resolution);

    // Deduct credits upfront — will be refunded automatically if the API call fails
    await UserService.deductCredits(userId, cost);

    try {
      const apiKey = config.ai.seedance.apiKey;
      if (!apiKey) throw new Error("SEEDANCE_V2_API_KEY is not configured");

      let type;
      if (mode === "text-to-video") type = "t2v";
      else if (mode === "image-to-video") type = "i2v";
      else if (mode === "reference-to-video") type = "reference";

      const endpoint = config.ai.seedance.endpoints[type][resolution];
      if (!endpoint) throw new Error(`Endpoint not found for mode: ${mode} and resolution: ${resolution}`);

      // ── Reference-mode safety injections ──────────────────────────────────
      // Two issues Arman flagged on 2026-05-12:
      //   1) Anti-flash — Seedance was rendering the literal reference
      //      image as the first frames before transitioning.
      //   2) Face lock — generated faces only loosely matched the
      //      uploaded photo. Needs to be IDENTICAL across every frame.
      //      Multi-character (2+ references): each face must stay
      //      anchored to its OWN reference — no swap between characters.
      // Both are also enforced by Claude in /api/prompt/expand, but
      // a user who types their own prompt or pastes one bypasses
      // that layer. We re-inject both here on every reference-mode
      // submit so the Seedance call ALWAYS carries both safeties.
      //
      // Mirrored from /api/prompt/expand/route.js — keep these two
      // builders in sync. Dynamic per image count so a two-person
      // scene gets a multi-character lock string instead of the
      // single-image text that only protects the first face.
      const buildFaceLock = (imageCount) => {
        if (imageCount <= 1) {
          return (
            "FACE LOCK: the character's face MUST match 【@image1】 EXACTLY in every single frame — " +
            "identical facial structure, identical eyes, identical nose, identical mouth, identical jawline, " +
            "identical skin tone and texture, identical hairline and hair texture. " +
            "No drift, no morphing, no 'similar', no 'inspired by' — IDENTITY-PRESERVING reproduction throughout the entire clip."
          );
        }
        const pairs = Array.from({ length: imageCount }, (_, i) => {
          const letter = String.fromCharCode(65 + i);
          return `Character ${letter} → 【@image${i + 1}】`;
        }).join(", ");
        return (
          "FACE LOCK (multi-character): each character's face MUST match its assigned reference EXACTLY in every frame they appear — " +
          `${pairs}. ` +
          "Identical facial structure, identical eyes, identical nose, identical mouth, identical jawline, " +
          "identical skin tone and texture, identical hairline and hair texture per character. " +
          "NO face-swap between characters, NO blending, NO morphing, NO 'similar' — " +
          "keep each face anchored to its source reference for every frame that character appears."
        );
      };

      const ANTI_FLASH =
        "Generate cinematically from FRAME 1. Do NOT show, flash, transition from, or include the reference image(s) as a visible frame at any point — the reference is for character likeness and styling ONLY.";

      let finalPrompt = prompt;
      if (type === "reference" && images_list.length > 0) {
        const FACE_LOCK = buildFaceLock(images_list.length);
        const insertAfterFirstLine = (body, sentence) => {
          const idx = body.indexOf("\n");
          if (idx === -1) return `${body}\n${sentence}`;
          return `${body.slice(0, idx)}\n${sentence}${body.slice(idx)}`;
        };
        if (!/do\s+not\s+show.*reference\s+image/i.test(finalPrompt)) {
          finalPrompt = insertAfterFirstLine(finalPrompt, ANTI_FLASH);
        }
        if (!/FACE\s+LOCK/i.test(finalPrompt)) {
          finalPrompt = insertAfterFirstLine(finalPrompt, FACE_LOCK);
        }
      }

      const webhookUrl = `${config.auth.webhook_url}/api/webhook/muapi?secret=${process.env.WEBHOOK_SECRET}`;
      const payload = {
        prompt: finalPrompt,
        aspect_ratio,
        duration: parseInt(duration),
        quality,
        webhook: webhookUrl,
      };

      if (type === "i2v" || type === "reference") {
        payload.images_list = images_list.slice(0, 9);
      }
      if (type === "reference") {
        payload.video_files = video_files.slice(0, 3);
        payload.audio_files = audio_files.slice(0, 3);
      }


      const submitRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      const responseText = await submitRes.text();

      if (!submitRes.ok) {
        // 4xx = user's payload was rejected (bad prompt, content policy, etc.).
        // We tag it so the catch block knows NOT to refund — otherwise an
        // attacker can spam garbage prompts and have credits returned each time.
        // 5xx and network errors still refund (our infrastructure problem).
        const err = new Error(`API Submission Failed: ${submitRes.status} ${responseText}`);
        err.userFault = submitRes.status >= 400 && submitRes.status < 500;
        throw err;
      }

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid JSON response from API: ${responseText}`);
      }

      const request_id = responseData.id || responseData.request_id;
      if (!request_id) throw new Error(`No request_id in response: ${responseText}`);

      await prisma.creation.create({
          data: {
            userId,
            // Persist the prompt we ACTUALLY sent (with the
            // anti-flash sentence baked in if it was injected) —
            // matches what produced the video, so the user can
            // edit + re-generate later without losing the safety
            // instruction.
            prompt: finalPrompt,
            aspectRatio: aspect_ratio,
            resolution,
            duration: parseInt(duration),
            quality,
            videoFiles: video_files,
            audioFiles: audio_files,
            inputImages: images_list,
            requestId: request_id,
            status: "processing",
          }
        });

      return { request_id };

    } catch (error) {
      // ── AUTO-REFUND (only for our-fault failures) ───────────────────────────
      // Refund on infrastructure failures (5xx, network errors), but NOT on
      // 4xx where the user's payload was the problem. Otherwise any logged-in
      // user could repeatedly submit garbage prompts and have their credits
      // returned each time, costing nothing to abuse.
      if (error.userFault) {
        console.error("[AI_NO_REFUND] User-fault failure — keeping", cost, "credits | reason:", error.message);
      } else {
        console.error("[AI_REFUND] Generation failed — refunding", cost, "credits to user", userId, "| reason:", error.message);
        try {
          await UserService.addCredits(userId, cost);
        } catch (refundErr) {
          console.error("[AI_REFUND_FAILED] Could not refund credits for user", userId, refundErr.message);
        }
      }
      throw error;
    }
  },

  async edit(userId, params) {
    return this.generate(userId, params);
  },

  async pollMuAPI(requestId, apiKey) {
    const urls = [
      `${MUAPI_RESULT_URL}/${requestId}/result`,
      `${MUAPI_RESULT_URL}/${requestId}`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { "x-api-key": apiKey },
        });
        const text = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        if (res.ok) {
          return parsed;
        }
        // 4xx with a parseable error body — MuAPI returns content-policy
        // rejections this way (e.g. "Face detected in uploaded image.").
        // Without this branch, pollMuAPI returned null and the caller
        // saw "processing" forever even though MuAPI had already rejected
        // the job. Arman flagged 2026-05-12.
        if (parsed && (parsed.error || parsed.detail)) {
          return { status: "failed", error: parsed.error || parsed.detail };
        }
      } catch (e) {
        console.error("[AI_POLL_FETCH_ERROR]", url, e.message);
      }
    }
    return null;
  },

  // Best-guess cost for an existing Creation. Mode isn't stored on the
  // Creation row (would require a migration) so we infer from the kinds
  // of references attached. Bias toward the LOWER mode when ambiguous so
  // an accidental refund never exceeds what was originally charged.
  estimateCostFromCreation(creation) {
    if (!creation) return 0;
    let mode = "text-to-video";
    const hasVid = (creation.videoFiles?.length || 0) > 0;
    const hasAud = (creation.audioFiles?.length || 0) > 0;
    const hasImg = (creation.inputImages?.length || 0) > 0;
    if (hasVid || hasAud) mode = "reference-to-video";
    else if (hasImg) mode = "image-to-video";
    return this.getCreditCost(mode, creation.duration, creation.quality, creation.resolution);
  },

  // Atomically transition processing → failed and refund credits exactly
  // once. The conditional updateMany acts as a compare-and-swap so the
  // webhook and the polling path can't both refund the same creation if
  // they fire concurrently. Returns true if THIS caller did the
  // transition (and refunded), false if someone else got there first.
  async failAndRefund(creation, errMsg) {
    const updated = await prisma.creation.updateMany({
      where: { id: creation.id, status: "processing" },
      data: { status: "failed", error: errMsg },
    });
    if (updated.count !== 1) return false;
    try {
      const cost = this.estimateCostFromCreation(creation);
      if (cost > 0) {
        await UserService.addCredits(creation.userId, cost);
        console.log(
          "[AI_REFUND_ASYNC] Refunded", cost,
          "credits to user", creation.userId,
          "for failed creation", creation.requestId,
          "| reason:", errMsg
        );
      }
    } catch (refundErr) {
      console.error("[AI_REFUND_ASYNC_FAILED]", refundErr.message);
    }
    return true;
  },

  async checkStatus(requestId, userId) {
    // Scope to the calling user — without this, anyone can poll any
    // requestId and read other users' generation status / output URLs.
    const creation = await prisma.creation.findFirst({
      where: { requestId, userId },
    });
    if (!creation) return { status: "processing" };

    if (creation.status === "completed") {
      return { status: "completed", imageUrl: creation.imageUrl };
    }
    if (creation.status === "failed") {
      throw new Error(creation.error || "Generation failed.");
    }

    const apiKey = config.ai.seedance.apiKey;
    if (!apiKey) return { status: "processing" };

    // Network call ONLY in try-catch. Failure-handling lives OUTSIDE so
    // the throw at the end actually surfaces to the route (and the
    // frontend toast) instead of being swallowed by the local catch
    // and silently returning "processing" — which was the original bug
    // that left users staring at a spinner after MuAPI rejected their
    // generation for content policy. Arman flagged 2026-05-12.
    let result;
    try {
      result = await this.pollMuAPI(requestId, apiKey);
    } catch (e) {
      console.error("[AI_POLL_ERROR]", e.message);
      return { status: "processing" };
    }
    if (!result) return { status: "processing" };

    const outputs = result?.outputs || result?.output || [];
    const outputArr = Array.isArray(outputs) ? outputs : (outputs ? [outputs] : []);
    const imageUrl = outputArr[0] || null;
    const statusStr = result?.status?.toLowerCase() || "";
    const hasError = result?.error && result.error !== "" && result.error !== null;
    const isCompleted =
      outputArr.length > 0 ||
      statusStr === "succeeded" ||
      statusStr === "completed" ||
      statusStr === "success";
    const isFailed = hasError || statusStr === "failed" || statusStr === "error";

    if (isCompleted && imageUrl) {
      // Upload to R2 if configured — fall back to MuAPI URL on failure
      let finalUrl = imageUrl;
      if (isR2Configured()) {
        try {
          const ext = imageUrl.includes(".webm") ? "webm" : "mp4";
          const key = `videos/${creation.id}.${ext}`;
          finalUrl = await uploadVideoFromUrl(imageUrl, key);
        } catch (e) {
          console.error("[AI_POLL] R2 upload failed, using MuAPI URL:", e.message);
          finalUrl = imageUrl;
        }
      }
      await prisma.creation.update({
        where: { requestId },
        data: { status: "completed", imageUrl: finalUrl },
      });
      return { status: "completed", imageUrl: finalUrl };
    }

    if (isFailed) {
      const errMsg = result.error || result.detail || "Generation failed";
      // Atomic transition + refund. Idempotent vs. the webhook — only
      // one caller (this one OR /api/webhook/muapi) will get the
      // count===1 result, so credits are refunded exactly once.
      await this.failAndRefund(creation, errMsg);
      throw new Error(errMsg);
    }

    return { status: "processing" };
  }
};
