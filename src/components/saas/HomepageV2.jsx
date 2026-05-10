"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import ArmanGallery from "@/components/saas/ArmanGallery";
import CinematicHero from "@/components/saas/CinematicHero";

const STEPS = [
  {
    n: "01",
    title: "Write your prompt",
    body: "Describe your scene, mood, and action. Use the AI builder to expand a short idea into a full cinematic prompt.",
  },
  {
    n: "02",
    title: "Choose settings",
    body: "Pick aspect ratio, duration, resolution, and quality. Supports 1:1, 16:9, and 9:16 formats.",
  },
  {
    n: "03",
    title: "Download & share",
    body: "Your video is ready in seconds. Download it directly or view it in your creations gallery.",
  },
];

const EXAMPLE_PROMPTS = [
  {
    tag: "Action",
    text: "A man in a grey shirt flips playing cards in a dark cyberpunk room with dramatic overhead lighting",
  },
  {
    tag: "Nature",
    text: "Slow motion ocean wave crashes on black sand beach at sunset, cinematic drone shot",
  },
  {
    tag: "Cinematic",
    text: "Epic drone shot flying through neon-lit Tokyo streets at night, rain reflections on pavement",
  },
];

export default function HomepageV2({ initialVideos = [] }) {
  const router = useRouter();

  return (
    <main>
      {/* ── Hero (cinematic interactive playground — see CinematicHero.jsx) */}
      <CinematicHero />

      {/* ── Gallery ───────────────────────────────────────────────────────── */}
      <div id="gallery">
        <ArmanGallery initialVideos={initialVideos} />
      </div>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: 1280,
          width: "100%",
          margin: "0 auto",
          padding: "64px 16px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
        >
          <div className="flex items-center gap-3 text-primary-500 mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.4em]">How it works</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground mb-8">
            Three steps to your video
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.45 }}
              className="rounded-xl bg-glass-bg backdrop-blur-3xl border border-glass-border p-6"
            >
              <div className="inline-block text-[10px] font-bold text-primary-400 bg-primary-500/10 border border-primary-500/20 rounded-md px-2.5 py-1 mb-4 uppercase tracking-widest">
                {s.n}
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-2">{s.title}</h3>
              <p className="text-xs text-muted leading-relaxed">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Example prompts ───────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: 1280,
          width: "100%",
          margin: "0 auto",
          padding: "0 16px 80px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
        >
          <div className="flex items-center gap-3 text-primary-500 mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.4em]">Try it now</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground mb-2">
            Start with an example
          </h2>
          <p className="text-muted font-medium text-xs uppercase tracking-widest mb-6">
            Not sure what to write? Click one of these to get started instantly.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {EXAMPLE_PROMPTS.map((p, i) => (
            <motion.button
              key={p.tag}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07, duration: 0.4 }}
              onClick={() => router.push(`/generate?prompt=${encodeURIComponent(p.text)}`)}
              className="text-left rounded-xl bg-glass-bg backdrop-blur-3xl border border-glass-border p-5 hover:border-primary-500/50 hover:bg-primary-500/5 transition-all group"
            >
              <div className="text-[9px] font-bold text-primary-400 uppercase tracking-widest mb-2">
                {p.tag}
              </div>
              <p className="text-xs text-muted leading-relaxed group-hover:text-foreground transition-colors">
                {p.text}
              </p>
            </motion.button>
          ))}
        </div>
      </section>
    </main>
  );
}
