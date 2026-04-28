export async function sendSignupNotification({ name, email, image }) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.log("[EMAIL] RESEND_API_KEY not set — skipping signup notification");
    return;
  }
  const time = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
  const html = `<div style="font-family:sans-serif;max-width:480px;background:#0f0f14;color:#e5e7eb;padding:32px;border-radius:12px"><h2 style="color:#a78bfa;margin-top:0">New Sign-Up on Seedance!</h2><table style="width:100%"><tr><td style="color:#9ca3af;width:70px">Name</td><td style="font-weight:600">${name||"—"}</td></tr><tr><td style="color:#9ca3af">Email</td><td><a href="mailto:${email}" style="color:#a78bfa">${email}</a></td></tr><tr><td style="color:#9ca3af">Time</td><td>${time}</td></tr></table>${image?`<img src="${image}" width="56" height="56" style="border-radius:50%;margin-top:16px"/>`:""}<p style="font-size:12px;color:#6b7280">seedance.visualseffect.com</p></div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Seedance <onboarding@resend.dev>", to: ["armankhan0826@gmail.com"], subject: `New sign-up: ${name||email}`, html }),
    });
    if (res.ok) console.log("[EMAIL] Notification sent for", email);
    else console.error("[EMAIL] Resend error:", res.status, await res.text());
  } catch (err) { console.error("[EMAIL] Failed:", err.message); }
}
