"use client";
import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

const MAX_REFERENCES = 3;
const MAX_LOOK_LENGTH = 500;
const LOOK_EXAMPLES = [
  "dress me like a king",
  "1920s gangster",
  "cyberpunk warrior",
  "samurai in feudal Japan",
  "Wall Street CEO in a suit",
];

// Mirror of the compressImage helper in GenerateClient.jsx — keeps modal
// self-contained so it can be reused outside the generate page.
async function compressImage(file, { maxDim = 2048, quality = 0.85 } = {}) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode failed"));
    i.src = dataUrl;
  });
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const ratio = width > height ? maxDim / width : maxDim / height;
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob) throw new Error("encode failed");
  if (blob.size >= file.size) return file;
  return new File([blob], (file.name?.replace(/\.[^.]+$/, "") || "ref") + ".jpg", { type: "image/jpeg" });
}

export default function ImageBuilder({ onUse, onClose }) {
  const { data: session, status: sessionStatus } = useSession();
  const [refs, setRefs] = useState([]); // { file, previewUrl }
  const [look, setLook] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [userCredits, setUserCredits] = useState(null);
  const fileInputRef = useRef(null);
  const overlayRef = useRef(null);
  const progressIntervalRef = useRef(null);

  useEffect(() => {
    if (session?.user?.id) {
      fetch("/api/user/credits")
        .then(r => r.json())
        .then(d => setUserCredits(d.credits ?? 0))
        .catch(() => setUserCredits(0));
    }
  }, [session]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const onClick = (e) => { if (e.target === overlayRef.current) onClose(); };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [onClose]);

  // Clean up object URLs on unmount
  useEffect(() => () => refs.forEach(r => URL.revokeObjectURL(r.previewUrl)), [refs]);

  // Clean up the progress timer on unmount (e.g. user closes the modal mid-generation).
  useEffect(() => () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); }, []);

  const handleAddFiles = async (fileList) => {
    if (!fileList?.length) return;
    setError("");
    const slots = MAX_REFERENCES - refs.length;
    if (slots <= 0) {
      setError(`Maximum ${MAX_REFERENCES} reference photos.`);
      return;
    }
    const incoming = Array.from(fileList).slice(0, slots);
    const compressed = [];
    for (const f of incoming) {
      if (!/^image\/(jpeg|png|webp|jpg)$/i.test(f.type)) {
        setError("Reference photos must be JPEG, PNG, or WEBP.");
        continue;
      }
      try {
        const c = await compressImage(f);
        compressed.push({ file: c, previewUrl: URL.createObjectURL(c) });
      } catch {
        setError("Could not read one of the photos.");
      }
    }
    setRefs(prev => [...prev, ...compressed]);
  };

  const removeRef = (idx) => {
    setRefs(prev => {
      const copy = prev.slice();
      const [removed] = copy.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return copy;
    });
  };

  const startProgressAnimation = () => {
    setProgress(0);
    let tick = 0;
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      tick++;
      // Three phases tuned to ~30s typical generation, asymptotic toward 95%.
      // 5 ticks/sec at 200ms interval.
      setProgress((p) => {
        if (tick <= 50) return Math.min(50, tick);                       //  0-10s → 0–50%
        if (tick <= 150) return Math.min(90, 50 + (tick - 50) * 0.4);    // 10-30s → 50–90%
        return Math.min(95, 90 + (tick - 150) * 0.05);                   //  30s+  → crawl to 95%
      });
    }, 200);
  };

  const stopProgressAnimation = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const handleGenerate = async () => {
    if (!refs.length) { setError("Upload at least one reference photo."); return; }
    if (!look.trim()) { setError("Tell us the look (e.g. \"dress me like a king\")."); return; }
    setError("");
    setLoading(true);
    setResultUrl("");
    startProgressAnimation();
    try {
      const fd = new FormData();
      fd.append("look", look.trim());
      for (const r of refs) fd.append("references", r.file);
      const res = await fetch("/api/image/build", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (HTTP ${res.status})`);
      stopProgressAnimation();
      setProgress(100);
      // Small delay so the user sees the bar hit 100% before the result renders.
      await new Promise((r) => setTimeout(r, 500));
      setResultUrl(data.url);
      setUserCredits(prev => (prev == null ? prev : Math.max(0, prev - (data.creditsCharged || 0))));
    } catch (err) {
      stopProgressAnimation();
      setError(err.message || "Failed to generate.");
    } finally {
      setLoading(false);
    }
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    overlay: {
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px", backdropFilter: "blur(4px)",
    },
    modal: {
      background: "#111118",
      border: "1px solid rgba(139,92,246,0.25)",
      borderRadius: "20px",
      // Compact: leaves margin around the modal so it doesn't feel full-screen.
      // The 1536x1024 result image still fits comfortably at this width.
      width: "100%", maxWidth: "min(960px, 90vw)", maxHeight: "85vh",
      overflowY: "auto",
      boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.1)",
      fontFamily: "Inter, sans-serif",
    },
    header: {
      padding: "22px 24px 20px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      position: "sticky", top: 0, background: "#111118", zIndex: 10,
    },
    title: { fontSize: "1rem", fontWeight: 800, color: "#e2e8f0", letterSpacing: "-0.02em", marginBottom: "4px" },
    subtitle: { fontSize: "0.78rem", color: "#475569", lineHeight: 1.5 },
    body: { padding: "20px 24px" },
    label: {
      display: "block",
      fontSize: "0.68rem", fontWeight: 700, color: "#475569",
      textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px",
    },
    refRow: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" },
    refTile: {
      position: "relative", width: "76px", height: "76px",
      borderRadius: "10px", overflow: "hidden",
      border: "1px solid rgba(139,92,246,0.25)",
    },
    refImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
    refLabel: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
      color: "#fff", fontSize: "0.6rem", fontWeight: 700,
      padding: "10px 4px 3px",
      textAlign: "center", textTransform: "uppercase",
      letterSpacing: "0.05em", pointerEvents: "none",
    },
    refRemove: {
      position: "absolute", top: 3, right: 3, width: 18, height: 18,
      borderRadius: "50%", background: "rgba(0,0,0,0.7)",
      color: "#fff", fontSize: "0.65rem", border: "1px solid rgba(255,255,255,0.2)",
      cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
    },
    addTile: {
      width: "76px", height: "76px", borderRadius: "10px",
      border: "1px dashed rgba(139,92,246,0.5)",
      background: "rgba(139,92,246,0.05)", color: "#a78bfa",
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "1.4rem", fontWeight: 800, fontFamily: "inherit",
    },
    addTileDisabled: { opacity: 0.3, cursor: "not-allowed" },
    lookInput: {
      width: "100%",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "10px", padding: "12px 14px",
      color: "#e2e8f0", fontSize: "0.9rem",
      fontFamily: "inherit",
      outline: "none", boxSizing: "border-box",
    },
    examples: {
      display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px",
    },
    examplePill: {
      padding: "5px 10px",
      background: "rgba(139,92,246,0.08)",
      border: "1px solid rgba(139,92,246,0.2)",
      borderRadius: "999px",
      color: "#a78bfa",
      fontSize: "0.72rem", fontWeight: 600,
      cursor: "pointer", fontFamily: "inherit",
      transition: "all 0.15s",
    },
    primaryBtn: (enabled) => ({
      width: "100%", padding: "12px",
      borderRadius: "10px", border: "none",
      marginTop: "14px",
      background: enabled ? "linear-gradient(135deg,#8b5cf6,#7c3aed)" : "rgba(255,255,255,0.06)",
      color: enabled ? "#fff" : "#334155",
      fontSize: "0.9rem", fontWeight: 700,
      cursor: enabled ? "pointer" : "not-allowed",
      fontFamily: "inherit", transition: "opacity 0.2s",
    }),
    resultBox: {
      marginTop: "18px", borderRadius: "12px", overflow: "hidden",
      border: "1px solid rgba(139,92,246,0.25)",
      background: "rgba(139,92,246,0.04)",
    },
    errorBox: {
      fontSize: "0.78rem", color: "#f87171", marginTop: "10px",
      background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
      borderRadius: "8px", padding: "10px 12px", lineHeight: 1.5,
    },
    // Loading bar — replaces the Generate button while a generation is in flight.
    loadingBar: {
      width: "100%",
      position: "relative",
      height: "44px",
      borderRadius: "10px",
      marginTop: "14px",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(34,197,94,0.18)",
      overflow: "hidden",
    },
    loadingFill: (pct) => ({
      position: "absolute",
      top: 0, bottom: 0, left: 0,
      width: `${pct}%`,
      background: "linear-gradient(90deg, #16a34a, #22c55e, #4ade80)",
      boxShadow: "0 0 18px rgba(34,197,94,0.45), inset 0 1px 0 rgba(255,255,255,0.15)",
      transition: "width 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
      borderRadius: "10px",
    }),
    loadingText: {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "0.85rem",
      fontWeight: 700,
      color: "#fff",
      letterSpacing: "0.02em",
      textShadow: "0 1px 2px rgba(0,0,0,0.6)",
      pointerEvents: "none",
    },
  };

  const isLoggedOut = sessionStatus === "unauthenticated";
  const sessionLoading = sessionStatus === "loading" || (session && userCredits === null);
  const noCredits = session && userCredits !== null && userCredits < 20;

  return (
    <div style={S.overlay} ref={overlayRef}>
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <p style={S.title}>🎨 Build my reference</p>
              <p style={S.subtitle}>
                Upload <b>1–3 photos of yourself in this order: front, side, back</b> for the best identity match.
                A single front photo also works — AI will infer the side and back. <b>20 credits per image.</b>
              </p>
            </div>
            <button onClick={onClose} style={{
              background: "none", border: "none", color: "#475569",
              fontSize: "1.2rem", cursor: "pointer", padding: "2px 6px",
              lineHeight: 1, marginTop: "2px",
            }}>✕</button>
          </div>
        </div>

        <div style={S.body}>
          {isLoggedOut ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "32px 16px", gap: "12px" }}>
              <div style={{ fontSize: "2rem" }}>🔒</div>
              <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "#e2e8f0", margin: 0 }}>
                Sign in to build references
              </p>
              <p style={{ fontSize: "0.78rem", color: "#475569", margin: 0, lineHeight: 1.6 }}>
                Generate identity-preserving turnaround sheets for video reference, without leaving the platform.
              </p>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("openSignIn"))}
                style={{ marginTop: "8px", padding: "10px 24px", background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", border: "none", borderRadius: "10px", color: "#fff", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Sign in with Google →
              </button>
            </div>
          ) : sessionLoading ? (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "#475569", fontSize: "0.82rem" }}>
              Checking access…
            </div>
          ) : noCredits ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "32px 16px", gap: "12px" }}>
              <div style={{ fontSize: "2rem" }}>⚡</div>
              <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "#e2e8f0", margin: 0 }}>
                You need at least 20 credits
              </p>
              <p style={{ fontSize: "0.78rem", color: "#475569", margin: 0, lineHeight: 1.6 }}>
                Build my reference uses 20 credits per image. Buy a credit pack to unlock it.
              </p>
              <a href="/pricing" style={{ marginTop: "8px", padding: "10px 24px", background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", borderRadius: "10px", color: "#fff", fontSize: "0.85rem", fontWeight: 700, fontFamily: "inherit", textDecoration: "none" }}>
                View Pricing →
              </a>
            </div>
          ) : (
            <>
              <label style={S.label}>Reference photos ({refs.length}/{MAX_REFERENCES})</label>
              <div style={S.refRow}>
                {refs.map((r, idx) => {
                  const label = ["Front", "Side", "Back"][idx] || `Ref ${idx + 1}`;
                  return (
                    <div key={idx} style={S.refTile}>
                      <img src={r.previewUrl} alt={label} style={S.refImg} />
                      <div style={S.refLabel}>{label}</div>
                      <button
                        type="button"
                        onClick={() => removeRef(idx)}
                        style={S.refRemove}
                        title="Remove"
                        aria-label="Remove reference"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                {refs.length < MAX_REFERENCES && (
                  <button
                    type="button"
                    style={{ ...S.addTile, ...(loading ? S.addTileDisabled : {}) }}
                    disabled={loading}
                    onClick={() => fileInputRef.current?.click()}
                    title="Add reference photo"
                  >
                    +
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  multiple
                  hidden
                  onChange={(e) => { handleAddFiles(e.target.files); e.target.value = ""; }}
                />
              </div>

              <label style={S.label}>Describe the look</label>
              <input
                type="text"
                style={S.lookInput}
                value={look}
                onChange={(e) => setLook(e.target.value)}
                placeholder='e.g. dress me like a king'
                maxLength={MAX_LOOK_LENGTH}
                onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleGenerate(); }}
              />
              <div style={S.examples}>
                {LOOK_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    style={S.examplePill}
                    disabled={loading}
                    onClick={() => setLook(ex)}
                  >
                    {ex}
                  </button>
                ))}
              </div>

              {loading ? (
                <div style={S.loadingBar} role="progressbar" aria-valuenow={Math.floor(progress)} aria-valuemin={0} aria-valuemax={100}>
                  <div style={S.loadingFill(progress)} />
                  <div style={S.loadingText}>
                    ✨ Generating… {Math.floor(progress)}%
                  </div>
                </div>
              ) : (
                <button
                  style={S.primaryBtn(refs.length > 0 && look.trim().length > 0)}
                  disabled={refs.length === 0 || !look.trim()}
                  onClick={handleGenerate}
                >
                  ✨ Generate (20 credits)
                </button>
              )}

              {error && <div style={S.errorBox}>{error}</div>}

              {resultUrl && (
                <div>
                  <div style={S.resultBox}>
                    <img src={resultUrl} alt="Generated reference" style={{ width: "100%", display: "block" }} />
                  </div>
                  <button
                    style={S.primaryBtn(true)}
                    onClick={() => { onUse(resultUrl); onClose(); }}
                  >
                    Use as reference →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
