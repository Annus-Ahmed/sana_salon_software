import { Screen } from "@/components/screens";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Screen section="booking-detail" id={(await params).id} />;
}
