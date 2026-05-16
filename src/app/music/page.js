import MusicClient from "./MusicClient";

export const metadata = {
  title: "AI Music Generator — Seedance Studio",
  description:
    "Generate royalty-free cinematic music, vocals, and ambient tracks for your films with AI. Genre and mood presets, lyrics, premium player with waveform — paired with our AI video generator.",
};

// Server entry point. Renders the client island that owns all the
// interactive bits (form, generation, player, library). Kept tiny so
// future server-side prefetches (e.g. the user's library count
// preloaded into the meta-description) drop in here.
export default function MusicPage() {
  return <MusicClient />;
}
