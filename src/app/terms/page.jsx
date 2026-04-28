import Link from "next/link";
import Footer from "@/components/saas/Footer";

export const metadata = {
  title: "Terms of Service",
  description: "Terms and conditions for using Seedance Studio.",
};

export default function TermsPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      fontFamily: "Inter, sans-serif",
      padding: "60px 24px 80px",
    }}>
      <div style={{ maxWidth: "720px", margin: "0 auto" }}>

        <Link href="/" style={{
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
          Terms of Service
        </h1>
        <p style={{ color: "#475569", fontSize: "0.85rem", marginBottom: "40px" }}>
          Last updated: June 2025
        </p>

        {[
          {
            title: "Acceptance of Terms",
            body: `By accessing or using Seedance Studio, you agree to be bound by these Terms of Service. If you do not agree, please do not use the service.`,
          },
          {
            title: "Use of the Service",
            body: `Seedance Studio grants you a personal, non-transferable licence to use the platform for lawful purposes. You may not use the service to generate content that is illegal, harmful, deceptive, or infringes the rights of others. We reserve the right to suspend or terminate accounts that violate these terms.`,
          },
          {
            title: "Credits and Payments",
            body: `Credits are purchased in advance and are non-transferable. Unused credits do not expire. Refunds are available on unused credit purchases within 7 days of the transaction, provided no credits from that purchase have been spent. To request a refund, contact us at support@seedance.visualseffect.com.`,
          },
          {
            title: "Generated Content",
            body: `You retain ownership of the videos you generate using the service. By using the service you confirm that your prompts and input materials do not infringe any third-party intellectual property rights. Seedance Studio is not liable for content generated based on your inputs.`,
          },
          {
            title: "Service Availability",
            body: `We aim to keep Seedance Studio available at all times but do not guarantee uninterrupted access. We may modify, suspend, or discontinue features with or without notice. We are not liable for any losses resulting from service interruptions.`,
          },
          {
            title: "Limitation of Liability",
            body: `To the fullest extent permitted by law, Seedance Studio and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.`,
          },
          {
            title: "Changes to Terms",
            body: `We may update these terms from time to time. Continued use of the service after changes constitutes acceptance of the revised terms.`,
          },
          {
            title: "Contact",
            body: `Questions about these terms? Reach us at support@seedance.visualseffect.com.`,
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
  );
}
