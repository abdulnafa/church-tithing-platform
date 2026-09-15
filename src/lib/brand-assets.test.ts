import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { BRAND_ASSETS } from "./branding";

const OFFICIAL_ASSETS = [
  {
    path: BRAND_ASSETS.horizontal,
    bytes: 126_067,
    width: 2_000,
    height: 422,
    hasAlpha: true,
    sha256: "b648fcc0dd27df432ab5a69f872b345c840539825e13ab3d50aa9454dc2c0360",
  },
  {
    path: BRAND_ASSETS.horizontalWide,
    bytes: 136_302,
    width: 2_000,
    height: 422,
    hasAlpha: true,
    sha256: "afc8b09494f12f5be59a7ede150e7dafb557780b2f0fe82be8a9130ff1106726",
  },
  {
    path: BRAND_ASSETS.wordmark,
    bytes: 22_586,
    width: 1_575,
    height: 330,
    hasAlpha: true,
    sha256: "8e9636299ae1afb5111d32a6e1e5555a36bfc5c3e4d9aea9598b48ac5220fc46",
  },
  {
    path: BRAND_ASSETS.stacked,
    bytes: 125_422,
    width: 2_000,
    height: 1_014,
    hasAlpha: true,
    sha256: "857b837e15dd8dcb6d474cd5b4f7dc880674861965e0082c19cb9f098cd415bd",
  },
  {
    path: BRAND_ASSETS.symbol,
    bytes: 95_179,
    width: 1_133,
    height: 784,
    hasAlpha: true,
    sha256: "fac21c0dd5b5f563bd20e6782118803841a202b553218bc37eb8aa5a83b7e761",
  },
  {
    path: BRAND_ASSETS.stackedOnWhite,
    bytes: 202_082,
    width: 2_000,
    height: 2_000,
    hasAlpha: false,
    sha256: "8793503c310edf618d78e6a30dddfabbdcc8eda6e64a93745dba0c2343804b52",
  },
] as const;

function publicAssetPath(assetPath: string) {
  return resolve(process.cwd(), "public", assetPath.replace(/^\/+/, ""));
}

describe("official churchwithease brand assets", () => {
  it.each(OFFICIAL_ASSETS)(
    "preserves $path byte-for-byte with its intended image metadata",
    async ({ path, bytes, width, height, hasAlpha, sha256 }) => {
      const file = readFileSync(publicAssetPath(path));
      const metadata = await sharp(file).metadata();

      expect(file).toHaveLength(bytes);
      expect(createHash("sha256").update(file).digest("hex")).toBe(sha256);
      expect(metadata).toMatchObject({
        format: "png",
        width,
        height,
        hasAlpha,
      });
    },
  );

  it("uses the exact supplied symbol for application icon metadata", () => {
    const symbol = readFileSync(publicAssetPath(BRAND_ASSETS.symbol));
    const icon = readFileSync(resolve(process.cwd(), "src", "app", "icon.png"));

    expect(icon.equals(symbol)).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src", "app", "icon.tsx"))).toBe(
      false,
    );
    expect(existsSync(resolve(process.cwd(), "src", "app", "favicon.ico"))).toBe(
      false,
    );
  });
});
