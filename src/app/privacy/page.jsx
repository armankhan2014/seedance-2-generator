import Link from "next/link";
import Footer from "@/components/saas/Footer";

export const metadata = {
  title: "Privacy Policy",
  description: "How Seedance Studio collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <>
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      fontFamily: "Inter, sans-serif",
      padding: "60px 24px 80px",
    }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>

        <Link href="/generate" style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "0.85rem",
          color: "#64748b",
          textDecoration: "none",
          marginBottom: "40px",
        }}>
          ← Back to Generate
        </Link>

        <h1 style={{
          fontSize: "2rem",
          fontWeight: 900,
          color: "#e2e8f0",
          letterSpacing: "-0.03em",
          marginBottom: "8px",
        }}>
          Privacy Policy
        </h1>
        <p style={{ color: "#475569", fontSize: "0.85rem", marginBottom: "40px" }}>
          Last updated: June 2025
        </p>

        {[
          {
            title: "Information We Collect",
            body: `We collect information you provide when creating an account via Google OAuth — including your name and email address. We also collect usage data such as videos generated, credits purchased, and session activity to operate and improve the service.`,
          },
          {
            title: "How We Use Your Information",
            body: `Your information is used solely to provide and improve Seedance Studio. This includes authenticating your account, processing payments via Stripe, delivering generated videos, and communicating service updates. We do not sell your personal data to third parties.`,
          },
          {
            title: "Payments",
            body: `Credit purchases are processed by Stripe. Seedance Studio does not store your payment card details. Stripe's privacy policy governs the handling of your payment information.`,
          },
          {
            title: "Data Retention",
            body: `Your account data and generated videos are retained for as long as your account is active. You may request deletion of your account and associated data by contacting us at the email below.`,
          },
          {
            title: "Cookies",
            body: `We use essential session cookies required for authentication. We do not use tracking or advertising cookies.`,
          },
          {
            title: "Contact",
            body: `If you have questions about this policy, please contact us at hello@visualseffect.com.`,
          },
        ].map(({ title, body }) => (
          <div key={title} style={{ marginBottom: "36px" }}>
            <h2 style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: "#e2e8f0",
              marginBottom: "10px",
              letterSpacing: "-0.01em",
            }}>
              {title}
            </h2>
            <p style={{
              fontSize: "0.88rem",
              color: "#64748b",
              lineHeight: 1.8,
              margin: 0,
            }}>
              {body}
            </p>
          </div>
        ))}

      </div>
    </div>
    <Footer />
    </>
  );
}
