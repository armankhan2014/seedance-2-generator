// /music/studio — Studio Pro DAW v0.
//
// Server entry. Auth-gates the page (the DAW is a paid feature so
// anonymous traffic shouldn't see it) and hands off rendering to
// the StudioClient which runs the Web Audio engine in the browser.
//
// Currently a "Hello DAW" scope: 3 sync'd track lanes with Canvas
// waveforms, drag-from-library, transport bar, per-track
// mute/solo/volume. Editing (drag clips, trim, split, fade,
// snap-to-grid, save projects) is v1 — multi-session build.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import StudioClient from "./StudioClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Studio Pro · Multi-track audio editor — Seedance Studio",
  description:
    "Pro audio editor for AI-generated music. Drag library tracks onto a multi-track timeline, mute/solo/balance, sync playback. Studio Pro tier.",
};

export default async function StudioPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    // Send unauthed users to the public /music page where the
    // sign-in modal opens. The callbackUrl preserves the path so
    // they land back here after sign-in.
    redirect("/music?next=/music/studio");
  }
  return <StudioClient />;
}
