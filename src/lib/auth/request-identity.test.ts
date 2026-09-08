import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

const { createPublicServerSupabaseClientMock, createServerSupabaseClientMock } =
  vi.hoisted(() => ({
    createPublicServerSupabaseClientMock: vi.fn(),
    createServerSupabaseClientMock: vi.fn(),
  }));

vi.mock("@/lib/supabase/public-server", () => ({
  createPublicServerSupabaseClient: createPublicServerSupabaseClientMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import {
  IdentityResolutionError,
  resolveRequestIdentity,
} from "./request-identity";

const USER_ID = "50000000-0000-4000-8000-000000000001";
const CHURCH_A = "10000000-0000-4000-8000-000000000001";
const CHURCH_B = "20000000-0000-4000-8000-000000000001";

type QueryResult = Readonly<{ data: unknown; error: unknown }>;

function createQuery(result: QueryResult) {
  const promise = Promise.resolve(result);
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(() => promise),
    then: promise.then.bind(promise),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  return query;
}

type FakeTables = Readonly<Record<string, ReturnType<typeof createQuery>>>;

function createClient(
  tables: FakeTables,
  claims: QueryResult = {
    data: { claims: { sub: USER_ID } },
    error: null,
  },
  permissionResponses: Readonly<Record<string, QueryResult>> = {},
  additionalRpcHandler?: (
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<QueryResult>,
) {
  const from = vi.fn((table: string) => {
    const query = tables[table];
    if (!query) throw new Error(`Unexpected table: ${table}`);
    return query;
  });
  const rpc = vi.fn(
    async (
      functionName: string,
      args: Readonly<Record<string, unknown>>,
    ) => {
      if (functionName === "get_my_church_permissions") {
        const churchId = args.target_church_id;
        return (
          (typeof churchId === "string"
            ? permissionResponses[churchId]
            : undefined) ?? {
            data: [],
            error: null,
          }
        );
      }

      if (additionalRpcHandler) {
        return additionalRpcHandler(functionName, args);
      }
      throw new Error(`Unexpected RPC: ${functionName}`);
    },
  );
  const client = {
    auth: { getClaims: vi.fn(async () => claims) },
    from,
    rpc,
  } as unknown as SupabaseClient<Database>;

  return { client, from, rpc };
}

function baseAuthenticatedTables(overrides: Partial<FakeTables> = {}) {
  return {
    profiles: createQuery({
      data: { id: USER_ID, display_name: "Miriam Jordan", is_active: true },
      error: null,
    }),
    platform_admins: createQuery({ data: null, error: null }),
    church_memberships: createQuery({ data: [], error: null }),
    donors: createQuery({ data: [], error: null }),
    churches: createQuery({ data: [], error: null }),
    ...overrides,
  };
}

describe("request identity DAL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { data: { claims: null }, error: null },
    {
      data: { claims: { sub: USER_ID } },
      error: { message: "invalid JWT" },
    },
    { data: { claims: { sub: "metadata-role-admin" } }, error: null },
  ])("treats missing, invalid, or malformed verified claims as anonymous", async (claims) => {
    const authenticated = createClient(baseAuthenticatedTables(), claims);

    await expect(
      resolveRequestIdentity({ authenticatedClient: authenticated.client }),
    ).resolves.toEqual({ state: "anonymous" });
    expect(authenticated.from).not.toHaveBeenCalled();
  });

  it("returns setup-required when the auth subject has no application profile", async () => {
    const authenticated = createClient(
      baseAuthenticatedTables({
        profiles: createQuery({ data: null, error: null }),
      }),
    );

    await expect(
      resolveRequestIdentity({ authenticatedClient: authenticated.client }),
    ).resolves.toEqual({ state: "setup_required", userId: USER_ID });
    expect(authenticated.from).toHaveBeenCalledTimes(1);
  });

  it("fails closed before tenant queries when the profile is inactive", async () => {
    const tables = baseAuthenticatedTables({
      profiles: createQuery({
        data: { id: USER_ID, display_name: "Inactive User", is_active: false },
        error: null,
      }),
    });
    const authenticated = createClient(tables);

    await expect(
      resolveRequestIdentity({ authenticatedClient: authenticated.client }),
    ).resolves.toEqual({
      state: "inactive",
      userId: USER_ID,
      displayName: "Inactive User",
    });
    expect(authenticated.from).toHaveBeenCalledTimes(1);
    expect(tables.church_memberships.select).not.toHaveBeenCalled();
    expect(tables.donors.select).not.toHaveBeenCalled();
  });

  it("uses explicit subject filters and separate clients for staff and donor church details", async () => {
    const tables = baseAuthenticatedTables({
      platform_admins: createQuery({
        data: { role: "super_admin", is_active: true },
        error: null,
      }),
      church_memberships: createQuery({
        data: [
          {
            id: "40000000-0000-4000-8000-000000000001",
            church_id: CHURCH_A,
            role: "owner",
          },
        ],
        error: null,
      }),
      donors: createQuery({
        data: [
          {
            id: "30000000-0000-4000-8000-000000000001",
            church_id: CHURCH_B,
          },
        ],
        error: null,
      }),
      churches: createQuery({
        data: [
          {
            id: CHURCH_A,
            name: "Harbour Grace Church",
            slug: "harbour-grace",
            status: "onboarding",
          },
        ],
        error: null,
      }),
    });
    const authenticated = createClient(tables, undefined, {
      [CHURCH_A]: {
        data: ["settings_manage", "workspace_read", "settings_manage"],
        error: null,
      },
    });
    const publicClient = createClient({}, undefined, {}, async (name, args) => {
      expect(name).toBe("get_public_church_identities");
      expect(args).toEqual({ church_ids: [CHURCH_B] });
      return {
        data: [
          {
            church_id: CHURCH_B,
            display_name: "New Life Fellowship",
            church_slug: "new-life",
          },
        ],
        error: null,
      };
    });

    const identity = await resolveRequestIdentity({
      authenticatedClient: authenticated.client,
      publicClient: publicClient.client,
    });

    expect(identity).toMatchObject({
      state: "active",
      userId: USER_ID,
      workspaces: [
        { kind: "member", churchId: CHURCH_B },
        {
          kind: "church",
          churchId: CHURCH_A,
          role: "owner",
          permissions: ["workspace_read", "settings_manage"],
        },
        { kind: "platform" },
      ],
    });
    expect(tables.profiles.eq).toHaveBeenCalledWith("id", USER_ID);
    expect(tables.platform_admins.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(tables.platform_admins.eq).toHaveBeenCalledWith("is_active", true);
    expect(tables.church_memberships.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(tables.church_memberships.eq).toHaveBeenCalledWith("status", "active");
    expect(tables.donors.eq).toHaveBeenCalledWith("auth_user_id", USER_ID);
    expect(tables.churches.in).toHaveBeenCalledWith("id", [CHURCH_A]);
    expect(publicClient.from).not.toHaveBeenCalled();
    expect(publicClient.rpc).toHaveBeenCalledWith(
      "get_public_church_identities",
      { church_ids: [CHURCH_B] },
    );
    expect(authenticated.rpc).toHaveBeenCalledWith(
      "get_my_church_permissions",
      { target_church_id: CHURCH_A },
    );
  });

  it("keeps an eligible church workspace but grants no capability when its permission RPC fails", async () => {
    const tables = baseAuthenticatedTables({
      church_memberships: createQuery({
        data: [
          {
            id: "40000000-0000-4000-8000-000000000001",
            church_id: CHURCH_A,
            role: "owner",
          },
        ],
        error: null,
      }),
      churches: createQuery({
        data: [
          {
            id: CHURCH_A,
            name: "Harbour Grace Church",
            slug: "harbour-grace",
            status: "active",
          },
        ],
        error: null,
      }),
    });
    const authenticated = createClient(tables, undefined, {
      [CHURCH_A]: {
        data: ["workspace_read"],
        error: { message: "permission function unavailable" },
      },
    });

    await expect(
      resolveRequestIdentity({ authenticatedClient: authenticated.client }),
    ).resolves.toMatchObject({
      state: "active",
      workspaces: [
        {
          kind: "church",
          churchId: CHURCH_A,
          permissions: [],
        },
      ],
    });
  });

  it("does not create or call a public client when the user has no donor rows", async () => {
    const tables = baseAuthenticatedTables();
    const authenticated = createClient(tables);

    const identity = await resolveRequestIdentity({
      authenticatedClient: authenticated.client,
    });

    expect(identity).toMatchObject({ state: "active", workspaces: [] });
    expect(createPublicServerSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("creates the cookie-free public client for donor church enrichment", async () => {
    const authenticated = createClient(
      baseAuthenticatedTables({
        donors: createQuery({
          data: [
            {
              id: "30000000-0000-4000-8000-000000000010",
              church_id: CHURCH_B,
            },
          ],
          error: null,
        }),
      }),
    );
    const publicClient = createClient({}, undefined, {}, async () => ({
      data: [
        {
          church_id: CHURCH_B,
          display_name: "New Life Fellowship",
          church_slug: "new-life",
        },
      ],
      error: null,
    }));
    createPublicServerSupabaseClientMock.mockReturnValue(publicClient.client);

    await expect(
      resolveRequestIdentity({ authenticatedClient: authenticated.client }),
    ).resolves.toMatchObject({
      state: "active",
      workspaces: [{ kind: "member", churchId: CHURCH_B }],
    });
    expect(createPublicServerSupabaseClientMock).toHaveBeenCalledOnce();
    expect(publicClient.from).not.toHaveBeenCalled();
    expect(publicClient.rpc).toHaveBeenCalledWith(
      "get_public_church_identities",
      { church_ids: [CHURCH_B] },
    );
  });

  it("chunks more than 50 donor church identities without imposing a product cap", async () => {
    const churchIds = Array.from(
      { length: 51 },
      (_, index) =>
        `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    const donors = churchIds.map((churchId, index) => ({
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      church_id: churchId,
    }));
    const authenticated = createClient(
      baseAuthenticatedTables({
        donors: createQuery({ data: donors, error: null }),
      }),
    );
    const publicClient = createClient({}, undefined, {}, async (name, args) => {
      expect(name).toBe("get_public_church_identities");
      const ids = args.church_ids as readonly string[];
      expect(ids.length).toBeLessThanOrEqual(50);
      return {
        data: ids.map((churchId) => ({
          church_id: churchId,
          display_name: `Church ${churchId.slice(-2)}`,
          church_slug: `church-${churchId.slice(-2)}`,
        })),
        error: null,
      };
    });

    const identity = await resolveRequestIdentity({
      authenticatedClient: authenticated.client,
      publicClient: publicClient.client,
    });

    expect(publicClient.rpc).toHaveBeenCalledTimes(2);
    expect(publicClient.rpc.mock.calls[0]?.[1]).toEqual({
      church_ids: churchIds.slice(0, 50),
    });
    expect(publicClient.rpc.mock.calls[1]?.[1]).toEqual({
      church_ids: churchIds.slice(50),
    });
    expect(identity).toMatchObject({ state: "active" });
    if (identity.state !== "active") throw new Error("Expected active identity");
    expect(identity.workspaces).toHaveLength(51);
  });

  it("accepts an empty public identity result but rejects unexpected or duplicate rows", async () => {
    const tables = baseAuthenticatedTables({
      donors: createQuery({
        data: [{ id: "30000000-0000-4000-8000-000000000010", church_id: CHURCH_B }],
        error: null,
      }),
    });
    const authenticated = createClient(tables);
    const emptyPublic = createClient({}, undefined, {}, async () => ({
      data: [],
      error: null,
    }));

    await expect(
      resolveRequestIdentity({
        authenticatedClient: authenticated.client,
        publicClient: emptyPublic.client,
      }),
    ).resolves.toMatchObject({ state: "active", workspaces: [] });

    for (const data of [
      [
        {
          church_id: CHURCH_A,
          display_name: "Unexpected Church",
          church_slug: "unexpected-church",
        },
      ],
      [
        {
          church_id: CHURCH_B,
          display_name: "New Life Fellowship",
          church_slug: "new-life",
        },
        {
          church_id: CHURCH_B,
          display_name: "New Life Fellowship",
          church_slug: "new-life",
        },
      ],
    ]) {
      const malformedPublic = createClient({}, undefined, {}, async () => ({
        data,
        error: null,
      }));
      await expect(
        resolveRequestIdentity({
          authenticatedClient: authenticated.client,
          publicClient: malformedPublic.client,
        }),
      ).rejects.toMatchObject({
        name: "IdentityResolutionError",
        operation: "member workspace details",
      });
    }
  });

  it("does not grant platform access to a support administrator", async () => {
    const authenticated = createClient(
      baseAuthenticatedTables({
        platform_admins: createQuery({
          data: { role: "support", is_active: true },
          error: null,
        }),
      }),
    );

    const identity = await resolveRequestIdentity({
      authenticatedClient: authenticated.client,
    });

    expect(identity).toMatchObject({ state: "active", workspaces: [] });
  });

  it("throws a sanitized operation error instead of treating a database failure as no access", async () => {
    const authenticated = createClient(
      baseAuthenticatedTables({
        donors: createQuery({
          data: null,
          error: { message: "raw database connection and policy details" },
        }),
      }),
    );

    const resolution = resolveRequestIdentity({
      authenticatedClient: authenticated.client,
    });

    await expect(resolution).rejects.toMatchObject({
      name: "IdentityResolutionError",
      operation: "member access",
      message: "The signed-in workspace could not be verified.",
    });
    await expect(resolution).rejects.not.toThrow(
      "raw database connection and policy details",
    );
    expect(IdentityResolutionError).toBeTypeOf("function");
  });
});
