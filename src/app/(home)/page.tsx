
import { HomeView } from "@/modules/home/ui/views/home-view";
import { HydrateClient, trpc } from "@/trpc/server";
import { PageClient as TwitchHome } from "@/app/(home)/client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    categoryId?: string;
    search?: string;
  }>
};

const Page = async ({ searchParams }: PageProps) => {
  const { categoryId, search } = await searchParams;
  void trpc.categories.getMany.prefetch( )
  void trpc.twitch.popularStreams.prefetch({ first: 20, language: "en" });
  return (
    <HydrateClient>
      <TwitchHome searchTerm={search} />
      <HomeView categoryId={categoryId}/>

    </HydrateClient>
  )
}
 
export default Page;