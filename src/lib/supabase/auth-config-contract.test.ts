import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(
  resolve(process.cwd(), "supabase/config.toml"),
  "utf8",
);
const confirmationTemplate = readFileSync(
  resolve(process.cwd(), "supabase/templates/confirmation.html"),
  "utf8",
);
const recoveryTemplate = readFileSync(
  resolve(process.cwd(), "supabase/templates/recovery.html"),
  "utf8",
);

function section(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = config.match(
    new RegExp(`^\\[${escapedName}\\]\\r?\\n([\\s\\S]*?)(?=^\\[|\\Z)`, "m"),
  );

  if (!match?.[1]) throw new Error(`Missing [${name}] in supabase/config.toml`);
  return match[1];
}

describe("local Supabase Auth configuration", () => {
  it("uses exact trusted local callback URLs and hardened session settings", () => {
    const auth = section("auth");

    expect(auth).toContain('site_url = "http://localhost:3000"');
    expect(auth).toContain(
      'additional_redirect_urls = ["http://localhost:3000/auth/confirm", "http://127.0.0.1:3000/auth/confirm"]',
    );
    expect(auth).toContain("jwt_expiry = 3600");
    expect(auth).toContain("enable_refresh_token_rotation = true");
    expect(auth).toContain("refresh_token_reuse_interval = 10");
    expect(auth).toContain("enable_signup = false");
    expect(auth).toContain("enable_anonymous_sign_ins = false");
    expect(auth).toContain("enable_manual_linking = false");
    expect(auth).toContain("minimum_password_length = 8");
  });

  it("requires verified email and disables public email and phone signup", () => {
    const email = section("auth.email");
    const phone = section("auth.sms");

    expect(email).toContain("enable_signup = false");
    expect(email).toContain("enable_confirmations = true");
    expect(email).toContain("secure_password_change = true");
    expect(email).toContain('max_frequency = "60s"');
    expect(phone).toContain("enable_signup = false");
  });

  it("routes local confirmation and recovery emails through token-hash callbacks", () => {
    expect(section("auth.email.template.confirmation")).toContain(
      'content_path = "./supabase/templates/confirmation.html"',
    );
    expect(section("auth.email.template.recovery")).toContain(
      'content_path = "./supabase/templates/recovery.html"',
    );
    expect(confirmationTemplate).toContain(
      "/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup",
    );
    expect(recoveryTemplate).toContain(
      "/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery",
    );
    expect(confirmationTemplate).not.toContain("{{ .ConfirmationURL }}");
    expect(recoveryTemplate).not.toContain("{{ .ConfirmationURL }}");
  });
});
