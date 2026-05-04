"use client";
import { useEffect } from "react";

export default function TawkTo() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Avoid loading twice (e.g. hot-reload)
    if (window.Tawk_API) return;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    const s1 = document.createElement("script");
    const s0 = document.getElementsByTagName("script")[0];
    s1.async = true;
    s1.src = "https://embed.tawk.to/69f87996986f9c1c33e853ff/1jnp9lsvt";
    s1.charset = "UTF-8";
    s1.setAttribute("crossorigin", "*");
    s0.parentNode.insertBefore(s1, s0);
  }, []);

  return null;
}
