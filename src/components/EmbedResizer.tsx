"use client";

import { useEffect } from "react";

// When the booking page is rendered inside an embed iframe, report the document
// height to the parent window so the host page can size the iframe with no
// inner scrollbars. The matching listener lives in /public/embed.js.
export default function EmbedResizer() {
  useEffect(() => {
    function postHeight() {
      const height = document.documentElement.scrollHeight;
      window.parent?.postMessage(
        { type: "booking-embed:height", height },
        "*",
      );
    }

    postHeight();
    const ro = new ResizeObserver(postHeight);
    ro.observe(document.documentElement);
    window.addEventListener("load", postHeight);

    return () => {
      ro.disconnect();
      window.removeEventListener("load", postHeight);
    };
  }, []);

  return null;
}
