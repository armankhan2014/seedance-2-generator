"use client";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";

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
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef(null);
  const elapsed = useLiveSince(profile?.createdAt);

  const fetchProfile = () => {
    fetch("/api/user/profile")
      .then(r => r.json())
      .then(data => {
        setProfile(data);
        // Prefer DB image (could be custom base64) over session image (Google OAuth URL)
        const img = data.image?.startsWith("data:image/") ? data.image
          : data.image || session?.user?.image || null;
        setImageUrl(img);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchProfile();
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status]);

  const compressImage = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 400;
      let { width, height } = img;
      if (width > height) { if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; } }
      else { if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; } }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = reject;
    img.src = url;
  });

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select an image file.");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      const compressed = await compressImage(file);
      const res = await fetch("/api/user/update-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: compressed }),
      });
      const data = await res.json();
      if (res.ok) {
        // Re-fetch from DB to confirm the image was actually saved
        const verify = await fetch("/api/user/profile");
        const verifyData = await verify.json();
        const savedImage = verifyData?.image;
        if (savedImage && savedImage.startsWith("data:image/")) {
          setImageUrl(savedImage);
        } else {
          // DB save succeeded but image not confirmed — use local preview
          setImageUrl(data.image);
          setUploadError("Image saved for this session but may not persist. Please try a smaller file.");
        }
      } else {
        setUploadError(data.error || "Upload failed.");
      }
    } catch (err) {
      setUploadError("Upload failed: " + (err.message || "Please try again."));
    } finally {
      setUploading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#64748b", fontFamily: "Inter,sans-serif", fontSize: "0.9rem" }}>Loading…</div>
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
    : "—";

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
                {uploading ? "…" : "📷"}
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
              {uploadError && (
                <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "#f87171" }}>{uploadError}</p>
              )}
              {uploading && (
                <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "#a78bfa" }}>Uploading…</p>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "28px" }}>
            <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "12px", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Credits</p>
              <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#a78bfa" }}>⚡ {credits.toLocaleString()}</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "16px" }}>
              <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Member Since</p>
              <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "4px" }}>{joinDate}</p>
              <p style={{ margin: 0, fontSize: "0.72rem", color: "#a78bfa", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {elapsed ? `🕐 ${elapsed}` : ""}
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
