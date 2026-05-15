// Pink verified badge — Material Design "verified" icon (scalloped
// starburst + white checkmark). Same SVG used on community
// .visualseffect.com so the brand badge is consistent across both
// properties. Inlined SVG keeps it dependency-free and trivially
// re-themeable.
export default function VerifiedBadge({ size = 16, title = "Verified" }) {
  return (
    <span
      title={title}
      aria-label={title}
      style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="#e91e8c"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82 1.89 3.2L12 21.04l3.4 1.46 1.89-3.19 3.61-.82-.34-3.69z" />
        <path
          d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9z"
          fill="white"
        />
      </svg>
    </span>
  );
}
