import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import type { ChurchPermission } from "./permissions";
import { normalizeChurchPermissions } from "./permissions";

/**
 * Uses the generated hosted RPC contract. An error, thrown request, or
 * malformed payload grants no permissions.
 */
export async function getMyChurchPermissions(
  client: SupabaseClient<Database>,
  churchId: string,
): Promise<readonly ChurchPermission[]> {
  try {
    const response = await client.rpc("get_my_church_permissions", {
      target_church_id: churchId,
    });

    return response.error ? [] : normalizeChurchPermissions(response.data);
  } catch {
    return [];
  }
}
