"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaDownload,
  FaMagic,
  FaCalendarAlt,
  FaExpandAlt,
  FaVideo,
  FaMusic,
} from "react-icons/fa";
import { useRouter } from "next/navigation";
import { downloadMedia } from "@/lib/utils";
import { FiDownload, FiTrash2, FiClipboard, FiCheck, FiChevronDown, FiChevronUp } from "react-icons/fi";
import toast from "@/lib/toast";

// ── Collapsible prompt with copy button ──────────────────────────────────────
function PromptBlock({ prompt }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (!prompt) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Prompt</div>
        <button
          onClick={() => { navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border"
          style={copied
            ? { background: "rgba(34,197,94,0.15)", borderColor: "rgba(34,197,94,0.4)", color: "#22c55e" }
            : { background: "rgba(139,92,246,0.1)", borderColor: "rgba(139,92,246,0.25)", color: "#a78bfa" }}
        >
          {copied ? <FiCheck size={11} /> : <FiClipboard size={11} />}
          <span className="ml-1">{copied ? "Copied!" : "Copy Prompt"}</span>
        </button>
      </div>
      <p
        className="text-sm font-normal text-foreground leading-relaxed transition-all"
        style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: expanded ? "unset" : 3, overflow: "hidden" }}
      >
        {prompt}
      </p>
      {prompt.length > 180 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-[10px] text-primary-400 hover:text-primary-300 transition-colors mt-0.5"
        >
          {expanded ? <><FiChevronUp size={11} /><span className="ml-1">Show less</span></> : <><FiChevronDown size={11} /><span className="ml-1">Show more</span></>}
        </button>
      )}
    </div>
  );
}

export default function CreationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [deletingId, setDeletingId] = useState(null);   // card confirm overlay
  const [deletingModal, setDeletingModal] = useState(false); // modal confirm state
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      fetchCreations();
    } else if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status]);

  const syncCreation = async (requestId) => {
    try {
      const res = await fetch("/api/seedance/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (data.status === "completed") {
        await fetchCreations();
      }
      return data;
    } catch (e) {
      console.error("Sync failed:", e);
    }
  };

  const fetchCreations = async () => {
    try {
      const res = await fetch("/api/creations");
      const data = await res.json();
      if (res.ok) {
        setCreations(data);
        return data;
      }
    } catch (error) {
      console.error("Error fetching creations:", error);
    } finally {
      setLoading(false);
    }
    return [];
  };

  const deleteCreation = async (id) => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/creations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCreations(prev => prev.filter(c => c.id !== id));
        if (selectedImage?.id === id) setSelectedImage(null);
        toast.success("Video deleted");
      } else {
        toast.error("Failed to delete video.");
      }
    } catch (e) {
      console.error("Delete failed:", e);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setDeleteLoading(false);
      setDeletingId(null);
      setDeletingModal(false);
    }
  };

  // Auto-sync processing items with MuAPI every 8s and refresh gallery
  useEffect(() => {
    let timer;
    const pending = creations.filter(c => c.status === "processing" && c.requestId);
    if (pending.length > 0) {
      timer = setTimeout(async () => {
        // Sync all processing items with MuAPI in parallel
        await Promise.all(pending.map(c => syncCreation(c.requestId)));
        // Then refresh gallery from DB
        await fetchCreations();
      }, 8000);
    }
    return () => clearTimeout(timer);
  }, [creations]);

  if (status === "loading" || loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full drop-shadow-md"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-transparent overflow-y-auto custom-scrollbar p-4 md:p-12">
      <header className="max-w-7xl mx-auto mb-10 space-y-3 pt-4 md:pt-0">
        <div className="flex items-center gap-3 text-primary-500 mb-1">
          <FaCalendarAlt className="text-sm" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.4em]">
            Your Videos
          </span>
        </div>
        <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-foreground">
          My Gallery
        </h1>
        <p className="text-muted text-sm max-w-xl">
          All the videos you've created, saved in one place.
        </p>
      </header>

      <div className="max-w-7xl mx-auto">
        {creations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center py-20 px-4"
          >
            {/* Illustration card */}
            <div className="relative w-full max-w-sm mb-10">
              <div className="rounded-2xl bg-glass-bg border border-glass-border overflow-hidden aspect-video flex items-center justify-center">
                {/* Fake video preview shimmer */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent" />
                <div className="flex flex-col items-center gap-3 z-10">
                  <div className="w-14 h-14 rounded-full bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
                    <FaVideo className="text-2xl text-primary-500/60" />
                  </div>
                  <span className="text-[10px] text-muted uppercase tracking-widest">Your first video will appear here</span>
                </div>
              </div>
              {/* Decorative ghost cards behind */}
              <div className="absolute -bottom-3 -right-3 -z-10 w-full h-full rounded-2xl border border-glass-border bg-glass-bg opacity-50" />
              <div className="absolute -bottom-6 -right-6 -z-20 w-full h-full rounded-2xl border border-glass-border bg-glass-bg opacity-25" />
            </div>

            {/* Heading */}
            <h2 className="text-2xl font-semibold text-foreground mb-2 text-center">
              No videos yet
            </h2>
            <p className="text-muted text-sm text-center max-w-xs mb-10">
              Generate your first AI video in seconds — just describe what you want to see.
            </p>

            {/* Steps */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl mb-10">
              {[
                { step: "1", icon: "✏️", title: "Write a prompt", desc: "Describe a scene, mood, or idea" },
                { step: "2", icon: "⚙️", title: "Pick settings",  desc: "Choose ratio, duration & quality" },
                { step: "3", icon: "▶️", title: "Hit Generate",   desc: "Your video is ready in ~30s" },
              ].map(({ step, icon, title, desc }) => (
                <div key={step} className="flex flex-col items-center text-center p-4 rounded-xl bg-glass-bg border border-glass-border gap-2">
                  <span className="text-2xl">{icon}</span>
                  <span className="text-xs font-semibold text-foreground">{title}</span>
                  <span className="text-[11px] text-muted leading-relaxed">{desc}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={() => router.push("/")}
              className="px-8 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-semibold text-sm transition-all shadow-xl shadow-primary-500/20 flex items-center gap-2"
            >
              <FaMagic className="text-xs" />
              Generate your first video
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence>
              {creations.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group relative rounded-xl bg-glass-bg backdrop-blur-3xl border border-glass-border aspect-square cursor-pointer overflow-hidden shadow-sm hover:shadow-md transition-shadow transition-all"
                  onClick={() => setSelectedImage(item)}
                >
                  {item.status === "completed" ? (
                    <video
                       src={item.videoFiles?.[0]}
                       poster={item.imageUrl}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      muted
                      autoPlay
                      loop
                      playsInline
                    />
                  ) : item.status === "failed" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-red-500/10 gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-500">
                        <span className="font-bold whitespace-nowrap">✕</span>
                      </div>
                      <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Failed</span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-glass-hover gap-4 relative">
                      <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
                      <span className="text-[9px] font-semibold text-muted uppercase tracking-[0.2em] animate-pulse">Generating...</span>
                      {item.requestId && (
                        <button
                          onClick={(e) => { e.stopPropagation(); syncCreation(item.requestId); }}
                          style={{ marginTop: "4px", background: "rgba(139,92,246,0.8)", border: "none", borderRadius: "6px", color: "#fff", padding: "4px 12px", fontSize: "0.7rem", cursor: "pointer" }}>
                          ↻ Check Status
                        </button>
                      )}
                    </div>
                  )}
                  {/* Normal hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 p-4 flex flex-col justify-between">
                    {/* Trash button — top right */}
                    <div className="flex justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingId(item.id); }}
                        title="Delete video"
                        className="w-7 h-7 rounded-lg bg-black/40 hover:bg-red-500/80 border border-white/10 hover:border-red-400/50 flex items-center justify-center text-white/60 hover:text-white transition-all"
                      >
                        <FiTrash2 size={11} />
                      </button>
                    </div>
                    {/* Bottom: prompt + date + actions */}
                    <div className="flex flex-col gap-2">
                      {item.prompt && (
                        <p className="text-white text-xs leading-relaxed" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {item.prompt}
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/50">
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : ""}
                        </span>
                        <div className="flex items-center gap-2">
                          {item.status === "completed" && item.imageUrl && (
                            <button
                              onClick={(e) => { e.stopPropagation(); downloadMedia(item.imageUrl, `seedance-${item.id}.mp4`); toast.info("Download started"); }}
                              title="Download video"
                              className="w-8 h-8 rounded-lg bg-primary-600 hover:bg-primary-500 border border-primary-400/50 flex items-center justify-center text-white transition-colors"
                            >
                              <FiDownload size={12} />
                            </button>
                          )}
                          <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white">
                            <FaExpandAlt className="text-[10px]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delete confirmation overlay (replaces hover overlay) */}
                  {deletingId === item.id && (
                    <div
                      className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10 p-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center">
                        <FiTrash2 size={16} className="text-red-400" />
                      </div>
                      <p className="text-white text-xs font-semibold text-center">Delete this video?</p>
                      <p className="text-white/40 text-[10px] text-center">This can't be undone.</p>
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                          className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteCreation(item.id); }}
                          disabled={deleteLoading}
                          className="px-4 py-1.5 rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-semibold transition-colors disabled:opacity-60 flex items-center gap-1.5"
                        >
                          {deleteLoading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Image Detail Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/20 backdrop-blur-sm p-4 md:p-12 flex flex-col items-center justify-center"
            onClick={() => { setSelectedImage(null); setDeletingModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative max-w-6xl w-full h-full bg-glass-bg border border-glass-border rounded-xl overflow-hidden flex flex-col md:flex-row shadow-2xl backdrop-blur-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image Side */}
              <div className="flex w-full md:w-[50%] h-[50%] md:h-full p-2 bg-glass-bg backdrop-blur-3xl flex border-b md:border-b-0 md:border-r border-glass-border">
                {selectedImage.status === "completed" ? (
                  <video
                    src={selectedImage.imageUrl}
                    className="h-full w-full object-contain"
                    controls
                    autoPlay
                    loop
                    playsInline
                  />
                ) : selectedImage.status === "failed" ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-red-500/5 gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 text-3xl">
                      ✕
                    </div>
                    <div className="text-center space-y-2">
                      <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest">Generation Failed</h3>
                      <p className="text-xs text-muted max-w-xs">{selectedImage.error || "Something went wrong. Please try generating again."}</p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-glass-hover gap-6">
                    <div className="relative">
                      <div className="w-20 h-20 border-4 border-primary-500/10 border-t-primary-500 rounded-full animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <FaMagic className="text-primary-500/30 text-xl animate-pulse" />
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <h3 className="text-sm font-black text-foreground uppercase tracking-[0.3em] animate-pulse">Generating...</h3>
                      <p className="text-[10px] text-muted">This might take a moment…</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Details Side */}
              <div className="flex w-full md:w-[50%] h-[50%] md:h-full p-6 flex flex-col bg-glass-bg backdrop-blur-3xl overflow-y-auto custom-scrollbar">
                <div className="flex flex-col justify-center space-y-4">
                  <PromptBlock prompt={selectedImage.prompt} />

                  <div className="space-y-6 border-t border-white/5 pt-10">
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-1.5">
                        <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Ratio</div>
                        <div className="text-xs text-foreground font-medium">{selectedImage.aspectRatio}</div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Resolution</div>
                        <div className="text-xs text-foreground font-medium">{selectedImage.resolution}</div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Duration</div>
                        <div className="text-xs text-foreground font-medium">{selectedImage.duration ? `${selectedImage.duration}s` : "5s"}</div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Quality</div>
                        <div className="text-xs text-foreground font-medium uppercase">{selectedImage.quality || "Basic"}</div>
                      </div>
                    </div>
                    
                    <div className="space-y-4 border-t border-glass-border pt-6">
                      {selectedImage.inputImages?.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Image References</div>
                          <div className="grid grid-cols-4 gap-2">
                            {selectedImage.inputImages.map((img, i) => (
                              <div key={i} className="relative aspect-square rounded-md bg-glass-hover overflow-hidden border border-glass-border group">
                                <img src={img} className="w-full h-full object-cover" />
                                <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <a href={img} target="_blank" rel="noopener noreferrer" className="p-1 bg-black/60 rounded flex items-center justify-center">
                                    <FaExpandAlt className="text-[8px] text-white" />
                                  </a>
                                </div>
                                <div className="absolute bottom-1 right-1 bg-black/60 px-1 rounded text-[8px] text-white">@image{i+1}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedImage.videoFiles?.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Video References</div>
                          <div className="grid grid-cols-3 gap-2">
                            {selectedImage.videoFiles.map((v, i) => (
                              <div key={i} className="relative aspect-video rounded-md bg-glass-hover overflow-hidden border border-glass-border group">
                                <video src={v} className="w-full h-full object-cover" />
                                <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <a href={v} target="_blank" rel="noopener noreferrer" className="p-1 bg-black/60 rounded flex items-center justify-center">
                                    <FaExpandAlt className="text-[8px] text-white" />
                                  </a>
                                </div>
                                <div className="absolute bottom-1 right-1 bg-black/60 px-1 rounded text-[8px] text-white">@video{i+1}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedImage.audioFiles?.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Audio References</div>
                          <div className="space-y-2">
                            {selectedImage.audioFiles.map((a, i) => (
                              <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-glass-hover border border-glass-border">
                                <FaMusic className="text-[10px] text-primary-500" />
                                <span className="text-[10px] text-foreground truncate flex-1">{a.split('/').pop()}</span>
                                <span className="text-[8px] text-muted font-bold">@audio{i+1}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5 pt-2">
                        <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Timestamp</div>
                        <div className="text-[11px] text-muted">
                          {new Date(selectedImage.createdAt).toLocaleString('en-US', { 
                            month: 'long', 
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-12 flex flex-col gap-3">
                  <button
                    onClick={async () => {
                      if (selectedImage.status !== "completed") return;
                      setDownloading(true);
                      await downloadMedia(selectedImage.imageUrl, `seedance-${selectedImage.id}.mp4`);
                      setDownloading(false);
                    }}
                    disabled={downloading || selectedImage.status !== "completed"}
                    className="w-full py-3 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg font-bold tracking-wider uppercase text-xs flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-primary-500/20 border border-primary-400/50"
                  >
                    {downloading ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <FiDownload size={16} />
                    )}
                    {selectedImage.status === "completed"
                      ? (downloading ? "Downloading..." : "Download Video")
                      : selectedImage.status === "failed"
                        ? "Generation Failed"
                        : "Generating..."}
                  </button>

                  {/* Delete button */}
                  {!deletingModal ? (
                    <button
                      onClick={() => setDeletingModal(true)}
                      className="w-full py-2.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                    >
                      <FiTrash2 size={13} />
                      Delete Video
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                      <p className="text-xs text-red-400 text-center font-semibold">Delete this video permanently?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDeletingModal(false)}
                          className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => deleteCreation(selectedImage.id)}
                          disabled={deleteLoading}
                          className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                        >
                          {deleteLoading ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiTrash2 size={12} />}
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => { setSelectedImage(null); setDeletingModal(false); }}
                className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center text-muted hover:text-white transition-colors"
              >
                <span className="text-xl">✕</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 0px;
        }
        .custom-scrollbar {
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
