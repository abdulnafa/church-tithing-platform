import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/database.types";

vi.mock("server-only", () => ({}));

import { getMyChurchPermissions } from "./permission-rpc";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";

function createClient(
  rpcImplementation: () => Promise<Readonly<{ data: unknown; error: unknown }>>,
) {
  const rpc = vi.fn(rpcImplementation);
  return {
    client: { rpc } as unknown as SupabaseClient<Database>,
    rpc,
  };
}

describe("authenticated permission RPC adapter", () => {
  it("calls the exact RPC contract and normalizes its grant", async () => {
    const { client, rpc } = createClient(async () => ({
      data: [
        "reports_read",
        "workspace_read",
        "reports_read",
      ],
      error: null,
    }));

    await expect(getMyChurchPermissions(client, CHURCH_ID)).resolves.toEqual([
      "workspace_read",
      "reports_read",
    ]);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("get_my_church_permissions", {
      target_church_id: CHURCH_ID,
    });
  });

  it("fails closed when the RPC responds with an error", async () => {
    const { client } = createClient(async () => ({
      data: ["workspace_read"],
      error: { message: "raw database details" },
    }));

    await expect(getMyChurchPermissions(client, CHURCH_ID)).resolves.toEqual(
      [],
    );
  });

  it("fails closed when the RPC throws", async () => {
    const { client } = createClient(async () => {
      throw new Error("network and token details");
    });

    await expect(getMyChurchPermissions(client, CHURCH_ID)).resolves.toEqual(
      [],
    );
  });

  it.each([
    null,
    {},
    "workspace_read",
    ["workspace_read", "not_a_permission"],
    ["workspace_read", 42],
  ])(
    "fails closed for malformed successful payload %#",
    async (data) => {
      const { client } = createClient(async () => ({ data, error: null }));

      await expect(getMyChurchPermissions(client, CHURCH_ID)).resolves.toEqual(
        [],
      );
    },
  );
});
