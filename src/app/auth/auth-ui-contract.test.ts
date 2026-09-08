import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("authentication UI contract", () => {
  it("contains no demo credentials or client-side role bypass", () => {
    const loginForm = source("src/components/login-form.tsx");

    expect(loginForm).not.toContain("demo-password");
    expect(loginForm).not.toContain("alicia.clarke@example.com");
    expect(loginForm).not.toContain("Preview as");
    expect(loginForm).not.toContain('name="role"');
    expect(loginForm).not.toContain("router.push");
    expect(loginForm).toContain("signInAction");
    expect(loginForm).toContain('href="/forgot-password"');
  });

  it("replaces fake workspace navigation with real sign-out forms", () => {
    const dashboardShell = source("src/components/dashboard-shell.tsx");

    expect(dashboardShell).not.toContain("Switch demo role");
    expect(dashboardShell).not.toContain("Exit demo");
    expect(dashboardShell).toContain("signOutAction");
    expect(dashboardShell.match(/action=\{signOutAction\}/g)).toHaveLength(2);
  });

  it("provides recovery, reset and fixed authentication error pages", () => {
    expect(source("src/app/forgot-password/page.tsx")).toContain(
      "PasswordResetRequestForm",
    );
    expect(source("src/app/reset-password/page.tsx")).toContain(
      "UpdatePasswordForm",
    );
    expect(source("src/app/auth/error/page.tsx")).toContain(
      'href="/forgot-password"',
    );
  });
});
