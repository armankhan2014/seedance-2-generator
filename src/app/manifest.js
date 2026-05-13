// PWA manifest — tells Android / desktop Chrome / Edge / Firefox that
// this is an installable web app. The browser then shows the "Install"
// button in the URL bar / address-bar menu and, when triggered, adds
// Seedance to the user's home screen / app drawer.
//
// iOS Safari uses meta tags in layout.js for the same purpose — it
// doesn't read manifest.json by default.
//
// Next.js 16 convention: this file is recognised automatically and
// served at /manifest.webmanifest. No need to register it manually.

export default function manifest() {
  return {
    name: "Seedance Studio — AI Video Generator",
    short_name: "Seedance",
    description:
      "Generate stunning AI videos in seconds. Text-to-video, image-to-video, multi-shot stories with face-locked cast.",
    // Land users on /generate when they open the installed app — that's
    // the primary use surface. Could change to "/" later if we want them
    // to see marketing first.
    start_url: "/generate",
    // standalone hides the browser chrome (URL bar, tabs) so the
    // installed app feels native.
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    orientation: "portrait-primary",
    categories: ["video", "productivity", "creativity"],
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      // maskable variant lets Android adaptive icon system clip the
      // image into circles / squircles / etc. without cropping the
      // content. Same image — Android handles the masking.
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
