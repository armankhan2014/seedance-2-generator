import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { firstName, lastName, message } = await req.json();

    if (!firstName || !lastName || !message) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASS;

    if (!user || !pass) {
      console.error("[CONTACT] GMAIL_USER or GMAIL_APP_PASS not set");
      return NextResponse.json({ error: "Email not configured" }, { status: 500 });
    }

    const time = new Date().toLocaleString("en-GB", {
      timeZone: "Europe/London",
      dateStyle: "full",
      timeStyle: "short",
    });

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0f0f14;color:#e5e7eb;padding:32px;border-radius:12px;border:1px solid rgba(255,255,255,0.08)">
        <h2 style="color:#a78bfa;margin-top:0">📬 New Contact Form Submission</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#9ca3af;width:90px">Name</td><td style="padding:6px 0;font-weight:600">${firstName} ${lastName}</td></tr>
          <tr><td style="padding:6px 0;color:#9ca3af">Time</td><td style="padding:6px 0">${time}</td></tr>
        </table>
        <div style="margin-top:20px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px">
          <p style="margin:0;color:#9ca3af;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Message</p>
          <p style="margin:0;color:#e5e7eb;white-space:pre-wrap;line-height:1.6">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#6b7280">Sent via Seedance contact form · <a href="https://seedance.visualseffect.com" style="color:#a78bfa">seedance.visualseffect.com</a></p>
      </div>
    `;

    const nodemailer = (await import("nodemailer")).default;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"Seedance Contact" <${user}>`,
      to: "armankhan0826@gmail.com",
      subject: `📬 Contact from ${firstName} ${lastName}`,
      html,
    });

    console.log("[CONTACT] Email sent for", firstName, lastName);
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[CONTACT] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
