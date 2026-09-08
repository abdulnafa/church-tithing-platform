import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerSupabaseClientMock,
  mutateChurchCampaignMock,
  requireChurchPermissionMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
  mutateChurchCampaignMock: vi.fn(),
  requireChurchPermissionMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireChurchPermission: requireChurchPermissionMock,
}));
vi.mock("@/lib/church-campaigns-dal", () => ({
  mutateChurchCampaign: mutateChurchCampaignMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  activateCampaignAction,
  archiveCampaignAction,
  closeCampaignAction,
  createCampaignAction,
  restoreCampaignAction,
  updateCampaignAction,
} from "./campaign-actions";
import {
  createInitialChurchCampaignActionState,
  type ChurchCampaign,
  type ChurchCampaignAction,
} from "@/lib/church-campaigns";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const FUND_ID = "20000000-0000-4000-8000-000000000001";
const CAMPAIGN_ID = "30000000-0000-4000-8000-000000000001";
const REQUEST_ID = "a0000000-0000-4000-8000-000000000001";
const client = { rpc: vi.fn() };
const campaign: ChurchCampaign = {
  id: CAMPAIGN_ID,
  fundId: FUND_ID,
  name: "Community Centre",
  slug: "community-centre",
  description: "A safe gathering place",
  status: "draft",
  goalAmountMinorText: "5000000",
  currency: "BBD",
  startsAt: null,
  endsAt: null,
};

function state(operation: ChurchCampaignAction) {
  return createInitialChurchCampaignActionState(
    REQUEST_ID,
    4,
    operation,
    operation === "create" ? null : campaign,
  );
}

function form(
  values: Record<string, string> = {},
  requestId = REQUEST_ID,
  revision = "4",
) {
  const data = new FormData();
  data.set("requestId", requestId);
  data.set("expectedCampaignsRevision", revision);
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const content = {
  name: "Community Centre",
  description: "A safe gathering place",
  fundId: FUND_ID,
  goalAmount: "50000.00",
};

const operations = [
  ["create", createCampaignAction],
  ["update", updateCampaignAction],
  ["activate", activateCampaignAction],
  ["close", closeCampaignAction],
  ["archive", archiveCampaignAction],
  ["restore", restoreCampaignAction],
] as const;

describe("church campaign Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchPermissionMock.mockResolvedValue({
      workspace: { kind: "church", churchId: CHURCH_ID },
    });
    createServerSupabaseClientMock.mockResolvedValue(client);
    mutateChurchCampaignMock.mockResolvedValue({
      ok: true,
      campaign,
      campaignsRevision: 5,
      replayed: false,
    });
  });

  it.each(operations)(
    "independently guards %s before parsing or client creation",
    async (operation, action) => {
      const denied = new Error("NEXT_REDIRECT");
      requireChurchPermissionMock.mockRejectedValueOnce(denied);

      await expect(action(state(operation), new FormData())).rejects.toBe(denied);
      expect(requireChurchPermissionMock).toHaveBeenCalledWith(
        "campaigns_manage",
      );
      expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
      expect(mutateChurchCampaignMock).not.toHaveBeenCalled();
    },
  );

  it("sends only canonical create fields to the tenant RPC adapter", async () => {
    const result = await createCampaignAction(
      state("create"),
      form({
        name: "  Community   Centre ",
        description: " A safe gathering place ",
        fundId: FUND_ID,
        goalAmount: "50000.0",
        slug: "client-override-is-ignored",
        startsAt: "2026-09-05",
      }),
    );

    expect(mutateChurchCampaignMock).toHaveBeenCalledWith(
      client,
      REQUEST_ID,
      CHURCH_ID,
      4,
      {
        operation: "create",
        campaignId: null,
        name: "Community Centre",
        slug: "community-centre",
        description: "A safe gathering place",
        fundId: FUND_ID,
        goalAmountMinorText: "5000000",
      },
    );
    expect(result).toMatchObject({
      status: "success",
      campaignsRevision: 5,
      retryRequired: false,
    });
    expect(result.requestId).not.toBe(REQUEST_ID);
    expect(revalidatePathMock).toHaveBeenCalledWith("/church");
    expect(revalidatePathMock).toHaveBeenCalledWith("/church/campaigns");
  });

  it("returns accessible field errors without creating a client", async () => {
    const result = await createCampaignAction(
      state("create"),
      form({
        name: "A",
        description: "",
        fundId: "bad",
        goalAmount: "1e3",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      retryRequired: false,
      fieldErrors: {
        name: expect.any(String),
        fundId: expect.any(String),
        goalAmount: expect.any(String),
      },
    });
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("locks all canonical content after ambiguity and accepts only exact replay", async () => {
    mutateChurchCampaignMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    const uncertain = await createCampaignAction(
      state("create"),
      form(content),
    );
    expect(uncertain).toMatchObject({
      status: "error",
      requestId: REQUEST_ID,
      campaignsRevision: 4,
      retryRequired: true,
      values: content,
    });

    const changed = await createCampaignAction(
      uncertain,
      form({ ...content, goalAmount: "50000.01" }),
    );
    expect(changed).toMatchObject({
      retryRequired: true,
      values: content,
    });
    expect(mutateChurchCampaignMock).toHaveBeenCalledTimes(1);

    mutateChurchCampaignMock.mockResolvedValueOnce({
      ok: true,
      campaign,
      campaignsRevision: 5,
      replayed: true,
    });
    const recovered = await createCampaignAction(changed, form(content));
    expect(recovered).toMatchObject({
      status: "success",
      retryRequired: false,
      campaignsRevision: 5,
    });
    expect(recovered.message).toContain("recovered");
    expect(mutateChurchCampaignMock).toHaveBeenCalledTimes(2);
  });

  it("rotates a confirmed failure and clears stale field errors", async () => {
    mutateChurchCampaignMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    const uncertain = await createCampaignAction(state("create"), form(content));

    mutateChurchCampaignMock.mockResolvedValueOnce({
      ok: false,
      reason: "revision_conflict",
    });
    const confirmed = await createCampaignAction(uncertain, form(content));
    expect(confirmed).toMatchObject({
      status: "error",
      retryRequired: false,
    });
    expect(confirmed.requestId).not.toBe(REQUEST_ID);
    expect(confirmed).not.toHaveProperty("fieldErrors");
    expect(revalidatePathMock).toHaveBeenCalledWith("/church/campaigns");
  });

  it("treats an unexpected adapter throw as ambiguous", async () => {
    mutateChurchCampaignMock.mockRejectedValueOnce(new Error("socket closed"));
    const result = await updateCampaignAction(
      state("update"),
      form({ ...content, name: "Community Hub" }),
    );
    expect(result).toMatchObject({
      status: "error",
      retryRequired: true,
      requestId: REQUEST_ID,
      campaignsRevision: 4,
      values: { ...content, name: "Community Hub" },
    });
  });

  it("discards irrelevant content for lifecycle retries", async () => {
    mutateChurchCampaignMock.mockResolvedValueOnce({
      ok: false,
      reason: "unavailable",
    });
    const uncertain = await archiveCampaignAction(
      state("archive"),
      form({ ...content, slug: "injected", endsAt: "2099-01-01" }),
    );
    expect(uncertain.values).toEqual({
      name: "",
      description: "",
      fundId: "",
      goalAmount: "",
    });

    mutateChurchCampaignMock.mockResolvedValueOnce({
      ok: true,
      campaign: { ...campaign, status: "archived" },
      campaignsRevision: 5,
      replayed: true,
    });
    const recovered = await archiveCampaignAction(
      uncertain,
      form({ name: "Different", fundId: "bad", goalAmount: "bad" }),
    );
    expect(recovered.status).toBe("success");
    expect(mutateChurchCampaignMock).toHaveBeenLastCalledWith(
      client,
      REQUEST_ID,
      CHURCH_ID,
      4,
      {
        operation: "archive",
        campaignId: CAMPAIGN_ID,
        name: null,
        slug: null,
        description: null,
        fundId: null,
        goalAmountMinorText: null,
      },
    );
  });

  it.each([
    ["name_conflict", "name"],
    ["slug_conflict", "name"],
    ["fund_not_active", "fundId"],
  ] as const)("maps %s to the visible %s field", async (reason, field) => {
    mutateChurchCampaignMock.mockResolvedValueOnce({ ok: false, reason });
    const result = await createCampaignAction(state("create"), form(content));
    expect(result.status).toBe("error");
    expect(result.fieldErrors).toHaveProperty(field);
    expect(result.requestId).not.toBe(REQUEST_ID);
  });

  it("maps the legacy ended-window activation failure honestly", async () => {
    mutateChurchCampaignMock.mockResolvedValueOnce({
      ok: false,
      reason: "window_ended",
    });
    const result = await activateCampaignAction(
      state("activate"),
      form(),
    );
    expect(result.message).toContain("legacy visibility window");
    expect(result.message).toContain("read-only");
  });

  it("rejects altered request identity or revision before validation", async () => {
    await createCampaignAction(
      state("create"),
      form(content, "b0000000-0000-4000-8000-000000000002", "5"),
    );
    expect(createServerSupabaseClientMock).not.toHaveBeenCalled();
    expect(mutateChurchCampaignMock).not.toHaveBeenCalled();
  });
});
