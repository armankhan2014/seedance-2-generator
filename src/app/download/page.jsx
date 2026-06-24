import Link from "next/link";

export const metadata = {
  title: "Download Seedance for Android",
  description: "Install the Seedance AI video generator on Android. Direct APK download — beta access while we finish Play Store review.",
  openGraph: {
    title: "Seedance — AI Video Generator (Android beta)",
    description: "Type. Tap. Cinema. Generate cinematic AI videos from text, photos, or multi-shot stories.",
    images: ["/og-image.png"],
  },
};

export default function DownloadPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      fontFamily: "Inter, sans-serif",
      color: "#FFFFFF",
      padding: "60px 24px 80px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
      <div style={{ maxWidth: "560px", width: "100%" }}>

        <Link href="/" style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.85rem",
          color: "#64748b",
          textDecoration: "none",
          marginBottom: "32px",
        }}>
          ← seedance.visualseffect.com
        </Link>

        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{
            width: "96px",
            height: "96px",
            borderRadius: "22px",
            background: "#000",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "20px",
            border: "2px solid #d4ff00",
          }}>
            <span style={{
              fontSize: "56px",
              fontWeight: 900,
              color: "#d4ff00",
              lineHeight: 1,
              fontFamily: "Inter, sans-serif",
            }}>S</span>
          </div>

          <h1 style={{
            fontSize: "2.4rem",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            marginBottom: "12px",
            lineHeight: 1.1,
          }}>
            Seedance for Android
          </h1>

          <p style={{
            fontSize: "1.05rem",
            color: "#94a3b8",
            margin: 0,
          }}>
            Type. Tap. Cinema. Generate cinematic AI video in under a minute.
          </p>
        </div>

        <a
          href="/seedance.apk"
          download
          style={{
            display: "block",
            background: "#d4ff00",
            color: "#000",
            fontSize: "1.1rem",
            fontWeight: 800,
            textAlign: "center",
            padding: "18px 24px",
            borderRadius: "14px",
            textDecoration: "none",
            marginBottom: "12px",
            letterSpacing: "-0.01em",
          }}
        >
          ⬇ Download APK — v1.0.3 · 3.7 MB
        </a>

        <p style={{
          fontSize: "0.8rem",
          color: "#64748b",
          textAlign: "center",
          marginTop: 0,
          marginBottom: "48px",
        }}>
          Android only · Play Store version coming in 3 weeks
        </p>

        <div style={{
          background: "#111",
          border: "1px solid #1f2937",
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "24px",
        }}>
          <h2 style={{
            fontSize: "1rem",
            fontWeight: 700,
            marginTop: 0,
            marginBottom: "16px",
            color: "#d4ff00",
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}>
            How to install
          </h2>
          <ol style={{
            margin: 0,
            paddingLeft: "20px",
            color: "#cbd5e1",
            lineHeight: 1.7,
            fontSize: "0.95rem",
          }}>
            <li>Tap the green download button above on your Android phone</li>
            <li>When prompted, allow <strong style={{ color: "#fff" }}>&ldquo;Install from this source&rdquo;</strong> (one-time setting)</li>
            <li>Open the APK file from your Downloads folder, tap <strong style={{ color: "#fff" }}>Install</strong></li>
            <li>Launch Seedance, sign in with Google or email, get 100 free credits</li>
          </ol>
        </div>

        <div style={{
          fontSize: "0.85rem",
          color: "#64748b",
          textAlign: "center",
          lineHeight: 1.6,
        }}>
          Questions or feedback?{" "}
          <a href="mailto:hello@visualseffect.com" style={{ color: "#d4ff00", textDecoration: "none" }}>
            hello@visualseffect.com
          </a>
          <br />
          <Link href="/privacy" style={{ color: "#64748b", textDecoration: "none" }}>Privacy</Link>
          {" · "}
          <Link href="/terms" style={{ color: "#64748b", textDecoration: "none" }}>Terms</Link>
        </div>

      </div>
    </div>
  );
}
