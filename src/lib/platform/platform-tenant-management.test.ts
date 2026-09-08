import { describe, expect, it } from "vitest";

import {
  createInitialPlatformLifecycleState,
  getPlatformLifecycleOperationForStatus,
  isPlatformChurchId,
  isPlatformRequestId,
  isPlatformTenantCursor,
} from "./platform-tenant-management";

const REQUEST_ID = "10000000-0000-4000-8000-000000000801";
const CHURCH_ID = "20000000-0000-4000-8000-000000000802";

describe("platform tenant lifecycle model", () => {
  it("creates an unlocked exact-request state", () => {
    expect(
      createInitialPlatformLifecycleState({
        requestId: REQUEST_ID,
        churchId: CHURCH_ID,
        expectedRevision: 7,
        operation: "suspend",
      }),
    ).toEqual({
      status: "idle",
      message: "",
      responseEpoch: 0,
      requestId: REQUEST_ID,
      churchId: CHURCH_ID,
      expectedRevision: 7,
      operation: "suspend",
      suspensionReasonCode: "",
      retryRequired: false,
    });
  });

  it.each([
    ["onboarding", "activate"],
    ["active", "suspend"],
    ["suspended", "restore"],
    ["canceled", null],
    ["archived", null],
  ] as const)("maps %s to only its conservative operation", (status, operation) => {
    expect(getPlatformLifecycleOperationForStatus(status)).toBe(operation);
  });

  it("distinguishes v4 mutation references from general church UUIDs", () => {
    expect(isPlatformRequestId(REQUEST_ID)).toBe(true);
    expect(isPlatformRequestId("10000000-0000-3000-8000-000000000801")).toBe(false);
    expect(isPlatformChurchId("10000000-0000-3000-8000-000000000801")).toBe(true);
    expect(isPlatformChurchId("not-a-uuid")).toBe(false);
  });

  it("accepts only a strict RFC3339 and UUID keyset cursor", () => {
    expect(
      isPlatformTenantCursor({
        createdAt: "2026-09-07T10:00:00.123456+00:00",
        churchId: CHURCH_ID,
      }),
    ).toBe(true);
    expect(
      isPlatformTenantCursor({
        createdAt: "September 7, 2026",
        churchId: CHURCH_ID,
      }),
    ).toBe(false);
    expect(
      isPlatformTenantCursor({
        createdAt: "2026-09-07T10:00:00+00:00",
        churchId: "bad",
      }),
    ).toBe(false);
    expect(isPlatformTenantCursor(null)).toBe(false);
  });
});
