import { Workspace } from "@/components/workspace";
import { getDashboardData } from "@/lib/supabase-rest";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getDashboardData();
  return <Workspace initialData={data} />;
}
