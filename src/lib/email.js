/**
 * email.js — Seedance Studio transactional emails
 *
 * Sends via Resend API (https://resend.com) — works on Vercel serverless.
 * Required env var:
 *   RESEND_API_KEY  — from resend.com dashboard
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "armankhan0826@gmail.com";
const FROM        = "Seedance Studio <noreply@visualseffect.com>";

async function send({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[EMAIL] RESEND_API_KEY not set — skipping:", subject);
    return;
  }
  const recipient = Array.isArray(to) ? to : [to];
  console.log("[EMAIL] Attempting send:", subject, "→", recipient);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: recipient, subject, html }),
    });
    const body = await res.text();
    if (res.ok) {
      console.log("[EMAIL] Sent OK:", subject, "→", recipient, "| id:", JSON.parse(body)?.id);
    } else {
      console.error("[EMAIL] Resend error", res.status, "for", subject, "→", recipient, ":", body);
    }
  } catch (err) {
    console.error("[EMAIL] send() threw for", subject, "→", recipient, ":", err.message);
  }
}

const BG      = "#0d0d14";
const CARD    = "#13111f";
const BORDER  = "rgba(124,58,237,0.18)";
const PURPLE  = "#7c3aed";
const PURPLE_L= "#a78bfa";
const MUTED   = "#9ca3af";
const TEXT    = "#e5e7eb";
const WHITE   = "#ffffff";

function baseWrapper(inner) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="min-height:100vh;background:${BG}"><tr><td align="center" style="padding:40px 16px"><table width="100%" style="max-width:520px" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:24px"><span style="color:${WHITE};font-size:16px;font-weight:700;letter-spacing:-0.3px">&#127916; Seedance Studio</span></td></tr><tr><td style="background:${CARD};border:1px solid ${BORDER};border-radius:16px;overflow:hidden">${inner}</td></tr><tr><td align="center" style="padding:24px 0 8px"><p style="margin:0;font-size:11px;color:${MUTED};line-height:1.8">Seedance Studio &nbsp;&middot;&nbsp;<a href="https://seedance.visualseffect.com" style="color:${PURPLE_L};text-decoration:none">seedance.visualseffect.com</a></p></td></tr></table></td></tr></table></body></html>`;
}

export async function sendSignupNotification({ name, email, image, isReturning = false }) {
  const time = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
  const avatarHtml = image ? `<tr><td style="padding:0 32px 24px"><img src="${image}" width="56" height="56" style="border-radius:50%;border:2px solid ${BORDER};display:block" /></td></tr>` : "";
  const inner = `<tr><td style="background:linear-gradient(135deg,${PURPLE},#4c1d95);padding:28px 32px 24px"><p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.12em">Admin Alert</p><h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:${WHITE};line-height:1.2">New sign-up! &#127881;</h1></td></tr>${avatarHtml}<tr><td style="padding:${image ? "0" : "24px"} 32px 28px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:${MUTED};font-size:12px;width:72px">Name</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:${TEXT};font-size:13px;font-weight:600">${name || "&#8212;"}</td></tr><tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:${MUTED};font-size:12px">Email</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px"><a href="mailto:${email}" style="color:${PURPLE_L};text-decoration:none">${email}</a></td></tr><tr><td style="padding:10px 0;color:${MUTED};font-size:12px">Time</td><td style="padding:10px 0;color:${TEXT};font-size:13px">${time}</td></tr></table></td></tr><tr><td style="padding:0 32px 32px"><a href="https://seedance.visualseffect.com" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,${PURPLE},#5b21b6);color:${WHITE};font-size:13px;font-weight:700;text-decoration:none;border-radius:8px">View Site &#8594;</a></td></tr>`;
  await send({ to: ADMIN_EMAIL, subject: `New sign-up: ${name || email}`, html: baseWrapper(inner) });
}

export async function sendWelcomeEmail({ name, email }) {
  const firstName = name ? name.split(" ")[0] : "there";
  const inner = `<tr><td style="background:linear-gradient(135deg,#1e1b4b,#2e1065);padding:36px 32px 28px;text-align:center"><div style="font-size:40px;margin-bottom:12px">&#127916;</div><h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:${WHITE}">Welcome to Seedance, ${firstName}!</h1><p style="margin:0;font-size:14px;color:rgba(196,181,253,0.9);line-height:1.6">You've just unlocked AI-powered video generation.<br/>Your first 10 credits are ready to use.</p></td></tr><tr><td style="padding:28px 32px 32px;text-align:center"><a href="https://seedance.visualseffect.com" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,${PURPLE},#5b21b6);color:${WHITE};font-size:14px;font-weight:700;text-decoration:none;border-radius:10px">Start Generating &#8594;</a></td></tr>`;
  await send({ to: email, subject: `Welcome to Seedance, ${firstName}! Your 10 free credits are ready`, html: baseWrapper(inner) });
}

export async function sendPaymentNotification({ customerEmail, customerName, plan, credits, amountCents }) {
  const amountUSD = amountCents ? (amountCents / 100).toFixed(2) : "—";
  const time = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
  const inner = `<tr><td style="background:linear-gradient(135deg,#15803d,#166534);padding:28px 32px 24px"><p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.12em">Payment Received</p><h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff">&#128181; $${amountUSD} received!</h1></td></tr><tr><td style="padding:24px 32px 28px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#9ca3af;font-size:12px;width:80px">Customer</td><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#e5e7eb;font-size:13px">${customerName || customerEmail}</td></tr><tr><td style="padding:10px 0;color:#9ca3af;font-size:12px">Time</td><td style="padding:10px 0;color:#e5e7eb;font-size:13px">${time}</td></tr></table></td></tr>`;
  await send({ to: ADMIN_EMAIL, subject: `Payment $${amountUSD} — ${customerEmail}`, html: baseWrapper(inner) });
}

export async function sendMagicLinkEmail({ email, url }) {
  const inner = `<tr><td style="background:linear-gradient(135deg,#1e1b4b,#2e1065);padding:36px 32px 28px;text-align:center"><div style="font-size:36px;margin-bottom:12px">🔗</div><h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff">Your sign-in link</h1><p style="margin:0;font-size:13px;color:rgba(196,181,253,0.85);line-height:1.6">Click below to sign in. Expires in 24 hours.</p></td></tr><tr><td style="padding:32px 32px 28px;text-align:center"><a href="${url}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:12px">Sign in to Seedance &#8594;</a></td></tr>`;
  await send({ to: email, subject: "Your Seedance sign-in link", html: baseWrapper(inner) });
}

export async function sendVisitNotification({ ip, country, region, city, isp, page }) {
  const time = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
  const location = [city, region, country].filter(Boolean).join(", ") || "Unknown";
  const inner = `<tr><td style="background:linear-gradient(135deg,#1e1b4b,#2e1065);padding:24px 32px 20px"><p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.12em">New Visitor</p><h1 style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ffffff">&#127758; ${location}</h1></td></tr><tr><td style="padding:24px 32px 28px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#9ca3af;font-size:11px;width:72px;text-transform:uppercase">IP</td><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#e5e7eb;font-size:13px;font-family:monospace">${ip}</td></tr><tr><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#9ca3af;font-size:11px;text-transform:uppercase">Page</td><td style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#a78bfa;font-size:13px;font-family:monospace">${page}</td></tr><tr><td style="padding:9px 0;color:#9ca3af;font-size:11px;text-transform:uppercase">Time</td><td style="padding:9px 0;color:#e5e7eb;font-size:13px">${time}</td></tr></table></td></tr>`;
  await send({ to: ADMIN_EMAIL, subject: `New visitor: ${location} — ${ip}`, html: baseWrapper(inner) });
}
