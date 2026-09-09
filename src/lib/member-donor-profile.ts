import "server-only";

import { cache } from "react";

import {
  getMyDonorProfile,
  type DonorProfileReadResult,
} from "./donor-profile-dal";
import { createServerSupabaseClient } from "./supabase/server";

async function readMemberDonorProfile(
  churchId: string,
  donorId: string,
): Promise<DonorProfileReadResult> {
  try {
    const client = await createServerSupabaseClient();
    return await getMyDonorProfile(client, churchId, donorId);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Deduplicates the layout and leaf-page profile read within one render pass. */
export const loadMemberDonorProfile = cache(readMemberDonorProfile);
