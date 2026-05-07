"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import ArmanGallery from "@/components/saas/ArmanGallery";

const STATS = [
  { num: "12,847+", label: "Videos Generated" },
  { num: "3,200+",  label: "Creators"          },
  { num: "4.9★",    label: "Rating"             },
];

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
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: 1280,
          width: "100%",
          margin: "0 auto",
          padding: "96px 16px 64px",
          textAlign: "center",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-4 py-1.5 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
            <span className="text-[10px] font-semibold text-primary-400 uppercase tracking-widest">
              Powered by Seedance 2.0
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground leading-[1.1] max-w-3xl mx-auto mb-5">
            Turn ideas into{" "}
            <span className="text-primary-400">cinematic</span>{" "}
            AI videos
          </h1>

          <p className="text-muted text-sm md:text-base max-w-md mx-auto mb-10 leading-relaxed">
            Write a prompt, pick your settings, and watch your vision come to life in seconds.
          </p>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => router.push("/generate")}
              className="px-7 py-3.5 bg-gradient-to-r from-primary-600 to-primary-500 text-black rounded-xl text-sm font-bold tracking-wide shadow-xl shadow-primary-500/20 border border-primary-400/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Generate a video
            </button>
            <button
              onClick={() => document.getElementById("gallery")?.scrollIntoView({ behavior: "smooth" })}
              className="px-7 py-3.5 bg-glass-bg border border-glass-border text-foreground rounded-xl text-sm font-medium hover:bg-glass-hover transition-all"
            >
              See examples
            </button>
          </div>
        </motion.div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          borderTop:    "1px solid rgba(255,255,255,.05)",
          borderBottom: "1px solid rgba(255,255,255,.05)",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
          }}
        >
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.07 }}
              style={{
                padding: "22px 24px",
                textAlign: "center",
                borderRight: i < STATS.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none",
              }}
            >
              <div className="text-xl md:text-2xl font-semibold text-foreground">{s.num}</div>
              <div className="text-[10px] text-muted uppercase tracking-widest mt-1">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </div>

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
