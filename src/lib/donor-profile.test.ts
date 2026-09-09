import { describe, expect, it } from "vitest";

import {
  createInitialDonorProfileActionState,
  donorProfileValuesEqual,
  isDonorProfileRequestId,
  isDonorProfileRevision,
  validateDonorProfileForm,
} from "./donor-profile";

const REQUEST_ID = "10000000-0000-4000-8000-000000000f15";

function form(overrides: Readonly<Record<string, string>> = {}) {
  const data = new FormData();
  const values = {
    displayName: " Alicia   Clarke ",
    ...overrides,
  };
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  return data;
}

describe("donor profile domain", () => {
  it("validates and canonicalizes only the editable display name", () => {
    expect(validateDonorProfileForm(form())).toEqual({
      success: true,
      data: {
        displayName: "Alicia Clarke",
      },
      values: {
        displayName: "Alicia Clarke",
      },
    });
  });

  it("returns a safe field error without accepting email, phone, or IDs", () => {
    const invalid = form({ displayName: "A", phone: "+1 246 555 0199" });
    invalid.set("email", "attacker@example.test");
    invalid.set("donorId", "20000000-0000-4000-8000-000000000001");
    invalid.set("userId", "30000000-0000-4000-8000-000000000001");

    expect(validateDonorProfileForm(invalid)).toEqual({
      success: false,
      fieldErrors: {
        displayName: "Enter your full name.",
      },
      values: { displayName: "A" },
    });
  });

  it("creates an action state with no verified email or identity identifiers", () => {
    const state = createInitialDonorProfileActionState(REQUEST_ID, {
      displayName: "Alicia Clarke",
      email: "alicia@example.test",
      profileRevision: 7,
    });

    expect(state).toEqual({
      status: "idle",
      message: "",
      responseEpoch: 0,
      requestId: REQUEST_ID,
      expectedRevision: 7,
      values: { displayName: "Alicia Clarke" },
      retryRequired: false,
    });
    expect(JSON.stringify(state)).not.toMatch(/email|donorId|userId|churchId/i);
  });

  it("accepts only UUIDv4 request IDs and nonnegative safe revisions", () => {
    expect(isDonorProfileRequestId(REQUEST_ID)).toBe(true);
    expect(
      isDonorProfileRequestId("10000000-0000-3000-8000-000000000f15"),
    ).toBe(false);
    expect(isDonorProfileRequestId(REQUEST_ID.toUpperCase())).toBe(false);
    expect(isDonorProfileRevision(0)).toBe(true);
    expect(isDonorProfileRevision(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isDonorProfileRevision(-1)).toBe(false);
    expect(isDonorProfileRevision(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it("compares canonical retry values exactly", () => {
    const values = { displayName: "Alicia Clarke" };
    expect(donorProfileValuesEqual(values, { ...values })).toBe(true);
    expect(
      donorProfileValuesEqual(values, { displayName: "Alicia Clarke-Smith" }),
    ).toBe(false);
  });
});
