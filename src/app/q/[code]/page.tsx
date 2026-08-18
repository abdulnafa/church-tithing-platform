import { notFound, redirect } from "next/navigation";
import { demoChurch, demoQrCode } from "@/lib";

export const dynamic = "force-dynamic";

export default async function GivingQrResolverPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (code !== demoQrCode) notFound();

  // A temporary redirect keeps the printed resolver stable when the church
  // slug or destination changes; scanners must not cache an old destination.
  redirect(`/give/${demoChurch.slug}`);
}
