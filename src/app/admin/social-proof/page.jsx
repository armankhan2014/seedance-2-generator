import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminSocialProofClient from "./AdminSocialProofClient";

/**
 * /admin/social-proof — owner-gated control panel for the live
 * social-proof popup system.
 *
 * Same gate as /admin/page.jsx — server-side redirect if
 * session.user.email !== OWNER_EMAIL.
 */

const OWNER_EMAIL = "armankhan0826@gmail.com";

export const dynamic = "force-dynamic";

export default async function AdminSocialProofPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    redirect("/");
  }
  return <AdminSocialProofClient />;
}
