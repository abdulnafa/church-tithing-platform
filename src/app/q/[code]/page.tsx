import { notFound, permanentRedirect } from "next/navigation";
import { demoChurch, demoQrCode } from "@/lib";

export function generateStaticParams() {
  return [{ code: demoQrCode }];
}

export default async function GivingQrResolverPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (code !== demoQrCode) notFound();

  permanentRedirect(`/give/${demoChurch.slug}`);
}
