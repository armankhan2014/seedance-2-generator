"use client";
import { useEffect, useState, useRef } from "react";

function GalleryCard({ video }) {
  const videoRef = useRef(null);
  const modalVideoRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const getAspectClass = (ratio) => {
    switch (ratio) {
      case "9:16": return "aspect-[9/16]";
      case "4:3":  return "aspect-[4/3]";
      case "3:4":  return "aspect-[3/4]";
      default:     return "aspect-video";
    }
  };

  useEffect(() => {
    if (!videoRef.current) return;
    if (isHovered) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isHovered]);

  useEffect(() => {
    if (modalOpen && modalVideoRef.current) {
      modalVideoRef.current.play().catch(() => {});
    }
  }, [modalOpen]);

  // Close modal on Escape key
  useEffect(() => {
    if (!modalOpen) return;
    const handleKey = (e) => { if (e.key === "Escape") setModalOpen(false); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [modalOpen]);

  const handleDownload = async () => {
    try {
      const a = document.createElement("a");
      a.href = video.imageUrl;
      a.download = `arman-gallery-${video.id}.mp4`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
  };

  return (
    <>
      {/* Card */}
      <div
        className={`relative ${getAspectClass(video.aspectRatio)} rounded-xl overflow-hidden cursor-pointer bg-black border border-white/5 hover:border-purple-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/10`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setModalOpen(true)}
      >
        <video
          ref={videoRef}
          src={video.imageUrl}
          className="w-full h-full object-cover"
          muted
          loop
          playsInline
          preload="metadata"
        />

        {/* Hover gradient */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity duration-300"
          style={{ opacity: isHovered ? 1 : 0 }}
        />

        {/* Play icon when not hovered */}
        {!isHovered && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-black/50 border border-white/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-2 right-2 flex gap-1">
          {video.resolution && (
            <span className="px-1.5 py-0.5 bg-black/70 text-white text-[9px] font-bold rounded uppercase tracking-wider">
              {video.resolution}
            </span>
          )}
          {video.duration && (
            <span className="px-1.5 py-0.5 bg-purple-600/90 text-white text-[9px] font-bold rounded">
              {video.duration}s
            </span>
          )}
        </div>

        {/* Prompt on hover */}
        {isHovered && video.prompt && (
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p className="text-white text-[10px] leading-relaxed line-clamp-2 font-medium">
              {video.prompt}
            </p>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative w-full rounded-2xl overflow-hidden shadow-2xl"
            style={{
              maxWidth: "720px",
              backgroundColor: "#111117",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span className="text-sm font-semibold text-white">Gallery Video</span>
              <div className="flex items-center gap-2">
                {/* Download */}
                <button
                  onClick={handleDownload}
                  className="p-2 rounded-lg text-purple-400 hover:text-white transition-colors"
                  style={{ backgroundColor: "rgba(139,92,246,0.12)" }}
                  title="Download"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m-4-4l4 4 4-4"/>
                  </svg>
                </button>
                {/* Close */}
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-2 rounded-lg text-gray-400 hover:text-white transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Video */}
            <video
              ref={modalVideoRef}
              src={video.imageUrl}
              className="w-full bg-black"
              style={{ maxHeight: "65vh", display: "block" }}
              controls
              autoPlay
              loop
              playsInline
            />

            {/* Prompt */}
            {video.prompt && (
              <div
                className="px-4 py-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
              >
                <p className="text-xs text-gray-400 leading-relaxed">{video.prompt}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default function ArmanGallery() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public/gallery")
      .then((r) => r.json())
      .then((data) => {
        setVideos(data.videos || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <section className="max-w-6xl w-full mx-auto mt-20 mb-12 px-4">
      {/* Header */}
      <div className="text-center mb-10">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4"
          style={{ backgroundColor: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)" }}
        >
          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
          <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest">Live Gallery</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
          Arman&rsquo;s Gallery
        </h2>
        <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
          Real AI-generated videos created with Seedance v2.0. Hover to preview, click to watch in full.
        </p>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-video rounded-xl animate-pulse"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">No videos yet.</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {videos.map((v) => (
            <GalleryCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </section>
  );
}
