import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CHURCH_LOGO_MAX_DIMENSION,
  CHURCH_LOGO_MAX_PIXELS,
  CHURCH_LOGO_OUTPUT_DIMENSION,
  sanitizeChurchLogo,
} from "./church-logo";
import { CHURCH_LOGO_MAX_BYTES } from "./church-settings";

async function imageFile(
  format: "jpeg" | "png" | "webp",
  width = 80,
  height = 48,
) {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 31, g: 109, b: 96, alpha: 0.85 },
    },
  });
  const bytes = await pipeline[format]().toBuffer();
  const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
  return new File([bytes], `church.${format}`, { type: mime });
}

async function animatedWebpFile() {
  const twoFrameGif = Buffer.from(
    "47494638396101000100800000000000ffffff21f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b",
    "hex",
  );
  const bytes = await sharp(twoFrameGif, { animated: true })
    .webp({ delay: [100, 100], loop: 0 })
    .toBuffer();
  return new File([bytes], "animated.webp", { type: "image/webp" });
}

describe("church logo sanitization", () => {
  it.each(["png", "jpeg", "webp"] as const)(
    "decodes %s and emits only a bounded WebP derivative",
    async (format) => {
      const result = await sanitizeChurchLogo(await imageFile(format));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.logo.contentType).toBe("image/webp");
      expect(result.logo.bytes.byteLength).toBeLessThanOrEqual(
        CHURCH_LOGO_MAX_BYTES,
      );
      expect(result.logo.width).toBe(80);
      expect(result.logo.height).toBe(48);
      const metadata = await sharp(result.logo.bytes).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.pages ?? 1).toBe(1);
    },
  );

  it("rejects an oversized declaration before calling arrayBuffer", async () => {
    const arrayBuffer = vi.fn();
    const file = {
      size: CHURCH_LOGO_MAX_BYTES + 1,
      type: "image/png",
      arrayBuffer,
    } as unknown as File;

    await expect(sanitizeChurchLogo(file)).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it.each([
    ["image/svg+xml", "<svg><script>alert(1)</script></svg>"],
    ["image/gif", "GIF89a"],
    ["text/html", "<html>not an image</html>"],
  ])("rejects unsupported declared type %s", async (type, content) => {
    const file = new File([content], "unsafe", { type });
    await expect(sanitizeChurchLogo(file)).resolves.toEqual({
      ok: false,
      reason: "unsupported_type",
    });
  });

  it("rejects a declared type that does not match decoded content", async () => {
    const png = await imageFile("png");
    const file = new File([await png.arrayBuffer()], "spoofed.jpg", {
      type: "image/jpeg",
    });
    await expect(sanitizeChurchLogo(file)).resolves.toEqual({
      ok: false,
      reason: "format_mismatch",
    });
  });

  it("rejects trailing polyglot content instead of preserving it", async () => {
    const png = await imageFile("png");
    const bytes = Buffer.concat([
      Buffer.from(await png.arrayBuffer()),
      Buffer.from("<svg><script>unsafe()</script></svg>"),
    ]);
    const file = new File([bytes], "polyglot.png", { type: "image/png" });
    await expect(sanitizeChurchLogo(file)).resolves.toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects truncated and otherwise malformed image bytes", async () => {
    const png = await imageFile("png");
    const bytes = Buffer.from(await png.arrayBuffer()).subarray(0, 24);
    const file = new File([bytes], "truncated.png", { type: "image/png" });
    await expect(sanitizeChurchLogo(file)).resolves.toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects an animated WebP even though its declared type is supported", async () => {
    await expect(sanitizeChurchLogo(await animatedWebpFile())).resolves.toEqual({
      ok: false,
      reason: "animated",
    });
  });

  it("rejects over-dimension and decompression-bomb pixel counts", async () => {
    const overDimension = await imageFile(
      "png",
      CHURCH_LOGO_MAX_DIMENSION + 1,
      1,
    );
    const overPixels = await imageFile("png", 2_100, 2_100);

    const first = await sanitizeChurchLogo(overDimension);
    const second = await sanitizeChurchLogo(overPixels);

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(2_100 * 2_100).toBeGreaterThan(CHURCH_LOGO_MAX_PIXELS);
  });

  it("auto-orients, strips metadata, and does not enlarge small logos", async () => {
    const source = await sharp({
      create: {
        width: 16,
        height: 8,
        channels: 3,
        background: "#1F6D60",
      },
    })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: { IFD0: { Copyright: "SECRET-METADATA" } },
      })
      .toBuffer();
    const result = await sanitizeChurchLogo(
      new File([source], "oriented.jpg", { type: "image/jpeg" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.logo.width).toBe(8);
    expect(result.logo.height).toBe(16);
    expect(result.logo.width).toBeLessThan(CHURCH_LOGO_OUTPUT_DIMENSION);
    expect(Buffer.from(result.logo.bytes).includes(Buffer.from("SECRET-METADATA"))).toBe(
      false,
    );

    const metadata = await sharp(result.logo.bytes).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.space).toBe("srgb");
  });

  it("resizes large valid input inside 1024 square", async () => {
    const result = await sanitizeChurchLogo(await imageFile("png", 2_000, 1_000));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.logo.width).toBe(CHURCH_LOGO_OUTPUT_DIMENSION);
    expect(result.logo.height).toBe(512);
  });
});
