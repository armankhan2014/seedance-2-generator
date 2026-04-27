"use client";
import { useEffect, useState, useRef } from "react";
import { FaPlay, FaTimes } from "react-icons/fa";
import { FiDownload } from "react-icons/fi";
import { downloadMedia } from "@/lib/utils";
function GalleryCard({ video }) {
  const videoRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const getAspectClass = (r) => r === "9:16" ? "aspect-[9/16]" : r === "4:3" ? "aspect-[4/3]" : r === "3:4" ? "aspect-[3/4]" : "aspect-video";
  useEffect(() => {
    if (!videoRef.current) return;
    if (isHovered) { videoRef.current.play().catch(() => {}); }
    else { videoRef.current.pause(); videoRef.current.currentTime = 0; }
  }, [isHovered]);
  return (
    <>
      <div className={`relative ${getAspectClass(video.aspectRatio)} rounded-xl overflow-hidden group cursor-pointer bg-black/20 border border-white/5 hover:border-purple-500/40 transition-all duration-300`}
        onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onClick={() => setModalOpen(true)}>
        <video ref={videoRef} src={video.imageUrl} className="w-full h-full object-cover" muted loop playsInline preload="metadata" />
        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity duration-300 ${isHovered ? "opacity-100" : "opacity-0"}`} />
        {!isHovered && <div className="absolute inset-0 flex items-center justify-center"><div className="w-10 h-10 rounded-full bg-black/40 border border-white/20 flex items-center justify-center opacity-60"><FaPlay className="text-white text-xs ml-0.5" /></div></div>}
        <div className="absolute top-2 right-2 flex gap-1">
          {video.resolution && <span className="px-1.5 py-0.5 bg-black/70 text-white text-[9px] font-bold rounded uppercase">{video.resolution}</span>}
          {video.duration && <span className="px-1.5 py-0.5 bg-purple-500/80 text-white text-[9px] font-bold rounded">{video.duration}s</span>}
        </div>
        {isHovered && video.prompt && <div className="absolute bottom-0 left-0 right-0 p-3"><p className="text-white text-[10px] leading-relaxed line-clamp-2">{video.prompt}</p></div>}
      </div>
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="relative max-w-3xl w-full bg-glass-bg border border-glass-border rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
              <h3 className="text-sm font-semibold text-foreground">Gallery Video</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadMedia(video.imageUrl, `arman-gallery-${video.id}.mp4`)} className="p-2 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white transition-colors"><FiDownload className="text-sm" /></button>
                <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg bg-glass-hover text-muted hover:text-foreground transition-colors"><FaTimes className="text-sm" /></button>
              </div>
            </div>
            <video src={video.imageUrl} className="w-full max-h-[70vh] object-contain bg-black" controls autoPlay loop playsInline />
            {video.prompt && <div className="px-4 py-3 border-t border-glass-border"><p className="text-xs text-muted leading-relaxed">{video.prompt}</p></div>}
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
    fetch("/api/public/gallery").then(r => r.json()).then(d => { setVideos(d.videos || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);
  return (
    <section className="max-w-6xl w-full mx-auto mt-20 mb-12 px-4">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full mb-4">
          <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
          <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-widest">Live Gallery</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">Arman&rsquo;s Gallery</h2>
        <p className="text-sm text-muted max-w-xl mx-auto leading-relaxed">Real AI-generated videos created with Seedance v2.0. Hover to preview, click to watch in full.</p>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{Array.from({length:8}).map((_,i) => <div key={i} className="aspect-video rounded-xl bg-white/5 animate-pulse" style={{animationDelay: i*80+"ms"}} />)}</div>
      ) : videos.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">No videos yet.</div>
      ) : (
        <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))"}}>{videos.map(v => <GalleryCard key={v.id} video={v} />)}</div>
      )}
    </section>
  );
}
