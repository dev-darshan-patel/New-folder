import { ImageResponse } from "next/og";

export const alt = "Bookify — Scheduling for small business";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 96,
              height: 96,
              borderRadius: 22,
              background: "#4f46e5",
              color: "#ffffff",
              fontSize: 56,
              fontWeight: 700,
            }}
          >
            B
          </div>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, color: "#ffffff" }}>
            Bookify<span style={{ color: "#818cf8" }}>.</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 32,
            color: "#94a3b8",
          }}
        >
          Scheduling for small business
        </div>
      </div>
    ),
    { ...size },
  );
}
