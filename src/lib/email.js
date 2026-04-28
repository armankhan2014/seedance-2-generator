/**
 * Sends a new-signup notification email to Arman.
 * Uses Gmail SMTP via nodemailer.
 * Requires env vars: NOTIFY_EMAIL_USER, NOTIFY_EMAIL_PASS (Gmail App Password)
 */
export async function sendSignupNotification({ name, email, image }) {
  const user = process.env.NOTIFY_EMAIL_USER;
  const pass = process.env.NOTIFY_EMAIL_PASS;

  if (!user || !pass) {
    console.log("[EMAIL] NOTIFY_EMAIL_USER/PASS not set — skipping signup notification");
    return;
  }

  const time = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "full",
    timeStyle: "short",
  });

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f0f14;color:#e5e7eb;padding:32px;border-radius:12px;border:1px solid rgba(255,255,255,0.08)">
      <h2 style="color:#a78bfa;margin-top:0">New Sign-Up on Seedance!</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#9ca3af;width:80px">Name</td><td style="padding:6px 0;font-weight:600">${name || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#9ca3af">Email</td><td style="padding:6px 0"><a href="mailto:${email}" style="color:#a78bfa">${email}</a></td></tr>
        <tr><td style="padding:6px 0;color:#9ca3af">Time</td><td style="padding:6px 0">${time}</td></tr>
      </table>
      ${image ? `<img src="${image}" width="64" height="64" style="border-radius:50%;margin-top:16px;border:2px solid rgba(167,139,250,0.4)" />` : ""}
      <p style="margin-top:24px;font-size:12px;color:#6b7280">Sent automatically by Seedance</p>
    </div>
  `;

  try {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `"Seedance Notifications" <${user}>`,
      to: "armankhan0826@gmail.com",
      subject: `New sign-up: ${name || email}`,
      html,
    });
    console.log("[EMAIL] Signup notification sent for", email);
  } catch (err) {
    console.error("[EMAIL] sendSignupNotification failed:", err.message);
  }
}
