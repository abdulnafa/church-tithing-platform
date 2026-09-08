import "server-only";

import sharp from "sharp";

import {
  CHURCH_LOGO_ACCEPTED_TYPES,
  CHURCH_LOGO_MAX_BYTES,
} from "./church-settings";

export const CHURCH_LOGO_MAX_DIMENSION = 4_096;
export const CHURCH_LOGO_MAX_PIXELS = 4_194_304;
export const CHURCH_LOGO_OUTPUT_DIMENSION = 1_024;

export type ChurchLogoFailureReason =
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "format_mismatch"
  | "malformed"
  | "animated"
  | "dimensions"
  | "output_too_large";

export type SanitizedChurchLogo = Readonly<{
  bytes: Uint8Array;
  contentType: "image/webp";
  width: number;
  height: number;
}>;

export type ChurchLogoSanitizationResult =
  | Readonly<{ ok: true; logo: SanitizedChurchLogo }>
  | Readonly<{ ok: false; reason: ChurchLogoFailureReason }>;

const MIME_TO_SHARP_FORMAT = new Map<string, "png" | "jpeg" | "webp">([
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
  ["image/webp", "webp"],
]);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function hasExactPngContainer(bytes: Buffer) {
  if (bytes.length < 20 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return false;
  }

  let offset = 8;
  let firstChunk = true;

  while (offset + 12 <= bytes.length) {
    const dataLength = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + dataLength;

    if (chunkEnd > bytes.length) return false;

    const chunkType = bytes.toString("ascii", offset + 4, offset + 8);
    if (firstChunk && chunkType !== "IHDR") return false;
    firstChunk = false;

    if (chunkType === "IEND") {
      return dataLength === 0 && chunkEnd === bytes.length;
    }

    offset = chunkEnd;
  }

  return false;
}

function hasExactJpegContainer(bytes: Buffer) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

function hasExactWebpContainer(bytes: Buffer) {
  if (
    bytes.length < 12 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return false;
  }

  return bytes.readUInt32LE(4) + 8 === bytes.length;
}

function detectExactContainerFormat(bytes: Buffer) {
  if (hasExactPngContainer(bytes)) return "png" as const;
  if (hasExactJpegContainer(bytes)) return "jpeg" as const;
  if (hasExactWebpContainer(bytes)) return "webp" as const;
  return null;
}

function hasValidDimensions(width: unknown, height: unknown) {
  return (
    typeof width === "number" &&
    Number.isInteger(width) &&
    width > 0 &&
    width <= CHURCH_LOGO_MAX_DIMENSION &&
    typeof height === "number" &&
    Number.isInteger(height) &&
    height > 0 &&
    height <= CHURCH_LOGO_MAX_DIMENSION &&
    width * height <= CHURCH_LOGO_MAX_PIXELS
  );
}

/**
 * Decodes untrusted image bytes and emits a single, bounded WebP derivative.
 * The original filename, extension, bytes, and metadata are never persisted.
 */
export async function sanitizeChurchLogo(
  file: File,
): Promise<ChurchLogoSanitizationResult> {
  if (file.size <= 0) return { ok: false, reason: "empty" };
  if (file.size > CHURCH_LOGO_MAX_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  if (!CHURCH_LOGO_ACCEPTED_TYPES.includes(
    file.type as (typeof CHURCH_LOGO_ACCEPTED_TYPES)[number],
  )) {
    return { ok: false, reason: "unsupported_type" };
  }

  const expectedFormat = MIME_TO_SHARP_FORMAT.get(file.type);
  if (!expectedFormat) return { ok: false, reason: "unsupported_type" };

  let input: Buffer;

  try {
    input = Buffer.from(await file.arrayBuffer());
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (input.length <= 0) return { ok: false, reason: "empty" };
  if (input.length > CHURCH_LOGO_MAX_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  const containerFormat = detectExactContainerFormat(input);
  if (!containerFormat) {
    return { ok: false, reason: "malformed" };
  }
  if (containerFormat !== expectedFormat) {
    return { ok: false, reason: "format_mismatch" };
  }

  try {
    const source = sharp(input, {
      animated: true,
      failOn: "warning",
      limitInputPixels: CHURCH_LOGO_MAX_PIXELS,
    });
    const metadata = await source.metadata();

    if (metadata.format !== expectedFormat) {
      return { ok: false, reason: "format_mismatch" };
    }
    if ((metadata.pages ?? 1) !== 1) {
      return { ok: false, reason: "animated" };
    }

    const sourceHeight = metadata.pageHeight ?? metadata.height;
    if (!hasValidDimensions(metadata.width, sourceHeight)) {
      return { ok: false, reason: "dimensions" };
    }

    const { data, info } = await sharp(input, {
      animated: false,
      failOn: "warning",
      limitInputPixels: CHURCH_LOGO_MAX_PIXELS,
    })
      .rotate()
      .resize({
        width: CHURCH_LOGO_OUTPUT_DIMENSION,
        height: CHURCH_LOGO_OUTPUT_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .webp({
        alphaQuality: 90,
        effort: 4,
        quality: 82,
        smartSubsample: true,
      })
      .toBuffer({ resolveWithObject: true });

    if (data.length > CHURCH_LOGO_MAX_BYTES) {
      return { ok: false, reason: "output_too_large" };
    }
    if (!hasValidDimensions(info.width, info.height)) {
      return { ok: false, reason: "dimensions" };
    }
    if (!hasExactWebpContainer(data)) {
      return { ok: false, reason: "malformed" };
    }

    return {
      ok: true,
      logo: {
        bytes: new Uint8Array(data),
        contentType: "image/webp",
        width: info.width,
        height: info.height,
      },
    };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
