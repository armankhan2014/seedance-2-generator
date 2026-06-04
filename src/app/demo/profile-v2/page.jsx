/**
 * /demo/profile-v2
 *
 * Staging preview of the redesigned premium creator profile.
 *
 * What this demo proves (Phase 1):
 *   • New visual layout — cover banner + large overlapping avatar,
 *     name/tagline/location header, stats row, tabs, right sidebar.
 *   • Edit Profile modal surfacing every field from the spec —
 *     first/last/display name, username + cooldown UX, bio, tagline,
 *     location, pronouns, languages, social links, privacy,
 *     notifications, email, password, 2FA, delete account.
 *   • Pulls the signed-in user's REAL current data (name, email,
 *     avatar, credits, member-since) so the redesign reads as alive
 *     rather than a Figma frame.
 *
 * What this demo does NOT yet do (deferred to Phase 2):
 *   • Save to DB — Edit modal updates local state only.
 *   • Cover-banner upload to R2 (gradient placeholder for now).
 *   • Real @handle uniqueness/cooldown enforcement on the server.
 *   • Pusher real-time push to other subdomains.
 *
 * After Arman signs off on the visual, Phase 2 lands the schema
 * migration (add bio/location/tagline/socialLinks/coverImageUrl/
 * pronouns to seedance's User table — these already exist on
 * community's mirrored schema), the PATCH /api/me endpoint, and
 * replaces /profile with this client.
 */

import { Suspense } from "react";
import ProfileV2Client from "./ProfileV2Client";

export const metadata = {
  title: "Profile v2 (demo) — Seedance",
  description:
    "Staging preview of the redesigned Seedance creator profile.",
  robots: { index: false, follow: false },
};

export default function ProfileV2DemoPage() {
  return (
    <Suspense fallback={null}>
      <ProfileV2Client />
    </Suspense>
  );
}
