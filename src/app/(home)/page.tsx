
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
  void trpc.twitch.topGames.prefetch({ first: 10 })
  if (categoryId) {
    void trpc.twitch.popularStreams.prefetch({ first: 50, gameId: categoryId });
  } else {
    void trpc.twitch.recommendationStreams.prefetch({ first: 50 });
  }
  return (
    <HydrateClient>
      <HomeView categoryId={categoryId}/>
      <TwitchHome categoryId={categoryId} searchTerm={search} />

    </HydrateClient>
  )
}
 
export default Page;