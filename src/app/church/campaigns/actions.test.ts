import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  mutateChurchFundMock,
  requireChurchPermissionMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  mutateChurchFundMock: vi.fn(),
  requireChurchPermissionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermission: requireChurchPermissionMock,
}));
vi.mock("@/lib/church-funds-dal", () => ({
  mutateChurchFund: mutateChurchFundMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  archiveFundAction,
  createFundAction,
  moveFundDownAction,
  moveFundUpAction,
  restoreFundAction,
  setDefaultFundAction,
  updateFundAction,
} from "./actions";
import {
  createInitialChurchFundActionState,
  type ChurchFundAction,
} from "@/lib/church-funds";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const FUND_ID = "20000000-0000-4000-8000-000000000001";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000001";
const client = { rpc: vi.fn() };
const fund = {
  id: FUND_ID,
  name: "Missions",
  slug: "missions",
  description: null,
  status: "active" as const,
  isDefault: false,
  sortOrder: 10,
};

function state(operation: ChurchFundAction) {
  return createInitialChurchFundActionState(
    REQUEST_ID,
    4,
    operation,
    operation === "create" ? null : fund,
  );
}

function form(
  values: Record<string, string> = {},
  requestId = REQUEST_ID,
  revision = "4",
) {
  const data = new FormData();
  data.set("requestId", requestId);
  data.set("expectedFundsRevision", revision);
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const operations = [
  ["create", createFundAction],
  ["update", updateFundAction],
  ["set_default", setDefaultFundAction],
  ["move_up", moveFundUpAction],
  ["move_down", moveFundDownAction],
  ["archive", archiveFundAction],
  ["restore", restoreFundAction],
] as const;

describe("church fund Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchPermissionMock.mockResolvedValue({
      workspace: { kind: "church", churchId: CHURCH_ID },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    mutateChurchFundMock.mockResolvedValue({
      ok: true,
      fund,
      fundsRevision: 5,
      replayed: false,
    });
  });

  it.each(operations)(
    "independently guards %s before parsing or creating a database client",
    async (operation, action) => {
      const denied = new Error("NEXT_REDIRECT");
      requireChurchPermissionMock.mockRejectedValueOnce(denied);

      await expect(action(state(operation), new FormData())).rejects.toBe(denied);
      expect(requireChurchPermissionMock).toHaveBeenCalledWith("funds_manage");
      expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
      expect(mutateChurchFundMock).not.toHaveBeenCalled();
    },
  );

  it("sends only canonical create fields to the tenant RPC adapter", async () => {
    mutateChurchFundMock.mockResolvedValueOnce({
      ok: true,
      fund: {
        ...fund,
        name: "Youth Ministry",
        slug: "youth-ministry",
        description: "Sunday youth giving",
      },
      fundsRevision: 5,
      replayed: false,
    });

    const result = await createFundAction(
      state("create"),
      form({
        name: "  Youth   Ministry ",
        slug: "youth-ministry",
        description: " Sunday youth giving ",
      }),
    );

    expect(mutateChurchFundMock).toHaveBeenCalledWith(
      client,
      REQUEST_ID,
      CHURCH_ID,
      4,
      {
        operation: "create",
        fundId: null,
        name: "Youth Ministry",
        slug: "youth-ministry",
        description: "Sunday youth giving",
      },
    );
    expect(result).toMatchObject({
      status: "success",
      fundsRevision: 5,
      retryRequired: false,
    });
    expect(result.requestId).not.toBe(REQUEST_ID);
    expect(revalidatePathMock).toHaveBeenCalledWith("/church");
    expect(revalidatePathMock).toHaveBeenCalledWith("/church/campaigns");
  });

  it("returns accessible field errors without creating a client", async () => {
    const result = await createFundAction(
      state("create"),
      form({ name: "A", slug: "Bad slug", description: "" }),
    );

    expect(result).toMatchObject({
      status: "error",
      retryRequired: false,
      fieldErrors: { name: expect.any(String) },
    });
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(mutateChurchFundMock).not.toHaveBeenCalled();
  });

  it("locks canonical content after an ambiguous result and accepts only an exact replay", async () => {
    mutateChurchFundMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    const original = form({
      name: "Youth Ministry",
      slug: "youth-ministry",
      description: "Youth giving",
    });
    const uncertain = await createFundAction(state("create"), original);
    expect(uncertain).toMatchObject({
      status: "error",
      retryRequired: true,
      requestId: REQUEST_ID,
      fundsRevision: 4,
      values: {
        name: "Youth Ministry",
        slug: "youth-ministry",
        description: "Youth giving",
      },
    });

    const changed = await createFundAction(
      uncertain,
      form({
        name: "Changed",
        slug: "changed",
        description: "Different",
      }),
    );
    expect(changed).toMatchObject({
      retryRequired: true,
      values: uncertain.values,
    });
    expect(mutateChurchFundMock).toHaveBeenCalledTimes(1);

    mutateChurchFundMock.mockResolvedValueOnce({
      ok: true,
      fund: {
        ...fund,
        name: "Youth Ministry",
        slug: "youth-ministry",
        description: "Youth giving",
      },
      fundsRevision: 5,
      replayed: true,
    });
    const recovered = await createFundAction(
      changed,
      form({
        name: "Youth Ministry",
        slug: "youth-ministry",
        description: "Youth giving",
      }),
    );
    expect(recovered).toMatchObject({
      status: "success",
      retryRequired: false,
      fundsRevision: 5,
    });
    expect(recovered.message).toContain("recovered");
    expect(mutateChurchFundMock).toHaveBeenCalledTimes(2);
  });

  it("clears an ambiguous lock when an exact retry gets a confirmed conflict", async () => {
    const values = {
      name: "Youth Ministry",
      slug: "youth-ministry",
      description: "Youth giving",
    };
    mutateChurchFundMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    const uncertain = await createFundAction(state("create"), form(values));

    mutateChurchFundMock.mockResolvedValueOnce({
      ok: false,
      reason: "revision_conflict",
    });
    const confirmed = await createFundAction(uncertain, form(values));

    expect(confirmed).toMatchObject({
      status: "error",
      retryRequired: false,
    });
    expect(confirmed.requestId).not.toBe(REQUEST_ID);
    expect(confirmed).not.toHaveProperty("fieldErrors");
    expect(revalidatePathMock).toHaveBeenCalledWith("/church/campaigns");
  });

  it("clears validation errors after a corrected request succeeds", async () => {
    const invalid = await createFundAction(
      state("create"),
      form({ name: "A", slug: "Bad slug", description: "" }),
    );
    expect(invalid).toHaveProperty("fieldErrors");

    mutateChurchFundMock.mockResolvedValueOnce({
      ok: true,
      fund: {
        ...fund,
        name: "Youth Ministry",
        slug: "youth-ministry",
      },
      fundsRevision: 5,
      replayed: false,
    });
    const corrected = await createFundAction(
      invalid,
      form({ name: "Youth Ministry", slug: "youth-ministry", description: "" }),
    );

    expect(corrected.status).toBe("success");
    expect(corrected).not.toHaveProperty("fieldErrors");
  });

  it("treats an unexpected adapter throw as ambiguous", async () => {
    mutateChurchFundMock.mockRejectedValueOnce(new Error("socket closed"));
    const result = await updateFundAction(
      state("update"),
      form({ name: "Global Missions", description: "Updated" }),
    );
    expect(result).toMatchObject({
      status: "error",
      retryRequired: true,
      requestId: REQUEST_ID,
      fundsRevision: 4,
      values: { name: "Global Missions", slug: "", description: "Updated" },
    });
  });

  it("discards irrelevant fields so they cannot alter a non-content retry", async () => {
    mutateChurchFundMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    const uncertain = await archiveFundAction(
      state("archive"),
      form({ name: "Injected", slug: "injected", description: "Injected" }),
    );
    expect(uncertain.values).toEqual({ name: "", slug: "", description: "" });

    mutateChurchFundMock.mockResolvedValueOnce({
      ok: true,
      fund: { ...fund, status: "archived" },
      fundsRevision: 5,
      replayed: true,
    });
    const recovered = await archiveFundAction(
      uncertain,
      form({ name: "Different", slug: "different", description: "Different" }),
    );
    expect(recovered.status).toBe("success");
    expect(mutateChurchFundMock).toHaveBeenLastCalledWith(
      client,
      REQUEST_ID,
      CHURCH_ID,
      4,
      {
        operation: "archive",
        fundId: FUND_ID,
        name: null,
        slug: null,
        description: null,
      },
    );
  });

  it("maps name conflicts to the name field and rotates the confirmed request", async () => {
    mutateChurchFundMock.mockResolvedValueOnce({
      ok: false,
      reason: "name_conflict",
    });
    const result = await updateFundAction(
      state("update"),
      form({ name: "Tithes", description: "" }),
    );
    expect(result).toMatchObject({
      status: "error",
      retryRequired: false,
      fieldErrors: { name: expect.stringContaining("already in use") },
    });
    expect(result.requestId).not.toBe(REQUEST_ID);
  });

  it("associates a derived slug collision with the visible name field", async () => {
    mutateChurchFundMock.mockResolvedValueOnce({
      ok: false,
      reason: "slug_conflict",
    });
    const result = await createFundAction(
      state("create"),
      form({ name: "Café", slug: "client-value-is-ignored", description: "" }),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        name: expect.stringContaining("more distinct fund name"),
      },
    });
    expect(result.fieldErrors).not.toHaveProperty("slug");
    expect(mutateChurchFundMock).toHaveBeenCalledWith(
      client,
      REQUEST_ID,
      CHURCH_ID,
      4,
      expect.objectContaining({ slug: "cafe" }),
    );
  });

  it("rejects altered request identity or revision before validation", async () => {
    await createFundAction(
      state("create"),
      form(
        { name: "Youth", slug: "youth", description: "" },
        "b0000000-0000-4000-8000-000000000002",
        "5",
      ),
    );
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(mutateChurchFundMock).not.toHaveBeenCalled();
  });
});
