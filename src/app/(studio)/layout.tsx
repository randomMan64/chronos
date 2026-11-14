import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { StudioLayout } from "@/components/layout/studio-layout";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !user.userId) {
    redirect("/login");
  }

  return <StudioLayout>{children}</StudioLayout>;
}
