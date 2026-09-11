import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isPublicChurchSlug,
  isPublicQrShortCode,
} from "@/lib/public-church-routing";
import type { Database } from "@/lib/supabase/database.types";
import { createPublicServerSupabaseClient } from "@/lib/supabase/public-server";

export type PublicQrResolutionResult =
  | Readonly<{ ok: true; churchSlug: string }>
  | Readonly<{ ok: false; reason: "not_found" | "unavailable" }>;

export type ChurchQrSnapshot = Readonly<{
  churchId: string;
  churchSlug: string;
  shortCode: string;
  isActive: boolean;
}>;

export type ChurchQrSnapshotResult =
  | Readonly<{ ok: true; snapshot: ChurchQrSnapshot }>
  | Readonly<{ ok: false; reason: "forbidden" | "unavailable" }>;

type RpcResponse = Readonly<{ data: unknown; error: unknown }>;
type RpcError = Readonly<{ message?: unknown }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSingleRow(data: unknown) {
  if (!Array.isArray(data)) return undefined;
  if (data.length === 0) return null;
  return data.length === 1 ? data[0] : undefined;
}

function getErrorMessage(error: unknown) {
  return isRecord(error) ? (error as RpcError).message : undefined;
}

export function parsePublicQrResolutionRow(value: unknown) {
  if (!isRecord(value) || !isPublicChurchSlug(value.church_slug)) return null;
  return { churchSlug: value.church_slug } as const;
}

export function parseChurchQrSnapshotRow(
  value: unknown,
  expectedChurchId: string,
): ChurchQrSnapshot | null {
  if (
    !isRecord(value) ||
    value.church_id !== expectedChurchId ||
    !isUuid(value.church_id) ||
    !isPublicChurchSlug(value.church_slug) ||
    !isPublicQrShortCode(value.short_code) ||
    typeof value.is_active !== "boolean"
  ) {
    return null;
  }

  return {
    churchId: value.church_id,
    churchSlug: value.church_slug,
    shortCode: value.short_code,
    isActive: value.is_active,
  };
}

/** Resolve one public code without forwarding a browser session or cookies. */
export async function resolvePublicQr(
  shortCode: string,
): Promise<PublicQrResolutionResult> {
  if (!isPublicQrShortCode(shortCode)) {
    return { ok: false, reason: "not_found" };
  }

  let response: RpcResponse;
  try {
    const client = createPublicServerSupabaseClient();
    response = await client.rpc("resolve_public_qr", {
      target_short_code: shortCode,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) return { ok: false, reason: "unavailable" };
  const row = getSingleRow(response.data);
  if (row === null) return { ok: false, reason: "not_found" };
  if (row === undefined) return { ok: false, reason: "unavailable" };

  const resolution = parsePublicQrResolutionRow(row);
  return resolution
    ? { ok: true, churchSlug: resolution.churchSlug }
    : { ok: false, reason: "unavailable" };
}

/** Read one minimum QR snapshot after both page and RPC authorization. */
export async function getChurchQrSnapshot(
  client: SupabaseClient<Database>,
  churchId: string,
): Promise<ChurchQrSnapshotResult> {
  if (!isUuid(churchId)) return { ok: false, reason: "unavailable" };

  let response: RpcResponse;
  try {
    response = await client.rpc("get_church_qr_snapshot", {
      target_church_id: churchId,
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.error) {
    return {
      ok: false,
      reason:
        getErrorMessage(response.error) === "QR_SNAPSHOT_FORBIDDEN"
          ? "forbidden"
          : "unavailable",
    };
  }

  const row = getSingleRow(response.data);
  if (row === null || row === undefined) {
    return { ok: false, reason: "unavailable" };
  }

  const snapshot = parseChurchQrSnapshotRow(row, churchId);
  return snapshot
    ? { ok: true, snapshot }
    : { ok: false, reason: "unavailable" };
}
