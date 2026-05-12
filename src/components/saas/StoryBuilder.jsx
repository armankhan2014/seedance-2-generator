"use client";
//
// StoryBuilder — left-column UI for /generate Story mode + the right-column
// ReelPreview. State is fully lifted to GenerateClient so the parent owns
// localStorage persistence and the real /api/seedance generation calls.
//
// Two named exports:
//   <StoryBuilder ... />       → cast strip + shot list (left column body)
//   <StoryReelPreview ... />   → stacked per-shot preview (right column)
//
// Designed to be a drop-in around the existing Tailwind classes the live
// /generate page uses (text-muted, bg-glass-bg, border-glass-border, etc.)
// so it visually melts into the page without extra theme work.

import { useRef } from "react";
import { FaPlus, FaArrowUp, FaArrowDown, FaTrash } from "react-icons/fa";

const DURATIONS = [5, 10, 15];

export function letterFor(i) {
  return String.fromCharCode(65 + i);
}

export function estimateCreditsPerShot(duration, resolution, quality) {
  const BASE = { 5: 120, 10: 200, 15: 320 };
  const base = BASE[duration] ?? Math.ceil((duration / 15) * 320);
  let mult = 1.0;
  if (resolution === "480p") mult = 0.7;
  else if (resolution === "1080p" && quality === "high") mult = 1.40625;
  else if (resolution === "1080p") mult = 1.2;
  else if (quality === "high") mult = 1.15;
  // Story shots always use the reference-to-video model (face lock via cast).
  mult *= 1.1;
  return Math.ceil(base * mult);
}

// ─────────────────────────────────────────────────────────────────────────
// StoryBuilder — title + cast strip + shot list
// ─────────────────────────────────────────────────────────────────────────
export function StoryBuilder({
  // Story content
  title,
  onTitleChange,
  cast,
  shots,

  // Inline-rename state for the cast strip
  editingCastId,
  setEditingCastId,
  castDraftName,
  setCastDraftName,

  // Cast handlers
  onUploadCastFile,        // (File) => Promise<void>  — parent does the upload
  onRemoveCast,
  onRenameCast,
  isUploadingCast,

  // Shot handlers
  onAddShot,
  onRemoveShot,
  onPatchShot,
  onToggleShotCast,
  onMoveShot,
  onGenerateOneShot,       // (shotId) => void

  // Per-shot generation state (so we can show "Generating…" on the right shot)
  generatingShotId,
  globalLoading,           // true while ANY generation runs

  // Settings used to estimate per-shot credits
  resolution,
  quality,
}) {
  const castFileRef = useRef(null);

  function commitRename(id) {
    onRenameCast(id, castDraftName);
    setEditingCastId(null);
    setCastDraftName("");
  }

  async function onCastInputChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      await onUploadCastFile(file);
    }
    // Reset so the same file can be picked again later.
    if (castFileRef.current) castFileRef.current.value = "";
  }

  const totalDuration = shots.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div className="space-y-4">
      {/* Story title */}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Story title…"
        className="w-full bg-transparent border-0 border-b border-glass-border text-foreground text-base font-semibold py-2 outline-none placeholder:text-muted/70"
      />

      {/* ── CAST STRIP ──────────────────────────────────────────────── */}
      <div>
        <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2">
          Cast ({cast.length}) · same faces across every shot
        </div>
        <div className="flex flex-wrap gap-2">
          {cast.map((c, idx) => {
            const isEditing = editingCastId === c.id;
            return (
              <div
                key={c.id}
                className="flex items-center gap-2 px-2 py-1 pl-1 bg-glass-hover border border-glass-border rounded-full"
              >
                <div className="relative">
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                  <span className="absolute -left-0.5 -bottom-0.5 bg-primary-500 text-black text-[9px] font-extrabold px-1 rounded leading-none">
                    {letterFor(idx)}
                  </span>
                </div>
                {isEditing ? (
                  <input
                    autoFocus
                    value={castDraftName}
                    onChange={(e) => setCastDraftName(e.target.value)}
                    onBlur={() => commitRename(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(c.id);
                      if (e.key === "Escape") {
                        setEditingCastId(null);
                        setCastDraftName("");
                      }
                    }}
                    maxLength={40}
                    className="w-24 bg-black/40 border border-primary-500/40 rounded-md px-2 py-0.5 text-xs text-foreground outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCastId(c.id);
                      setCastDraftName(c.name);
                    }}
                    title="Click to rename"
                    className="text-xs font-semibold text-foreground cursor-text bg-transparent border-0 p-0"
                  >
                    {c.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveCast(c.id)}
                  title="Remove character"
                  aria-label="Remove character"
                  className="w-4 h-4 rounded-full border border-glass-border text-muted hover:text-red-400 hover:border-red-400/40 text-[10px] leading-none flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            );
          })}

          {/* Hidden picker + visible Add button */}
          <input
            ref={castFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/jpg"
            hidden
            onChange={onCastInputChange}
          />
          <button
            type="button"
            onClick={() => castFileRef.current?.click()}
            disabled={isUploadingCast}
            className="px-3 py-1 text-xs font-bold border border-dashed border-glass-border rounded-full text-primary-500 hover:bg-primary-500/10 disabled:opacity-60 disabled:cursor-wait transition-colors flex items-center gap-1.5"
          >
            <FaPlus className="text-[10px]" />
            {isUploadingCast ? "Uploading…" : "Add character"}
          </button>
        </div>
      </div>

      {/* ── SHOT LIST ───────────────────────────────────────────────── */}
      <div>
        <div className="text-[10px] font-medium text-muted uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>Shots ({shots.length})</span>
          {shots.length > 0 && (
            <span className="text-muted/80 normal-case tracking-normal">
              total {totalDuration}s
            </span>
          )}
        </div>

        <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
          {shots.map((shot, idx) => (
            <ShotCard
              key={shot.id}
              index={idx}
              isFirst={idx === 0}
              isLast={idx === shots.length - 1}
              shot={shot}
              cast={cast}
              resolution={resolution}
              quality={quality}
              onPatch={(patch) => onPatchShot(shot.id, patch)}
              onToggleCast={(castId) => onToggleShotCast(shot.id, castId)}
              onRemove={() => onRemoveShot(shot.id)}
              onMoveUp={() => onMoveShot(shot.id, "up")}
              onMoveDown={() => onMoveShot(shot.id, "down")}
              onGenerate={() => onGenerateOneShot(shot.id)}
              isGenerating={generatingShotId === shot.id}
              disabled={globalLoading}
            />
          ))}

          <button
            type="button"
            onClick={onAddShot}
            disabled={globalLoading}
            className="w-full px-4 py-3 text-xs font-semibold text-muted border border-dashed border-glass-border rounded-lg hover:text-foreground hover:border-glass-border/80 disabled:opacity-50 transition-colors"
          >
            + Add shot
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ShotCard — internal
// ─────────────────────────────────────────────────────────────────────────
function ShotCard({
  index,
  isFirst,
  isLast,
  shot,
  cast,
  resolution,
  quality,
  onPatch,
  onToggleCast,
  onRemove,
  onMoveUp,
  onMoveDown,
  onGenerate,
  isGenerating,
  disabled,
}) {
  const cost = estimateCreditsPerShot(shot.duration, resolution, quality);
  const statusLabel =
    shot.status === "done"
      ? "✓ Done"
      : shot.status === "failed"
        ? `✗ ${shot.error || "Failed"}`
        : shot.status === "generating" || isGenerating
          ? "Generating…"
          : shot.status === "queued"
            ? "Queued"
            : null;

  return (
    <div className="bg-glass-hover border border-glass-border rounded-lg">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-glass-border/60">
        <div className="text-[10px] font-extrabold text-primary-500 uppercase tracking-widest">
          Shot {index + 1}
        </div>

        {/* Duration pills */}
        <div className="flex gap-1 ml-1">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onPatch({ duration: d })}
              disabled={disabled}
              className={`px-2 py-0.5 text-[10px] font-bold rounded-md border transition-colors disabled:cursor-not-allowed ${
                shot.duration === d
                  ? "bg-primary-500 text-black border-primary-500"
                  : "bg-transparent text-muted border-glass-border hover:text-foreground"
              }`}
            >
              {d}s
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {statusLabel && (
          <span
            className={`text-[10px] font-semibold mr-1 ${
              shot.status === "done"
                ? "text-primary-500"
                : shot.status === "failed"
                  ? "text-red-400"
                  : "text-muted"
            }`}
          >
            {statusLabel}
          </span>
        )}

        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst || disabled}
          aria-label="Move up"
          title="Move up"
          className="w-6 h-6 rounded-md border border-glass-border text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-[10px]"
        >
          <FaArrowUp />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast || disabled}
          aria-label="Move down"
          title="Move down"
          className="w-6 h-6 rounded-md border border-glass-border text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-[10px]"
        >
          <FaArrowDown />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label="Delete shot"
          title="Delete shot"
          className="w-6 h-6 rounded-md border border-glass-border text-muted hover:text-red-400 hover:border-red-400/40 disabled:opacity-40 flex items-center justify-center text-[10px]"
        >
          <FaTrash />
        </button>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2.5">
        {/* Cast chips */}
        {cast.length > 0 ? (
          <div>
            <div className="flex flex-wrap gap-1.5">
              {cast.map((c, ci) => {
                const on = shot.castIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onToggleCast(c.id)}
                    disabled={disabled}
                    title={on ? `Remove ${c.name}` : `Add ${c.name}`}
                    className={`inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full text-[11px] font-bold border transition-colors disabled:cursor-not-allowed ${
                      on
                        ? "bg-primary-500/10 border-primary-500/40 text-foreground"
                        : "bg-transparent border-glass-border text-muted hover:text-foreground"
                    }`}
                  >
                    <img
                      src={c.imageUrl}
                      alt=""
                      className="w-[18px] h-[18px] rounded-full object-cover"
                    />
                    <span className="font-extrabold">{letterFor(ci)}</span>
                    <span className="font-semibold">{c.name}</span>
                  </button>
                );
              })}
            </div>
            {shot.castIds.length === 0 && (
              <div className="mt-1.5 text-[10.5px] text-amber-400/90 font-semibold">
                ⚠ Tap a character above to add them to this shot.
              </div>
            )}
          </div>
        ) : (
          <div className="text-[10.5px] text-amber-400/90 font-semibold">
            ⚠ Add a character above first so this shot can stay face-locked.
          </div>
        )}

        {/* Prompt */}
        <textarea
          value={shot.prompt}
          onChange={(e) => onPatch({ prompt: e.target.value })}
          placeholder="Describe this shot…"
          rows={2}
          disabled={disabled}
          className="w-full bg-black/40 border border-glass-border rounded-md px-2.5 py-2 text-xs leading-relaxed text-foreground outline-none focus:border-primary-500/40 resize-y min-h-[56px] disabled:opacity-70"
        />

        {/* Action row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[10.5px] text-muted">
            ~{cost} credits
            {shot.castIds.length > 0 && (
              <>
                {" · "}
                {shot.castIds
                  .map((cid) => {
                    const i = cast.findIndex((c) => c.id === cid);
                    return i >= 0 ? letterFor(i) : null;
                  })
                  .filter(Boolean)
                  .join(", ")}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={
              disabled ||
              !shot.prompt.trim() ||
              isGenerating
            }
            className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-primary-500 text-black hover:brightness-110 disabled:bg-transparent disabled:border disabled:border-glass-border disabled:text-muted disabled:cursor-not-allowed transition-all"
          >
            {isGenerating ? "Generating…" : "▶ This shot"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// StoryReelPreview — right column when in Story mode
// ─────────────────────────────────────────────────────────────────────────
export function StoryReelPreview({ shots, cast, onDownloadShot }) {
  if (shots.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-xs text-muted border border-dashed border-glass-border rounded-lg">
        Add a shot to get started. The output reel appears here.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {shots.map((shot, idx) => (
        <div
          key={shot.id}
          className="flex gap-3 bg-glass-hover border border-glass-border rounded-lg p-2.5"
        >
          {/* Video / placeholder */}
          <div className="flex-shrink-0 w-[132px] aspect-video bg-black border border-glass-border rounded-md overflow-hidden relative flex items-center justify-center">
            {shot.videoUrl ? (
              <video
                src={shot.videoUrl}
                className="w-full h-full object-cover"
                muted
                loop
                autoPlay
                playsInline
              />
            ) : shot.status === "generating" || shot.status === "queued" ? (
              <div className="text-[10px] text-primary-500 font-bold uppercase tracking-widest animate-pulse">
                {shot.status === "queued" ? "queued" : "generating…"}
              </div>
            ) : shot.status === "failed" ? (
              <div className="text-[10px] text-red-400 font-bold uppercase tracking-widest text-center px-2">
                Failed
              </div>
            ) : (
              <>
                <div className="text-2xl text-muted/40">▶</div>
                <div className="absolute bottom-1 left-1.5 text-[9px] text-muted font-bold uppercase tracking-widest">
                  awaiting · {shot.duration}s
                </div>
              </>
            )}
            <div className="absolute top-1 left-1.5 bg-black/70 text-primary-500 text-[9.5px] font-extrabold px-1.5 rounded tracking-wider">
              {idx + 1}
            </div>
            {shot.videoUrl && onDownloadShot && (
              <button
                type="button"
                onClick={() => onDownloadShot(shot)}
                className="absolute bottom-1 right-1 text-[10px] font-bold bg-primary-500/90 text-black px-1.5 py-0.5 rounded"
              >
                ↓
              </button>
            )}
          </div>

          {/* Text side */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-extrabold text-muted uppercase tracking-widest mb-1">
              Shot {idx + 1} · {shot.duration}s
            </div>
            <div
              className="text-xs text-foreground leading-snug overflow-hidden"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                minHeight: 32,
              }}
            >
              {shot.prompt || (
                <span className="text-muted italic">No prompt yet…</span>
              )}
            </div>
            {shot.castIds.length > 0 && (
              <div className="mt-1.5 flex gap-1 items-center">
                {shot.castIds.map((cid) => {
                  const i = cast.findIndex((c) => c.id === cid);
                  if (i < 0) return null;
                  return (
                    <img
                      key={cid}
                      src={cast[i].imageUrl}
                      alt=""
                      title={cast[i].name}
                      className="w-[18px] h-[18px] rounded-full object-cover border border-primary-500/40"
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
