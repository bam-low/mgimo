import { ApplicationList } from "../../applications/list";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <ApplicationList isStaff query={await searchParams} />;
}
