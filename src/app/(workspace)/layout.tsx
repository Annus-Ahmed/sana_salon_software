import { redirect } from "next/navigation";
import { getActor } from "@/server/auth";
import { WorkspaceProvider } from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return <WorkspaceProvider actor={actor}>{children}</WorkspaceProvider>;
}
