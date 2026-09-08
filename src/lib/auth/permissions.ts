export const CHURCH_PERMISSION_VALUES = [
  "workspace_read",
  "funds_read",
  "funds_manage",
  "campaigns_read",
  "campaigns_manage",
  "qr_read",
  "settings_manage",
  "staff_manage",
  "provider_manage",
  "audit_read",
  "billing_manage",
  "financial_read",
  "members_read",
  "reports_read",
  "reports_export",
  "receipts_read",
  "statements_read",
  "provider_status_read",
  "email_status_read",
  "prayer_requests_review",
] as const;

export type ChurchPermission = (typeof CHURCH_PERMISSION_VALUES)[number];

const CHURCH_PERMISSION_SET = new Set<string>(CHURCH_PERMISSION_VALUES);

/** Normalize an untrusted RPC payload into the canonical permission order. */
export function normalizeChurchPermissions(
  value: unknown,
): readonly ChurchPermission[] {
  if (!Array.isArray(value)) return [];

  if (
    value.some(
      (permission) =>
        typeof permission !== "string" ||
        !CHURCH_PERMISSION_SET.has(permission),
    )
  ) {
    return [];
  }

  const granted = new Set(value as readonly ChurchPermission[]);

  return CHURCH_PERMISSION_VALUES.filter((permission) =>
    granted.has(permission),
  );
}

export function hasChurchPermission(
  permissions: unknown,
  required: ChurchPermission,
) {
  return normalizeChurchPermissions(permissions).includes(required);
}

export function hasEveryChurchPermission(
  permissions: unknown,
  required: readonly ChurchPermission[],
) {
  const granted = normalizeChurchPermissions(permissions);

  return (
    required.length > 0 &&
    required.every((permission) => granted.includes(permission))
  );
}

export function hasAnyChurchPermission(
  permissions: unknown,
  required: readonly ChurchPermission[],
) {
  const granted = normalizeChurchPermissions(permissions);

  return (
    required.length > 0 &&
    required.some((permission) => granted.includes(permission))
  );
}
