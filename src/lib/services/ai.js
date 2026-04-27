import config from "@/lib/config";
import { UserService } from "./user";
import { prisma } from "@/lib/prisma";

const MUAPI_RESULT_URL = "https://api.muapi.ai/api/v1/predictions";

export const AIService = {
  getCreditCost(mode, duration, quality, resolution) {
    const isReference = mode === "reference-to-video";
    const is1080p = resolution === "1080p";
    const is720p = resolution === "720p";
    let rate;
    if (isReference) {
      if (is1080p) rate = quality === "high" ? 80 : 56;
      else if (is720p) rate = quality === "high" ? 60 : 42;
      else rate = quality === "high" ? 48 : 36;
    } else {
      if (is1080p) rate = quality === "high" ? 70 : 45;
      else if (is720p) rate = quality === "high" ? 50 : 30;
      else rate = quality === "high" ? 30 : 24;
    }
    return Math.ceil(duration * rate);
  },

  async generate(userId, { mode, prompt, aspect_ratio = "16:9", resolution = "720p", duration = 5, quality = "basic", images_list = [], video_files = [], audio_files = [] }) {
    const cost = this.getCreditCost(mode, duration, quality, resolution);
    await UserService.deductCredits(userId, cost);

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

    const webhookUrl = `${config.auth.webhook_url}/api/webhook/muapi`;
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
  },

  async edit(userId, params) {
    return this.generate(userId, params);
  },

  async pollMuAPI(requestId, apiKey) {
    // Try the /result endpoint first, fall back to base predictions endpoint
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

    // Poll MuAPI directly for live status
    const apiKey = config.ai.seedance.apiKey;
    if (apiKey) {
      try {
        const result = await this.pollMuAPI(requestId, apiKey);
        console.log("[AI_POLL_PARSED]", requestId, JSON.stringify(result));

        const status = result?.status?.toLowerCase();
        const isDone = status === "succeeded" || status === "completed" || status === "success";
        const isFailed = status === "failed" || status === "error";

        if (result && isDone) {
          // Handle all possible output field names from MuAPI
          const rawOutput = result.output ?? result.outputs ?? result.video_url ?? result.url ?? null;
          const imageUrl = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;
          console.log("[AI_POLL_COMPLETE] imageUrl:", imageUrl);
          await creationModel.update({
            where: { requestId },
            data: { status: "completed", imageUrl: imageUrl || null },
          });
          return { status: "completed", imageUrl };
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
        if (e.message && !e.message.includes("Generation failed")) {
          console.error("[AI_POLL_ERROR]", e.message);
        } else {
          throw e;
        }
      }
    }

    return { status: "processing" };
  }
};
