import { ImageResponse } from "next/og";
import { BRAND_COLOR, PRODUCT_NAME } from "@/lib/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Was a static icon.svg with a hardcoded "B" — converted to code generation
// (like apple-icon.tsx and opengraph-image.tsx) so the favicon follows
// PRODUCT_NAME too. A static SVG can't read an env var at request time.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 14,
          background: BRAND_COLOR,
          color: "#ffffff",
          fontSize: 36,
          fontWeight: 700,
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        {PRODUCT_NAME[0]?.toUpperCase()}
      </div>
    ),
    { ...size },
  );
}
