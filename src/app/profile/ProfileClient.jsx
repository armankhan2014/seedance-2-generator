"use client";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import toast from "@/lib/toast";

function useLiveSince(dateStr) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!dateStr) return;
    const joined = new Date(dateStr).getTime();

    const tick = () => {
      const diff = Date.now() - joined;
      const totalSecs = Math.floor(diff / 1000);
      const secs  = totalSecs % 60;
      const mins  = Math.floor(totalSecs / 60) % 60;
      const hours = Math.floor(totalSecs / 3600) % 24;
      const days  = Math.floor(totalSecs / 86400) % 30;
      const months= Math.floor(totalSecs / (86400 * 30)) % 12;
      const years = Math.floor(totalSecs / (86400 * 365));

      const parts = [];
      if (years)  parts.push(`${years}y`);
      if (months) parts.push(`${months}mo`);
      if (days)   parts.push(`${days}d`);
      if (hours)  parts.push(`${hours}h`);
      if (mins)   parts.push(`${mins}m`);
      parts.push(`${secs}s`);

      setElapsed(parts.join(" "));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dateStr]);

  return elapsed;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const fileRef = useRef(null);
  const elapsed = useLiveSince(session?.user?.createdAt);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError("");
    setUploadStatus(`= Reading ${file.name}&`);

    try {
      // Step 1: Read file into data URL
      const rawDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read file  try a JPEG or PNG"));
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
      });

      setUploadStatus("= Resizing image&");

      // Step 2: Compress via canvas (max 250×250, JPEG 0.72)
      const compressed = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not decode image  try a different file"));
        img.onload = () => {
          try {
            const MAX = 250;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
              if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
              else { width = Math.round(width * MAX / height); height = MAX; }
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas not available in this browser");
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
            if (!dataUrl || dataUrl === "data:,") throw new Error("Canvas output is empty  try a different image");
            resolve(dataUrl);
          } catch (canvasErr) {
            reject(canvasErr);
          }
        };
        img.src = rawDataUrl;
      });

      const kbSize = (compressed.length / 1024).toFixed(0);
      setUploadStatus(`= Uploading (${kbSize} KB)&`);

      // Step 3: POST to API
      const res = await fetch("/api/user/update-image", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: compressed }),
      });

      let data = {};
      try { data = await res.json(); } catch {}

      if (res.ok) {
        setImageUrl(compressed);
        setUploadStatus(" Photo updated!");
        toast.success("Profile photo updated!");
        setTimeout(() => setUploadStatus(""), 3000);
      } else {
        const msg = data.error || `Server error (HTTP ${res.status})`;
        setUploadStatus(`L ${msg}`);
        setUploadError(msg);
        toast.error(msg);
      }
    } catch (err) {
      const msg = err?.message || "Upload error  please try again";
      setUploadStatus(`L ${msg}`);
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#64748b", fontFamily: "Inter,sans-serif", fontSize: "0.9rem" }}>Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#64748b", marginBottom: "16px" }}>You need to be signed in to view your profile.</p>
          <Link href="/" style={{ color: "#a78bfa", textDecoration: "none", fontWeight: 600 }}>← Back to home</Link>
        </div>
      </div>
    );
  }

  const name = profile?.name || session.user?.name || "User";
  const email = profile?.email || session.user?.email || "";
  const credits = profile?.credits ?? session.user?.credits ?? 0;
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const joinDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", fontFamily: "Inter,sans-serif", padding: "40px 16px" }}>
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>

        {/* Back link */}
        <Link href="/" style={{ color: "#64748b", textDecoration: "none", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "32px" }}>
          ← Back to Generate
        </Link>

        {/* Profile card */}
        <div style={{
          background: "#111118",
          border: "1px solid rgba(139,92,246,0.2)",
          borderRadius: "20px",
          padding: "36px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}>

          {/* Avatar + upload */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "32px" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={name}
                  style={{ width: "80px", height: "80px", borderRadius: "50%", border: "2px solid rgba(139,92,246,0.4)", objectFit: "cover" }}
                />
              ) : (
                <div style={{
                  width: "80px", height: "80px", borderRadius: "50%",
                  background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.5rem", fontWeight: 700, color: "#fff",
                }}>
                  {initials}
                </div>
              )}

              {/* Camera overlay */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="Change photo"
                style={{
                  position: "absolute", bottom: 0, right: 0,
                  width: "26px", height: "26px",
                  background: uploading ? "rgba(139,92,246,0.5)" : "#7c3aed",
                  border: "2px solid #111118",
                  borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: uploading ? "wait" : "pointer",
                  fontSize: "0.7rem",
                }}>
                {uploading ? "&" : "="}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </div>

            <div>
              <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "#fff" }}>{name}</h1>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>{email}</p>
              {/* Step-by-step upload status */}
              {uploadStatus && !uploadError && (
                <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: uploadStatus.startsWith("") ? "#4ade80" : "#a78bfa" }}>{uploadStatus}</p>
              )}
              {uploadError && (
                <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "#f87171" }}>{uploadError}</p>
              )}
              {/* Test connection button  helps diagnose upload issues */}
            </div>
          </div>

          {/* Stats grid  2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "28px" }}>
            {/* Credits remaining */}
            <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "12px", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Credits</p>
              <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#a78bfa" }}>⚡ {credits.toLocaleString()}</p>
            </div>
            {/* Member since */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Member Since</p>
              <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "4px" }}>{joinDate}</p>
              <p style={{ margin: 0, fontSize: "0.72rem", color: "#a78bfa", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {elapsed ? `= ${elapsed}` : ""}
              </p>
            </div>
            {/* Videos generated */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Videos Generated</p>
              <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#e2e8f0" }}>
                < {(profile?.videosGenerated ?? 0).toLocaleString()}
              </p>
            </div>
            {/* Total credits spent */}
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Credits Spent</p>
              <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#e2e8f0" }}>
                ⚡ {(profile?.totalCreditsSpent ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Info rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "28px" }}>
            {[
              { label: "Full Name", value: name },
              { label: "Email", value: email },
              { label: "Account Type", value: "Google" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>{row.label}</span>
                <span style={{ fontSize: "0.85rem", color: "#e2e8f0" }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px" }}>
            <Link href="/pricing" style={{
              flex: 1,
              background: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
              border: "none",
              borderRadius: "10px",
              color: "#fff",
              padding: "12px",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "none",
              textAlign: "center",
              display: "block",
            }}>
              ⚡ Buy Credits
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
                color: "#94a3b8",
                padding: "12px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}>
              Sign Out
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
