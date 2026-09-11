import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

const { createPublicServerSupabaseClientMock, publicRpcMock } = vi.hoisted(
  () => ({
    createPublicServerSupabaseClientMock: vi.fn(),
    publicRpcMock: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicServerSupabaseClient: createPublicServerSupabaseClientMock,
}));

import {
  getChurchQrSnapshot,
  parseChurchQrSnapshotRow,
  parsePublicQrResolutionRow,
  resolvePublicQr,
} from "./qr-routing-dal";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_CHURCH_ID = "10000000-0000-4000-8000-000000000002";
const SHORT_CODE = "hgc-7v2q9mx4";
const resolutionRow = { church_slug: "harbour-grace" } as const;
const snapshotRow = {
  church_id: CHURCH_ID,
  church_slug: "harbour-grace",
  short_code: SHORT_CODE,
  is_active: true,
} as const;

function createAuthenticatedClient(rpc = vi.fn()) {
  return {
    client: { rpc } as unknown as SupabaseClient<Database>,
    rpc,
  };
}

describe("QR routing database adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPublicServerSupabaseClientMock.mockReturnValue({
      rpc: publicRpcMock,
    });
    publicRpcMock.mockResolvedValue({ data: [resolutionRow], error: null });
  });

  it("uses the session-free public RPC and exposes only a validated slug", async () => {
    publicRpcMock.mockResolvedValue({
      data: [{ ...resolutionRow, private_field: "must-not-cross" }],
      error: null,
    });

    await expect(resolvePublicQr(SHORT_CODE)).resolves.toEqual({
      ok: true,
      churchSlug: "harbour-grace",
    });
    expect(createPublicServerSupabaseClientMock).toHaveBeenCalledOnce();
    expect(publicRpcMock).toHaveBeenCalledWith("resolve_public_qr", {
      target_short_code: SHORT_CODE,
    });
    expect(JSON.stringify(await resolvePublicQr(SHORT_CODE))).not.toContain(
      "private_field",
    );
  });

  it.each([
    "",
    "abc1234",
    "HGC-7V2Q9MX4",
    "hgc/7v2q9mx4",
    "https://attacker.example",
    `a${"b".repeat(64)}`,
  ])("maps malformed public code %s to indistinguishable not-found", async (code) => {
    await expect(resolvePublicQr(code)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(createPublicServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("maps zero public rows to not-found", async () => {
    publicRpcMock.mockResolvedValue({ data: [], error: null });

    await expect(resolvePublicQr(SHORT_CODE)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it.each([
    ["RPC error", { data: null, error: { message: "private detail" } }],
    ["null data", { data: null, error: null }],
    ["too many rows", { data: [resolutionRow, resolutionRow], error: null }],
    ["unsafe slug", { data: [{ church_slug: "https://attacker.example" }], error: null }],
    ["unexpected object", { data: [{ church_slug: "Harbour-Grace" }], error: null }],
  ])("maps %s to a generic unavailable result", async (_name, response) => {
    publicRpcMock.mockResolvedValue(response);

    await expect(resolvePublicQr(SHORT_CODE)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("maps a thrown public client or network failure to unavailable", async () => {
    createPublicServerSupabaseClientMock.mockImplementationOnce(() => {
      throw new Error("private configuration detail");
    });
    await expect(resolvePublicQr(SHORT_CODE)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    publicRpcMock.mockRejectedValueOnce(new Error("private network detail"));
    await expect(resolvePublicQr(SHORT_CODE)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("reads a minimum authenticated snapshot with exact church scope", async () => {
    const { client, rpc } = createAuthenticatedClient(
      vi.fn().mockResolvedValue({
        data: [{ ...snapshotRow, internal_field: "must-not-cross" }],
        error: null,
      }),
    );

    await expect(getChurchQrSnapshot(client, CHURCH_ID)).resolves.toEqual({
      ok: true,
      snapshot: {
        churchId: CHURCH_ID,
        churchSlug: "harbour-grace",
        shortCode: SHORT_CODE,
        isActive: true,
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_church_qr_snapshot", {
      target_church_id: CHURCH_ID,
    });
  });

  it("accepts an inactive QR snapshot without calling it publicly available", () => {
    expect(
      parseChurchQrSnapshotRow(
        { ...snapshotRow, is_active: false },
        CHURCH_ID,
      ),
    ).toEqual({
      churchId: CHURCH_ID,
      churchSlug: "harbour-grace",
      shortCode: SHORT_CODE,
      isActive: false,
    });
  });

  it.each([
    ["wrong church", { ...snapshotRow, church_id: OTHER_CHURCH_ID }],
    ["invalid church", { ...snapshotRow, church_id: "not-a-uuid" }],
    ["unsafe slug", { ...snapshotRow, church_slug: "../platform" }],
    ["noncanonical code", { ...snapshotRow, short_code: "HGC-7V2Q9MX4" }],
    ["short code", { ...snapshotRow, short_code: "abc1234" }],
    ["invalid active flag", { ...snapshotRow, is_active: "true" }],
  ])("rejects malformed authenticated row: %s", (_name, row) => {
    expect(parseChurchQrSnapshotRow(row, CHURCH_ID)).toBeNull();
  });

  it("maps forbidden distinctly and all other authenticated failures generically", async () => {
    const forbidden = createAuthenticatedClient(
      vi.fn().mockResolvedValue({
        data: null,
        error: { message: "QR_SNAPSHOT_FORBIDDEN" },
      }),
    );
    await expect(
      getChurchQrSnapshot(forbidden.client, CHURCH_ID),
    ).resolves.toEqual({ ok: false, reason: "forbidden" });

    for (const response of [
      { data: null, error: { message: "private detail" } },
      { data: [], error: null },
      { data: null, error: null },
      { data: [snapshotRow, snapshotRow], error: null },
      { data: [{ ...snapshotRow, church_slug: "bad/slug" }], error: null },
    ]) {
      const failure = createAuthenticatedClient(
        vi.fn().mockResolvedValue(response),
      );
      await expect(
        getChurchQrSnapshot(failure.client, CHURCH_ID),
      ).resolves.toEqual({ ok: false, reason: "unavailable" });
    }
  });

  it("fails closed before an authenticated RPC for an invalid church ID", async () => {
    const { client, rpc } = createAuthenticatedClient();

    await expect(getChurchQrSnapshot(client, "not-a-uuid")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps all reads server-only and uses authoritative generated RPC types", () => {
    const source = readFileSync(
      new URL("./qr-routing-dal.ts", import.meta.url),
      "utf8",
    );

    expect(source.startsWith('import "server-only"')).toBe(true);
    expect(source).toContain("createPublicServerSupabaseClient");
    expect(source).not.toMatch(/TODO\(P17-TYPEGEN\)|Pending.*QrRpcClient/);
    expect(source).not.toContain("as unknown as");
    expect(source).not.toMatch(/console\.|service.?role|cookies\(|headers\(/i);
  });

  it("parses only canonical minimum public output", () => {
    expect(parsePublicQrResolutionRow(resolutionRow)).toEqual({
      churchSlug: "harbour-grace",
    });
    expect(parsePublicQrResolutionRow({ church_slug: "Church" })).toBeNull();
    expect(parsePublicQrResolutionRow(null)).toBeNull();
  });
});
