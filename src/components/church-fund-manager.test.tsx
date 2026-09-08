import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChurchFundActionState } from "@/lib/church-funds";

const {
  archiveFundActionMock,
  createFundActionMock,
  moveFundDownActionMock,
  moveFundUpActionMock,
  restoreFundActionMock,
  setDefaultFundActionMock,
  updateFundActionMock,
  useActionStateMock,
} = vi.hoisted(() => ({
  archiveFundActionMock: vi.fn(),
  createFundActionMock: vi.fn(),
  moveFundDownActionMock: vi.fn(),
  moveFundUpActionMock: vi.fn(),
  restoreFundActionMock: vi.fn(),
  setDefaultFundActionMock: vi.fn(),
  updateFundActionMock: vi.fn(),
  useActionStateMock: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: useActionStateMock };
});
vi.mock("@/app/church/campaigns/actions", () => ({
  archiveFundAction: archiveFundActionMock,
  createFundAction: createFundActionMock,
  moveFundDownAction: moveFundDownActionMock,
  moveFundUpAction: moveFundUpActionMock,
  restoreFundAction: restoreFundActionMock,
  setDefaultFundAction: setDefaultFundActionMock,
  updateFundAction: updateFundActionMock,
}));

import {
  ChurchFundManager,
  type ChurchFundManagerSnapshot,
  type ChurchFundManagerRequestIds,
} from "./church-fund-manager";

const CHURCH_ID = "10000000-0000-4000-8000-000000000001";
const TITHES_ID = "20000000-0000-4000-8000-000000000001";
const MISSIONS_ID = "20000000-0000-4000-8000-000000000002";
const YOUTH_ID = "20000000-0000-4000-8000-000000000003";
const BUILDING_ID = "20000000-0000-4000-8000-000000000004";

const snapshot: ChurchFundManagerSnapshot = {
  churchId: CHURCH_ID,
  fundsRevision: 9,
  funds: [
    {
      id: TITHES_ID,
      name: "Tithes",
      description: "General giving",
      status: "active",
      isDefault: true,
      sortOrder: 0,
    },
    {
      id: MISSIONS_ID,
      name: "Missions",
      description: null,
      status: "active",
      isDefault: false,
      sortOrder: 10,
    },
    {
      id: YOUTH_ID,
      name: "Youth",
      description: "Youth ministry",
      status: "active",
      isDefault: false,
      sortOrder: 20,
    },
    {
      id: BUILDING_ID,
      name: "Building Fund",
      description: "Historic building fund",
      status: "archived",
      isDefault: false,
      sortOrder: 30,
    },
  ],
};

function uuid(index: number) {
  return `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

const requestIds: ChurchFundManagerRequestIds = {
  create: uuid(1),
  funds: snapshot.funds.map((fund, index) => ({
    fundId: fund.id,
    update: uuid(index * 6 + 2),
    setDefault: uuid(index * 6 + 3),
    moveUp: uuid(index * 6 + 4),
    moveDown: uuid(index * 6 + 5),
    archive: uuid(index * 6 + 6),
    restore: uuid(index * 6 + 7),
  })),
};

function renderManager(canManage: boolean) {
  return renderToStaticMarkup(
    <ChurchFundManager
      canManage={canManage}
      requestIds={requestIds}
      snapshot={snapshot}
    />,
  );
}

describe("church fund manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockImplementation(
      (_action, initialState: ChurchFundActionState) => [
        initialState,
        "/church/campaigns",
        false,
      ],
    );
  });

  it("shows real active/default/archived configuration without financial metrics", () => {
    const markup = renderManager(false);

    expect(markup).toContain('data-funds-revision="9"');
    expect(markup).toContain("Active funds");
    expect(markup).toContain("Default fund");
    expect(markup).toContain("Archived funds");
    expect(markup).toContain("Tithes");
    expect(markup).toContain("Building Fund");
    expect(markup).toContain("read-only access");
    expect(markup).not.toContain("Create a fund");
    expect(markup).not.toContain("Demo giving");
    expect(markup).not.toContain("donor");
    expect(markup).not.toContain("raised");
  });

  it("renders owner create/edit/order/default/archive/restore controls with specific names", () => {
    const markup = renderManager(true);

    expect(markup).toContain("Create a fund");
    expect(markup).not.toContain('name="slug"');
    expect(markup).toContain("stable internal identity");
    expect(markup).toContain(`aria-label="Edit Tithes name or description"`);
    expect(markup).toContain(`aria-label="Move up Missions"`);
    expect(markup).toContain(`aria-label="Move down Missions"`);
    expect(markup).toContain(`aria-label="Make default Missions"`);
    expect(markup).toContain(`aria-label="Archive Missions"`);
    expect(markup).toContain(
      `aria-label="Edit Building Fund name or description"`,
    );
    expect(markup).toContain(`aria-label="Restore to active list Building Fund"`);
    expect(markup).not.toContain("Permanent slug");
    expect(markup).not.toContain("building-fund");
  });

  it("disables only known boundary/default actions and explains archive policy", () => {
    const markup = renderManager(true);

    expect(markup).toMatch(
      /aria-label="Move up Tithes"[^>]*disabled=""[^>]*title="Already first"/,
    );
    expect(markup).toMatch(
      /aria-label="Move down Youth"[^>]*disabled=""[^>]*title="Already last"/,
    );
    expect(markup).toMatch(
      /aria-label="Archive Tithes"[^>]*disabled=""[^>]*title="Choose another default first"/,
    );
    expect(markup).toContain("draft/active campaign");
    expect(markup).toContain("non-final recurring gift");
    expect(markup).toContain("Historical donations never block");
  });

  it("shows exact-retry guidance and restores server-authoritative fields", () => {
    useActionStateMock.mockImplementation(
      (action, initialState: ChurchFundActionState) => [
        action === createFundActionMock
          ? {
              ...initialState,
              status: "error",
              message: "The change could not be confirmed.",
              responseEpoch: 2,
              retryRequired: true,
              values: {
                name: "Youth Ministry",
                slug: "youth-ministry",
                description: "Youth giving",
              },
            }
          : initialState,
        "/church/campaigns",
        false,
      ],
    );
    const markup = renderManager(true);

    expect(markup).toContain("This request is unconfirmed");
    expect(markup).toContain("Do not change these details or reload");
    expect(markup).toContain("Retry same request");
    expect(markup).toContain('value="Youth Ministry"');
  });

  it("keeps labels/error ids unique and the responsive layout fluid", () => {
    useActionStateMock.mockImplementation(
      (action, initialState: ChurchFundActionState) => [
        action === updateFundActionMock
          ? {
              ...initialState,
              status: "error",
              message: "Check the details.",
              fieldErrors: { name: "Choose another name." },
            }
          : initialState,
        "/church/campaigns",
        false,
      ],
    );
    const markup = renderManager(true);
    const errorIds = [...markup.matchAll(/id="(fund-name-[^"]+-error)"/g)].map(
      (match) => match[1],
    );
    expect(new Set(errorIds).size).toBe(snapshot.funds.length);
    expect(errorIds).toHaveLength(snapshot.funds.length);

    const source = readFileSync(
      new URL("./church-fund-manager.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("min-w-0");
    expect(source).toContain("w-full");
    expect(source).not.toContain("min-w-[");
  });
});
