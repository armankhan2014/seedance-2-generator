"use client";
import { useEffect, useState, useRef } from "react";

function GalleryCard({ video }) {
  const videoRef = useRef(null);
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

  // Hover play/pause
  useEffect(() => {
    if (!videoRef.current) return;
    if (isHovered && !modalOpen) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isHovered, modalOpen]);

  // Escape key closes modal
  useEffect(() => {
    if (!modalOpen) return;
    const fn = (e) => { if (e.key === "Escape") setModalOpen(false); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [modalOpen]);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = video.imageUrl;
    a.download = `arman-${video.id}.mp4`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      {/* Thumbnail card */}
      <div
        className={`relative ${getAspectClass(video.aspectRatio)} rounded-xl overflow-hidden cursor-pointer bg-black`}
        style={{ border: "1px solid rgba(255,255,255,0.06)", transition: "border-color .2s, box-shadow .2s" }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setModalOpen(true)}
      >
        <video ref={videoRef} src={video.imageUrl} className="w-full h-full object-cover" muted loop playsInline preload="metadata" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"
          style={{ opacity: isHovered ? 1 : 0, transition: "opacity .25s" }} />

        {!isHovered && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div style={{ width:40,height:40,borderRadius:"50%",background:"rgba(0,0,0,.55)",border:"1px solid rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <svg width="12" height="14" viewBox="0 0 12 14" fill="white"><path d="M1 1l10 6L1 13V1z"/></svg>
            </div>
          </div>
        )}

        <div className="absolute top-2 right-2 flex gap-1">
          {video.resolution && <span style={{padding:"2px 5px",background:"rgba(0,0,0,.75)",color:"#fff",fontSize:9,borderRadius:3,fontWeight:700,textTransform:"uppercase"}}>{video.resolution}</span>}
          {video.duration  && <span style={{padding:"2px 5px",background:"rgba(124,58,237,.85)",color:"#fff",fontSize:9,borderRadius:3,fontWeight:700}}>{video.duration}s</span>}
        </div>

        {isHovered && video.prompt && (
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <p style={{color:"#fff",fontSize:10,lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
              {video.prompt}
            </p>
          </div>
        )}
      </div>

      {/* Modal — completely self-contained styles, no CSS vars */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          style={{
            position:"fixed", inset:0, zIndex:99999,
            display:"flex", alignItems:"center", justifyContent:"center",
            padding:16,
            backgroundColor:"rgba(0,0,0,.88)",
            backdropFilter:"blur(10px)",
            WebkitBackdropFilter:"blur(10px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position:"relative",
              width:"100%", maxWidth:680,
              borderRadius:16,
              overflow:"hidden",
              boxShadow:"0 25px 60px rgba(0,0,0,.7)",
              backgroundColor:"#0f0f14",
              border:"1px solid rgba(255,255,255,.1)",
            }}
          >
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid rgba(255,255,255,.07)" }}>
              <span style={{ color:"#fff", fontSize:13, fontWeight:600 }}>Gallery Video</span>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={handleDownload}
                  style={{ padding:8, borderRadius:8, background:"rgba(124,58,237,.15)", border:"none", cursor:"pointer", color:"#a78bfa", display:"flex", alignItems:"center" }}
                  title="Download">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m-4-4l4 4 4-4"/></svg>
                </button>
                <button onClick={() => setModalOpen(false)}
                  style={{ padding:8, borderRadius:8, background:"rgba(255,255,255,.07)", border:"none", cursor:"pointer", color:"#9ca3af", display:"flex", alignItems:"center" }}
                  title="Close">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            {/* Video */}
            <video
              src={video.imageUrl}
              style={{ width:"100%", display:"block", backgroundColor:"#000", maxHeight:"60vh" }}
              controls autoPlay loop playsInline
            />

            {/* Prompt — max 4 lines, scrollable */}
            {video.prompt && (
              <div style={{ padding:"10px 16px", borderTop:"1px solid rgba(255,255,255,.07)", maxHeight:80, overflowY:"auto" }}>
                <p style={{ color:"#6b7280", fontSize:11, lineHeight:1.6, margin:0 }}>{video.prompt}</p>
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
    fetch("/api/public/gallery").then(r=>r.json()).then(d=>{ setVideos(d.videos||[]); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  return (
    <section style={{ maxWidth:1152, width:"100%", margin:"80px auto 48px", padding:"0 16px" }}>
      <div style={{ textAlign:"center", marginBottom:40 }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"4px 12px", background:"rgba(124,58,237,.1)", border:"1px solid rgba(124,58,237,.25)", borderRadius:999, marginBottom:16 }}>
          <div style={{ width:6,height:6,background:"#a78bfa",borderRadius:"50%",animation:"pulse 2s infinite" }} />
          <span style={{ color:"#a78bfa", fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase" }}>Live Gallery</span>
        </div>
        <h2 style={{ color:"#fff", fontSize:"clamp(22px,4vw,32px)", fontWeight:700, margin:"0 0 10px" }}>Arman&rsquo;s Gallery</h2>
        <p style={{ color:"#6b7280", fontSize:13, maxWidth:480, margin:"0 auto", lineHeight:1.6 }}>
          Real AI-generated videos created with Seedance v2.0. Hover to preview, click to watch in full.
        </p>
      </div>

      {loading ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:16 }}>
          {Array.from({length:8}).map((_,i)=>(
            <div key={i} style={{ aspectRatio:"16/9", borderRadius:12, background:"rgba(255,255,255,.05)", animation:"pulse 1.5s infinite", animationDelay:`${i*80}ms` }} />
          ))}
        </div>
      ) : videos.length===0 ? (
        <div style={{ textAlign:"center", padding:"64px 0", color:"#6b7280", fontSize:13 }}>No videos yet.</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:16 }}>
          {videos.map(v => <GalleryCard key={v.id} video={v} />)}
        </div>
      )}
    </section>
  );
}
