"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { FaExpandAlt, FaCalendarAlt } from "react-icons/fa";
import { FiDownload, FiPlus, FiMinus, FiClipboard, FiCheck, FiChevronDown, FiChevronUp, FiArrowRight } from "react-icons/fi";
import { downloadMedia } from "@/lib/utils";

const ADMIN_EMAIL = "armankhan0826@gmail.com";
// First N cards preload metadata eagerly; the rest defer until in-view
const EAGER_COUNT = 4;

function GalleryCard({ video, index, onClick, isAdmin, onToggle, toggling }) {
  const videoRef = useRef(null);
  const eager = index < EAGER_COUNT;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Lazy-load: set src only when card enters view
          if (!eager && el.getAttribute("data-src") && !el.src) {
            el.src = el.getAttribute("data-src");
            el.load();
          }
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.25, rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [eager]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      className="group relative rounded-xl bg-glass-bg backdrop-blur-3xl border border-glass-border aspect-square cursor-pointer overflow-hidden shadow-sm hover:shadow-md transition-all"
      onClick={() => onClick(video)}
    >
      {eager ? (
        <video
          ref={videoRef}
          src={video.imageUrl}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        // Non-eager: no src until IntersectionObserver fires
        <video
          ref={videoRef}
          data-src={video.imageUrl}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          muted
          loop
          playsInline
          preload="none"
        />
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 p-4 flex flex-col justify-end">
        <p className="text-white text-xs font-semibold tracking-tight truncate mb-1">
          {video.prompt}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold text-primary-400 uppercase tracking-widest">
            {video.aspectRatio}
          </span>
          <div className="w-8 h-8 rounded-lg bg-glass-hover border border-glass-border flex items-center justify-center text-white">
            <FaExpandAlt className="text-[10px]" />
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="absolute top-2 right-2 flex gap-1 pointer-events-none">
        {video.resolution && (
          <span style={{ padding: "2px 5px", background: "rgba(0,0,0,.75)", color: "#fff", fontSize: 9, borderRadius: 3, fontWeight: 700, textTransform: "uppercase" }}>
            {video.resolution}
          </span>
        )}
        {video.duration && (
          <span style={{ padding: "2px 5px", background: "rgba(124,58,237,.85)", color: "#fff", fontSize: 9, borderRadius: 3, fontWeight: 700 }}>
            {video.duration}s
          </span>
        )}
      </div>

      {/* Admin toggle button */}
      {isAdmin && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(video); }}
          disabled={toggling}
          title={video.featured ? "Remove from gallery" : "Add to gallery"}
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            width: 28,
            height: 28,
            borderRadius: 8,
            border: video.featured ? "1.5px solid rgba(239,68,68,0.8)" : "1.5px solid rgba(34,197,94,0.8)",
            background: video.featured ? "rgba(239,68,68,0.85)" : "rgba(34,197,94,0.85)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: toggling ? "not-allowed" : "pointer",
            opacity: toggling ? 0.6 : 1,
            zIndex: 20,
            backdropFilter: "blur(8px)",
            transition: "all 0.2s",
          }}
        >
          {toggling ? (
            <div style={{ width: 10, height: 10, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
          ) : video.featured ? (
            <FiMinus size={13} />
          ) : (
            <FiPlus size={13} />
          )}
        </button>
      )}

      {/* Admin: featured indicator */}
      {isAdmin && video.featured && (
        <div style={{
          position: "absolute", top: 8, left: 8,
          padding: "2px 6px", background: "rgba(34,197,94,0.9)",
          color: "#fff", fontSize: 8, borderRadius: 4, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.08em",
          backdropFilter: "blur(8px)",
        }}>
          Live
        </div>
      )}
    </motion.div>
  );
}

// ── Buffering-aware modal video ───────────────────────────────────────────────
function ModalVideo({ src }) {
  const [buffering, setBuffering] = useState(true);
  return (
    <div className="relative h-full w-full">
      <video
        key={src}
        src={src}
        className="h-full w-full object-contain"
        controls
        autoPlay
        loop
        playsInline
        preload="auto"
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => setBuffering(false)}
        onWaiting={() => setBuffering(true)}
      />
      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

function VideoModal({ video, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1000] bg-black/20 backdrop-blur-sm p-4 md:p-12 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative max-w-6xl w-full h-full bg-glass-bg border border-glass-border rounded-xl overflow-hidden flex flex-col md:flex-row shadow-2xl backdrop-blur-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full md:w-[55%] h-[50%] md:h-full p-2 bg-glass-bg backdrop-blur-3xl border-b md:border-b-0 md:border-r border-glass-border">
          <ModalVideo src={video.imageUrl} />
        </div>

        <div className="flex w-full md:w-[45%] h-[50%] md:h-full p-6 flex-col bg-glass-bg backdrop-blur-3xl overflow-y-auto custom-scrollbar">
          <div className="flex flex-col space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-muted uppercase tracking-widest">Prompt</div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { navigator.clipboard.writeText(video.prompt); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border"
                    style={copied ? { background: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.4)", color: "#22c55e" } : { background: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.25)", color: "#a78bfa" }}
                  >
                    {copied ? <FiCheck size={11} /> : <FiClipboard size={11} />}
                    {copied ? "Copied!" : "Copy Prompt"}
                  </button>
                  <button
                    onClick={() => { onClose(); router.push(`/generate?prompt=${encodeURIComponent(video.prompt)}`); }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border"
                    style={{ background: "rgba(139,92,246,0.18)", borderColor: "rgba(139,92,246,0.4)", color: "#c4b5fd" }}
                  >
                    <FiArrowRight size={11} />
                    Use This Prompt
                  </button>
                </div>
              </div>
              <p
                className="text-sm font-normal text-foreground leading-relaxed transition-all"
                style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: expanded ? "unset" : 3, overflow: "hidden" }}
              >
                {video.prompt}
              </p>
              {video.prompt && video.prompt.length > 180 && (
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="flex items-center gap-1 text-[10px] text-primary-400 hover:text-primary-300 transition-colors mt-0.5"
                >
                  {expanded ? <><FiChevronUp size={11} /> Show less</> : <><FiChevronDown size={11} /> Show more</>}
                </button>
              )}
            </div>
            <div className="space-y-6 border-t border-white/5 pt-6">
              <div className="grid grid-cols-2 gap-6">
                {video.aspectRatio && (
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Ratio</div>
                    <div className="text-xs text-foreground font-medium">{video.aspectRatio}</div>
                  </div>
                )}
                {video.resolution && (
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Resolution</div>
                    <div className="text-xs text-foreground font-medium">{video.resolution}</div>
                  </div>
                )}
                {video.duration && (
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Duration</div>
                    <div className="text-xs text-foreground font-medium">{video.duration}s</div>
                  </div>
                )}
                {video.quality && (
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Quality</div>
                    <div className="text-xs text-foreground font-medium uppercase">{video.quality}</div>
                  </div>
                )}
              </div>
              {video.createdAt && (
                <div className="space-y-1.5 border-t border-glass-border pt-4">
                  <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Created</div>
                  <div className="text-[11px] text-muted">
                    {new Date(video.createdAt).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="pt-8 mt-auto">
            <button
              onClick={async () => { setDownloading(true); await downloadMedia(video.imageUrl, `seedance-${video.id}.mp4`); setDownloading(false); }}
              disabled={downloading}
              className="w-full py-3 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg font-bold tracking-wider uppercase text-xs flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-primary-500/20 border border-primary-400/50"
            >
              {downloading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiDownload size={16} />}
              {downloading ? "Downloading…" : "Download Video"}
            </button>
          </div>
        </div>

        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-muted hover:text-white transition-colors z-10">
          <span className="text-xl">✕</span>
        </button>
      </motion.div>
      <style jsx global>{`.custom-scrollbar::-webkit-scrollbar{width:0px}.custom-scrollbar{scrollbar-width:none}`}</style>
    </motion.div>
  );
}

export default function ArmanGallery({ initialVideos = [] }) {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  // Public visitors see initialVideos immediately (server-pre-fetched, no wait)
  // Admin users re-fetch from the admin endpoint to get toggle controls
  const [videos, setVideos] = useState(
    initialVideos.map(v => ({ ...v, featured: true }))
  );
  const [adminLoading, setAdminLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [toggling, setToggling] = useState(null);

  // Once session resolves and user is admin, fetch admin view
  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!isAdmin) return; // public visitors already have initialVideos
    setAdminLoading(true);
    fetch("/api/admin/gallery/list")
      .then(r => r.json())
      .then(d => { setVideos(d.videos || []); })
      .catch(() => {})
      .finally(() => setAdminLoading(false));
  }, [isAdmin, sessionStatus]);

  const handleToggle = async (video) => {
    setToggling(video.id);
    try {
      const res = await fetch("/api/admin/gallery/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: video.id, featured: !video.featured }),
      });
      if (res.ok) {
        setVideos(prev => prev.map(v => v.id === video.id ? { ...v, featured: !v.featured } : v));
      }
    } finally {
      setToggling(null);
    }
  };

  const displayVideos = isAdmin ? videos : videos.filter(v => v.featured !== false);
  const isLoading = adminLoading && videos.length === 0;

  return (
    <section style={{ maxWidth: 1280, width: "100%", margin: "80px auto 48px", padding: "0 16px" }}>
      <div style={{ marginBottom: 40 }}>
        <div className="flex items-center gap-3 text-primary-500 mb-3">
          <FaCalendarAlt className="text-sm" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.4em]">Live Gallery</span>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-2">Gallery</h2>
            <p className="text-muted font-medium text-xs uppercase tracking-widest leading-loose max-w-xl">
              Real AI-generated videos created with Seedance v2.0.<br className="hidden md:block" />
              Click any card to watch in full and download.
            </p>
          </div>
          {isAdmin && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Admin mode — {videos.filter(v => v.featured).length} live / {videos.length} total
              </span>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: "1/1", borderRadius: 12, background: "rgba(255,255,255,.05)", animation: "pulse 1.5s infinite", animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      ) : displayVideos.length === 0 ? (
        <div className="py-32 flex flex-col items-center justify-center text-center space-y-8">
          <div className="w-20 h-20 rounded-3xl bg-glass-bg border border-glass-border flex items-center justify-center shadow-sm">
            <FaExpandAlt className="text-3xl text-muted" />
          </div>
          <div className="space-y-4">
            <h3 className="text-xl font-bold italic text-foreground">
              {isAdmin ? "NO VIDEOS YET" : "GALLERY EMPTY"}
            </h3>
            <p className="text-muted text-xs uppercase tracking-widest">
              {isAdmin ? "Generate some videos to add them here." : "No videos yet — check back soon."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence>
            {displayVideos.map((v, i) => (
              <GalleryCard
                key={v.id}
                video={v}
                index={i}
                onClick={setSelected}
                isAdmin={isAdmin}
                onToggle={handleToggle}
                toggling={toggling === v.id}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {selected && <VideoModal video={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>

      <style jsx global>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </section>
  );
}
