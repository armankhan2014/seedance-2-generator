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

      console.log("[AI_DEBUG] Submitting to:", endpoint);
      console.log("[AI_DEBUG] mode:", mode, "resolution:", resolution, "quality:", quality, "duration:", duration);

      const webhookUrl = `${config.auth.webhook_url}/api/webhook/muapi?secret=${process.env.WEBHOOK_SECRET}`;
      const payload = {
        prompt,
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

      console.log("[AI_DEBUG] payload:", JSON.stringify(payload));

      const submitRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      });

      const responseText = await submitRes.text();
      console.log("[AI_DEBUG] response status:", submitRes.status, "body:", responseText);

      if (!submitRes.ok) {
        // API rejected the request — refund happens in catch block below
        throw new Error(`API Submission Failed: ${submitRes.status} ${responseText}`);
      }

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid JSON response from API: ${responseText}`);
      }

      const request_id = responseData.id || responseData.request_id;
      if (!request_id) throw new Error(`No request_id in response: ${responseText}`);

      const creationModel = prisma.creation || prisma.Creation;
      if (creationModel) {
        await creationModel.create({
          data: {
            userId,
            prompt,
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
      }

      return { request_id };

    } catch (error) {
      // ── AUTO-REFUND ──────────────────────────────────────────────────────────
      // Any failure after credit deduction triggers an automatic refund.
      // This covers: muapi.ai "not enough fund", network errors, bad responses, etc.
      console.error("[AI_REFUND] Generation failed — refunding", cost, "credits to user", userId, "| reason:", error.message);
      try {
        await UserService.addCredits(userId, cost);
        console.log("[AI_REFUND] Successfully refunded", cost, "credits to user", userId);
      } catch (refundErr) {
        // Log refund failure but don't hide the original error
        console.error("[AI_REFUND_FAILED] Could not refund credits for user", userId, refundErr.message);
      }
      // ────────────────────────────────────────────────────────────────────────
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
        console.log("[AI_POLL_RAW] URL:", url, "status:", res.status, "body:", text.slice(0, 500));
        if (res.ok) {
          return JSON.parse(text);
        }
      } catch (e) {
        console.error("[AI_POLL_FETCH_ERROR]", url, e.message);
      }
    }
    return null;
  },

  async checkStatus(requestId, userId) {
    const creationModel = prisma.creation || prisma.Creation;
    if (!creationModel) return { status: "processing" };

    const creation = await creationModel.findUnique({ where: { requestId } });
    if (!creation) return { status: "processing" };

    if (creation.status === "completed") {
      return { status: "completed", imageUrl: creation.imageUrl };
    }
    if (creation.status === "failed") {
      throw new Error(creation.error || "Generation failed.");
    }

    const apiKey = config.ai.seedance.apiKey;
    if (apiKey) {
      try {
        const result = await this.pollMuAPI(requestId, apiKey);
        console.log("[AI_POLL_PARSED]", requestId, JSON.stringify(result));

        const outputs = result?.outputs || result?.output || [];
        const outputArr = Array.isArray(outputs) ? outputs : (outputs ? [outputs] : []);
        const imageUrl = outputArr[0] || null;

        const statusStr = result?.status?.toLowerCase() || "";
        const hasError = result?.error && result.error !== "" && result.error !== null;
        const isCompleted = outputArr.length > 0 || statusStr === "succeeded" || statusStr === "completed" || statusStr === "success";
        const isFailed = hasError || statusStr === "failed" || statusStr === "error";

        console.log("[AI_POLL_PARSED] id:", requestId, "status:", statusStr, "outputs:", outputArr.length, "imageUrl:", imageUrl);

        if (result && isCompleted && imageUrl) {
          // Upload to R2 if configured — fall back to MuAPI URL on failure
          let finalUrl = imageUrl;
          if (isR2Configured()) {
            try {
              const creation = await creationModel.findUnique({ where: { requestId } });
              if (creation) {
                const ext = imageUrl.includes(".webm") ? "webm" : "mp4";
                const key = `videos/${creation.id}.${ext}`;
                console.log("[AI_POLL] Uploading to R2:", key);
                finalUrl = await uploadVideoFromUrl(imageUrl, key);
                console.log("[AI_POLL] R2 upload done:", finalUrl);
              }
            } catch (e) {
              console.error("[AI_POLL] R2 upload failed, using MuAPI URL:", e.message);
              finalUrl = imageUrl;
            }
          }
          await creationModel.update({
            where: { requestId },
            data: { status: "completed", imageUrl: finalUrl },
          });
          return { status: "completed", imageUrl: finalUrl };
        }
        if (result && isFailed) {
          const errMsg = result.error || result.detail || "Generation failed";
          await creationModel.update({
            where: { requestId },
            data: { status: "failed", error: errMsg },
          });
          throw new Error(errMsg);
        }
      } catch (e) {
        console.error("[AI_POLL_ERROR]", e.message);
      }
    }

    return { status: "processing" };
  }
};
