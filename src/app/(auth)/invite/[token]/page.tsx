import { redirect } from "next/navigation";

export default async function InviteDynamicPage(props: {
  params: Promise<{ token: string }>;
}) {
  const params = await props.params;
  redirect(`/invite/accept?token=${encodeURIComponent(params.token)}`);
}
