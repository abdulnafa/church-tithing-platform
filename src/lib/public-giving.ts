export type PublicGivingFund = Readonly<{
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}>;

export type PublicGivingCampaign = Readonly<{
  id: string;
  fundId: string;
  name: string;
  description: string | null;
  goalAmountMinor: string | null;
}>;

export type PublicGivingCampaignOption = Readonly<{
  id: string;
  fundId: string;
  name: string;
  description: string | null;
}>;

export type PublicGivingChurch = Readonly<{
  slug: string;
  name: string;
  currency: "BBD" | "USD" | "CAD" | "XCD";
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  thankYouMessage: string | null;
}>;

/**
 * The minimum public-giving result returned to the Server Component. The page
 * narrows this again before passing selectable targets to its Client Component.
 * It excludes tenant IDs, provider state, donor data, and donation totals.
 */
export type PublicGivingPageData = Readonly<{
  church: PublicGivingChurch;
  funds: readonly PublicGivingFund[];
  campaigns: readonly PublicGivingCampaign[];
}>;
