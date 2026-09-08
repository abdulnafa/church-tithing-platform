import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import {
  completeChurchLogoCleanup,
  getChurchLogoPublicUrl,
  getChurchSettings,
  getPendingChurchLogoCleanups,
  removeChurchLogoObject,
  stageChurchLogo,
  updateChurchSettings,
} from "./church-settings-dal";
import type { ChurchSettingsInput } from "./church-settings";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_CHURCH_ID = "20000000-0000-4000-8000-000000000001";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000901";
const OLD_REQUEST_ID = "b0000000-0000-4000-8000-000000000902";
const LOGO_PATH = `${CHURCH_ID}/${REQUEST_ID}.webp`;
const OLD_LOGO_PATH = `${CHURCH_ID}/${OLD_REQUEST_ID}.webp`;

const snapshotRow = {
  church_id: CHURCH_ID,
  display_name: "Harbour Grace Church",
  legal_name: "Harbour Grace Church Inc.",
  slug: "harbour-grace",
  status: "active",
  default_currency: "BBD",
  support_email: "office@example.test",
  timezone: "America/Barbados",
  primary_color: "#1F6D60",
  secondary_color: null,
  thank_you_message: "Thank you.",
  logo_storage_path: OLD_LOGO_PATH,
  settings_revision: 0,
} as const;

const input: ChurchSettingsInput = {
  displayName: "Harbour Grace Church",
  legalName: "Harbour Grace Church Inc.",
  supportEmail: "office@example.test",
  timezone: "America/Barbados",
  primaryColor: "#1F6D60",
  secondaryColor: null,
  thankYouMessage: "Thank you.",
  logoAction: "replace",
  logoStoragePath: LOGO_PATH,
};

const updateRow = {
  church_id: CHURCH_ID,
  settings_revision: 1,
  logo_storage_path: LOGO_PATH,
  logo_cleanup_path: OLD_LOGO_PATH,
  logo_cleanup_status: "pending",
  replayed: false,
} as const;

const rpc = vi.fn();
const upload = vi.fn();
const download = vi.fn();
const remove = vi.fn();
const getPublicUrl = vi.fn();
const from = vi.fn(() => ({ upload, download, remove, getPublicUrl }));
const client = { rpc, storage: { from } } as unknown as SupabaseClient<Database>;

describe("church settings DAL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: snapshotRow, error: null });
    upload.mockResolvedValue({ data: { path: LOGO_PATH }, error: null });
    download.mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null });
    remove.mockResolvedValue({ data: [], error: null });
    getPublicUrl.mockReturnValue({
      data: {
        publicUrl: `https://example.supabase.co/storage/v1/object/public/church-logos/${LOGO_PATH}`,
      },
    });
  });

  it("reads the exact settings RPC and maps its scalar composite", async () => {
    await expect(getChurchSettings(client, CHURCH_ID)).resolves.toEqual({
      ok: true,
      settings: {
        churchId: CHURCH_ID,
        displayName: "Harbour Grace Church",
        legalName: "Harbour Grace Church Inc.",
        slug: "harbour-grace",
        status: "active",
        defaultCurrency: "BBD",
        supportEmail: "office@example.test",
        timezone: "America/Barbados",
        primaryColor: "#1F6D60",
        secondaryColor: null,
        thankYouMessage: "Thank you.",
        logoStoragePath: OLD_LOGO_PATH,
        settingsRevision: 0,
      },
    });
    expect(rpc).toHaveBeenCalledWith("get_church_settings", {
      target_church_id: CHURCH_ID,
    });
  });

  it("accepts one array-wrapped composite and fails closed otherwise", async () => {
    rpc.mockResolvedValueOnce({ data: [snapshotRow], error: null });
    await expect(getChurchSettings(client, CHURCH_ID)).resolves.toMatchObject({
      ok: true,
    });

    for (const data of [
      [],
      [snapshotRow, snapshotRow],
      { ...snapshotRow, church_id: OTHER_CHURCH_ID },
      { ...snapshotRow, slug: "Harbour--Grace" },
      { ...snapshotRow, support_email: "raw@example" },
      { ...snapshotRow, status: "deleted" },
      { ...snapshotRow, settings_revision: "0" },
      { ...snapshotRow, logo_storage_path: `${OTHER_CHURCH_ID}/${REQUEST_ID}.webp` },
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(getChurchSettings(client, CHURCH_ID)).resolves.toEqual({
        ok: false,
        reason: "unavailable",
      });
    }
  });

  it("loads legacy nullable legal/support fields as blanks so owners can repair them", async () => {
    rpc.mockResolvedValue({
      data: { ...snapshotRow, legal_name: null, support_email: null },
      error: null,
    });
    const result = await getChurchSettings(client, CHURCH_ID);
    expect(result).toMatchObject({
      ok: true,
      settings: { legalName: "", supportEmail: "" },
    });
  });

  it("maps read authorization without exposing raw errors", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "SETTINGS_FORBIDDEN" },
    });
    await expect(getChurchSettings(client, CHURCH_ID)).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "secret relation leaked" },
    });
    const result = await getChurchSettings(client, CHURCH_ID);
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("secret relation");
  });

  it("calls the exact update RPC and validates returned revision/logo cleanup", async () => {
    rpc.mockResolvedValue({ data: updateRow, error: null });
    await expect(
      updateChurchSettings(client, REQUEST_ID, CHURCH_ID, 0, input),
    ).resolves.toEqual({
      ok: true,
      settingsRevision: 1,
      logoStoragePath: LOGO_PATH,
      logoCleanupPath: OLD_LOGO_PATH,
      logoCleanupStatus: "pending",
      replayed: false,
    });

    expect(rpc).toHaveBeenCalledWith("update_church_settings", {
      settings_request_id: REQUEST_ID,
      target_church_id: CHURCH_ID,
      expected_settings_revision: 0,
      church_display_name: "Harbour Grace Church",
      church_legal_name: "Harbour Grace Church Inc.",
      church_support_email: "office@example.test",
      church_timezone: "America/Barbados",
      church_primary_color: "#1F6D60",
      church_secondary_color: null,
      church_thank_you_message: "Thank you.",
      church_logo_action: "replace",
      church_logo_storage_path: LOGO_PATH,
    });
  });

  it.each([
    ["SETTINGS_FORBIDDEN", "forbidden"],
    ["SETTINGS_IDEMPOTENCY_CONFLICT", "idempotency_conflict"],
    ["SETTINGS_REVISION_CONFLICT", "revision_conflict"],
    ["SETTINGS_NO_CHANGES", "no_changes"],
    ["SETTINGS_LOGO_OBJECT_NOT_READY", "logo_not_ready"],
    ["SETTINGS_INVALID_LOGO_ACTION", "invalid_request"],
    ["SETTINGS_INVALID_SUPPORT_EMAIL", "invalid_request"],
  ] as const)("maps safe update error %s", async (message, reason) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    await expect(
      updateChurchSettings(client, REQUEST_ID, CHURCH_ID, 0, input),
    ).resolves.toEqual({ ok: false, reason });
  });

  it("rejects invalid input or a malformed/misrouted successful result", async () => {
    await expect(
      updateChurchSettings(client, REQUEST_ID, CHURCH_ID, 0, {
        ...input,
        logoStoragePath: `${OTHER_CHURCH_ID}/${REQUEST_ID}.webp`,
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_request" });
    expect(rpc).not.toHaveBeenCalled();

    for (const data of [
      { ...updateRow, church_id: OTHER_CHURCH_ID },
      { ...updateRow, settings_revision: 0 },
      { ...updateRow, settings_revision: 2 },
      { ...updateRow, logo_storage_path: OLD_LOGO_PATH },
      { ...updateRow, logo_cleanup_path: LOGO_PATH },
      { ...updateRow, logo_cleanup_status: "queued" },
      { ...updateRow, logo_cleanup_status: "pending", logo_cleanup_path: null },
      { ...updateRow, logo_cleanup_status: "completed", logo_cleanup_path: null },
      [updateRow, updateRow],
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(
        updateChurchSettings(client, REQUEST_ID, CHURCH_ID, 0, input),
      ).resolves.toEqual({ ok: false, reason: "unavailable" });
    }
  });

  it("uploads only exact immutable WebP bytes and reuses an identical 409 retry", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await expect(stageChurchLogo(client, CHURCH_ID, LOGO_PATH, bytes)).resolves.toEqual({
      ok: true,
      created: true,
    });
    expect(from).toHaveBeenCalledWith("church-logos");
    expect(upload).toHaveBeenCalledWith(LOGO_PATH, bytes, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });

    upload.mockResolvedValueOnce({ error: { statusCode: "409" } });
    await expect(stageChurchLogo(client, CHURCH_ID, LOGO_PATH, bytes)).resolves.toEqual({
      ok: true,
      created: false,
    });
    expect(download).toHaveBeenCalledWith(LOGO_PATH);
  });

  it("fails closed for a colliding or cross-tenant storage path", async () => {
    upload.mockResolvedValueOnce({ error: { statusCode: 409 } });
    download.mockResolvedValueOnce({
      data: new Blob([new Uint8Array([9, 9, 9])]),
      error: null,
    });
    await expect(
      stageChurchLogo(client, CHURCH_ID, LOGO_PATH, new Uint8Array([1, 2, 3])),
    ).resolves.toEqual({ ok: false, reason: "path_conflict" });

    vi.clearAllMocks();
    await expect(
      stageChurchLogo(
        client,
        CHURCH_ID,
        `${OTHER_CHURCH_ID}/${REQUEST_ID}.webp`,
        new Uint8Array([1]),
      ),
    ).resolves.toEqual({ ok: false, reason: "invalid_path" });
    expect(from).not.toHaveBeenCalled();
  });

  it("deletes and publishes only exact managed paths", async () => {
    await expect(removeChurchLogoObject(client, CHURCH_ID, OLD_LOGO_PATH)).resolves.toBe(
      true,
    );
    expect(remove).toHaveBeenCalledWith([OLD_LOGO_PATH]);
    expect(getChurchLogoPublicUrl(client, CHURCH_ID, LOGO_PATH)).toBe(
      `https://example.supabase.co/storage/v1/object/public/church-logos/${LOGO_PATH}`,
    );

    vi.clearAllMocks();
    expect(
      getChurchLogoPublicUrl(
        client,
        CHURCH_ID,
        `${OTHER_CHURCH_ID}/${REQUEST_ID}.webp`,
      ),
    ).toBeNull();
    await expect(
      removeChurchLogoObject(client, CHURCH_ID, `${OTHER_CHURCH_ID}/${REQUEST_ID}.webp`),
    ).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("reads pending cleanups and acknowledges only the exact deleted path", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { settings_request_id: REQUEST_ID, logo_storage_path: OLD_LOGO_PATH },
      ],
      error: null,
    });
    const cleanups = await getPendingChurchLogoCleanups(client, CHURCH_ID);
    expect(cleanups).toEqual([
      { requestId: REQUEST_ID, logoStoragePath: OLD_LOGO_PATH },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_pending_church_logo_cleanups", {
      target_church_id: CHURCH_ID,
    });

    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(
      completeChurchLogoCleanup(client, CHURCH_ID, cleanups![0]),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenLastCalledWith("complete_church_logo_cleanup", {
      target_church_id: CHURCH_ID,
      settings_request_id: REQUEST_ID,
      logo_cleanup_path: OLD_LOGO_PATH,
    });
  });

  it("fails pending cleanup parsing closed on duplicate or malformed rows", async () => {
    for (const data of [
      [{ settings_request_id: "bad", logo_storage_path: OLD_LOGO_PATH }],
      [{ settings_request_id: REQUEST_ID, logo_storage_path: `${OTHER_CHURCH_ID}/${REQUEST_ID}.webp` }],
      [
        { settings_request_id: REQUEST_ID, logo_storage_path: OLD_LOGO_PATH },
        { settings_request_id: REQUEST_ID, logo_storage_path: OLD_LOGO_PATH },
      ],
      snapshotRow,
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(getPendingChurchLogoCleanups(client, CHURCH_ID)).resolves.toBeNull();
    }
  });
});
