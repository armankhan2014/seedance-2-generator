"use client";
// Platform-aware download page body. Android gets the direct APK
// (unchanged); iPhone gets the web-app install path while the native
// app sits in Apple review — Apple has no APK equivalent, so
// Add to Home Screen IS the install story until the App Store listing
// goes live. Both cards always render (a wrong UA sniff must never
// hide an install path); detection only decides which card comes
// first and gets the highlight. 2026-09-13.

import { useEffect, useState } from "react";
import Link from "next/link";

const LIME = "#d4ff00";

function detectPlatform() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return null;
}

// Facebook / Instagram / TikTok in-app browsers can't Add to Home
// Screen — the user must escape to Safari first. Detecting them lets
// the iOS card lead with that step instead of confusing the user.
function detectInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|FB_IAB|Instagram|TikTok|Line\//i.test(ua);
}

function Card({ highlight, children }) {
  return (
    <div
      style={{
        background: "#111",
        border: `1px solid ${highlight ? LIME : "#1f2937"}`,
        borderRadius: "16px",
        padding: "24px",
        marginBottom: "24px",
        boxShadow: highlight ? "0 0 32px -14px rgba(212,255,0,0.55)" : "none",
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ children }) {
  return (
    <h2
      style={{
        fontSize: "1rem",
        fontWeight: 700,
        marginTop: 0,
        marginBottom: "16px",
        color: LIME,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </h2>
  );
}

function Steps({ items }) {
  return (
    <ol
      style={{
        margin: 0,
        paddingLeft: "20px",
        color: "#cbd5e1",
        lineHeight: 1.7,
        fontSize: "0.95rem",
      }}
    >
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

function IosCard({ highlight, inAppBrowser }) {
  return (
    <Card highlight={highlight}>
      <CardTitle>iPhone — install now</CardTitle>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(212,255,0,0.08)",
          border: "1px solid rgba(212,255,0,0.25)",
          borderRadius: "999px",
          padding: "5px 12px",
          fontSize: "0.78rem",
          color: LIME,
          marginBottom: "16px",
        }}
      >
        <span
          aria-hidden
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: LIME,
            display: "inline-block",
          }}
        />
        App Store version — in review with Apple
      </div>

      <p
        style={{
          margin: "0 0 14px",
          color: "#cbd5e1",
          fontSize: "0.95rem",
          lineHeight: 1.6,
        }}
      >
        No need to wait — install Seedance straight from this page. It lands on
        your home screen with its own icon and runs full-screen like any app.
      </p>

      <Steps
        items={
          inAppBrowser
            ? [
                <span key="0">
                  You&rsquo;re inside an in-app browser — tap the{" "}
                  <strong style={{ color: "#fff" }}>&middot;&middot;&middot;</strong> menu and choose{" "}
                  <strong style={{ color: "#fff" }}>Open in Safari</strong> first
                </span>,
                <span key="1">
                  In Safari, tap the <strong style={{ color: "#fff" }}>Share</strong> button (square
                  with an up arrow)
                </span>,
                <span key="2">
                  Scroll down and tap <strong style={{ color: "#fff" }}>Add to Home Screen</strong>,
                  then <strong style={{ color: "#fff" }}>Add</strong>
                </span>,
                <span key="3">
                  Open <strong style={{ color: "#fff" }}>Seedance</strong> from your home screen —
                  sign in and get 100 free credits
                </span>,
              ]
            : [
                <span key="0">
                  Open this page in <strong style={{ color: "#fff" }}>Safari</strong>
                  {" "}(if you aren&rsquo;t already)
                </span>,
                <span key="1">
                  Tap the <strong style={{ color: "#fff" }}>Share</strong> button (square with an up
                  arrow)
                </span>,
                <span key="2">
                  Scroll down and tap <strong style={{ color: "#fff" }}>Add to Home Screen</strong>,
                  then <strong style={{ color: "#fff" }}>Add</strong>
                </span>,
                <span key="3">
                  Open <strong style={{ color: "#fff" }}>Seedance</strong> from your home screen —
                  sign in and get 100 free credits
                </span>,
              ]
        }
      />

      <p
        style={{
          margin: "14px 0 0",
          fontSize: "0.8rem",
          color: "#64748b",
          lineHeight: 1.6,
        }}
      >
        The App Store app will be announced here the moment Apple approves it.
      </p>
    </Card>
  );
}

function AndroidCard({ highlight }) {
  return (
    <Card highlight={highlight}>
      <CardTitle>Android — direct APK</CardTitle>
      <a
        href="/seedance.apk"
        download
        style={{
          display: "block",
          background: LIME,
          color: "#000",
          fontSize: "1.05rem",
          fontWeight: 800,
          textAlign: "center",
          padding: "16px 24px",
          borderRadius: "14px",
          textDecoration: "none",
          marginBottom: "16px",
          letterSpacing: "-0.01em",
        }}
      >
        ⬇ Download APK — v1.0.3 · 3.7 MB
      </a>
      <Steps
        items={[
          <span key="0">Tap the download button above on your Android phone</span>,
          <span key="1">
            When prompted, allow{" "}
            <strong style={{ color: "#fff" }}>&ldquo;Install from this source&rdquo;</strong>{" "}
            (one-time setting)
          </span>,
          <span key="2">
            Open the APK from your Downloads folder, tap{" "}
            <strong style={{ color: "#fff" }}>Install</strong>
          </span>,
          <span key="3">
            Launch Seedance, sign in with Google or email, get 100 free credits
          </span>,
        ]}
      />
      <p
        style={{
          margin: "14px 0 0",
          fontSize: "0.8rem",
          color: "#64748b",
        }}
      >
        Play Store version coming soon.
      </p>
    </Card>
  );
}

export default function DownloadClient() {
  // null until mount → server HTML and first client render match
  // (Android card first, no highlight), then the effect reorders for
  // the visitor's platform. Avoids a hydration mismatch from reading
  // navigator.userAgent during render.
  const [platform, setPlatform] = useState(null);
  const [inAppBrowser, setInAppBrowser] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInAppBrowser(detectInAppBrowser());
  }, []);

  const ios = <IosCard key="ios" highlight={platform === "ios"} inAppBrowser={inAppBrowser} />;
  const android = <AndroidCard key="android" highlight={platform === "android"} />;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        fontFamily: "Inter, sans-serif",
        color: "#FFFFFF",
        padding: "60px 24px 80px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ maxWidth: "560px", width: "100%" }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.85rem",
            color: "#64748b",
            textDecoration: "none",
            marginBottom: "32px",
          }}
        >
          ← seedance.visualseffect.com
        </Link>

        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div
            style={{
              width: "96px",
              height: "96px",
              borderRadius: "22px",
              background: "#000",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "20px",
              border: `2px solid ${LIME}`,
            }}
          >
            <span
              style={{
                fontSize: "56px",
                fontWeight: 900,
                color: LIME,
                lineHeight: 1,
                fontFamily: "Inter, sans-serif",
              }}
            >
              S
            </span>
          </div>

          <h1
            style={{
              fontSize: "2.4rem",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              marginBottom: "12px",
              lineHeight: 1.1,
            }}
          >
            Get Seedance on your phone
          </h1>

          <p
            style={{
              fontSize: "1.05rem",
              color: "#94a3b8",
              margin: 0,
            }}
          >
            Type. Tap. Cinema. Generate cinematic AI video in under a minute.
          </p>
        </div>

        {platform === "ios" ? (
          <>
            {ios}
            {android}
          </>
        ) : (
          <>
            {android}
            {ios}
          </>
        )}

        <div
          style={{
            fontSize: "0.85rem",
            color: "#64748b",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          Questions or feedback?{" "}
          <a
            href="mailto:hello@visualseffect.com"
            style={{ color: LIME, textDecoration: "none" }}
          >
            hello@visualseffect.com
          </a>
          <br />
          <Link href="/privacy" style={{ color: "#64748b", textDecoration: "none" }}>
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" style={{ color: "#64748b", textDecoration: "none" }}>
            Terms
          </Link>
        </div>
      </div>
    </div>
  );
}
