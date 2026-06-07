"use client";
import { useSession, signIn } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import {
  FaBolt,
  FaMagic,
  FaChevronDown,
  FaPlus,
  FaTrash,
  FaSyncAlt,
  FaVideo,
  FaMusic,
  FaShare,
} from "react-icons/fa";
import { IoImageOutline } from "react-icons/io5";
import { FiDownload } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { downloadMedia } from "@/lib/utils";
import { nativeShare, isNativeApp } from "@/lib/nativeShare";
import ArmanGallery from "@/components/saas/ArmanGallery";
import toast from "@/lib/toast";
import PromptBuilder from "@/components/saas/PromptBuilder";
import ImageBuilder from "@/components/saas/ImageBuilder";
import SeedanceHeroCard from "@/components/saas/SeedanceHeroCard";
import ReferenceImageGuideModal, {
  shouldAutoShowReferenceGuide,
} from "@/components/saas/ReferenceImageGuideModal";
import SmartPrompt from "@/components/saas/SmartPrompt";
import {
  StoryBuilder,
  StoryReelPreview,
  letterFor as storyLetterFor,
  estimateCreditsPerShot as storyEstimateCreditsPerShot,
} from "@/components/saas/StoryBuilder";
import PushPermissionBanner from "@/components/PushPermissionBanner";

export const dynamic = "force-dynamic";

// ── Recent images library (v2) ──────────────────────────────────────────────
// v1 stored URLs as a flat string[] under `seedance_recent_images`.
// v2 stores rich rows so each image carries a user-editable name + timestamp:
//   { url: string, name: string, addedAt: number }[]
//
// On load we read v2 first, then migrate any v1 leftovers in-place so users
// who saved images on the old strip don't see them disappear. v1 entries get
// auto-named "Image 1", "Image 2"… in their original order (newest first).
const RECENT_IMAGES_KEY_V1 = "seedance_recent_images";
const RECENT_IMAGES_KEY = "seedance_recent_images_v2";
const MAX_RECENT = 24;

function loadRecentImages() {
  try {
    const v2raw = localStorage.getItem(RECENT_IMAGES_KEY);
    if (v2raw) {
      const arr = JSON.parse(v2raw);
      if (Array.isArray(arr)) {
        // Defensive: discard rows missing a url.
        return arr.filter((r) => r && typeof r.url === "string");
      }
    }
    // Migrate v1 → v2 on first read.
    const v1raw = localStorage.getItem(RECENT_IMAGES_KEY_V1);
    if (v1raw) {
      const urls = JSON.parse(v1raw);
      if (Array.isArray(urls) && urls.length > 0) {
        const now = Date.now();
        const migrated = urls
          .filter((u) => typeof u === "string")
          .map((url, i) => ({
            url,
            name: `Image ${i + 1}`,
            // Stagger fake timestamps so the time-ago caption reads
            // newest-first without all rows saying "just now".
            addedAt: now - i * 60_000,
          }));
        localStorage.setItem(RECENT_IMAGES_KEY, JSON.stringify(migrated));
        localStorage.removeItem(RECENT_IMAGES_KEY_V1);
        return migrated;
      }
    }
    return [];
  } catch { return []; }
}

function writeRecentImages(rows) {
  try {
    localStorage.setItem(RECENT_IMAGES_KEY, JSON.stringify(rows));
  } catch {}
  return rows;
}

// Push a URL into the library. If it already exists, surface it to the top
// without losing the user's saved name. New entries get an auto-name
// ("Image N") that the user can rename inline later.
function saveRecentImage(url) {
  try {
    const existing = loadRecentImages();
    const hit = existing.find((r) => r.url === url);
    if (hit) {
      const updated = [hit, ...existing.filter((r) => r.url !== url)].slice(0, MAX_RECENT);
      return writeRecentImages(updated);
    }
    // Auto-name: scan for the highest "Image N" already used so we don't
    // collide. Users who rename their entries won't trip this — only
    // un-renamed auto-names increment.
    const nums = existing
      .map((r) => {
        const m = /^Image (\d+)$/.exec(r.name || "");
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => n > 0);
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    const row = { url, name: `Image ${next}`, addedAt: Date.now() };
    const updated = [row, ...existing].slice(0, MAX_RECENT);
    return writeRecentImages(updated);
  } catch { return []; }
}

function removeRecentImage(url) {
  try {
    const existing = loadRecentImages();
    return writeRecentImages(existing.filter((r) => r.url !== url));
  } catch { return []; }
}

function renameRecentImage(url, name) {
  try {
    const existing = loadRecentImages();
    const updated = existing.map((r) => (r.url === url ? { ...r, name: name.trim() || r.name } : r));
    return writeRecentImages(updated);
  } catch { return []; }
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Story (mode 4) persistence ──────────────────────────────────────────────
// Story state survives refresh so users don't lose half-written scripts.
// Schema: { title, cast: [{id,name,imageUrl}], shots: [{id, duration,
// castIds, prompt, status, videoUrl, requestId, error}] }
const STORY_KEY = "seedance_story_v1";

function loadStory() {
  try {
    const raw = localStorage.getItem(STORY_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return null;
    return {
      title: typeof s.title === "string" ? s.title : "",
      cast: Array.isArray(s.cast) ? s.cast.filter((c) => c && c.id && c.imageUrl) : [],
      shots: Array.isArray(s.shots) ? s.shots.filter((sh) => sh && sh.id) : [],
    };
  } catch { return null; }
}

function saveStory(payload) {
  try { localStorage.setItem(STORY_KEY, JSON.stringify(payload)); } catch {}
}

// Auto-name helper for new cast: scans existing names for "Character X"
// and bumps to the next free letter. Lets users rename to anything; this
// only assigns the initial placeholder.
function nextCastAutoName(existing) {
  const used = new Set(
    existing
      .map((c) => /^Character ([A-Z])$/.exec(c.name || ""))
      .filter(Boolean)
      .map((m) => m[1])
  );
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!used.has(letter)) return `Character ${letter}`;
  }
  return `Character ${existing.length + 1}`;
}

let _storyIdSeed = 0;
function newStoryId(prefix) {
  _storyIdSeed += 1;
  return `${prefix}-${Date.now().toString(36)}-${_storyIdSeed}`;
}

// Small inline magnifier icon — react-icons would work too, but the
// library import list above is already long. Keeping it inline avoids
// pulling in another package + matches the visual weight of the
// surrounding 12px-text UI.
function FaSearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// Resize/re-encode an image in the browser before uploading.
// Phone photos are typically 5–12 MB, which exceeds Vercel's 4.5 MB body limit.
// Targeting 2048px on the long edge at JPEG-0.85 produces ~0.5–1.5 MB while
// keeping plenty of detail for AI video reference.
async function compressImage(file, { maxDim = 2048, quality = 0.85 } = {}) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not decode image"));
    i.src = dataUrl;
  });
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const ratio = width > height ? maxDim / width : maxDim / height;
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Could not encode image");
  if (blob.size >= file.size) return file;
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], baseName + ".jpg", { type: "image/jpeg" });
}

const ASPECT_RATIOS = [
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "4:3", value: "4:3" },
  { label: "3:4", value: "3:4" },
];

const RESOLUTIONS = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];

const DURATIONS = [
  { value: 5, label: "5 Seconds" },
  { value: 10, label: "10 Seconds" },
  { value: 15, label: "15 Seconds" },
];

const QUALITIES = [
  { value: "basic", label: "Basic" },
  { value: "high", label: "High" },
];

function CustomSelect({ label, value, options, onChange, icon: Icon }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target))
        setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const selectedOption = options.find((o) => o.value === value) || options[0];
  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 bg-glass-bg border border-glass-border rounded-md text-xs font-medium text-foreground hover:bg-glass-hover transition-colors outline-none"
        >
          <div className="flex items-center gap-2">
            {Icon && <Icon className="text-primary-500 text-[10px]" />}
            {selectedOption.label}
          </div>
          <FaChevronDown
            className={`text-[10px] text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute bottom-10 left-0 right-0 bg-glass-bg border border-glass-border rounded-md shadow-xl z-[100] overflow-hidden backdrop-blur-xl"
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-xs transition-colors ${
                    value === option.value
                      ? "bg-primary-500 text-black"
                      : "text-muted hover:bg-glass-hover hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function Home() {
  const { data: session } = useSession();
  // Mode State
  // Default to Image To video — most common starting point for our users.
  // Arman flagged 2026-05-13: landing on Text first felt empty since the
  // Image Library + photo upload are the bigger draw.
  const [mode, setMode] = useState("image-to-video");
  // Form State
  const [prompt, setPrompt] = useState("");
  const [showBuilder, setShowBuilder] = useState(false);
  const [showImageBuilder, setShowImageBuilder] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0].value);
  // Pre-fill from sessionStorage (in-app "Use This Prompt") AND from
  // URL query (cross-origin "Use this prompt" coming in from
  // community.visualseffect.com/prompts/<id>). The URL receiver is
  // why this needs to fire AFTER aspectRatio's useState is declared
  // — community sends ?ratio=16:9 etc and we need setAspectRatio
  // to be in scope. URL params win when both are present.
  useEffect(() => {
    let pendingPrompt = null;
    let pendingRatio = null;
    try {
      const sp = new URLSearchParams(window.location.search);
      const p = sp.get("prompt");
      const r = sp.get("ratio");
      if (p) pendingPrompt = p;
      if (r) pendingRatio = r;
    } catch {}
    if (!pendingPrompt) {
      try {
        const p = sessionStorage.getItem("pendingPrompt");
        if (p) pendingPrompt = p;
      } catch {}
    }
    if (pendingPrompt) setPrompt(pendingPrompt);
    if (pendingRatio && ASPECT_RATIOS.some((a) => a.value === pendingRatio)) {
      setAspectRatio(pendingRatio);
    }
    try { sessionStorage.removeItem("pendingPrompt"); } catch {}
    // Clean the URL so a reload doesn't re-prefill (and so the
    // 50KB prompt doesn't sit in the address bar forever).
    if (pendingPrompt || pendingRatio) {
      try {
        window.history.replaceState({}, "", window.location.pathname);
      } catch {}
    }
  }, []);
  const [resolution, setResolution] = useState(RESOLUTIONS[1].value); // 720p default
  const [duration, setDuration] = useState(DURATIONS[0].value);
  const [quality, setQuality] = useState(QUALITIES[0].value);
  const [imagesList, setImagesList] = useState([]); // Max 9 URLs for I2V/Reference
  // Library of previously-uploaded images. v2 schema: { url, name, addedAt }[]
  // (was a flat URL[] under "Recent" before 2026-05-12 — auto-migrated on load).
  const [recentImages, setRecentImages] = useState([]);
  // Search query for the library — filters by name (case-insensitive substring).
  const [librarySearch, setLibrarySearch] = useState("");
  // Inline-rename state. editingUrl tracks which row's name field is active.
  const [libraryEditingUrl, setLibraryEditingUrl] = useState(null);
  const [libraryDraftName, setLibraryDraftName] = useState("");
  // Click-to-preview state — small floating popup showing the library
  // image at a readable size without leaving the page. Anchored next to
  // the thumbnail using getBoundingClientRect on click. Closes on
  // outside-click or Escape via a useEffect below.
  const [libraryPreview, setLibraryPreview] = useState(null); // {url, name, rect} | null

  // ── Story mode (mode 4) state ─────────────────────────────────────────
  // Each shot calls /api/seedance under the hood with mode=reference-to-video
  // so the existing FACE LOCK system keeps cast faces consistent across
  // shots. We persist all of this to localStorage so a refresh doesn't
  // throw away a half-written script.
  const [storyTitle, setStoryTitle] = useState("");
  const [storyCast, setStoryCast] = useState([]); // {id,name,imageUrl}[]
  const [storyShots, setStoryShots] = useState([]); // {id,duration,castIds,prompt,status,videoUrl,requestId,error}[]
  const [castEditingId, setCastEditingId] = useState(null);
  const [castDraftName, setCastDraftName] = useState("");
  const [isUploadingCast, setIsUploadingCast] = useState(false);
  // Currently-generating shot id (single shot run OR active shot inside a
  // "Generate all" loop). Used to disable the right buttons + show the
  // "Generating…" label on the right card.
  const [generatingShotId, setGeneratingShotId] = useState(null);
  // True while ANY story-mode generation is running (single OR batch). Mirrors
  // the existing `loading` flag for the other 3 modes.
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyStatusMsg, setStoryStatusMsg] = useState("");
  const [videoFiles, setVideoFiles] = useState([]); // Max 3 URLs for Reference
  const [audioFiles, setAudioFiles] = useState([]); // Max 3 URLs for Reference
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [newAudioUrl, setNewAudioUrl] = useState("");
  // UI State
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const fileInputRef = useRef(null);
  // Reference-photo guide modal — appears the first time the user
  // clicks "Upload image" in a session. Dismiss is per-session via
  // sessionStorage; "Don't show this every session" persists in
  // localStorage. The "ℹ Reference Tips" button always opens it
  // regardless of the gate.
  const [refGuideOpen, setRefGuideOpen] = useState(false);
  const videoInputRef = useRef(null);
  const audioInputRef = useRef(null);
  // Ref on the uploaded-thumbnails grid so we can scroll the new image
  // into view after every successful upload. Mobile users were scrolling
  // far below the upload button and not realising their photo had
  // landed — Arman flagged 2026-05-13.
  const uploadsGridRef = useRef(null);

  // Load recent images from localStorage on mount
  useEffect(() => {
    setRecentImages(loadRecentImages());
  }, []);
  // Pre-fill reference image from sessionStorage (set by "Use this image to
  // generate a video" button in /creations). Auto-switches to image-to-video.
  useEffect(() => {
    const url = sessionStorage.getItem("pendingReferenceImage");
    if (!url) return;
    sessionStorage.removeItem("pendingReferenceImage");
    setMode("image-to-video");
    setImagesList((prev) => (prev.includes(url) ? prev : [...prev, url].slice(0, 9)));
    setRecentImages(saveRecentImage(url));
  }, []);

  // Close the library-image preview popup on outside-click or Escape.
  // 50 ms timeout on the click listener so the click that OPENED the
  // popup doesn't immediately propagate and close it.
  useEffect(() => {
    if (!libraryPreview) return;
    const onClickAway = () => setLibraryPreview(null);
    const onEsc = (e) => { if (e.key === "Escape") setLibraryPreview(null); };
    const t = setTimeout(() => {
      document.addEventListener("click", onClickAway);
      document.addEventListener("keydown", onEsc);
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", onClickAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [libraryPreview]);

  // Hydrate Story state on mount + persist on every change.
  useEffect(() => {
    const s = loadStory();
    if (s) {
      setStoryTitle(s.title);
      setStoryCast(s.cast);
      setStoryShots(s.shots);
    }
  }, []);
  useEffect(() => {
    saveStory({ title: storyTitle, cast: storyCast, shots: storyShots });
  }, [storyTitle, storyCast, storyShots]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef(null);
  // Bumped each time the user kicks off a generation — drives
  // <PushPermissionBanner>'s show check. Initial null means "don't
  // show on first mount"; we only want the banner on real generate
  // events.
  const [pushBannerTrigger, setPushBannerTrigger] = useState(null);

  // Phase 3 music pairing — when the user arrives via
  // /generate?soundtrack=<id> (the "Use in video" button on the
  // music page) we fetch the track row and stash it here. The pill
  // above the prompt makes the attached-soundtrack state obvious;
  // the API call below sends `musicTrackId` so the Creation row
  // persists the link.
  const searchParams = useSearchParams();
  const [pairedTrack, setPairedTrack] = useState(null);
  useEffect(() => {
    const soundtrackId = searchParams?.get("soundtrack");
    if (!soundtrackId) return;
    let cancelled = false;
    fetch(`/api/music/tracks/${soundtrackId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.ok && j.track) setPairedTrack(j.track);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchParams]);
  function clearPairedTrack() {
    setPairedTrack(null);
    // Strip the query param so a refresh doesn't re-attach.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("soundtrack");
      window.history.replaceState({}, "", url.toString());
    }
  }

  // Expected wall-clock seconds for a generation, based on the selected video
  // duration. Provided by the user from real-world observation:
  //   5s  → ~120s (2 min)
  //   10s → ~330s (5.5 min)
  //   15s → ~510s (8.5 min)
  // For other durations (reference-to-video supports 8–15s), we linearly
  // interpolate between these anchors.
  const getExpectedGenerationSeconds = (videoSec) => {
    if (videoSec <= 5)  return 120;
    if (videoSec <= 10) return 120 + ((videoSec - 5)  / 5) * (330 - 120);
    if (videoSec <= 15) return 330 + ((videoSec - 10) / 5) * (510 - 330);
    return 510;
  };

  const startProgressAnimation = (videoSec) => {
    setProgress(0);
    const expected = getExpectedGenerationSeconds(videoSec);
    const phase1End = Math.round(expected * 0.33); // 0-50% in the first third of expected time
    const phase2End = Math.round(expected);        // 50-90% across the rest
    let tick = 0;
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      tick++;
      setProgress((p) => {
        if (tick <= phase1End) return Math.min(50, (tick / phase1End) * 50);
        if (tick <= phase2End) return Math.min(90, 50 + ((tick - phase1End) / Math.max(1, phase2End - phase1End)) * 40);
        return Math.min(95, 90 + (tick - phase2End) * 0.05);   // crawl asymptotically toward 95%
      });
    }, 1000);
  };

  const stopProgressAnimation = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  // Clean up the progress timer on unmount.
  useEffect(() => () => stopProgressAnimation(), []);
  const [statusMessage, setStatusMessage] = useState("");
  const [resultUrl, setResultUrl] = useState(null);
  const [error, setError] = useState(null);

  const MODES = [
    // Arman's exact wording (2026-05-12): "X To video" — capital T on
    // "To", lowercase "video". Story stays as just "Story" with the
    // inline NEW pill.
    { id: "text-to-video", label: "Text", fullLabel: "Text To video", icon: FaBolt },
    { id: "image-to-video", label: "Image", fullLabel: "Image To video", icon: IoImageOutline },
    { id: "reference-to-video", label: "Reference", fullLabel: "Reference To video", icon: FaSyncAlt },
    { id: "story", label: "Story", fullLabel: "Story", icon: FaVideo, badge: "NEW" },
  ];

  // FIX 1: Show thumbnail immediately from local file, handle both MuAPI response formats
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imagesList.length >= 9) return;

    // Show thumbnail immediately using local object URL
    const localUrl = URL.createObjectURL(file);
    setImagesList((prev) => [...prev, localUrl]);

    try {
      setIsUploading(true);
      setError(null);
      let uploadFile = file;
      try { uploadFile = await compressImage(file); } catch {}
      if (uploadFile.size > 4_000_000) {
        throw new Error("Image is too large even after compression. Please pick a smaller photo.");
      }
      const formData = new FormData();
      formData.append("file", uploadFile);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
      // Handle both response formats: data.url or data.data?.url
      const uploadedUrl = data.url || data.data?.url;
      if (uploadedUrl) {
        // Replace local blob URL with the real remote URL
        setImagesList((prev) =>
          prev.map((u) => (u === localUrl ? uploadedUrl : u))
        );
        // Save to recent images
        const updated = saveRecentImage(uploadedUrl);
        setRecentImages(updated);
        toast.success("Image uploaded");
        // Scroll the uploaded thumbnails into view so mobile users can
        // immediately see the photo landed. block:"center" puts the
        // grid in the middle of the viewport so they can also see the
        // Upload button + the image library below.
        requestAnimationFrame(() => {
          uploadsGridRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
      } else {
        throw new Error("No URL returned from upload service");
      }
    } catch (err) {
      // Remove the local preview on failure and show error
      setImagesList((prev) => prev.filter((u) => u !== localUrl));
      const msg = err?.message || "Upload failed. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileUploadVideo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (videoFiles.length >= 3) return;
    try {
      setIsUploadingVideo(true);
      setError(null);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data.error || `Video upload failed (HTTP ${res.status})`);
      const uploadedUrl = data.url || data.data?.url;
      if (uploadedUrl) { setVideoFiles([...videoFiles, uploadedUrl]); toast.success("Video reference added"); }
      else throw new Error("No URL returned from upload service");
    } catch (err) {
      const msg = err?.message || "Video upload failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const handleFileUploadAudio = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (audioFiles.length >= 3) return;
    try {
      setIsUploadingAudio(true);
      setError(null);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data.error || `Audio upload failed (HTTP ${res.status})`);
      const uploadedUrl = data.url || data.data?.url;
      if (uploadedUrl) { setAudioFiles([...audioFiles, uploadedUrl]); toast.success("Audio reference added"); }
      else throw new Error("No URL returned from upload service");
    } catch (err) {
      const msg = err?.message || "Audio upload failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!session) {
      signIn();
      return;
    }
    if (mode === "text-to-video" && !prompt.trim()) return;
    if (
      mode !== "text-to-video" &&
      imagesList.length === 0 &&
      mode !== "reference-to-video"
    ) {
      setError("Please add at least one reference image.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      setResultUrl(null);
      setStatusMessage("Starting generation...");
      startProgressAnimation(duration);
      // Bump the push-banner trigger key so it re-evaluates whether
      // to surface the "Don't sit and wait" banner. The banner is a
      // no-op if the user already has permission or has dismissed in
      // the last 14 days — see PushPermissionBanner show-rules.
      setPushBannerTrigger(Date.now());
      const res = await fetch("/api/seedance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt,
          aspect_ratio: aspectRatio,
          resolution,
          duration,
          quality,
          images_list: imagesList,
          video_files: videoFiles,
          audio_files: audioFiles,
          // Phase 3 — soundtrack pairing. When the user arrived at
          // /generate via ?soundtrack=<id>, we attach the music
          // track id so the API persists it on the Creation row and
          // /v/[id] can play the audio synced under the video.
          musicTrackId: pairedTrack?.id || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed.");
      await pollStatus(data.request_id, data.metadata);
    } catch (err) {
      stopProgressAnimation();
      setError(err.message);
      toast.error(err.message || "Generation failed.");
      setLoading(false);
    }
  };

  const pollStatus = async (requestId, metadata) => {
    setStatusMessage("Processing...");
    try {
      const res = await fetch("/api/seedance/check-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, metadata }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Status check failed.");
      if (data.status === "completed") {
        stopProgressAnimation();
        setProgress(100);
        await new Promise((r) => setTimeout(r, 500)); // brief pause so users see the bar hit 100%
        setResultUrl(data.imageUrl);
        setLoading(false);
        toast.success("Video ready! 🎬");
      } else if (data.status === "failed") {
        throw new Error("Generation failed.");
      } else {
        setTimeout(() => pollStatus(requestId, metadata), 3000);
      }
    } catch (err) {
      stopProgressAnimation();
      setError(err.message);
      toast.error(err.message || "Something went wrong.");
      setLoading(false);
    }
  };

  // ── Story mode helpers ────────────────────────────────────────────────────
  // Cast file picker is owned by StoryBuilder; we reuse the live image upload
  // pipeline (compress → /api/upload) so the same R2 URL the rest of the page
  // uses ends up on the cast member.
  const handleUploadCastFile = async (file) => {
    if (!session) { signIn(); return; }
    if (!file) return;
    try {
      setIsUploadingCast(true);
      setError(null);
      let uploadFile = file;
      try { uploadFile = await compressImage(file); } catch {}
      if (uploadFile.size > 4_000_000) {
        throw new Error("Image is too large even after compression. Please pick a smaller photo.");
      }
      const formData = new FormData();
      formData.append("file", uploadFile);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
      const uploadedUrl = data.url || data.data?.url;
      if (!uploadedUrl) throw new Error("No URL returned from upload service");
      const newCast = {
        id: newStoryId("c"),
        name: nextCastAutoName(storyCast),
        imageUrl: uploadedUrl,
      };
      setStoryCast([...storyCast, newCast]);
      // If the user added shots BEFORE adding their first cast member,
      // those shots have an empty castIds array — generating would then
      // bail with "Every shot needs at least one cast chip tagged".
      // Auto-tag this new cast into every empty-cast shot so the user's
      // existing shots immediately become generatable. Shots that already
      // have OTHER cast tagged are left alone (we don't want a silent
      // additive tag if the user deliberately curated their cast list).
      setStoryShots((prev) =>
        prev.map((s) =>
          s.castIds.length === 0 ? { ...s, castIds: [newCast.id] } : s
        )
      );
      // Also save to the image library so the same photo is discoverable
      // later from the Reference / Image modes — names default to
      // "Image N", users can rename inline there too.
      setRecentImages(saveRecentImage(uploadedUrl));
      toast.success("Character added");
    } catch (err) {
      const msg = err?.message || "Upload failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsUploadingCast(false);
    }
  };

  const handleRenameCast = (id, name) => {
    setStoryCast((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c))
    );
  };
  const handleRemoveCast = (id) => {
    setStoryCast((prev) => prev.filter((c) => c.id !== id));
    setStoryShots((prev) =>
      prev.map((s) => ({ ...s, castIds: s.castIds.filter((cid) => cid !== id) }))
    );
  };

  const handleAddShot = () => {
    setStoryShots((prev) => [
      ...prev,
      {
        id: newStoryId("s"),
        duration: 5,
        castIds: storyCast.map((c) => c.id), // default: all cast in this shot
        prompt: "",
        status: "ready",
        videoUrl: null,
        requestId: null,
        error: null,
      },
    ]);
  };
  const handleRemoveShot = (id) =>
    setStoryShots((prev) => prev.filter((s) => s.id !== id));
  const handlePatchShot = (id, patch) =>
    setStoryShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const handleToggleShotCast = (shotId, castId) =>
    setStoryShots((prev) =>
      prev.map((s) =>
        s.id !== shotId
          ? s
          : {
              ...s,
              castIds: s.castIds.includes(castId)
                ? s.castIds.filter((c) => c !== castId)
                : [...s.castIds, castId],
            }
      )
    );
  const handleMoveShot = (id, direction) => {
    setStoryShots((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const swap = direction === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= prev.length) return prev;
      const copy = prev.slice();
      [copy[idx], copy[swap]] = [copy[swap], copy[idx]];
      return copy;
    });
  };

  // Build the per-shot prompt sent to Seedance. We prepend a CAST header
  // naming every character in this shot and binding them to the image
  // index they'll occupy in images_list. /lib/services/ai.js's FACE LOCK
  // injection then adds the multi-character anchor sentence on top so
  // each face stays glued to its source photo across every frame.
  const buildShotPrompt = (shot) => {
    const shotCast = shot.castIds
      .map((cid) => storyCast.find((c) => c.id === cid))
      .filter(Boolean);
    if (shotCast.length === 0) return shot.prompt.trim();
    const castLines = shotCast
      .map((c, i) => `- Character ${storyLetterFor(i)}: ${c.name} (face locked to 【@image${i + 1}】)`)
      .join("\n");
    return `CAST in this shot:\n${castLines}\n\nSHOT:\n${shot.prompt.trim()}`;
  };

  // Poll a single shot until /api/seedance/check-status reports done/fail.
  // Mirrors the existing pollStatus loop but returns a promise so the batch
  // runner can await one shot at a time.
  const pollShotUntilDone = (shotId, requestId) =>
    new Promise((resolve, reject) => {
      const tick = async () => {
        try {
          const res = await fetch("/api/seedance/check-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Status check failed.");
          if (data.status === "completed") {
            setStoryShots((prev) =>
              prev.map((s) =>
                s.id === shotId ? { ...s, status: "done", videoUrl: data.imageUrl } : s
              )
            );
            resolve(data.imageUrl);
          } else if (data.status === "failed") {
            reject(new Error("Generation failed."));
          } else {
            setTimeout(tick, 3000);
          }
        } catch (err) {
          reject(err);
        }
      };
      tick();
    });

  // Generate a single shot. Used by the "▶ This shot" button on each card.
  const handleGenerateOneShot = async (shotId) => {
    if (!session) { signIn(); return; }
    const shot = storyShots.find((s) => s.id === shotId);
    if (!shot) return;
    if (!shot.prompt.trim()) {
      toast.error("Add a prompt before generating.");
      return;
    }
    const shotCast = shot.castIds
      .map((cid) => storyCast.find((c) => c.id === cid))
      .filter(Boolean);
    if (shotCast.length === 0) {
      // Surface BOTH cases that lead here: no cast at all (top-level fix)
      // vs. cast exists but none tagged in THIS shot (just tap a chip).
      if (storyCast.length === 0) {
        toast.error("Add at least one character above before generating this shot.");
      } else {
        toast.error("Tap a character chip in this shot to add them, then try again.");
      }
      return;
    }
    try {
      setStoryLoading(true);
      setGeneratingShotId(shotId);
      setStoryStatusMsg(`Generating shot ${storyShots.findIndex((s) => s.id === shotId) + 1}…`);
      setStoryShots((prev) =>
        prev.map((s) =>
          s.id === shotId ? { ...s, status: "generating", error: null, videoUrl: null } : s
        )
      );
      const res = await fetch("/api/seedance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "reference-to-video",
          prompt: buildShotPrompt(shot),
          aspect_ratio: aspectRatio,
          resolution,
          duration: shot.duration,
          quality,
          images_list: shotCast.map((c) => c.imageUrl),
          video_files: [],
          audio_files: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed.");
      setStoryShots((prev) =>
        prev.map((s) => (s.id === shotId ? { ...s, requestId: data.request_id } : s))
      );
      await pollShotUntilDone(shotId, data.request_id);
      toast.success("Shot ready! 🎬");
    } catch (err) {
      setStoryShots((prev) =>
        prev.map((s) =>
          s.id === shotId ? { ...s, status: "failed", error: err.message } : s
        )
      );
      toast.error(err.message || "Shot failed.");
    } finally {
      setStoryLoading(false);
      setGeneratingShotId(null);
      setStoryStatusMsg("");
    }
  };

  // Generate every shot in order. We run sequentially so one failure halts
  // the rest — protects credits and lets the user fix the bad prompt
  // before re-trying.
  const handleGenerateAllShots = async () => {
    if (!session) { signIn(); return; }
    if (storyShots.length === 0) return;
    if (storyCast.length === 0) {
      toast.error("Add at least one cast member first.");
      return;
    }
    // Point to the offending shot so the user knows where to look.
    const missingCastIdx = storyShots.findIndex((s) => s.castIds.length === 0);
    if (missingCastIdx >= 0) {
      toast.error(
        `Shot ${missingCastIdx + 1} has no cast tagged — tap a character chip in that shot to add one.`
      );
      return;
    }
    const missingPromptIdx = storyShots.findIndex((s) => !s.prompt.trim());
    if (missingPromptIdx >= 0) {
      toast.error(`Shot ${missingPromptIdx + 1} is missing a prompt.`);
      return;
    }
    setStoryLoading(true);
    // Mark all shots as queued so the right column lights up.
    setStoryShots((prev) =>
      prev.map((s) => (s.status === "done" ? s : { ...s, status: "queued", error: null }))
    );
    try {
      for (let i = 0; i < storyShots.length; i++) {
        const shot = storyShots[i];
        // Skip already-done shots so the user can re-run partial batches.
        if (shot.status === "done") continue;
        setGeneratingShotId(shot.id);
        setStoryStatusMsg(`Generating shot ${i + 1} of ${storyShots.length}…`);
        setStoryShots((prev) =>
          prev.map((s) =>
            s.id === shot.id ? { ...s, status: "generating", error: null, videoUrl: null } : s
          )
        );
        const shotCast = shot.castIds
          .map((cid) => storyCast.find((c) => c.id === cid))
          .filter(Boolean);
        const res = await fetch("/api/seedance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "reference-to-video",
            prompt: buildShotPrompt(shot),
            aspect_ratio: aspectRatio,
            resolution,
            duration: shot.duration,
            quality,
            images_list: shotCast.map((c) => c.imageUrl),
            video_files: [],
            audio_files: [],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed.");
        setStoryShots((prev) =>
          prev.map((s) => (s.id === shot.id ? { ...s, requestId: data.request_id } : s))
        );
        await pollShotUntilDone(shot.id, data.request_id);
      }
      toast.success("All shots ready! 🎬");
    } catch (err) {
      setStoryShots((prev) =>
        prev.map((s) =>
          s.id === generatingShotId
            ? { ...s, status: "failed", error: err.message }
            : (s.status === "queued" ? { ...s, status: "ready" } : s)
        )
      );
      toast.error(err.message || "Story generation halted.");
    } finally {
      setStoryLoading(false);
      setGeneratingShotId(null);
      setStoryStatusMsg("");
    }
  };

  const handleDownloadShot = (shot) => {
    if (!shot.videoUrl) return;
    downloadMedia(shot.videoUrl, `story-shot-${shot.id}.mp4`);
  };

  const getAvailableDurations = () => {
    if (mode === "reference-to-video") {
      return Array.from({ length: 8 }, (_, i) => ({
        value: i + 8,
        label: `${i + 8} Seconds`,
      }));
    }
    return DURATIONS;
  };

  useEffect(() => {
    const available = getAvailableDurations();
    if (!available.find((d) => d.value === duration)) {
      setDuration(available[0].value);
    }
  }, [mode]);

  // Cmd+Enter / Ctrl+Enter to generate
  useEffect(() => {
    const handleKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return;
      if (loading) return;
      if (mode === "text-to-video" && !prompt.trim()) return;
      if (mode !== "text-to-video" && imagesList.length === 0) return;
      e.preventDefault();
      handleGenerate();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [loading, mode, prompt, imagesList]);

  const creditCost = (() => {
    // Mirror of AIService.getCreditCost in src/lib/services/ai.js —
    // MUST match server cost or users see a different price preview
    // than what they actually get charged. 720p 15s override at the
    // bottom matches the server's 2026-05-25 pricing change.
    const BASE = { 5: 120, 10: 200, 15: 320 };
    const base = BASE[duration] ?? Math.ceil((duration / 15) * 320);
    // 1080p + high = 450cr for 15s, scale for other durations
    let mult = 1.0;
    if (resolution === "480p") mult = 0.7;
    else if (resolution === "1080p" && quality === "high") mult = 1.40625;
    else if (resolution === "1080p") mult = 1.2;
    else if (quality === "high") mult = 1.15;
    if (mode === "reference-to-video") mult *= 1.1;
    let cost = Math.ceil(base * mult);

    // 720p 15s manual override — see comment in ai.js for the full
    // rationale. Applied as a hard override so 1080p/480p prices stay
    // anchored at their original values.
    if (resolution === "720p" && duration === 15) {
      let cost720 = quality === "high" ? 483 : 420;
      if (mode === "reference-to-video") cost720 = Math.ceil(cost720 * 1.1);
      cost = cost720;
    }

    return cost;
  })();

  // Sum the per-shot cost for the Story-mode "Generate all" button.
  // Skips shots already done so partial-batch retries don't double-bill.
  const storyTotalCredits = storyShots.reduce(
    (sum, s) =>
      s.status === "done" ? sum : sum + storyEstimateCreditsPerShot(s.duration, resolution, quality),
    0
  );
  const storyTotalDuration = storyShots.reduce((sum, s) => sum + s.duration, 0);

  return (
    <>
    <div className="flex-1 w-full flex flex-col items-center p-4 md:p-8 overflow-y-auto custom-scrollbar">
      {/* Playground Header */}
      <div className="max-w-6xl w-full mb-10 text-center space-y-4">
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl md:text-5xl font-bold text-foreground tracking-tight"
        >
          Seedance v2.0 Playground
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-sm md:text-base text-muted max-w-2xl mx-auto leading-relaxed"
        >
          Experience the next generation of AI video creation. Transform your
          text and images into high-quality cinematic videos using our advanced
          Seedance v2.0 engine.
        </motion.p>
      </div>

      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: Controls */}
        <div className="bg-glass-bg border border-glass-border rounded-lg p-6 flex flex-col gap-6">
          {/* Playing-video hero card — replaces the plain
              "Seedance Generator / Minimal Video Engine" header.
              Same card pattern as visualseffect.com/studio/video.
              Video is SAME-ORIGIN (/hero-videos/seedance.mp4 served
              from /public) so iOS Safari's cross-origin autoplay
              block doesn't show the play overlay on iPhone. */}
          <SeedanceHeroCard
            providerLabel="SEEDANCE"
            modelName="Seedance 2 Pro"
            subline="Minimal Video Engine"
            videoUrl="/hero-videos/seedance.mp4"
          />

          {/* Phase 3 music pairing pill — visible only when the user
              arrived from /music or /m/<id> via the "Use in video"
              button. Shows attached track + remove (×). The musicTrackId
              gets persisted on the Creation row when Generate fires,
              and /v/[id] reads it to play synced audio under the video. */}
          {pairedTrack && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: "linear-gradient(135deg, rgba(217,255,0,0.12), rgba(166,204,0,0.04))",
                border: "1px solid rgba(217,255,0,0.40)",
                borderRadius: 12,
                fontFamily: "Inter, sans-serif",
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: "linear-gradient(135deg, #D9FF00, #A6CC00)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, flexShrink: 0,
              }}>🎵</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#D9FF00", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  Soundtrack attached
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginTop: 2,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {pairedTrack.title}
                </div>
                <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2 }}>
                  Plays under your video at /v/&lt;id&gt;
                </div>
              </div>
              <button
                type="button"
                onClick={clearPairedTrack}
                aria-label="Remove soundtrack"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "#94a3b8",
                  width: 28, height: 28, borderRadius: "50%",
                  cursor: "pointer", fontSize: 14,
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Mode buttons — independent floating pills (replaced the
              segmented control 2026-05-12). On mobile they wrap to 2×2,
              on desktop they sit in a single row of 4. Active button has
              a green gradient + soft glow shadow + subtle scale-up;
              inactive pills are dark glass that light to the accent on
              hover. NEW indicator on Story is an inline pill, not a
              floating corner sticker. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`relative py-2.5 px-2 sm:px-2.5 rounded-xl text-[10.5px] sm:text-[11px] font-bold tracking-tight transition-all duration-200 active:scale-[0.97] flex items-center justify-center gap-1 ${
                    active
                      ? "bg-gradient-to-br from-primary-400 to-primary-600 text-black shadow-[0_4px_24px_-6px_rgba(200,241,53,0.6)] ring-1 ring-primary-400/40 scale-[1.02]"
                      : "bg-glass-hover border border-glass-border text-muted hover:text-foreground hover:border-primary-500/40 hover:bg-primary-500/[0.04]"
                  }`}
                >
                  {/* Same full label on mobile + desktop. Phone is 2×2
                      grid so each cell is wide enough for the long
                      "Reference To video" text. */}
                  <span className="whitespace-nowrap">{m.fullLabel}</span>
                  {m.badge && (
                    <span
                      className={`text-[8px] font-extrabold tracking-wider px-1 py-px rounded ${
                        active
                          ? "bg-black/25 text-black"
                          : "bg-primary-500/15 text-primary-500 border border-primary-500/30"
                      }`}
                    >
                      {m.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            {/* ── STORY MODE BODY ───────────────────────────────────────────
                Replaces the prompt + image upload + reference upload blocks
                below when mode === "story". Renders the cast strip and
                vertical shot list. Settings grid (aspect / resolution /
                quality) still renders below, applied globally to every shot. */}
            {mode === "story" && (
              <StoryBuilder
                title={storyTitle}
                onTitleChange={setStoryTitle}
                cast={storyCast}
                shots={storyShots}
                editingCastId={castEditingId}
                setEditingCastId={setCastEditingId}
                castDraftName={castDraftName}
                setCastDraftName={setCastDraftName}
                onUploadCastFile={handleUploadCastFile}
                onRemoveCast={handleRemoveCast}
                onRenameCast={handleRenameCast}
                isUploadingCast={isUploadingCast}
                onAddShot={handleAddShot}
                onRemoveShot={handleRemoveShot}
                onPatchShot={handlePatchShot}
                onToggleShotCast={handleToggleShotCast}
                onMoveShot={handleMoveShot}
                onGenerateOneShot={handleGenerateOneShot}
                generatingShotId={generatingShotId}
                globalLoading={storyLoading}
                resolution={resolution}
                quality={quality}
              />
            )}

            {mode !== "story" && <div className="space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-y-2 gap-x-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
                    Prompt
                  </label>
                  {/* "✨ Build my prompt" replaced by SmartPrompt's
                      inline ✦ Expand button below. The old modal +
                      its `showBuilder` state stays mounted as dead
                      code so we can revive the feature instantly if
                      needed without a code restore — just by re-
                      adding this button. Removed per Arman's brief
                      on 2026-05-12. */}
                  <button
                    type="button"
                    onClick={() => setShowImageBuilder(true)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-primary-500 bg-primary-500/10 border border-primary-500/20 hover:bg-primary-500/20 transition-colors"
                  >
                    🎨 Build my reference
                  </button>
                </div>
                {/* External word counter removed — SmartPrompt now
                    renders the count inside its own footer bar. */}
              </div>
              {/* SmartPrompt — one textarea, inline ✦ Expand my idea
                  button, AI-aware expansion via /api/prompt/expand.
                  Same controlled `prompt` / `setPrompt` state as the
                  old textarea so nothing else in this component had
                  to change. */}
              <SmartPrompt
                value={prompt}
                onChange={setPrompt}
                duration={duration}
                // Pass uploaded image URLs so Claude can actually
                // SEE the photos when expanding. Only relevant in
                // image-to-video / reference-to-video modes — text-
                // to-video sends an empty array. Server-side the
                // route caps at 4 images per call.
                images={mode !== "text-to-video" ? imagesList : []}
                placeholder={
                  mode === "reference-to-video"
                    ? "Use @image1, @video1, @audio1 to reference your files…\nExample: @video1 in the style of @image1 with @audio1"
                    : "Describe your video…"
                }
                onUpgrade={() => {
                  // No credits — surface a toast, the user can buy
                  // credits from the existing /billing page.
                  toast.error?.("You're out of credits. Buy more to keep expanding prompts.") ||
                    toast("You're out of credits. Buy more to keep expanding prompts.");
                }}
              />
            </div>}

            {mode !== "text-to-video" && mode !== "story" && (
              <div className="space-y-3">
                <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
                  Images ({imagesList.length}/9)
                </label>
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    hidden
                    accept=".png, .jpg, .jpeg"
                    onChange={handleFileUpload}
                  />
                  <button
                    onClick={() => {
                      if (!session) {
                        signIn();
                        return;
                      }
                      // First-time-this-session pre-upload guide: open
                      // the modal instead of the file picker. The
                      // modal's "Got it" CTA wires straight to the
                      // picker so the user still ends up in the same
                      // place after a brief educational moment.
                      if (shouldAutoShowReferenceGuide()) {
                        setRefGuideOpen(true);
                      } else {
                        fileInputRef.current?.click();
                      }
                    }}
                    disabled={isUploading || imagesList.length >= 9}
                    className="flex-1 h-10 bg-primary-500/10 border border-primary-500/20 text-primary-500 rounded-md flex items-center justify-center gap-2 text-xs font-semibold hover:bg-primary-500 hover:text-black transition-colors overflow-hidden"
                  >
                    {isUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <IoImageOutline className="text-base" />
                        Upload image
                      </>
                    )}
                  </button>
                  {/* "ℹ Reference Tips" — secondary button sat right
                      next to Upload image so users always have the
                      passport-style guidance one tap away, even after
                      they've ticked "don't show again" on the popup.
                      Sized to match the upload button's 40px height. */}
                  <button
                    type="button"
                    onClick={() => setRefGuideOpen(true)}
                    title="Reference photo tips"
                    aria-label="Reference photo tips"
                    className="h-10 px-3 sm:px-4 bg-transparent border border-primary-500/40 text-primary-500 rounded-md flex items-center justify-center gap-1.5 text-xs font-semibold hover:bg-primary-500/10 transition-colors whitespace-nowrap"
                  >
                    <span aria-hidden="true">ℹ</span>
                    <span className="hidden sm:inline">Reference Tips</span>
                    <span className="sm:hidden">Tips</span>
                  </button>
                </div>

                {imagesList.length > 0 && (
                  <div
                    ref={uploadsGridRef}
                    className="grid grid-cols-3 sm:grid-cols-5 gap-2"
                  >
                    {imagesList.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-md bg-glass-bg overflow-hidden border border-glass-border"
                      >
                        <img src={url} className="w-full h-full object-cover" alt={`image ${idx + 1}`} />
                        {/* Delete button is ALWAYS visible on touch — was
                            hover-only (hidden group-hover:flex), which
                            meant phone users couldn't remove an uploaded
                            image at all. Arman flagged 2026-05-13. */}
                        <button
                          onClick={() =>
                            setImagesList(
                              imagesList.filter((_, i) => i !== idx)
                            )
                          }
                          aria-label="Remove image"
                          title="Remove image"
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/75 hover:bg-red-500 border border-white/20 flex items-center justify-center transition-colors"
                        >
                          <FaTrash className="text-white text-[10px]" />
                        </button>
                        <div className="absolute bottom-1 left-1 bg-black/70 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] text-white font-bold tracking-tight">
                          @image{idx + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Image library — searchable, named, scrollable. Replaces the
                    old horizontal "Recent" strip (2026-05-12). Each row carries
                    a user-editable name + time-ago caption. localStorage v1
                    auto-migrates to v2 on first load — see loadRecentImages(). */}
                {recentImages.length > 0 && (() => {
                  const q = librarySearch.trim().toLowerCase();
                  const filtered = q
                    ? recentImages.filter((r) => (r.name || "").toLowerCase().includes(q))
                    : recentImages;
                  return (
                    <div className="bg-glass-bg border border-glass-border rounded-lg overflow-hidden">
                      {/* Header: title + count + search */}
                      <div className="px-3 pt-3 pb-2 border-b border-glass-border">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[10px] font-medium text-muted uppercase tracking-wider flex items-center gap-1">
                            <FaSyncAlt className="text-[8px]" /> Your image library ({recentImages.length})
                          </label>
                          {librarySearch && (
                            <button
                              type="button"
                              onClick={() => setLibrarySearch("")}
                              className="text-[11px] text-muted hover:text-white transition-colors"
                            >
                              clear
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <FaSearchIcon />
                          <input
                            type="text"
                            value={librarySearch}
                            onChange={(e) => setLibrarySearch(e.target.value)}
                            placeholder="Search by name…"
                            className="w-full bg-black/40 border border-glass-border rounded-md pl-8 pr-7 py-1.5 text-xs outline-none focus:border-primary-500/40 placeholder:text-muted/70"
                          />
                          {librarySearch && (
                            <button
                              type="button"
                              onClick={() => setLibrarySearch("")}
                              aria-label="Clear search"
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted hover:text-white text-xs"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Scroll body */}
                      <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                        {filtered.length === 0 ? (
                          <div className="px-4 py-6 text-center text-xs text-muted">
                            No images named “{librarySearch}”.
                          </div>
                        ) : (
                          <ul className="divide-y divide-glass-border/60">
                            {filtered.map((row) => {
                              const inTray = imagesList.includes(row.url);
                              const isEditing = libraryEditingUrl === row.url;
                              const trayFull = imagesList.length >= 9;
                              return (
                                <li
                                  key={row.url}
                                  className={`flex items-center gap-3 px-3 py-2 ${
                                    inTray ? "bg-primary-500/[0.04]" : ""
                                  }`}
                                >
                                  {/* Thumbnail — click for a small floating
                                      preview popup. Magnifier overlay on
                                      hover hints that there's more to see. */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setLibraryPreview({
                                        url: row.url,
                                        name: row.name,
                                        rect: e.currentTarget.getBoundingClientRect(),
                                      });
                                    }}
                                    title="Click to view larger"
                                    className={`relative flex-shrink-0 w-11 h-11 rounded-md overflow-hidden border group cursor-zoom-in transition-shadow ${
                                      inTray ? "border-primary-500/40" : "border-glass-border hover:border-primary-500/30"
                                    }`}
                                  >
                                    <img src={row.url} className="w-full h-full object-cover" alt="" />
                                    {inTray && (
                                      <div className="absolute inset-0 bg-primary-500/20 flex items-center justify-center text-primary-500 font-bold text-sm pointer-events-none">
                                        ✓
                                      </div>
                                    )}
                                    {/* Magnifier hint on hover */}
                                    {!inTray && (
                                      <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <circle cx="11" cy="11" r="7" />
                                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                          <line x1="11" y1="8" x2="11" y2="14" />
                                          <line x1="8" y1="11" x2="14" y2="11" />
                                        </svg>
                                      </div>
                                    )}
                                  </button>

                                  {/* Name + time-ago */}
                                  <div className="flex-1 min-w-0">
                                    {isEditing ? (
                                      <input
                                        autoFocus
                                        value={libraryDraftName}
                                        onChange={(e) => setLibraryDraftName(e.target.value)}
                                        onBlur={() => {
                                          setRecentImages(renameRecentImage(row.url, libraryDraftName));
                                          setLibraryEditingUrl(null);
                                          setLibraryDraftName("");
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            setRecentImages(renameRecentImage(row.url, libraryDraftName));
                                            setLibraryEditingUrl(null);
                                            setLibraryDraftName("");
                                          } else if (e.key === "Escape") {
                                            setLibraryEditingUrl(null);
                                            setLibraryDraftName("");
                                          }
                                        }}
                                        maxLength={60}
                                        className="w-full bg-black/60 border border-primary-500/40 rounded-md px-2 py-1 text-xs outline-none"
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setLibraryEditingUrl(row.url);
                                          setLibraryDraftName(row.name || "");
                                        }}
                                        title="Click to rename"
                                        className="block w-full text-left text-xs font-medium text-white truncate hover:text-primary-500 transition-colors cursor-text"
                                      >
                                        {row.name || "Untitled"}
                                      </button>
                                    )}
                                    <div className="text-[10px] text-muted mt-0.5">
                                      {timeAgo(row.addedAt || Date.now())}
                                    </div>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {inTray ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setImagesList((prev) => prev.filter((u) => u !== row.url))
                                        }
                                        className="px-2 py-1 text-[11px] font-semibold rounded-md border border-glass-border text-muted hover:text-white hover:border-white/30 transition-colors"
                                      >
                                        In tray
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (!trayFull) setImagesList((prev) => [...prev, row.url]);
                                        }}
                                        disabled={trayFull}
                                        title={trayFull ? "Tray is full (9/9)" : "Add to images"}
                                        className="px-2 py-1 text-[11px] font-semibold rounded-md bg-primary-500 text-black hover:brightness-110 disabled:bg-transparent disabled:border disabled:border-glass-border disabled:text-muted disabled:cursor-not-allowed transition-all"
                                      >
                                        Add
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setRecentImages(removeRecentImage(row.url))}
                                      aria-label="Remove from library"
                                      title="Remove from library"
                                      className="w-6 h-6 rounded-md border border-glass-border text-muted hover:text-red-400 hover:border-red-400/40 transition-colors flex items-center justify-center text-sm leading-none"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {mode === "reference-to-video" && (
              <div className="space-y-6 pt-4 border-t border-glass-border">
                <div className="space-y-3">
                  <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
                    Video Clips ({videoFiles.length}/3)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newVideoUrl}
                      onChange={(e) => setNewVideoUrl(e.target.value)}
                      placeholder="Video URL..."
                      className="flex-1 bg-glass-bg border border-glass-border rounded-md px-3 py-2 text-xs outline-none focus:border-primary-500/40"
                    />
                    <input
                      type="file"
                      ref={videoInputRef}
                      hidden
                      accept=".mp4"
                      onChange={handleFileUploadVideo}
                    />
                    <button
                      onClick={() => {
                        if (!session) {
                          signIn();
                          return;
                        }
                        videoInputRef.current?.click();
                      }}
                      disabled={isUploadingVideo || videoFiles.length >= 3}
                      className="w-9 h-9 bg-primary-500/10 border border-primary-500/20 text-primary-500 rounded-md flex items-center justify-center hover:bg-primary-500 hover:text-black transition-colors"
                    >
                      {isUploadingVideo ? (
                        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <FaVideo />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (newVideoUrl && videoFiles.length < 3) {
                          setVideoFiles([...videoFiles, newVideoUrl]);
                          setNewVideoUrl("");
                        }
                      }}
                      disabled={!newVideoUrl || videoFiles.length >= 3}
                      className="w-9 h-9 bg-glass-bg border border-glass-border text-primary-500 rounded-md flex items-center justify-center hover:bg-primary-500 hover:text-black transition-colors"
                    >
                      <FaPlus />
                    </button>
                  </div>
                  {videoFiles.length > 0 && (
                    <div className="grid grid-cols-5 gap-2">
                      {videoFiles.map((url, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-md bg-glass-bg overflow-hidden group border border-glass-border"
                        >
                          <video src={url} className="w-full h-full object-cover" />
                          <button
                            onClick={() =>
                              setVideoFiles(
                                videoFiles.filter((_, i) => i !== idx)
                              )
                            }
                            className="absolute top-2 right-2 p-1 rounded bg-red-500/80 items-center justify-center hidden group-hover:flex"
                          >
                            <FaTrash className="text-white text-[10px]" />
                          </button>
                          <div className="absolute bottom-1 right-1 bg-black/60 px-1 rounded text-[8px] text-white">
                            @video{idx + 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
                    Audio Clips ({audioFiles.length}/3)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAudioUrl}
                      onChange={(e) => setNewAudioUrl(e.target.value)}
                      placeholder="Audio URL..."
                      className="flex-1 bg-glass-bg border border-glass-border rounded-md px-3 py-2 text-xs outline-none focus:border-primary-500/40"
                    />
                    <input
                      type="file"
                      ref={audioInputRef}
                      hidden
                      accept=".mp3,.wav"
                      onChange={handleFileUploadAudio}
                    />
                    <button
                      onClick={() => {
                        if (!session) {
                          signIn();
                          return;
                        }
                        audioInputRef.current?.click();
                      }}
                      disabled={isUploadingAudio || audioFiles.length >= 3}
                      className="w-9 h-9 bg-primary-500/10 border border-primary-500/20 text-primary-500 rounded-md flex items-center justify-center hover:bg-primary-500 hover:text-black transition-colors"
                    >
                      {isUploadingAudio ? (
                        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <FaMusic />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (newAudioUrl && audioFiles.length < 3) {
                          setAudioFiles([...audioFiles, newAudioUrl]);
                          setNewAudioUrl("");
                        }
                      }}
                      disabled={!newAudioUrl || audioFiles.length >= 3}
                      className="w-9 h-9 bg-glass-bg border border-glass-border text-primary-500 rounded-md flex items-center justify-center hover:bg-primary-500 hover:text-black transition-colors"
                    >
                      <FaPlus />
                    </button>
                  </div>
                  {audioFiles.length > 0 && (
                    <div className="space-y-2">
                      {audioFiles.map((url, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-md bg-glass-bg border border-glass-border group"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FaMusic className="text-muted text-[10px]" />
                            <span className="text-[10px] text-foreground truncate">
                              {url.split("/").pop()}
                            </span>
                            <span className="text-[8px] text-primary-500 font-bold">
                              @audio{idx + 1}
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              setAudioFiles(
                                audioFiles.filter((_, i) => i !== idx)
                              )
                            }
                            className="text-muted hover:text-red-500"
                          >
                            <FaTrash className="text-[10px]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {mode === "story" && (
              <div className="text-[10px] font-medium text-muted uppercase tracking-wider -mb-1">
                Global settings · applied to every shot
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <CustomSelect
                label="Aspect Ratio"
                value={aspectRatio}
                options={ASPECT_RATIOS}
                onChange={setAspectRatio}
              />
              <CustomSelect
                label="Resolution"
                value={resolution}
                options={RESOLUTIONS}
                onChange={setResolution}
              />
              {mode === "story" ? (
                <div className="px-3 py-2 bg-glass-hover border border-glass-border rounded-md">
                  <div className="text-[9.5px] font-medium text-muted uppercase tracking-wider">
                    Total duration
                  </div>
                  <div className="text-sm font-bold text-foreground mt-0.5">
                    {storyTotalDuration}s · {storyShots.length} shot{storyShots.length === 1 ? "" : "s"}
                  </div>
                </div>
              ) : (
                <CustomSelect
                  label="Duration"
                  value={duration}
                  options={getAvailableDurations()}
                  onChange={setDuration}
                />
              )}
              <CustomSelect
                label="Quality"
                value={quality}
                options={QUALITIES}
                onChange={setQuality}
              />
            </div>
          </div>

          {mode === "story" ? (
            // Story mode runs N generations in sequence. We don't drive the
            // existing progress bar (which is per-clip) — instead we show a
            // status pill + the big batch-cost button. The right column's
            // <StoryReelPreview> shows each shot's state ("queued" /
            // "generating…" / "done") individually.
            <button
              onClick={handleGenerateAllShots}
              disabled={
                storyLoading ||
                storyShots.length === 0 ||
                storyCast.length === 0
              }
              className="w-full bg-primary-500 text-black rounded-md py-2 text-sm font-medium hover:bg-primary-600 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              <span className="flex items-center justify-center gap-2">
                {storyLoading
                  ? (storyStatusMsg || "Generating story…")
                  : `▶ Generate all ${storyShots.length} shot${storyShots.length === 1 ? "" : "s"} (${storyTotalCredits} credits)`
                }
              </span>
            </button>
          ) : loading ? (
            <div
              role="progressbar"
              aria-valuenow={Math.floor(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="relative w-full rounded-md overflow-hidden"
              style={{
                height: "36px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(34,197,94,0.25)",
              }}
            >
              <div
                style={{
                  position: "absolute", top: 0, bottom: 0, left: 0,
                  width: `${progress}%`,
                  background: "linear-gradient(90deg, #16a34a, #22c55e, #4ade80)",
                  boxShadow: "0 0 18px rgba(34,197,94,0.45), inset 0 1px 0 rgba(255,255,255,0.15)",
                  transition: "width 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
                  borderRadius: "6px",
                }}
              />
              <div
                className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white pointer-events-none"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)", letterSpacing: "0.02em" }}
              >
                ✨ Generating… {Math.floor(progress)}%
              </div>
            </div>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={
                (mode === "text-to-video" && !prompt.trim()) ||
                (mode !== "text-to-video" && imagesList.length === 0)
              }
              className="w-full bg-primary-500 text-black rounded-md py-2 text-sm font-medium hover:bg-primary-600 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              <span className="flex items-center justify-center gap-2">
                Generate ({creditCost} Credits)
                <span className="hidden sm:inline text-[10px] opacity-40 font-normal">⌘↵</span>
              </span>
            </button>
          )}

          {error && (
            <p className="text-[10px] text-red-500 font-medium text-center">
              {error}
            </p>
          )}
        </div>

        {/* Right: Preview */}
        <div className="bg-glass-bg border border-glass-border rounded-lg p-6 flex flex-col gap-4 min-h-[500px]">
          <h2 className="text-[10px] font-medium text-muted uppercase tracking-wider">
            {mode === "story" ? "Reel Preview" : "Preview"}
          </h2>
          {mode === "story" ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
              <StoryReelPreview
                shots={storyShots}
                cast={storyCast}
                onDownloadShot={handleDownloadShot}
              />
            </div>
          ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-glass-hover rounded-md border border-glass-border relative overflow-hidden group">
            {resultUrl ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-4">
                <div className="relative w-full aspect-video rounded-md overflow-hidden bg-black shadow-inner">
                  <video
                    src={resultUrl}
                    className="w-full h-full object-contain"
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                  <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Inside the native iOS/Android app, opening the
                        OS share sheet is FAR more useful than a download
                        — users want to push the video into Instagram /
                        WhatsApp / TikTok directly. nativeShare() returns
                        a Web Share fallback for mobile browsers and
                        a clipboard fallback for desktop, so the same
                        button works everywhere. The download button is
                        kept as a secondary action. */}
                    <button
                      onClick={async () => {
                        const r = await nativeShare({
                          title: "My Seedance video",
                          text: "Made with Seedance — type. tap. cinema.",
                          url: resultUrl,
                          dialogTitle: "Share your video",
                        });
                        if (!r.ok && r.via === "unsupported") {
                          // Last-resort: just download.
                          downloadMedia(resultUrl, `seedance-${Date.now()}.mp4`);
                        } else if (r.ok && r.via === "clipboard") {
                          toast.success("Link copied — paste it anywhere");
                        }
                      }}
                      title={isNativeApp() ? "Share" : "Share or copy link"}
                      aria-label="Share"
                      className="p-3 bg-white/90 hover:bg-white text-black rounded-full shadow-2xl transition-all hover:scale-110 active:scale-90"
                    >
                      <FaShare className="text-base" />
                    </button>
                    <button
                      onClick={() =>
                        downloadMedia(resultUrl, `seedance-${Date.now()}.mp4`)
                      }
                      title="Download"
                      aria-label="Download"
                      className="p-3 bg-white/90 hover:bg-white text-black rounded-full shadow-2xl transition-all hover:scale-110 active:scale-90"
                    >
                      <FiDownload className="text-xl" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-primary-500/10 text-primary-500 text-[10px] font-medium rounded uppercase">
                    {aspectRatio}
                  </span>
                  <span className="px-2 py-1 bg-glass-hover text-muted text-[10px] font-medium rounded uppercase">
                    {resolution}
                  </span>
                </div>
              </div>
            ) : loading ? (
              <div className="w-full h-full flex flex-col p-4 gap-3">
                {/* Shimmer video block */}
                <div className="relative w-full rounded-md overflow-hidden bg-glass-hover shimmer-box" style={{ aspectRatio: "16/9" }}>
                  <div className="shimmer-overlay" />
                  {/* Fake play button in centre */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full shimmer-btn" />
                  </div>
                </div>

                {/* Status row */}
                <div className="flex items-center gap-2 px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-ping shrink-0" />
                  <p className="text-[10px] font-medium text-primary-500 uppercase tracking-widest">
                    {statusMessage || "Processing…"}
                  </p>
                </div>

                {/* Skeleton meta badges */}
                <div className="flex gap-2 px-1">
                  <div className="h-5 w-10 rounded shimmer-box" />
                  <div className="h-5 w-10 rounded shimmer-box" />
                </div>
              </div>
            ) : (
              <div className="text-center p-8 space-y-3">
                <FaMagic className="text-2xl opacity-30 mx-auto" />
                <p className="text-[10px] text-muted uppercase tracking-widest font-medium">
                  Video Preview
                </p>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      <ArmanGallery />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 0px;
        }
        .custom-scrollbar {
          scrollbar-width: none;
        }

        /* Shimmer skeleton */
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .shimmer-box {
          background: rgba(255,255,255,0.04);
          position: relative;
          overflow: hidden;
        }
        .shimmer-box::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(217, 255, 0,0.08) 40%,
            rgba(217, 255, 0,0.14) 50%,
            rgba(217, 255, 0,0.08) 60%,
            transparent 100%
          );
          animation: shimmer 1.6s ease-in-out infinite;
        }
        .shimmer-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(217, 255, 0,0.1) 40%,
            rgba(217, 255, 0,0.18) 50%,
            rgba(217, 255, 0,0.1) 60%,
            transparent 100%
          );
          animation: shimmer 1.6s ease-in-out infinite;
        }
        .shimmer-btn {
          background: rgba(255,255,255,0.06);
          position: relative;
          overflow: hidden;
        }
        .shimmer-btn::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255,255,255,0.08) 50%,
            transparent 100%
          );
          animation: shimmer 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
      {showBuilder && (
        <PromptBuilder
          onUse={(p) => setPrompt(p)}
          onClose={() => setShowBuilder(false)}
        />
      )}
      {showImageBuilder && (
        <ImageBuilder
          onUse={(url) => {
            // Add the generated image to the imagesList for video generation
            // and save it to the Recent Images strip in localStorage.
            if (imagesList.length < 9) {
              setImagesList((prev) => [...prev, url]);
            }
            const updated = saveRecentImage(url);
            setRecentImages(updated);
            toast.success("Reference image ready");
          }}
          onClose={() => setShowImageBuilder(false)}
        />
      )}

      {/* Push-permission banner — slides in bottom-right on the first
          Generate click of the session (provided OS push is supported,
          permission is still "default", and the user hasn't dismissed
          in the last 14 days). All gating logic lives inside the
          component; we just bump `triggerKey` here. */}
      <PushPermissionBanner triggerKey={pushBannerTrigger} />

      {/* Library image preview popup — small floating card that appears
          next to the clicked thumbnail so the user can see the full
          image clearly without leaving the page. Positioned with the
          captured rect; flips left when there's no room on the right,
          clamps vertically to the viewport. ESC + outside-click close
          (wired in the useEffect above). */}
      {libraryPreview && (() => {
        const SIZE = 280;             // square card edge
        const PAD = 12;                // gap between thumbnail + card
        const VW = typeof window !== "undefined" ? window.innerWidth : 1024;
        const VH = typeof window !== "undefined" ? window.innerHeight : 768;
        const r = libraryPreview.rect;
        // Prefer right of the thumbnail. If that overflows, place on the left.
        let left = r.right + PAD;
        if (left + SIZE > VW - 8) left = Math.max(8, r.left - PAD - SIZE);
        // Top-align with the row, but clamp inside the viewport.
        let top = Math.max(8, Math.min(r.top, VH - SIZE - 60));
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "fixed", left, top, width: SIZE, zIndex: 60 }}
            className="bg-glass-bg border border-glass-border rounded-xl shadow-2xl shadow-black/60 p-2 backdrop-blur-sm"
          >
            <div className="relative w-full" style={{ height: SIZE - 16 }}>
              <img
                src={libraryPreview.url}
                alt={libraryPreview.name || ""}
                className="w-full h-full object-contain rounded-lg bg-black/40"
              />
              <button
                type="button"
                onClick={() => setLibraryPreview(null)}
                aria-label="Close preview"
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 border border-white/15 text-white text-xs leading-none flex items-center justify-center hover:bg-red-500 hover:border-red-400 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2 px-1">
              <span className="text-[11px] font-semibold text-foreground truncate">
                {libraryPreview.name || "Untitled"}
              </span>
              <span className="text-[10px] text-muted">Esc to close</span>
            </div>
          </div>
        );
      })()}
      <ReferenceImageGuideModal
        open={refGuideOpen}
        onClose={() => setRefGuideOpen(false)}
        onGotIt={() => {
          setRefGuideOpen(false);
          // Brief breath after the modal close animation so the OS
          // file picker doesn't slam in on top of it.
          setTimeout(() => fileInputRef.current?.click(), 120);
        }}
      />
    </>
  );
}
