import { describe, it, expect } from "vitest";
import { detectImageType, extensionForImageType } from "@/lib/image-upload";

// This is what stands between "user uploaded an image" and "user uploaded an
// executable named cat.png". The declared MIME type is attacker-controlled,
// so these bytes are the only real check — worth pinning directly.

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

describe("detectImageType", () => {
  it("detects PNG", () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
  });

  it("detects JPEG", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe("image/jpeg");
  });

  it("detects GIF", () => {
    expect(detectImageType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("image/gif");
  });

  it("detects WebP (RIFF container with a WEBP FourCC)", () => {
    // "RIFF" + 4 size bytes + "WEBP"
    expect(
      detectImageType(
        bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50),
      ),
    ).toBe("image/webp");
  });

  // The interesting negative case: RIFF is also .wav and .avi. Matching the
  // RIFF header alone would wave those through as images.
  it("rejects a RIFF container that is not WebP (e.g. a WAV)", () => {
    expect(
      detectImageType(
        // "RIFF" + size + "WAVE"
        bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45),
      ),
    ).toBeNull();
  });

  it("rejects an executable (MZ header)", () => {
    expect(detectImageType(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03))).toBeNull();
  });

  it("rejects an SVG / HTML payload (a classic stored-XSS vector)", () => {
    const svg = "<svg onload=alert(1)>";
    const buf = new Uint8Array([...svg].map((c) => c.charCodeAt(0))).buffer;
    expect(detectImageType(buf)).toBeNull();
  });

  it("rejects empty and truncated input without throwing", () => {
    expect(detectImageType(new ArrayBuffer(0))).toBeNull();
    // Starts like a PNG but ends before the signature completes.
    expect(detectImageType(bytes(0x89, 0x50))).toBeNull();
  });
});

describe("extensionForImageType", () => {
  it("maps jpeg to the conventional jpg extension", () => {
    expect(extensionForImageType("image/jpeg")).toBe("jpg");
  });
  it("passes other types through", () => {
    expect(extensionForImageType("image/png")).toBe("png");
    expect(extensionForImageType("image/webp")).toBe("webp");
  });
});
