import { redirect } from "next/navigation";
import { getActor } from "@/server/auth";
import { Login } from "@/components/login";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await getActor()) redirect("/dashboard");
  return <Login demo={process.env.DEMO_MODE === "true"} />;
}
