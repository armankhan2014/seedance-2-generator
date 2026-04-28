/**
 * Sends a new-signup notification email to Arman via Resend.
 * Requires RESEND_API_KEY env var in Vercel.
 */
export async function sendSignupNotification({ name, email, image }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.log("[EMAIL] RESEND_API_KEY not set — skipping signup notification");
    return;
  }

  const time = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "full",
    timeStyle: "short",
  });

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f0f14;color:#e5e7eb;padding:32px;border-radius:12px;border:1px solid rgba(255,255,255,0.08)">
      <h2 style="color:#a78bfa;margin-top:0">🎉 New Sign-Up on Seedance!</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#9ca3af;width:80px">Name</td><td style="padding:6px 0;font-weight:600">${name || "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#9ca3af">Email</td><td style="padding:6px 0"><a href="mailto:${email}" style="color:#a78bfa">${email}</a></td></tr>
        <tr><td style="padding:6px 0;color:#9ca3af">Time</td><td style="padding:6px 0">${time}</td></tr>
      </table>
      ${image ? `<img src="${image}" width="64" height="64" style="border-radius:50%;margin-top:16px;border:2px solid rgba(167,139,250,0.4)" />` : ""}
      <p style="margin-top:24px;font-size:12px;color:#6b7280">Sent automatically by Seedance · <a href="https://seedance.visualseffect.com" style="color:#a78bfa">seedance.visualseffect.com</a></p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Seedance <onboarding@resend.dev>",
        to: ["armankhan0826@gmail.com"],
        subject: `New sign-up: ${name || email}`,
        html,
      }),
    });
    if (res.ok) {
      console.log("[EMAIL] Signup notification sent for", email);
    } else {
      const body = await res.text();
      console.error("[EMAIL] Resend API error:", res.status, body);
    }
  } catch (err) {
    console.error("[EMAIL] sendSignupNotification failed:", err.message);
  }
}
