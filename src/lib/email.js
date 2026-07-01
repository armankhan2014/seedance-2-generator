/**
 * email.js — Seedance Studio transactional emails
 *
 * Sends via Resend API (https://resend.com) — works on Vercel serverless.
 * Required env var:
 *   RESEND_API_KEY  — from resend.com dashboard
 *
 * Visual language mirrors seedance.visualseffect.com — minimal, cinematic,
 * dark slate with brand green #A6CC00 / #D9FF00 accents. Inter typography
 * (system fallbacks since email clients block webfont loading).
 */

import fs from "node:fs";
import path from "node:path";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "armankhan0826@gmail.com";
// FROM address uses the `send.visualseffect.com` subdomain because that's the
// verified sending domain in Resend. The receiving mailbox at
// hello@visualseffect.com (Google Workspace) is unchanged — replies still
// route to Arman's Gmail. Don't change this back to @visualseffect.com
// without re-verifying the apex domain in Resend first, otherwise every
// transactional email silently fails (Resend rejects unverified senders).
const FROM        = "Seedance Studio <noreply@send.visualseffect.com>";
const SITE        = "https://seedance.visualseffect.com";

// Welcome-email HTML loaded from emails/seedance_welcome_email.html at
// module-load. Cached for the lifetime of the Lambda warm instance so we
// don't re-read on every signup. The file ships in the Vercel bundle
// because Next.js includes anything reachable via fs.readFileSync from
// a server-only path inside the repo. On a cold-start read failure the
// loader falls back to null and sendWelcomeEmail logs + bails — better
// than crashing the signup flow.
let WELCOME_HTML = null;
try {
  WELCOME_HTML = fs.readFileSync(
    path.join(process.cwd(), "emails", "seedance_welcome_email.html"),
    "utf8"
  );
} catch (e) {
  console.error("[EMAIL] failed to load welcome template:", e.message);
}

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

/* ─────────────────────────────────────────────────────────────────
 * Design tokens — match the live site palette
 * Brand green pulled from duration badges (#A6CC00) and the
 * image-builder progress gradient seen at seedance.visualseffect.com
 * ───────────────────────────────────────────────────────────────── */
const BG          = "#0a0a0a";
const CARD        = "#0d0d0f";
const BORDER      = "rgba(255,255,255,0.07)";
const DIVIDER     = "rgba(255,255,255,0.05)";
const TEXT        = "#f1f5f9";
const TEXT_DIM    = "#cbd5e1";
const MUTED       = "#64748b";
const ACCENT      = "#A6CC00";  // brand olive lime — primary
const ACCENT_LT   = "#D9FF00";  // electric yellow-green — bright accent
const ACCENT_DK   = "#65a30d";  // deep olive — gradient depth
const ACCENT_BG   = "rgba(166,204,0,0.10)";
const ACCENT_BORD = "rgba(166,204,0,0.32)";
const ACCENT_GLOW = "rgba(217,255,0,0.45)";
const ACCENT_INK  = "#0a0a0a";  // dark text used on bright green CTAs
const FONT        = "'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO        = "'JetBrains Mono','SF Mono',Menlo,Consolas,monospace";

/* ─────────────────────────────────────────────────────────────────
 * Reusable building blocks
 * ───────────────────────────────────────────────────────────────── */

function pageWrapper({ title = "Seedance Studio", preheader = "", inner }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:${FONT};color:${TEXT};-webkit-font-smoothing:antialiased">
${preheader ? `<span style="display:none!important;visibility:hidden;mso-hide:all;font-size:0;line-height:0;color:transparent;max-height:0;max-width:0;opacity:0;overflow:hidden">${preheader}</span>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG}">
  <tr><td align="center" style="padding:48px 16px 36px">
    <table role="presentation" width="100%" style="max-width:560px" cellpadding="0" cellspacing="0" border="0">

      <!-- Wordmark -->
      <tr><td align="center" style="padding-bottom:32px">
        <span style="font-family:${FONT};font-size:11px;font-weight:700;color:${TEXT};letter-spacing:0.42em;text-transform:uppercase">SEEDANCE STUDIO</span>
      </td></tr>

      <!-- Card -->
      <tr><td style="background:${CARD};border:1px solid ${BORDER};border-radius:18px;overflow:hidden;box-shadow:0 24px 60px -20px rgba(0,0,0,0.5)">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="height:1px;font-size:0;line-height:0;background:linear-gradient(90deg,transparent 0%,${ACCENT} 30%,${ACCENT_LT} 50%,${ACCENT} 70%,transparent 100%)">&nbsp;</td></tr>
        </table>
        ${inner}
      </td></tr>

      <!-- Footer -->
      <tr><td align="center" style="padding:28px 8px 8px">
        <p style="margin:0;font-family:${FONT};font-size:11px;color:${MUTED};line-height:1.8">
          Seedance Studio &nbsp;·&nbsp; <a href="${SITE}" style="color:${ACCENT_LT};text-decoration:none">seedance.visualseffect.com</a>
        </p>
        <p style="margin:6px 0 0;font-family:${FONT};font-size:10px;color:${MUTED};letter-spacing:0.06em">
          AI video generation · London, UK
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function pulseBadge({ label, color = ACCENT_LT, glow = ACCENT }) {
  return `<p style="margin:0 0 22px;font-family:${FONT};font-size:10px;font-weight:700;color:${color};letter-spacing:0.24em;text-transform:uppercase">
    <span style="color:${color};font-size:14px;vertical-align:-1px;text-shadow:0 0 8px ${glow}">●</span>&nbsp;&nbsp;${label}
  </p>`;
}

function headline(htmlContent, size = 28) {
  return `<h1 style="margin:0 0 14px;font-family:${FONT};font-size:${size}px;font-weight:600;color:${TEXT};line-height:1.18;letter-spacing:-0.025em">${htmlContent}</h1>`;
}

function subline(text) {
  return `<p style="margin:0 0 32px;font-family:${FONT};font-size:14px;color:${MUTED};line-height:1.6;font-weight:400">${text}</p>`;
}

function ctaButton({ url, label, accent = ACCENT, accentLt = ACCENT_LT, glow = ACCENT_GLOW, ink = ACCENT_INK }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0">
    <tr><td style="background:linear-gradient(135deg,${accentLt} 0%,${accent} 100%);border:1px solid rgba(255,255,255,0.22);border-radius:12px;box-shadow:0 12px 32px -8px ${glow}">
      <a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:13px;font-weight:800;color:${ink};text-decoration:none;letter-spacing:0.04em;text-transform:uppercase">${label}&nbsp;&nbsp;→</a>
    </td></tr>
  </table>`;
}

function infoTable(rows) {
  const cells = rows.map((r, i) => {
    const last = i === rows.length - 1;
    const border = last ? "" : `border-bottom:1px solid ${DIVIDER};`;
    const labelStyle = `padding:14px 0;${border}width:88px;font-family:${FONT};font-size:10px;color:${MUTED};text-transform:uppercase;letter-spacing:0.14em;font-weight:600;vertical-align:top`;
    const valueStyle = `padding:14px 0;${border}font-size:13px;color:${TEXT_DIM};${r.mono ? `font-family:${MONO};` : `font-family:${FONT};`}vertical-align:top;font-weight:500`;
    const valueHtml = r.link
      ? `<a href="${r.link}" style="color:${ACCENT_LT};text-decoration:none">${r.value}</a>`
      : r.value;
    return `<tr><td style="${labelStyle}">${r.label}</td><td style="${valueStyle}">${valueHtml}</td></tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table>`;
}

function statChip({ value, label, color = ACCENT_LT, bg = ACCENT_BG, border = ACCENT_BORD }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px">
    <tr><td style="background:${bg};border:1px solid ${border};border-radius:14px;padding:18px 24px">
      <p style="margin:0;font-family:${FONT};font-size:26px;font-weight:700;color:${color};line-height:1;letter-spacing:-0.02em">${value}</p>
      <p style="margin:8px 0 0;font-family:${FONT};font-size:10px;color:${MUTED};letter-spacing:0.16em;text-transform:uppercase;font-weight:600">${label}</p>
    </td></tr>
  </table>`;
}

/* ─────────────────────────────────────────────────────────────────
 * 1. New sign-up — admin alert
 * ───────────────────────────────────────────────────────────────── */
export async function sendSignupNotification({ name, email, image, isReturning = false }) {
  const time = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
  const displayName = name || email;
  const avatarHtml = image
    ? `<tr><td style="padding:0 36px 4px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${CARD};padding:3px;border:1px solid ${ACCENT_BORD};border-radius:50%">
          <img src="${image}" width="56" height="56" alt="" style="display:block;border-radius:50%;border:0" />
        </td></tr></table>
       </td></tr>`
    : "";

  const inner = `
    <tr><td style="padding:36px 36px 0">
      ${pulseBadge({ label: "New Member" })}
      ${headline(`A new <span style="color:${ACCENT_LT}">creator</span><br/>just joined the studio`)}
      ${subline("Your community grew by one. Drop a line when you get a chance.")}
    </td></tr>
    ${avatarHtml}
    <tr><td style="padding:${image ? "16px" : "0"} 36px 0">
      ${infoTable([
        { label: "Name", value: name || "—" },
        { label: "Email", value: email, link: `mailto:${email}` },
        { label: "Joined", value: time },
      ])}
    </td></tr>
    <tr><td style="padding:32px 36px 36px">
      ${ctaButton({ url: `${SITE}/admin`, label: "Open admin panel" })}
    </td></tr>
  `;

  await send({
    to: ADMIN_EMAIL,
    subject: `New member · ${displayName}`,
    html: pageWrapper({
      title: "New sign-up",
      preheader: `${displayName} just joined Seedance Studio · ${time}`,
      inner,
    }),
  });
}

/* ─────────────────────────────────────────────────────────────────
 * 2. Welcome email — to the new user
 *
 * Body is the file-based template at emails/seedance_welcome_email.html
 * (loaded into WELCOME_HTML at module load). We substitute three merge
 * tags:
 *   {{first_name}}      — user's first word of `name`, or "there"
 *   {{help_url}}        — mailto:hello@visualseffect.com (no /help page exists yet)
 *   {{unsubscribe_url}} — mailto:hello@visualseffect.com with the user's
 *                         email prefilled in the subject so we can sweep
 *                         opt-outs manually. Swap to a real /unsubscribe
 *                         page + suppression list when that lands.
 * ───────────────────────────────────────────────────────────────── */
export async function sendWelcomeEmail({ name, email }) {
  if (!WELCOME_HTML) {
    console.error("[EMAIL] WELCOME_HTML missing — skipping welcome email to", email);
    return;
  }
  const firstName = name ? name.split(" ")[0] : "there";

  // Escape user input before injection — name can contain HTML-significant
  // chars (e.g. "Tom & Jerry") that would break the markup otherwise.
  const escape = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const helpUrl = `mailto:hello@visualseffect.com?subject=${encodeURIComponent("Seedance help")}`;
  const unsubUrl =
    `mailto:hello@visualseffect.com` +
    `?subject=${encodeURIComponent("Unsubscribe")}` +
    `&body=${encodeURIComponent(`Please unsubscribe ${email} from all Seedance emails.`)}`;

  const html = WELCOME_HTML
    .replace(/\{\{first_name\}\}/g, escape(firstName))
    .replace(/\{\{help_url\}\}/g, helpUrl)
    .replace(/\{\{unsubscribe_url\}\}/g, unsubUrl);

  await send({
    to: email,
    subject: `Welcome to Seedance, ${firstName} 🎬`,
    html,
  });
}

/* ─────────────────────────────────────────────────────────────────
 * 3. Payment received — admin alert
 * ───────────────────────────────────────────────────────────────── */
export async function sendPaymentNotification({ customerEmail, customerName, plan, credits, amountCents }) {
  const amountUSD = amountCents != null ? (amountCents / 100).toFixed(2) : "—";
  const time = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });

  const rows = [
    { label: "Customer", value: customerName || customerEmail },
    { label: "Email", value: customerEmail, link: `mailto:${customerEmail}` },
  ];
  if (plan)    rows.push({ label: "Plan",    value: plan });
  if (credits) rows.push({ label: "Credits", value: `${credits}` });
  rows.push({ label: "Time", value: time });

  const inner = `
    <tr><td style="padding:36px 36px 0">
      ${pulseBadge({ label: "Payment Received" })}
      ${headline(`<span style="color:${ACCENT_LT};font-variant-numeric:tabular-nums">$${amountUSD}</span> received`)}
      ${subline(`A payment from ${customerName || customerEmail} just landed.`)}
    </td></tr>
    <tr><td style="padding:0 36px">
      ${infoTable(rows)}
    </td></tr>
    <tr><td style="padding:32px 36px 36px">
      ${ctaButton({ url: `${SITE}/admin`, label: "Open admin panel" })}
    </td></tr>
  `;

  await send({
    to: ADMIN_EMAIL,
    subject: `Payment received · $${amountUSD} from ${customerEmail}`,
    html: pageWrapper({
      title: "Payment received",
      preheader: `$${amountUSD} from ${customerName || customerEmail} · ${time}`,
      inner,
    }),
  });
}

/* ─────────────────────────────────────────────────────────────────
 * 4. Magic link sign-in — to user
 * ───────────────────────────────────────────────────────────────── */
export async function sendMagicLinkEmail({ email, url, code }) {
  const prettyCode = code ? `${code.slice(0, 4)}&nbsp;&nbsp;${code.slice(4)}` : "";
  const inner = `
    <tr><td style="padding:40px 36px 0">
      ${pulseBadge({ label: "Secure Sign-in" })}
      ${headline(`Your sign-in <span style="color:${ACCENT_LT}">code</span>`, 28)}
      ${subline("Enter this code in the Seedance app to sign in. It expires in 30 minutes and can only be used once.")}
    </td></tr>
    ${code ? `<tr><td style="padding:22px 36px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td align="center" style="background:rgba(255,255,255,0.04);border:1px solid ${DIVIDER};border-radius:14px;padding:24px 12px">
          <div style="font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:8px;color:${ACCENT_LT};line-height:1">${prettyCode}</div>
        </td></tr>
      </table>
    </td></tr>` : ""}
    <tr><td style="padding:26px 36px 0">
      <p style="margin:0;font-family:${FONT};font-size:12px;color:${MUTED};line-height:1.6">Or tap the button to sign in on this device:</p>
    </td></tr>
    <tr><td style="padding:10px 36px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td align="left">
          ${ctaButton({ url, label: "Sign in to Seedance" })}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:22px 36px 0">
      <p style="margin:0;font-family:${FONT};font-size:11px;color:${MUTED};line-height:1.6">
        Or paste this link into your browser:<br/>
        <span style="font-family:${MONO};font-size:11px;color:${TEXT_DIM};word-break:break-all">${url}</span>
      </p>
    </td></tr>
    <tr><td style="padding:28px 36px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:1px;background:${DIVIDER};font-size:0;line-height:0">&nbsp;</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 36px 36px">
      <p style="margin:0;font-family:${FONT};font-size:11px;color:${MUTED};line-height:1.6">
        Didn't request this? You can safely ignore this email — your account stays secure.
      </p>
    </td></tr>
  `;

  await send({
    to: email,
    subject: code ? `${code.slice(0, 4)} ${code.slice(4)} is your Seedance sign-in code` : "Sign in to Seedance Studio",
    html: pageWrapper({
      title: "Your sign-in code",
      preheader: "Enter this code in the Seedance app · expires in 30 minutes",
      inner,
    }),
  });
}

/* ─────────────────────────────────────────────────────────────────
 * 5. New visitor — admin alert
 * ───────────────────────────────────────────────────────────────── */
export async function sendVisitNotification({ ip, country, region, city, isp, page }) {
  const time = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
  const location = [city, region, country].filter(Boolean).join(", ") || "Unknown location";

  const rows = [
    { label: "IP",       value: ip,                 mono: true },
    { label: "Page",     value: page,               mono: true, link: `${SITE}${page.startsWith("/") ? page : "/" + page}` },
  ];
  if (isp) rows.push({ label: "ISP", value: isp });
  rows.push({ label: "Time", value: time });

  const inner = `
    <tr><td style="padding:36px 36px 0">
      ${pulseBadge({ label: "New Visitor" })}
      ${headline(`<span style="color:${ACCENT_LT}">${location}</span>`, 24)}
      ${subline("Someone just opened the studio.")}
    </td></tr>
    <tr><td style="padding:0 36px">
      ${infoTable(rows)}
    </td></tr>
    <tr><td style="padding:32px 36px 36px">
      ${ctaButton({ url: `${SITE}/admin`, label: "View visitors" })}
    </td></tr>
  `;

  await send({
    to: ADMIN_EMAIL,
    subject: `New visitor · ${location}`,
    html: pageWrapper({
      title: "New visitor",
      preheader: `Visit from ${location} (${ip}) · ${page}`,
      inner,
    }),
  });
}
