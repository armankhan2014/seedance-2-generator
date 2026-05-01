/**
 * email.js — Seedance Studio transactional emails
 *
 * Sends via Gmail SMTP using Nodemailer.
 * Required env vars (already set on Vercel):
 *   GMAIL_USER      — e.g. visualseffect@gmail.com
 *   GMAIL_APP_PASS  — 16-char Gmail App Password (not your login password)
 *
 * Exports:
 *   sendSignupNotification({ name, email, image }) — alerts admin of new sign-up
 *   sendWelcomeEmail({ name, email })              — welcomes the new user
 */

import nodemailer from "nodemailer";

const ADMIN_EMAIL = "armankhan0826@gmail.com";

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASS;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

async function send({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log("[EMAIL] GMAIL_USER / GMAIL_APP_PASS not set — skipping:", subject);
    return;
  }
  const from = `"Seedance Studio" <${process.env.GMAIL_USER}>`;
  try {
    await transporter.sendMail({ from, to, subject, html });
    console.log("[EMAIL] Sent:", subject, "→", to);
  } catch (err) {
    console.error("[EMAIL] Failed to send:", subject, err.message);
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

        <!-- Logo bar -->
        <tr><td align="center" style="padding-bottom:24px">
          <div style="display:inline-block">
            <span style="color:${WHITE};font-size:16px;font-weight:700;letter-spacing:-0.3px">&#127916; Seedance Studio</span>
          </div>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:${CARD};border:1px solid ${BORDER};border-radius:16px;overflow:hidden">
          ${inner}
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:24px 0 8px">
          <p style="margin:0;font-size:11px;color:${MUTED};line-height:1.8">
            Seedance Studio &nbsp;&middot;&nbsp;
            <a href="https://seedance.visualseffect.com" style="color:${PURPLE_L};text-decoration:none">seedance.visualseffect.com</a><br/>
            You're receiving this because you signed up for Seedance Studio.
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
  const time = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "full",
    timeStyle: "short",
  });

  const avatarHtml = image
    ? `<tr><td style="padding:0 32px 24px">
         <img src="${image}" width="56" height="56"
           style="border-radius:50%;border:2px solid ${BORDER};display:block" />
       </td></tr>`
    : "";

  const inner = `
    <!-- Purple top bar -->
    <tr><td style="background:linear-gradient(135deg,${PURPLE},#4c1d95);padding:28px 32px 24px">
      <p style="margin:0;font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.12em">Admin Alert</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:${WHITE};line-height:1.2">New sign-up! &#127881;</h1>
    </td></tr>

    ${avatarHtml}

    <!-- Details table -->
    <tr><td style="padding:${image ? "0" : "24px"} 32px 28px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:${MUTED};font-size:12px;width:72px;vertical-align:top">Name</td>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:${TEXT};font-size:13px;font-weight:600">${name || "&#8212;"}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:${MUTED};font-size:12px;vertical-align:top">Email</td>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:13px">
            <a href="mailto:${email}" style="color:${PURPLE_L};text-decoration:none">${email}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:${MUTED};font-size:12px;vertical-align:top">Time</td>
          <td style="padding:10px 0;color:${TEXT};font-size:13px">${time}</td>
        </tr>
      </table>
    </td></tr>

    <!-- CTA -->
    <tr><td style="padding:0 32px 32px">
      <a href="https://seedance.visualseffect.com/admin"
        style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,${PURPLE},#5b21b6);color:${WHITE};font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em">
        View in Admin Dashboard &#8594;
      </a>
    </td></tr>
  `;

  await send({
    to: ADMIN_EMAIL,
    subject: `New sign-up: ${name || email}`,
    html: baseWrapper(inner),
  });
}

// ── 2. Welcome email to new user ───────────────────────────────────────────────
export async function sendWelcomeEmail({ name, email }) {
  const firstName = name ? name.split(" ")[0] : "there";

  const steps = [
    ["01", "Write a prompt", "Describe your scene — mood, action, lighting. The more detail the better."],
    ["02", "Pick your settings", "Choose duration (5s, 10s, 15s), aspect ratio, and quality."],
    ["03", "Download your video", "Your video generates in seconds. Download or share it instantly."],
  ];

  const stepsHtml = steps.map(([n, title, desc]) => `
    <tr><td style="padding:0 0 16px" valign="top">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="36" valign="top" style="padding-right:14px">
          <div style="width:28px;height:28px;background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);border-radius:6px;text-align:center;line-height:28px;font-size:10px;font-weight:800;color:${PURPLE_L}">${n}</div>
        </td>
        <td valign="top">
          <p style="margin:0 0 2px;font-size:13px;font-weight:600;color:${TEXT}">${title}</p>
          <p style="margin:0;font-size:12px;color:${MUTED};line-height:1.5">${desc}</p>
        </td>
      </tr></table>
    </td></tr>
  `).join("");

  const inner = `
    <!-- Hero -->
    <tr><td style="background:linear-gradient(135deg,#1e1b4b,#2e1065);padding:36px 32px 28px;text-align:center">
      <div style="font-size:40px;margin-bottom:12px">&#127916;</div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:${WHITE};line-height:1.2">
        Welcome to Seedance, ${firstName}!
      </h1>
      <p style="margin:0;font-size:14px;color:rgba(196,181,253,0.9);line-height:1.6">
        You've just unlocked AI-powered video generation.<br/>Your first 10 credits are ready to use.
      </p>
    </td></tr>

    <!-- Credits badge -->
    <tr><td style="padding:28px 32px 0;text-align:center">
      <div style="display:inline-block;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:12px;padding:16px 28px">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${PURPLE_L};text-transform:uppercase;letter-spacing:0.1em">Your starting credits</p>
        <p style="margin:0;font-size:36px;font-weight:800;color:${WHITE}">10</p>
        <p style="margin:4px 0 0;font-size:11px;color:${MUTED}">Free credits &mdash; no card required</p>
      </div>
    </td></tr>

    <!-- Steps -->
    <tr><td style="padding:28px 32px 8px">
      <p style="margin:0 0 16px;font-size:11px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:0.1em">Get started in 3 steps</p>
      <table width="100%" cellpadding="0" cellspacing="0">${stepsHtml}</table>
    </td></tr>

    <!-- Divider -->
    <tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,0.06)"></div></td></tr>

    <!-- CTA -->
    <tr><td style="padding:28px 32px 32px;text-align:center">
      <a href="https://seedance.visualseffect.com/generate"
        style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,${PURPLE},#5b21b6);color:${WHITE};font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.02em">
        Generate Your First Video &#8594;
      </a>
      <p style="margin:16px 0 0;font-size:12px;color:${MUTED}">
        Questions? Reply to this email or contact us at
        <a href="mailto:${ADMIN_EMAIL}" style="color:${PURPLE_L};text-decoration:none">${ADMIN_EMAIL}</a>
      </p>
    </td></tr>
  `;

  await send({
    to: email,
    subject: `Welcome to Seedance, ${firstName}! Your 10 free credits are ready`,
    html: baseWrapper(inner),
  });
}
