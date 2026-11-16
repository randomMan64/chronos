import { redirect } from "next/navigation";
import { getAuthenticatedSession } from "@/lib/auth/session";
import { StudioLayout } from "@/components/layout/studio-layout";
import { StudioLoadingSkeleton } from "@/components/shared/studio-loading-skeleton";
import * as React from "react";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getAuthenticatedSession();

  if (!session || !session.user || !session.user.id) {
    redirect("/login");
  }

  return (
    <React.Suspense fallback={<StudioLoadingSkeleton />}>
      <StudioLayout initialSession={session}>{children}</StudioLayout>
    </React.Suspense>
  );
}
