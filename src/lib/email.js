/**
 * email.js — Seedance Studio transactional emails
 *
 * Sends via Resend API (https://resend.com) — works on Vercel serverless.
 * Required env var:
 *   RESEND_API_KEY  — from resend.com dashboard
 *
 * Exports:
 *   sendSignupNotification({ name, email, image })
 *   sendWelcomeEmail({ name, email })
 *   sendPaymentNotification({ customerEmail, customerName, plan, credits, amountCents })
 *   sendMagicLinkEmail({ email, url })
 *   sendVisitNotification({ ip, country, region, city, isp, page })
 */

const ADMIN_EMAIL = "armankhan0826@gmail.com";
const FROM        = "Seedance Studio <onboarding@resend.dev>";

async function send({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("[EMAIL] RESEND_API_KEY not set — skipping:", subject);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html }),
    });
    if (res.ok) {
      console.log("[EMAIL] Sent:", subject, "→", to);
    } else {
      const body = await res.text();
      console.error("[EMAIL] Resend error:", res.status, body);
    }
  } catch (err) {
    console.error("[EMAIL] send() failed:", err.message);
  }
}

// ── Shared brand tokens ────────────────────────────────────────────────────────
const BG      = "#0d0d14";
const CARD    = "#13111f";
const BORDER  = "rgba(124,58,237,0.18)";
const PURPLE  = "#7c3aed";
const PURPLE_L= "#a78bfa";
const MUTED   = "#9ca3af";
const TEXT    = "#e5e7eb";
const WHITE   = "#ffffff";

function baseWrapper(inner) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="min-height:100vh;background:${BG}">
    <tr><td align="center" style="padding:40px 16px">
      <table width="100%" style="max-width:520px" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding-bottom:24px">
          <span style="color:${WHITE};font-size:16px;font-weight:700;letter-spacing:-0.3px">&#127916; Seedance Studio</span>
        </td></tr>
        <tr><td style="background:${CARD};border:1px solid ${BORDER};border-radius:16px;overflow:hidden">
          ${inner}
        </td></tr>
        <tr><td align="center" style="padding:24px 0 8px">
          <p style="margin:0;font-size:11px;color:${MUTED};line-height:1.8">
            Seedance Studio &nbsp;&middot;&nbsp;
            <a href="https://seedance.visualseffect.com" style="color:${PURPLE_L};text-decoration:none">seedance.visualseffect.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── 1. Admin signup notification ───────────────────────────────────────────────
export async function sendSignupNotification({ name, email, image }) {
  const time = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
  const avatarHtml = image ? `<tr><td style="padding:0 32px 24px"><img src="${image}" width="56" height="56" style="border-radius:50%;border:2px solid ${BORDER};display:block" /></td></tr>` : "";
  const inner = `
    <tr><td style="background:linear-gradient(135deg,${PURPLE},#4c1d95);padding:28px 32px 24px">
      <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.12em">Admin Alert</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:${WHITE};line-height:1.2">New sign-up! &#127881;</h1>
    </td></tr>
    ${avatarHtml}
    <tr><td style="padding:${image ? "0" : "24px"} 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:${MUTED};font-size:12px;width:72px;vertical-align:top">Name</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:${TEXT};font-size:13px;font-weight:600">${name || "&#8212;"}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:${MUTED};font-size:12px;vertical-align:top">Email</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px"><a href="mailto:${email}" style="color:${PURPLE_L};text-decoration:none">${email}</a></td></tr>
        <tr><td style="padding:10px 0;color:${MUTED};font-size:12px;vertical-align:top">Time</td><td style="padding:10px 0;color:${TEXT};font-size:13px">${time}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px"><a href="https://seedance.visualseffect.com/admin" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,${PURPLE},#5b21b6);color:${WHITE};font-size:13px;font-weight:700;text-decoration:none;border-radius:8px">View in Admin Dashboard &#8594;</a></td></tr>`;
  await send({ to: ADMIN_EMAIL, subject: `New sign-up: ${name || email}`, html: baseWrapper(inner) });
}

// ── 2. Welcome email ───────────────────────────────────────────────────────────
export async function sendWelcomeEmail({ name, email }) {
  const firstName = name ? name.split(" ")[0] : "there";
  const steps = [
    ["01", "Write a prompt", "Describe your scene — mood, action, lighting. The more detail the better."],
    ["02", "Pick your settings", "Choose duration (5s, 10s, 15s), aspect ratio, and quality."],
    ["03", "Download your video", "Your video generates in seconds. Download or share it instantly."],
  ];
  const stepsHtml = steps.map(([n, title, desc]) => `
    <tr><td style="padding:0 0 16px" valign="top"><table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="36" valign="top" style="padding-right:14px"><div style="width:28px;height:28px;background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);border-radius:6px;text-align:center;line-height:28px;font-size:10px;font-weight:800;color:${PURPLE_L}">${n}</div></td>
      <td valign="top"><p style="margin:0 0 2px;font-size:13px;font-weight:600;color:${TEXT}">${title}</p><p style="margin:0;font-size:12px;color:${MUTED};line-height:1.5">${desc}</p></td>
    </tr></table></td></tr>`).join("");
  const inner = `
    <tr><td style="background:linear-gradient(135deg,#1e1b4b,#2e1065);padding:36px 32px 28px;text-align:center">
      <div style="font-size:40px;margin-bottom:12px">&#127916;</div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:${WHITE}">Welcome to Seedance, ${firstName}!</h1>
      <p style="margin:0;font-size:14px;color:rgba(196,181,253,0.9);line-height:1.6">You've just unlocked AI-powered video generation.<br/>Your first 10 credits are ready to use.</p>
    </td></tr>
    <tr><td style="padding:28px 32px 0;text-align:center">
      <div style="display:inline-block;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:12px;padding:16px 28px">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PURPLE_L};text-transform:uppercase;letter-spacing:0.1em">Your starting credits</p>
        <p style="margin:0;font-size:36px;font-weight:800;color:${WHITE}">10</p>
        <p style="margin:4px 0 0;font-size:11px;color:${MUTED}">Free credits — no card required</p>
      </div>
    </td></tr>
    <tr><td style="padding:28px 32px 8px"><p style="margin:0 0 16px;font-size:11px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.1em">Get started in 3 steps</p><table width="100%" cellpadding="0" cellspacing="0">${stepsHtml}</table></td></tr>
    <tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,0.06)"></div></td></tr>
    <tr><td style="padding:28px 32px 32px;text-align:center"><a href="https://seedance.visualseffect.com/generate" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,${PURPLE},#5b21b6);color:${WHITE};font-size:14px;font-weight:700;text-decoration:none;border-radius:10px">Generate Your First Video &#8594;</a></td></tr>`;
  await send({ to: email, subject: `Welcome to Seedance, ${firstName}! Your 10 free credits are ready`, html: baseWrapper(inner) });
}

// ── 3. Payment notification ────────────────────────────────────────────────────
const PLAN_NAMES = { starter: "Starter Manifest", power: "Power Engine", quantum: "Quantum Flow" };
export async function sendPaymentNotification({ customerEmail, customerName, plan, credits, amountCents }) {
  const planLabel = PLAN_NAMES[plan] || `Custom (${(credits || 0).toLocaleString()} credits)`;
  const amountUSD = amountCents ? (amountCents / 100).toFixed(2) : "—";
  const time = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
  const inner = `
    <tr><td style="background:linear-gradient(135deg,#15803d,#166534);padding:28px 32px 24px">
      <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.12em">Payment Received</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;line-height:1.2">&#128181; New purchase!</h1>
    </td></tr>
    <tr><td style="padding:24px 32px 0;text-align:center">
      <div style="display:inline-block;background:rgba(22,163,74,0.1);border:1px solid rgba(22,163,74,0.3);border-radius:12px;padding:14px 32px">
        <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#4ade80;text-transform:uppercase;letter-spacing:0.1em">Amount Paid</p>
        <p style="margin:0;font-size:32px;font-weight:900;color:#ffffff">$${amountUSD}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">${(credits || 0).toLocaleString()} credits added</p>
      </div>
    </td></tr>
    <tr><td style="padding:24px 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#9ca3af;font-size:12px;width:80px;vertical-align:top">Package</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#e5e7eb;font-size:13px;font-weight:700">${planLabel}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#9ca3af;font-size:12px;vertical-align:top">Customer</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px"><span style="color:#e5e7eb;font-weight:600">${customerName || "—"}</span><br/><a href="mailto:${customerEmail}" style="color:#a78bfa;text-decoration:none;font-size:12px">${customerEmail}</a></td></tr>
        <tr><td style="padding:10px 0;color:#9ca3af;font-size:12px;vertical-align:top">Time</td><td style="padding:10px 0;color:#e5e7eb;font-size:13px">${time}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 32px"><a href="https://seedance.visualseffect.com/admin" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#16a34a,#15803d);color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;border-radius:8px">View Admin Dashboard &#8594;</a></td></tr>`;
  await send({ to: ADMIN_EMAIL, subject: `Payment received: $${amountUSD} — ${planLabel} (${customerEmail})`, html: baseWrapper(inner) });
}

// ── 4. Magic link ──────────────────────────────────────────────────────────────
export async function sendMagicLinkEmail({ email, url }) {
  const inner = `
    <tr><td style="background:linear-gradient(135deg,#1e1b4b,#2e1065);padding:36px 32px 28px;text-align:center">
      <div style="font-size:36px;margin-bottom:12px">🔗</div>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.2">Your sign-in link</h1>
      <p style="margin:0;font-size:13px;color:rgba(196,181,253,0.85);line-height:1.6">Click the button below to sign in to Seedance Studio.<br/>This link expires in <strong>24 hours</strong> and can only be used once.</p>
    </td></tr>
    <tr><td style="padding:32px 32px 24px;text-align:center"><a href="${url}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px">Sign in to Seedance &#8594;</a></td></tr>
    <tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,0.06)"></div></td></tr>
    <tr><td style="padding:20px 32px 28px">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em">Or copy this link into your browser</p>
      <p style="margin:0;font-size:11px;color:#4b5563;word-break:break-all;line-height:1.6;font-family:monospace;background:rgba(255,255,255,0.03);padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.06)">${url}</p>
    </td></tr>
    <tr><td style="padding:0 32px 28px"><div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.12);border-radius:8px;padding:12px 14px"><p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6">&#128274; <strong style="color:#e5e7eb">Didn't request this?</strong> You can safely ignore this email. Your account is not at risk.</p></div></td></tr>`;
  await send({ to: email, subject: "Your Seedance sign-in link", html: baseWrapper(inner) });
}

// ── 5. Visitor notification ────────────────────────────────────────────────────
export async function sendVisitNotification({ ip, country, region, city, isp, page }) {
  const time = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
  const location = [city, region, country].filter(Boolean).join(", ") || "Unknown location";
  const inner = `
    <tr><td style="background:linear-gradient(135deg,#1e1b4b,#2e1065);padding:24px 32px 20px">
      <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.12em">New Visitor</p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff;line-height:1.2">&#127758; Someone visited your site</h1>
    </td></tr>
    <tr><td style="padding:24px 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#9ca3af;font-size:11px;width:72px;vertical-align:top;text-transform:uppercase;letter-spacing:0.06em">IP</td><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#e5e7eb;font-size:13px;font-family:monospace;font-weight:600">${ip}</td></tr>
        <tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top">Location</td><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#e5e7eb;font-size:13px;font-weight:600">${location}</td></tr>
        ${isp ? `<tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top">ISP</td><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#e5e7eb;font-size:13px">${isp}</td></tr>` : ""}
        <tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top">Page</td><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#a78bfa;font-size:13px;font-family:monospace">${page}</td></tr>
        <tr><td style="padding:9px 0;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top">Time</td><td style="padding:9px 0;color:#e5e7eb;font-size:13px">${time}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 28px"><a href="https://seedance.visualseffect.com/admin" style="display:inline-block;padding:11px 22px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#ffffff;font-size:12px;font-weight:700;text-decoration:none;border-radius:8px">View All Visitors &#8594;</a></td></tr>`;
  await send({ to: ADMIN_EMAIL, subject: `New visitor: ${location} — ${ip}`, html: baseWrapper(inner) });
}
