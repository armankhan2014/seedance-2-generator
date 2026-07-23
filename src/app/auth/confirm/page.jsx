"use client";

/**
 * /auth/confirm — human-click interstitial for magic-link sign-in.
 *
 * Email security scanners (Kaspersky, Outlook SafeLinks, corporate
 * gateways) prefetch links in emails. NextAuth's email callback URL is a
 * ONE-TIME token — a scanner's GET consumes it, so the real person's
 * click lands on "back to login" with no error. Sign-in emails now link
 * HERE instead; the token is only spent when a human presses Continue.
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function ConfirmInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const callbackUrl = params.get("callbackUrl") ?? "/";

  const go = () => {
    window.location.href =
      "/api/auth/callback/email?token=" + encodeURIComponent(token) +
      "&email=" + encodeURIComponent(email) +
      "&callbackUrl=" + encodeURIComponent(callbackUrl);
  };

  const bad = !token || !email;

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#05050c", padding: 20,
      fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif",
    }}>
      <div style={{
        width: "min(420px, 100%)", textAlign: "center",
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 20, padding: "40px 28px",
      }}>
        <div style={{ fontSize: 34, marginBottom: 14 }}>🎬</div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff" }}>
          {bad ? "Link incomplete" : "Confirm your sign-in"}
        </h1>
        <p style={{ margin: "10px 0 26px", fontSize: 13.5, lineHeight: 1.6, color: "#94a3b8" }}>
          {bad
            ? "This sign-in link is missing its code — request a fresh one from the sign-in screen."
            : <>Signing in as <strong style={{ color: "#e2e8f0" }}>{email}</strong></>}
        </p>
        {!bad && (
          <button
            type="button"
            onClick={go}
            style={{
              display: "inline-block", width: "100%",
              background: "linear-gradient(135deg,#D9FF00 0%,#a6cc00 100%)",
              color: "#0a0a0a", border: "none", borderRadius: 12,
              padding: "15px 20px", fontSize: 14, fontWeight: 800,
              letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer",
            }}
          >
            Continue to Seedance →
          </button>
        )}
        <p style={{ margin: "18px 0 0", fontSize: 11, color: "#475569" }}>
          Didn&apos;t request this? You can safely close this page.
        </p>
      </div>
    </div>
  );
}

export default function ConfirmSignInPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmInner />
    </Suspense>
  );
}
