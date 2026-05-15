// Studio push fanout helper.
//
// Entry point: `sendCreationReadyPush(userId, creationId, opts)` —
// called from /api/webhook/muapi when MuAPI flips a Creation to
// completed or failed. Reads the user's push prefs, their active
// Studio-origin subscriptions, and sends each one a payload through
// web-push. Dead endpoints (410 Gone) get pruned automatically so
// the subscriptions table self-cleans.
//
// Mobile push (FCM/APNS) will hook in alongside this function once
// Phase C lands — same userId entry point, separate fanout target.

import webpush from "web-push";
import { prisma } from "./prisma";
// Lazy-imported inside `ensureFcmConfig()` so the app doesn't pay the
// firebase-admin init cost (or crash on a missing key) in environments
// where mobile push isn't configured. Web push still works without it.
let admin = null;
let fcm = null;

// One-time configuration when this module is first imported. Pulled
// from process.env so we never accidentally commit keys in source.
let configured = false;
function ensureConfig() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:hello@visualseffect.com";
  if (!publicKey || !privateKey) {
    // Missing keys — skip configuration; sendXxx() calls become
    // no-ops with a console warning. Lets the app boot in
    // environments where push isn't wired (e.g. preview deploys).
    return;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

// Initialise firebase-admin once per process. Expects either:
//   • FCM_SERVICE_ACCOUNT_JSON          — raw JSON string (handy in dev)
//   • FCM_SERVICE_ACCOUNT_JSON_BASE64   — base64-encoded JSON (Vercel-friendly,
//                                          avoids newline / quoting hell)
// Returns true once configured, false if keys aren't present (web push
// fanout still runs; FCM branch is skipped).
async function ensureFcmConfig() {
  if (fcm) return true;
  const rawB64 = process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64;
  const rawJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!rawB64 && !rawJson) return false;
  try {
    const json = rawB64
      ? JSON.parse(Buffer.from(rawB64, "base64").toString("utf8"))
      : JSON.parse(rawJson);
    // Dynamic import keeps firebase-admin out of the cold-start path
    // for the webhook in environments where push isn't wired.
    const mod = await import("firebase-admin");
    admin = mod.default ?? mod;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(json) });
    }
    fcm = admin.messaging();
    return true;
  } catch (err) {
    console.warn("[push/fcm] init failed:", err?.message);
    return false;
  }
}

// Send to all of a user's mobile devices via FCM. Like the web-push
// branch this auto-prunes dead tokens (UNREGISTERED / INVALID_ARGUMENT
// errors → marked invalid in the Device table). Returns { sent, removed }.
async function sendFcmToUser(userId, payload, { type } = {}) {
  if (!userId) return { sent: 0, removed: 0 };
  const ok = await ensureFcmConfig();
  if (!ok) return { sent: 0, removed: 0, skipped: "no_fcm" };

  const devices = await prisma.device.findMany({
    where: { userId, invalidAt: null },
    select: { id: true, token: true, platform: true },
  });
  if (devices.length === 0) return { sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;
  await Promise.all(
    devices.map(async (d) => {
      try {
        // Capacitor PushNotifications listens to the `data` payload
        // for tap-routing. We also include a `notification` block so
        // the OS draws the banner when the app is backgrounded.
        await fcm.send({
          token: d.token,
          notification: { title: payload.title, body: payload.body },
          data: {
            kind: payload.kind || "default",
            url: payload.url || "/",
            tag: payload.tag || "",
          },
          android: { priority: "high", notification: { sound: "default", channelId: "video_ready" } },
          apns: {
            payload: { aps: { sound: "default", "thread-id": payload.tag || payload.kind } },
          },
        });
        sent++;
      } catch (err) {
        const code = err?.errorInfo?.code || err?.code || "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          try {
            await prisma.device.update({
              where: { id: d.id },
              data: { invalidAt: new Date() },
            });
            removed++;
          } catch {
            /* race — fine */
          }
        } else {
          console.warn("[push/fcm] send failed:", code, err?.message);
        }
      }
    })
  );
  return { sent, removed };
}

// Short helper — server-side check whether a given prefs row should
// receive a push of this type. Always honors the master switch first.
function userOptedIn(user, type) {
  if (!user?.pushMaster) return false;
  if (type === "video_ready") return !!user.pushVideoReady;
  if (type === "video_failed") return !!user.pushVideoFailed;
  if (type === "featured") return !!user.pushFeatured;
  return false;
}

// Truncate the prompt for the notification body (OS limits vary; 80
// chars is the safe sweet spot across iOS / Android / desktop Chrome).
function trimPrompt(s, max = 80) {
  if (!s) return "";
  const trimmed = s.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + "…";
}

// Core sender. Fans out one payload to every active Studio
// subscription for a user. Returns { sent, removed } so the caller
// (webhook / cron) can log impact.
export async function sendPushToUser(userId, payload, { type } = {}) {
  ensureConfig();
  if (!configured) {
    console.warn("[push] VAPID keys missing — skipping fanout");
    return { sent: 0, removed: 0, skipped: "no_vapid" };
  }
  if (!userId) return { sent: 0, removed: 0 };

  // Pull user push prefs + only Studio-origin subscriptions. Null
  // origin is treated as community for back-compat, so brand-new
  // Studio rows MUST set origin = "studio".
  const [user, subs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        pushMaster: true,
        pushVideoReady: true,
        pushVideoFailed: true,
        pushFeatured: true,
      },
    }),
    prisma.pushSubscription.findMany({
      where: { userId, origin: "studio" },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    }),
  ]);

  if (!user) return { sent: 0, removed: 0 };
  if (type && !userOptedIn(user, type)) {
    return { sent: 0, removed: 0, skipped: "user_opted_out" };
  }

  const body = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;

  if (subs?.length) {
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body
          );
          sent++;
        } catch (err) {
          // 404 / 410 = the browser unsubscribed (uninstall, denied
          // permission, cleared site data). Prune the dead row so we
          // don't keep retrying forever.
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            try {
              await prisma.pushSubscription.delete({ where: { id: s.id } });
              removed++;
            } catch {
              /* race with another delete — fine */
            }
          } else {
            console.warn("[push] send failed:", status, err?.body || err?.message);
          }
        }
      })
    );
  }

  // Mobile fanout (FCM) — independent of the web branch. Mobile-only
  // users (Capacitor app installed but never opted into web push) still
  // get pushed. Skipped silently if Firebase admin isn't configured.
  const fcmResult = await sendFcmToUser(userId, payload, { type });

  return {
    sent: sent + (fcmResult.sent || 0),
    removed: removed + (fcmResult.removed || 0),
    web: { sent, removed },
    fcm: fcmResult,
  };
}

// "🎬 Your video is ready" — fired when MuAPI's webhook flips a
// Creation to completed. Tap goes to /v/<creationId>.
export async function sendCreationReadyPush(userId, creation) {
  if (!creation?.id) return { sent: 0, removed: 0 };
  return sendPushToUser(
    userId,
    {
      kind: "video_ready",
      title: "🎬 Your video is ready",
      body:
        (trimPrompt(creation.prompt, 60) || "Your generation is done") +
        " — tap to watch",
      url: `/v/${creation.id}`,
      tag: `ready-${creation.id}`,
    },
    { type: "video_ready" }
  );
}

// "⚠️ Generation didn't complete" — fired when failAndRefund runs.
// Tap goes to /creations so the user can see the refund + retry.
export async function sendCreationFailedPush(userId, creation, errorReason) {
  if (!creation?.id) return { sent: 0, removed: 0 };
  const friendly = friendlyFailReason(errorReason);
  return sendPushToUser(
    userId,
    {
      kind: "video_failed",
      title: "⚠️ Generation didn't complete",
      body: `${friendly} Credits refunded — tap for details.`,
      url: `/creations`,
      tag: `failed-${creation.id}`,
    },
    { type: "video_failed" }
  );
}

// Optional admin / community trigger — wired separately from the
// community-side pin/feature feature in Phase 2 if/when we want
// Studio users notified that their work hit the home feed.
export async function sendFeaturedPush(userId, creation) {
  if (!creation?.id) return { sent: 0, removed: 0 };
  return sendPushToUser(
    userId,
    {
      kind: "featured",
      title: "⭐ You're featured",
      body: "An admin pinned your latest video to the home feed — tap to see it live.",
      url: `/v/${creation.id}`,
      tag: `featured-${creation.id}`,
    },
    { type: "featured" }
  );
}

function friendlyFailReason(raw) {
  const s = (raw || "").toString().toLowerCase();
  if (s.includes("face")) return "Face detection blocked this render.";
  if (s.includes("nsfw") || s.includes("content")) return "Content policy blocked this render.";
  if (s.includes("timeout")) return "The render timed out.";
  return "Something went wrong.";
}
