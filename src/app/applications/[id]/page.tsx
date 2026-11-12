import { ApplicationDetailPage } from "../detail";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <ApplicationDetailPage
      isStaff={false}
      id={(await params).id}
      query={await searchParams}
    />
  );
}
