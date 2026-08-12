import { Workspace } from "@/components/workspace";
import { getDashboardData } from "@/lib/supabase-rest";

export default async function Home() {
  const data = await getDashboardData();
  return <Workspace initialData={data} />;
}
