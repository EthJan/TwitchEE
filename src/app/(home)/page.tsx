
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
  const queries = [trpc.twitch.topGames.prefetch({ first: 10 })];
  if (!search) {
    queries.push(
      categoryId
        ? trpc.twitch.popularStreams.prefetch({ first: 50, gameId: categoryId })
        : trpc.twitch.recommendationStreams.prefetch({ first: 50 }),
    );
  }
  await Promise.all(queries);
  return (
    <HydrateClient>
      {!search && <HomeView categoryId={categoryId}/>}
      <TwitchHome categoryId={categoryId} searchTerm={search} />

    </HydrateClient>
  )
}
 
export default Page;