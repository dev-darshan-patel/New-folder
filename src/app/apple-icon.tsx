import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icons must be a raster format (iOS doesn't render SVG here),
// so this one is code-generated via ImageResponse rather than a static file
// like icon.svg. iOS applies its own corner-rounding/mask, so this is a plain
// square fill — no rx needed.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4f46e5",
          color: "#ffffff",
          fontSize: 108,
          fontWeight: 700,
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        B
      </div>
    ),
    { ...size },
  );
}
