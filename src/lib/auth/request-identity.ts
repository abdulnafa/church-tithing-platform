import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createPublicServerSupabaseClient } from "@/lib/supabase/public-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

import type { RequestIdentity } from "./identity-types";
import { getMyChurchPermissions } from "./permission-rpc";
import { buildWorkspaces } from "./workspaces";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHURCH_IDENTITY_COLUMNS = "id,name,slug,status";
const PUBLIC_CHURCH_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SINGLE_LINE_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;

type DatabaseClient = SupabaseClient<Database>;
type PublicChurchIdentityRpcResponse = Readonly<{
  data: unknown;
  error: unknown;
}>;

export type IdentityResolutionDependencies = Readonly<{
  authenticatedClient?: DatabaseClient;
  publicClient?: DatabaseClient;
}>;

export class IdentityResolutionError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super("The signed-in workspace could not be verified.");
    this.name = "IdentityResolutionError";
    this.operation = operation;
  }
}

function assertQuerySucceeded(
  operation: string,
  response: Readonly<{ error: unknown }>,
) {
  if (response.error) throw new IdentityResolutionError(operation);
}

function uniqueChurchIds(rows: readonly { church_id: string }[]) {
  return Array.from(new Set(rows.map((row) => row.church_id)));
}

function isCanonicalPublicChurchName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim().replace(/\s+/g, " ") &&
    Array.from(value).length >= 2 &&
    Array.from(value).length <= 120 &&
    !SINGLE_LINE_CONTROL_PATTERN.test(value)
  );
}

function parsePublicChurchIdentities(
  value: unknown,
  requestedChurchIds: readonly string[],
) {
  if (!Array.isArray(value) || value.length > requestedChurchIds.length) {
    return null;
  }

  const requestedIds = new Set(requestedChurchIds);
  const rows: Array<{
    id: string;
    name: string;
    slug: string;
    status: "active";
  }> = [];
  let previousId: string | null = null;
  for (const candidate of value) {
    if (typeof candidate !== "object" || candidate === null) return null;
    const row = candidate as Record<string, unknown>;
    const churchId = row.church_id;
    const slug = row.church_slug;
    if (
      typeof churchId !== "string" ||
      !UUID_PATTERN.test(churchId) ||
      churchId !== churchId.toLowerCase() ||
      !requestedIds.has(churchId) ||
      (previousId !== null && churchId <= previousId) ||
      !isCanonicalPublicChurchName(row.display_name) ||
      typeof slug !== "string" ||
      slug.length < 2 ||
      slug.length > 63 ||
      !PUBLIC_CHURCH_SLUG_PATTERN.test(slug)
    ) {
      return null;
    }

    rows.push({
      id: churchId,
      name: row.display_name,
      slug,
      status: "active",
    });
    previousId = churchId;
  }

  return rows;
}

async function getPublicDonorChurches(
  publicClient: DatabaseClient,
  churchIds: readonly string[],
) {
  if (
    churchIds.length < 1 ||
    new Set(churchIds).size !== churchIds.length ||
    churchIds.some(
      (churchId) =>
        !UUID_PATTERN.test(churchId) || churchId !== churchId.toLowerCase(),
    )
  ) {
    throw new IdentityResolutionError("member workspace details");
  }

  const batches: string[][] = [];
  for (let index = 0; index < churchIds.length; index += 50) {
    batches.push(churchIds.slice(index, index + 50));
  }

  const batchResults: Array<
    NonNullable<ReturnType<typeof parsePublicChurchIdentities>>
  > = [];
  for (const batch of batches) {
    let response: PublicChurchIdentityRpcResponse;
    try {
      response = await publicClient.rpc("get_public_church_identities", {
        church_ids: batch,
      });
    } catch {
      throw new IdentityResolutionError("member workspace details");
    }

    assertQuerySucceeded("member workspace details", response);
    const churches = parsePublicChurchIdentities(response.data, batch);
    if (!churches) {
      throw new IdentityResolutionError("member workspace details");
    }
    batchResults.push(churches);
  }

  return batchResults.flat().toSorted((left, right) =>
    left.id.localeCompare(right.id),
  );
}

/**
 * Resolves the current user's application identity through their request-bound
 * Supabase session. Every identity table is filtered to the validated subject
 * even when RLS permits broader reads for privileged roles.
 */
export async function resolveRequestIdentity(
  dependencies: IdentityResolutionDependencies = {},
): Promise<RequestIdentity> {
  const authenticatedClient =
    dependencies.authenticatedClient ??
    (await createServerSupabaseClient());
  const { data: claimsData, error: claimsError } =
    await authenticatedClient.auth.getClaims();
  const subject = claimsData?.claims?.sub;

  if (
    claimsError ||
    typeof subject !== "string" ||
    !UUID_PATTERN.test(subject)
  ) {
    return { state: "anonymous" };
  }

  const profileResponse = await authenticatedClient
    .from("profiles")
    .select("id,display_name,is_active")
    .eq("id", subject)
    .maybeSingle();

  assertQuerySucceeded("profile", profileResponse);

  if (!profileResponse.data) {
    return { state: "setup_required", userId: subject };
  }

  const displayName = profileResponse.data.display_name ?? "Kindred user";

  if (!profileResponse.data.is_active) {
    return { state: "inactive", userId: subject, displayName };
  }

  const [platformResponse, membershipResponse, donorResponse] =
    await Promise.all([
      authenticatedClient
        .from("platform_admins")
        .select("role,is_active")
        .eq("user_id", subject)
        .eq("is_active", true)
        .maybeSingle(),
      authenticatedClient
        .from("church_memberships")
        .select("id,church_id,role")
        .eq("user_id", subject)
        .eq("status", "active"),
      authenticatedClient
        .from("donors")
        .select("id,church_id")
        .eq("auth_user_id", subject),
    ]);

  assertQuerySucceeded("platform access", platformResponse);
  assertQuerySucceeded("church access", membershipResponse);
  assertQuerySucceeded("member access", donorResponse);

  const memberships = membershipResponse.data ?? [];
  const donors = donorResponse.data ?? [];
  const memberChurchIds = uniqueChurchIds(memberships);
  const donorChurchIds = uniqueChurchIds(donors);
  const publicClient =
    donorChurchIds.length > 0
      ? dependencies.publicClient ?? createPublicServerSupabaseClient()
      : null;

  const [memberChurchResponse, donorChurchResponse, permissionEntries] =
    await Promise.all([
      memberChurchIds.length > 0
        ? authenticatedClient
            .from("churches")
            .select(CHURCH_IDENTITY_COLUMNS)
            .in("id", memberChurchIds)
        : Promise.resolve({ data: [], error: null }),
      donorChurchIds.length > 0 && publicClient
        ? getPublicDonorChurches(publicClient, donorChurchIds)
        : Promise.resolve([]),
      Promise.all(
        memberChurchIds.map(async (churchId) =>
          [
            churchId,
            await getMyChurchPermissions(authenticatedClient, churchId),
          ] as const,
        ),
      ),
    ]);

  assertQuerySucceeded("church workspace details", memberChurchResponse);

  return {
    state: "active",
    userId: subject,
    displayName,
    workspaces: buildWorkspaces({
      memberships,
      donors,
      memberChurches: memberChurchResponse.data ?? [],
      donorChurches: donorChurchResponse,
      permissionsByChurch: Object.fromEntries(permissionEntries),
      isPlatformSuperAdmin:
        platformResponse.data?.is_active === true &&
        platformResponse.data.role === "super_admin",
    }),
  };
}

export const getRequestIdentity = cache(() => resolveRequestIdentity());
