import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  completeChurchLogoCleanupMock,
  createServerSupabaseClientMock,
  getChurchLogoPublicUrlMock,
  getChurchSettingsMock,
  getPendingChurchLogoCleanupsMock,
  randomUUIDMock,
  removeChurchLogoObjectMock,
  requireChurchPermissionMock,
  revalidatePathMock,
  sanitizeChurchLogoMock,
  stageChurchLogoMock,
  updateChurchSettingsMock,
} = vi.hoisted(() => ({
  completeChurchLogoCleanupMock: vi.fn(),
  createServerSupabaseClientMock: vi.fn(),
  getChurchLogoPublicUrlMock: vi.fn(),
  getChurchSettingsMock: vi.fn(),
  getPendingChurchLogoCleanupsMock: vi.fn(),
  randomUUIDMock: vi.fn(),
  removeChurchLogoObjectMock: vi.fn(),
  requireChurchPermissionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  sanitizeChurchLogoMock: vi.fn(),
  stageChurchLogoMock: vi.fn(),
  updateChurchSettingsMock: vi.fn(),
}));

vi.mock("node:crypto", () => ({ randomUUID: randomUUIDMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermission: requireChurchPermissionMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/church-logo", () => ({
  sanitizeChurchLogo: sanitizeChurchLogoMock,
}));
vi.mock("@/lib/church-settings-dal", () => ({
  completeChurchLogoCleanup: completeChurchLogoCleanupMock,
  getChurchLogoPublicUrl: getChurchLogoPublicUrlMock,
  getChurchSettings: getChurchSettingsMock,
  getPendingChurchLogoCleanups: getPendingChurchLogoCleanupsMock,
  removeChurchLogoObject: removeChurchLogoObjectMock,
  stageChurchLogo: stageChurchLogoMock,
  updateChurchSettings: updateChurchSettingsMock,
}));

import {
  createInitialChurchSettingsState,
  type ChurchSettingsSnapshot,
} from "@/lib/church-settings";

import { updateChurchSettingsAction } from "./actions";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000901";
const NEXT_REQUEST_ID = "c0000000-0000-4000-8000-000000000903";
const OLD_REQUEST_ID = "b0000000-0000-4000-8000-000000000902";
const LOGO_PATH = `${CHURCH_ID}/${REQUEST_ID}.webp`;
const OLD_LOGO_PATH = `${CHURCH_ID}/${OLD_REQUEST_ID}.webp`;
const LOGO_URL = `https://example.supabase.co/storage/v1/object/public/church-logos/${LOGO_PATH}`;
const client = { rpc: vi.fn(), storage: { from: vi.fn() } };

const snapshot: ChurchSettingsSnapshot = {
  churchId: CHURCH_ID,
  displayName: "Harbour Grace Church",
  legalName: "Harbour Grace Church Inc.",
  slug: "harbour-grace",
  status: "active",
  defaultCurrency: "BBD",
  supportEmail: "office@example.test",
  timezone: "America/Barbados",
  primaryColor: "#1F6D60",
  secondaryColor: "#E1B85A",
  thankYouMessage: "Thank you.",
  logoStoragePath: OLD_LOGO_PATH,
  settingsRevision: 0,
};

function initialState() {
  return createInitialChurchSettingsState(
    REQUEST_ID,
    snapshot,
    `https://example.supabase.co/storage/v1/object/public/church-logos/${OLD_LOGO_PATH}`,
  );
}

function validForm(
  overrides: Record<string, string | boolean | File> = {},
) {
  const entries: Record<string, string | boolean | File> = {
    requestId: REQUEST_ID,
    expectedSettingsRevision: "0",
    displayName: " Harbour   Grace Church ",
    legalName: " Harbour Grace Church Inc. ",
    supportEmail: " OFFICE@Example.Test ",
    timezone: " America/Barbados ",
    primaryColor: " #1f6d60 ",
    secondaryColor: " #e1b85a ",
    thankYouMessage: " Thank you. ",
    ...overrides,
  };
  const formData = new FormData();
  Object.entries(entries).forEach(([name, value]) => {
    if (value === true) formData.set(name, "on");
    if (typeof value === "string" || value instanceof File) {
      formData.set(name, value);
    }
  });
  return formData;
}

function logoFile() {
  return new File([new Uint8Array([1, 2, 3])], "church.png", {
    type: "image/png",
  });
}

const keepSuccess = {
  ok: true,
  settingsRevision: 1,
  logoStoragePath: OLD_LOGO_PATH,
  logoCleanupPath: null,
  logoCleanupStatus: "not_required",
  replayed: false,
} as const;

const replaceSuccess = {
  ok: true,
  settingsRevision: 1,
  logoStoragePath: LOGO_PATH,
  logoCleanupPath: OLD_LOGO_PATH,
  logoCleanupStatus: "pending",
  replayed: false,
} as const;

describe("church settings Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchPermissionMock.mockResolvedValue({
      identity: { userId: "d0000000-0000-4000-8000-000000000904" },
      workspace: { churchId: CHURCH_ID, kind: "church", key: `church:${CHURCH_ID}` },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    sanitizeChurchLogoMock.mockResolvedValue({
      ok: true,
      logo: {
        bytes: new Uint8Array([8, 9, 10]),
        contentType: "image/webp",
        width: 80,
        height: 48,
      },
    });
    stageChurchLogoMock.mockResolvedValue({ ok: true, created: true });
    updateChurchSettingsMock.mockResolvedValue(keepSuccess);
    getPendingChurchLogoCleanupsMock.mockResolvedValue([]);
    removeChurchLogoObjectMock.mockResolvedValue(true);
    completeChurchLogoCleanupMock.mockResolvedValue(true);
    getChurchLogoPublicUrlMock.mockReturnValue(LOGO_URL);
    getChurchSettingsMock.mockResolvedValue({ ok: true, settings: snapshot });
    randomUUIDMock.mockReturnValue(NEXT_REQUEST_ID);
  });

  it("re-authorizes before parsing an invalid request or touching Supabase", async () => {
    const stop = new Error("AUTHORIZATION_STOP");
    requireChurchPermissionMock.mockRejectedValue(stop);
    await expect(
      updateChurchSettingsAction(initialState(), new FormData()),
    ).rejects.toBe(stop);
    expect(requireChurchPermissionMock).toHaveBeenCalledWith("settings_manage");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(sanitizeChurchLogoMock).not.toHaveBeenCalled();
    expect(updateChurchSettingsMock).not.toHaveBeenCalled();
  });

  it("validates after authorization and before creating a client", async () => {
    const result = await updateChurchSettingsAction(
      initialState(),
      validForm({ supportEmail: "invalid" }),
    );
    expect(result.status).toBe("error");
    expect(result.fieldErrors?.supportEmail).toBeDefined();
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("requires hidden id/revision to equal server action state", async () => {
    const wrongId = await updateChurchSettingsAction(
      initialState(),
      validForm({ requestId: NEXT_REQUEST_ID }),
    );
    const wrongRevision = await updateChurchSettingsAction(
      initialState(),
      validForm({ expectedSettingsRevision: "1" }),
    );
    expect(wrongId.message).toContain("reference is invalid");
    expect(wrongRevision.message).toContain("version is invalid");
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("never advises reload when hidden retry metadata is invalid", async () => {
    updateChurchSettingsMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    const uncertain = await updateChurchSettingsAction(initialState(), validForm());

    const wrongId = await updateChurchSettingsAction(
      uncertain,
      validForm({ requestId: NEXT_REQUEST_ID }),
    );
    const wrongRevision = await updateChurchSettingsAction(
      uncertain,
      validForm({ expectedSettingsRevision: "1" }),
    );

    expect(wrongId.message).toContain("locked request unchanged");
    expect(wrongRevision.message).toContain("locked request unchanged");
    expect(wrongId.message.toLowerCase()).not.toContain("reload");
    expect(wrongRevision.message.toLowerCase()).not.toContain("reload");
    expect(wrongId.values).toEqual(uncertain.values);
    expect(wrongRevision.values).toEqual(uncertain.values);
  });

  it("normalizes allowlisted fields and derives tenant only from the guard", async () => {
    const result = await updateChurchSettingsAction(
      initialState(),
      validForm({ churchId: "20000000-0000-4000-8000-000000000001" }),
    );
    expect(updateChurchSettingsMock).toHaveBeenCalledWith(
      client,
      REQUEST_ID,
      CHURCH_ID,
      0,
      {
        displayName: "Harbour Grace Church",
        legalName: "Harbour Grace Church Inc.",
        supportEmail: "office@example.test",
        timezone: "America/Barbados",
        primaryColor: "#1F6D60",
        secondaryColor: "#E1B85A",
        thankYouMessage: "Thank you.",
        logoAction: "keep",
        logoStoragePath: null,
      },
    );
    expect(result).toMatchObject({
      status: "success",
      requestId: NEXT_REQUEST_ID,
      settingsRevision: 1,
      logoChanged: false,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/church/settings");
  });

  it("sanitizes, stages, switches, then deletes only the row-locked cleanup path", async () => {
    updateChurchSettingsMock.mockResolvedValue(replaceSuccess);
    const result = await updateChurchSettingsAction(
      initialState(),
      validForm({ logo: logoFile() }),
    );

    expect(sanitizeChurchLogoMock).toHaveBeenCalledOnce();
    expect(stageChurchLogoMock).toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      LOGO_PATH,
      new Uint8Array([8, 9, 10]),
    );
    expect(updateChurchSettingsMock).toHaveBeenCalledWith(
      client,
      REQUEST_ID,
      CHURCH_ID,
      0,
      expect.objectContaining({
        logoAction: "replace",
        logoStoragePath: LOGO_PATH,
      }),
    );
    expect(removeChurchLogoObjectMock).toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      OLD_LOGO_PATH,
    );
    expect(removeChurchLogoObjectMock).not.toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      LOGO_PATH,
    );
    expect(completeChurchLogoCleanupMock).toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      { requestId: REQUEST_ID, logoStoragePath: OLD_LOGO_PATH },
    );
    expect(result).toMatchObject({
      status: "success",
      logoPublicUrl: LOGO_URL,
      logoChanged: true,
      cleanupPending: false,
    });
  });

  it("returns a safe field error without staging invalid decoded content", async () => {
    sanitizeChurchLogoMock.mockResolvedValue({ ok: false, reason: "animated" });
    const result = await updateChurchSettingsAction(
      initialState(),
      validForm({ logo: logoFile() }),
    );
    expect(result.fieldErrors?.logo).toContain("Animated logos");
    expect(stageChurchLogoMock).not.toHaveBeenCalled();
    expect(updateChurchSettingsMock).not.toHaveBeenCalled();
  });

  it("does not delete a newly staged logo after an ambiguous RPC result", async () => {
    updateChurchSettingsMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    const first = await updateChurchSettingsAction(
      initialState(),
      validForm({ logo: logoFile() }),
    );
    expect(first).toMatchObject({
      status: "error",
      requestId: REQUEST_ID,
      settingsRevision: 0,
      retryLogoAction: "replace",
    });
    expect(removeChurchLogoObjectMock).not.toHaveBeenCalled();

    updateChurchSettingsMock.mockResolvedValue({ ...replaceSuccess, replayed: true });
    const second = await updateChurchSettingsAction(first, validForm());
    expect(sanitizeChurchLogoMock).toHaveBeenCalledOnce();
    expect(stageChurchLogoMock).toHaveBeenCalledOnce();
    expect(updateChurchSettingsMock).toHaveBeenNthCalledWith(
      2,
      client,
      REQUEST_ID,
      CHURCH_ID,
      0,
      expect.objectContaining({
        logoAction: "replace",
        logoStoragePath: LOGO_PATH,
      }),
    );
    expect(second.status).toBe("success");
    expect(second.message).toContain("without applying it twice");
  });

  it("preserves ambiguous recovery intent through a later validation error", async () => {
    updateChurchSettingsMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    const first = await updateChurchSettingsAction(
      initialState(),
      validForm({ logo: logoFile() }),
    );
    const second = await updateChurchSettingsAction(
      first,
      validForm({ supportEmail: "invalid" }),
    );
    expect(second.retryLogoAction).toBe("replace");
    expect(second.values).toEqual(first.values);
    expect(createServerSupabaseClientMock).toHaveBeenCalledOnce();

    updateChurchSettingsMock.mockResolvedValue({ ...replaceSuccess, replayed: true });
    const third = await updateChurchSettingsAction(second, validForm());
    expect(third.status).toBe("success");
    expect(updateChurchSettingsMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the original ambiguous payload after a valid changed retry", async () => {
    updateChurchSettingsMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    const first = await updateChurchSettingsAction(
      initialState(),
      validForm({ logo: logoFile() }),
    );
    const changed = await updateChurchSettingsAction(
      first,
      validForm({ displayName: "Changed Church" }),
    );
    expect(changed.status).toBe("error");
    expect(changed.values).toEqual(first.values);
    expect(updateChurchSettingsMock).toHaveBeenCalledOnce();

    updateChurchSettingsMock.mockResolvedValue({ ...replaceSuccess, replayed: true });
    const recovered = await updateChurchSettingsAction(changed, validForm());
    expect(recovered.status).toBe("success");
    expect(updateChurchSettingsMock).toHaveBeenCalledTimes(2);
  });

  it("preserves the locked baseline after a retry selects different logo bytes", async () => {
    updateChurchSettingsMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    const uncertain = await updateChurchSettingsAction(
      initialState(),
      validForm({ logo: logoFile() }),
    );
    stageChurchLogoMock.mockResolvedValue({
      ok: false,
      reason: "path_conflict",
    });

    const conflict = await updateChurchSettingsAction(
      uncertain,
      validForm({ logo: logoFile() }),
    );

    expect(conflict.retryLogoAction).toBe("replace");
    expect(conflict.values).toEqual(uncertain.values);
    expect(conflict.message).toContain("locked request");
    expect(conflict.message.toLowerCase()).not.toContain("reload");
    expect(updateChurchSettingsMock).toHaveBeenCalledOnce();
  });

  it("locks an ambiguous profile-only save to its exact original payload", async () => {
    updateChurchSettingsMock.mockResolvedValue({ ok: false, reason: "unavailable" });
    const uncertain = await updateChurchSettingsAction(initialState(), validForm());
    expect(uncertain.retryLogoAction).toBe("keep");

    const changed = await updateChurchSettingsAction(
      uncertain,
      validForm({ displayName: "Changed Church" }),
    );
    expect(changed.values).toEqual(uncertain.values);
    expect(changed.retryLogoAction).toBe("keep");
    expect(updateChurchSettingsMock).toHaveBeenCalledOnce();

    updateChurchSettingsMock.mockResolvedValue({ ...keepSuccess, replayed: true });
    const recovered = await updateChurchSettingsAction(changed, validForm());
    expect(recovered).toMatchObject({
      status: "success",
      requestId: NEXT_REQUEST_ID,
      responseEpoch: 3,
    });
    expect(recovered).not.toHaveProperty("retryLogoAction");
    expect(updateChurchSettingsMock).toHaveBeenCalledTimes(2);
  });

  it("compensates an exact fresh staged path after a known revision failure", async () => {
    updateChurchSettingsMock.mockResolvedValue({
      ok: false,
      reason: "revision_conflict",
    });
    const result = await updateChurchSettingsAction(
      initialState(),
      validForm({ logo: logoFile() }),
    );
    expect(removeChurchLogoObjectMock).toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      LOGO_PATH,
    );
    expect(result.retryLogoAction).toBeUndefined();
    expect(result.message).toContain("another session");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("compensates an identical 409-staged path after a known revision failure", async () => {
    stageChurchLogoMock.mockResolvedValue({ ok: true, created: false });
    updateChurchSettingsMock.mockResolvedValue({
      ok: false,
      reason: "revision_conflict",
    });
    await updateChurchSettingsAction(
      initialState(),
      validForm({ logo: logoFile() }),
    );
    expect(removeChurchLogoObjectMock).toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      LOGO_PATH,
    );
  });

  it("retains exact retry state if known-failure compensation cannot delete", async () => {
    updateChurchSettingsMock.mockResolvedValue({
      ok: false,
      reason: "revision_conflict",
    });
    removeChurchLogoObjectMock.mockResolvedValue(false);
    const result = await updateChurchSettingsAction(
      initialState(),
      validForm({ logo: logoFile() }),
    );
    expect(result).toMatchObject({
      retryLogoAction: "replace",
      cleanupPending: true,
    });
  });

  it("preserves remove intent across an ambiguous retry", async () => {
    updateChurchSettingsMock
      .mockResolvedValueOnce({ ok: false, reason: "unavailable" })
      .mockResolvedValueOnce({
        ...keepSuccess,
        logoStoragePath: null,
        replayed: true,
      });
    const first = await updateChurchSettingsAction(
      initialState(),
      validForm({ removeLogo: true }),
    );
    expect(first.retryLogoAction).toBe("remove");

    const second = await updateChurchSettingsAction(first, validForm());
    expect(updateChurchSettingsMock).toHaveBeenNthCalledWith(
      2,
      client,
      REQUEST_ID,
      CHURCH_ID,
      0,
      expect.objectContaining({ logoAction: "remove", logoStoragePath: null }),
    );
    expect(second.status).toBe("success");
  });

  it("keeps a confirmed settings save successful when old-logo cleanup fails", async () => {
    updateChurchSettingsMock.mockResolvedValue(replaceSuccess);
    removeChurchLogoObjectMock.mockResolvedValue(false);
    const result = await updateChurchSettingsAction(
      initialState(),
      validForm({ logo: logoFile() }),
    );
    expect(result.status).toBe("success");
    expect(result.cleanupPending).toBe(true);
    expect(result.message).toContain("queued for safe cleanup");
    expect(completeChurchLogoCleanupMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledOnce();
  });

  it("does not misreport a committed save when cache invalidation fails", async () => {
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error("cache unavailable");
    });

    const result = await updateChurchSettingsAction(initialState(), validForm());

    expect(result.status).toBe("success");
    expect(result.message).toContain("settings were saved");
    expect(result.retryLogoAction).toBeUndefined();
  });

  it("retries durable cleanup on a later unchanged save", async () => {
    updateChurchSettingsMock
      .mockResolvedValueOnce(replaceSuccess)
      .mockResolvedValueOnce({ ok: false, reason: "no_changes" });
    removeChurchLogoObjectMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const saved = await updateChurchSettingsAction(
      initialState(),
      validForm({ logo: logoFile() }),
    );
    expect(saved.cleanupPending).toBe(true);

    getChurchSettingsMock.mockResolvedValue({
      ok: true,
      settings: {
        ...snapshot,
        logoStoragePath: LOGO_PATH,
        settingsRevision: 1,
      },
    });
    getPendingChurchLogoCleanupsMock.mockResolvedValue([
      { requestId: REQUEST_ID, logoStoragePath: OLD_LOGO_PATH },
    ]);
    const retried = await updateChurchSettingsAction(
      saved,
      validForm({
        requestId: NEXT_REQUEST_ID,
        expectedSettingsRevision: "1",
      }),
    );

    expect(retried).toMatchObject({
      status: "success",
      cleanupPending: false,
      settingsRevision: 1,
    });
    expect(retried.message).toContain("cleanup queue is clear");
    expect(removeChurchLogoObjectMock).toHaveBeenLastCalledWith(
      client,
      CHURCH_ID,
      OLD_LOGO_PATH,
    );
    expect(completeChurchLogoCleanupMock).toHaveBeenCalledWith(
      client,
      CHURCH_ID,
      { requestId: REQUEST_ID, logoStoragePath: OLD_LOGO_PATH },
    );
  });

  it("limits sequential backlog cleanup work per save", async () => {
    const backlog = Array.from({ length: 8 }, (_, index) => ({
      requestId: `${(index + 1).toString(16)}0000000-0000-4000-8000-00000000090${index}`,
      logoStoragePath: `${CHURCH_ID}/${(index + 1).toString(16)}0000000-0000-4000-8000-00000000090${index}.webp`,
    }));
    getPendingChurchLogoCleanupsMock.mockResolvedValue(backlog);
    const result = await updateChurchSettingsAction(initialState(), validForm());
    expect(removeChurchLogoObjectMock).toHaveBeenCalledTimes(5);
    expect(result.cleanupPending).toBe(true);
  });

  it("maps safe failures and never exposes a thrown raw DAL error", async () => {
    updateChurchSettingsMock.mockRejectedValue(
      new Error("secret relation and support email"),
    );
    const result = await updateChurchSettingsAction(initialState(), validForm());
    expect(result.status).toBe("error");
    expect(result.retryLogoAction).toBe("keep");
    expect(result.message).toContain("could not be confirmed");
    expect(JSON.stringify(result)).not.toContain("secret relation");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
