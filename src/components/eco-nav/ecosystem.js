// Single source of truth for the ecosystem registry. Imported by
// every nav surface (top bar, apps panel, mobile bottom nav).
// Once this demo is approved, this file moves into a shared
// package consumed by every subdomain so a tool addition is a
// one-PR change.

// `id` doubles as the apps-panel slot key. `host` is matched
// against window.location.host to detect the active app for the
// "current subdomain" pill + the highlighted tile in the panel.
export const APPS = [
  {
    id: "seedance",
    name: "Generate Video",
    sub: "Seedance · Veo · Kling",
    icon: "🎬",
    href: "https://seedance.visualseffect.com",
    host: "seedance.visualseffect.com",
    family: "generate",
  },
  {
    id: "studio-image",
    name: "Generate Image",
    sub: "Imagen · Nano Banana · MJ",
    icon: "🎨",
    href: "https://visualseffect.com/studio/image",
    host: "visualseffect.com",
    family: "generate",
  },
  {
    id: "music",
    name: "Music Studio",
    sub: "Create AI music",
    icon: "🎵",
    href: "https://music.visualseffect.com",
    host: "music.visualseffect.com",
    family: "make",
  },
  {
    id: "edits",
    name: "Video Editor",
    sub: "Edit your videos",
    icon: "✂",
    href: "https://edits.visualseffect.com",
    host: "edits.visualseffect.com",
    family: "make",
  },
  {
    id: "cinema",
    name: "Cinema Studio",
    sub: "Virtual cinema cam",
    icon: "🎥",
    href: "https://visualseffect.com/studio/cinema",
    host: "visualseffect.com",
    pathPrefix: "/studio/cinema",
    family: "make",
  },
  {
    id: "community",
    name: "The Community",
    sub: "Share & connect",
    icon: "🎞",
    href: "https://community.visualseffect.com",
    host: "community.visualseffect.com",
    family: "share",
  },
  {
    id: "prompts",
    name: "Prompt Library",
    sub: "Browse prompts",
    icon: "💡",
    href: "https://community.visualseffect.com/prompts",
    host: "community.visualseffect.com",
    pathPrefix: "/prompts",
    family: "share",
  },
  {
    id: "hub",
    name: "Dashboard",
    sub: "Your account",
    icon: "📊",
    href: "https://visualseffect.com",
    host: "visualseffect.com",
    family: "you",
  },
];

// Resolve which app is "active" given a host + path. Used to
// highlight the tile in the panel and the pill in the top bar.
export function detectActiveApp({ host = "", pathname = "" } = {}) {
  // Exact pathPrefix match wins over plain host match — that's
  // how /studio/cinema and /prompts win against the host fallback.
  const prefixMatch = APPS.find(
    (a) => a.host === host && a.pathPrefix && pathname.startsWith(a.pathPrefix)
  );
  if (prefixMatch) return prefixMatch;
  return APPS.find((a) => a.host === host && !a.pathPrefix) || APPS.find((a) => a.host === host);
}

// Family grouping for the panel — keeps a 2-column grid balanced
// across visually-related tools.
export const FAMILIES = {
  generate: { label: "Generate", order: 1 },
  make: { label: "Make", order: 2 },
  share: { label: "Share", order: 3 },
  you: { label: "You", order: 4 },
};

// "Continue" suggestions — what the user was last doing inside
// each app. The real impl reads from a cross-domain user-state
// API; for the demo we hardcode plausible mock entries.
export const DEMO_RECENT_TOOLS = ["seedance", "edits", "music"];
export const DEMO_RESUME = [
  {
    appId: "edits",
    title: "Bullet ricochet — clip 3",
    sub: "12-second cut · last edited 23m ago",
  },
  {
    appId: "seedance",
    title: "Cigar vs bullet — comedy beat",
    sub: "Seedance 2 · 9:16 · rendering 60%",
  },
  {
    appId: "music",
    title: "Mumbai golden-hour score",
    sub: "Suno V5 · 2:14 · draft",
  },
];
