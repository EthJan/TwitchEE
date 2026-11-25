import { PageClient as TwitchHome } from "@/app/(home)/client";
import { HydrateClient, trpc } from "@/trpc/server";

export const dynamic = "force-dynamic";

export default async function TrendingPage() {
    await trpc.twitch.popularStreams.prefetch({ first: 50 });

    return (
        <HydrateClient>
            <TwitchHome trending />
        </HydrateClient>
    );
}
