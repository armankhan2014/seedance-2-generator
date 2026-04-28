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
import { FiDownload } from "react-icons/fi";

export default function CreationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

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
                      src={item.imageUrl}
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
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 p-4 flex flex-col justify-end">
                    <p className="text-white text-xs font-semibold tracking-tight truncate mb-1">
                      {item.prompt}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-semibold text-primary-400 uppercase tracking-widest">
                        {item.aspectRatio}
                      </span>
                      <div className="flex items-center gap-2">
                        {item.status === "completed" && item.imageUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadMedia(item.imageUrl, `seedance-${item.id}.mp4`);
                            }}
                            title="Download video"
                            className="w-8 h-8 rounded-lg bg-primary-600 hover:bg-primary-500 border border-primary-400/50 flex items-center justify-center text-white transition-colors"
                          >
                            <FiDownload size={12} />
                          </button>
                        )}
                        <div className="w-8 h-8 rounded-lg bg-glass-hover border border-glass-border flex items-center justify-center text-white">
                          <FaExpandAlt className="text-[10px]" />
                        </div>
                      </div>
                    </div>
                  </div>
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
            onClick={() => setSelectedImage(null)}
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
                  <div className="space-y-2">
                    <div className="text-xs text-muted">
                      Prompt
                    </div>
                    <p className="text-sm font-normal text-foreground leading-relaxed">
                      {selectedImage.prompt}
                    </p>
                  </div>

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

                <div className="pt-12">
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
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setSelectedImage(null)}
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
