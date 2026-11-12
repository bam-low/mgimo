import { ApplicationList } from "./list";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return <ApplicationList isStaff={false} query={await searchParams} />;
}
