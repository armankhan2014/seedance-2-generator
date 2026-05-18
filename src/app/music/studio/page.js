// /music/studio — Studio Pro DAW v0.
//
// Server entry. Decides between:
//   • signed-in → render StudioClient (the full DAW)
//   • signed-out → render StudioSignIn (an inline sign-in CTA that
//     auto-redirects back here after auth, no manual navigation
//     needed)
//
// Why an inline CTA instead of a server redirect (the original
// 2026-05-18 ship): Arman flagged that redirecting unauth traffic
// to /music?next=/music/studio was confusing — the homepage doesn't
// honor the `next` param + the user lands somewhere they didn't
// expect with no clear path back. Rendering a sign-in prompt
// in-place on /music/studio keeps the URL stable + uses NextAuth's
// callbackUrl to return the user automatically.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import StudioClient from "./StudioClient";
import StudioSignIn from "./StudioSignIn";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Studio Pro · Multi-track audio editor — Seedance Studio",
  description:
    "Pro audio editor for AI-generated music. Drag library tracks onto a multi-track timeline, mute/solo/balance, sync playback. Studio Pro tier.",
};

export default async function StudioPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return <StudioSignIn />;
  }
  return <StudioClient />;
}
