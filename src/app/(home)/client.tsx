"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { trpc } from "@/trpc/client";
import { SaveChannelButton } from "@/modules/home/ui/components/save-channel-button";

function formatDate(date: string) {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));
}

function formatDurationSince(date: string, now: number | null) {
    if (now === null) return null;

    const elapsedMinutes = Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000));
    if (elapsedMinutes < 60) return `${elapsedMinutes}m`;
    return `${Math.floor(elapsedMinutes / 60)}h`;
}

function getThumbnailUrl(url: string) {
    return url
        .replace(/%?\{width\}/g, "640")
        .replace(/%?\{height\}/g, "360");
}

interface TwitchHomeProps {
    searchTerm?: string;
    categoryId?: string;
    subscriptions?: boolean;
    trending?: boolean;
}

export const PageClient = ({ searchTerm, categoryId, subscriptions = false, trending = false }: TwitchHomeProps) => {
    const { isLoaded, isSignedIn } = useAuth();
    const [now, setNow] = useState<number | null>(null);
    const [sortMode, setSortMode] = useState<"recommended" | "viewers-desc" | "viewers-asc">("recommended");
    const [refreshStatus, setRefreshStatus] = useState<"idle" | "pending" | "queued">("idle");
    const [refreshError, setRefreshError] = useState<string | null>(null);
    const { mutate: gatherPublicData } = trpc.twitch.gatherPublicData.useMutation();
    const { mutate: gatherUserData } = trpc.twitch.gatherUserData.useMutation();
    const trpcUtils = trpc.useUtils();

    useEffect(() => {
        const updateNow = () => setNow(Date.now());
        updateNow();
        const interval = window.setInterval(updateNow, 15_000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!isLoaded || subscriptions || categoryId || searchTerm || trending) return;

        gatherPublicData(undefined, {
            onSuccess: () => trpcUtils.twitch.recommendationStreams.invalidate(),
        });
    }, [isLoaded, subscriptions, categoryId, searchTerm, trending, gatherPublicData, trpcUtils.twitch.recommendationStreams]);

    useEffect(() => {
        if (!isLoaded || !isSignedIn || subscriptions || categoryId || searchTerm || trending) return;

        gatherUserData();
        const interval = window.setInterval(gatherUserData, 5 * 60 * 1000);
        return () => window.clearInterval(interval);
    }, [isLoaded, isSignedIn, subscriptions, categoryId, searchTerm, trending, gatherUserData]);

    useEffect(() => {
        setSortMode(categoryId || subscriptions || trending ? "viewers-desc" : "recommended");
    }, [categoryId, subscriptions, trending]);

    const followedChannelsQuery = trpc.twitch.followedChannels.useQuery(
        { first: 20 },
        { enabled: isSignedIn === true && subscriptions, retry: false },
    );
    const followedStreamsQuery = trpc.twitch.followedStreams.useQuery(
        { first: 20 },
        {
            enabled: isSignedIn === true && subscriptions,
            retry: false,
            refetchInterval: 15_000,
            refetchOnWindowFocus: true,
        },
    );
    const recommendationStreamsQuery = trpc.twitch.recommendationStreams.useQuery(
        { first: 50 },
        {
            enabled: !searchTerm && !subscriptions && !categoryId,
            refetchInterval: 15_000,
            refetchOnWindowFocus: true,
        },
    );
    const popularStreamsQuery = trpc.twitch.popularStreams.useQuery(
        { first: 50, gameId: categoryId },
        {
            enabled: !searchTerm && !subscriptions && (Boolean(categoryId) || trending),
            refetchInterval: 15_000,
            refetchOnWindowFocus: true,
        },
    );
    const normalizedSearchTerm = searchTerm?.trim().replace(/^@/, "").toLowerCase();
    const channelSearchQuery = trpc.twitch.searchChannels.useQuery(
        { query: normalizedSearchTerm ?? "", first: 20 },
        { enabled: Boolean(normalizedSearchTerm) },
    );
    const categorySearchQuery = trpc.twitch.searchCategories.useQuery(
        { query: normalizedSearchTerm ?? "", first: 6 },
        { enabled: Boolean(normalizedSearchTerm) },
    );
    const exactChannelMatch = channelSearchQuery.data?.data.find(
        (channel) => channel.display_name.toLowerCase() === normalizedSearchTerm,
    );
    const videosQuery = trpc.twitch.videos.useQuery(
        { userLogin: exactChannelMatch?.display_name.toLowerCase() ?? "", first: 20, sort: "time" },
        { enabled: Boolean(exactChannelMatch) },
    );
    const liveStreamsQuery = subscriptions
        ? followedStreamsQuery
        : categoryId || trending
            ? popularStreamsQuery
            : recommendationStreamsQuery;
    const activeSortMode = (categoryId || subscriptions || trending) && sortMode === "recommended" ? "viewers-desc" : sortMode;
    const sortedStreams = useMemo(() => {
        const streams = liveStreamsQuery.data?.data ?? [];
        if (activeSortMode === "recommended") return streams;

        return [...streams].sort((a, b) =>
            activeSortMode === "viewers-desc"
                ? b.viewer_count - a.viewer_count
                : a.viewer_count - b.viewer_count,
        );
    }, [activeSortMode, liveStreamsQuery.data]);

    const refreshRecommendations = async () => {
        setRefreshStatus("pending");
        setRefreshError(null);

        try {
            const response = await fetch("/api/recommendations/refresh", { method: "POST" });
            if (!response.ok) {
                const result = await response.json() as { error?: string };
                throw new Error(result.error ?? `Refresh request failed (${response.status}).`);
            }
            setRefreshStatus("queued");
        } catch (error) {
            setRefreshStatus("idle");
            setRefreshError(error instanceof Error ? error.message : "Unable to refresh recommendations.");
        }
    };

    return (
        <section className="border-b border-slate-200 bg-white text-slate-950">
            <div className="mx-auto max-w-[2400px] px-4 pt-3 pb-8">
                {!searchTerm && <div className={subscriptions ? "mt-6" : ""}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold">
                            {subscriptions
                                ? "Live now"
                                : trending
                                    ? "Trending live now"
                                    : categoryId
                                        ? "Live streams in this category"
                                        : "Recommended to you"}
                        </h2>
                        <div className="flex items-center gap-3">
                            {liveStreamsQuery.data && (
                                <span className="text-sm text-slate-500">
                                    {liveStreamsQuery.data.data.length} channel{liveStreamsQuery.data.data.length === 1 ? "" : "s"}
                                </span>
                            )}
                            {!subscriptions && !categoryId && !trending && isSignedIn && (
                                <button
                                    type="button"
                                    className="border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={refreshStatus !== "idle"}
                                    onClick={refreshRecommendations}
                                >
                                    {refreshStatus === "pending"
                                        ? "Queueing refresh..."
                                        : refreshStatus === "queued"
                                            ? "Refresh queued"
                                            : "Refresh recommendations"}
                                </button>
                            )}
                            {liveStreamsQuery.data && liveStreamsQuery.data.data.length > 0 && (
                                <select
                                    aria-label="Sort streams"
                                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={activeSortMode}
                                    onChange={(event) => {
                                        const value = event.currentTarget.value;
                                        if (value === "recommended" || value === "viewers-desc" || value === "viewers-asc") {
                                            setSortMode(value);
                                        }
                                    }}
                                >
                                    {!categoryId && !subscriptions && !trending && <option value="recommended">Recommended</option>}
                                    <option value="viewers-desc">Viewers: high to low</option>
                                    <option value="viewers-asc">Viewers: low to high</option>
                                </select>
                            )}
                        </div>
                    </div>

                    {refreshError && (
                        <p className="mb-3 text-sm text-red-600" role="alert">
                            {refreshError}
                        </p>
                    )}
                    {refreshStatus === "queued" && (
                        <p className="mb-3 text-sm text-slate-500" role="status">
                            The refresh workflow was queued. Updated recommendations will appear when it finishes.
                        </p>
                    )}

                    {liveStreamsQuery.isLoading && (
                        <p className="mt-3 text-sm text-slate-500">
                            {subscriptions
                                ? "Checking your followed channels for live streams..."
                                : trending
                                    ? "Loading trending live streams..."
                                : categoryId
                                    ? "Loading live streams in this category..."
                                    : "Loading recommendations..."}
                        </p>
                    )}

                    {liveStreamsQuery.isError && (
                        <p className="mt-3 text-sm text-slate-500">
                            {subscriptions && liveStreamsQuery.error.message.includes("Connect your Twitch")
                                ? "Connect Twitch above to see who is live."
                                : liveStreamsQuery.error.message}
                        </p>
                    )}

                    {liveStreamsQuery.data && liveStreamsQuery.data.data.length === 0 && (
                        <div className="mt-3 border border-slate-200 bg-slate-50 px-5 py-6">
                            <p className="font-medium">
                                {subscriptions ? "Nobody you follow is live right now." : "No live streams are available right now."}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">This section updates automatically.</p>
                        </div>
                    )}

                    {liveStreamsQuery.data && sortedStreams.length > 0 && (
                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {sortedStreams.map((stream) => (
                                <article
                                    className="group overflow-hidden rounded-md border border-slate-200 bg-white hover:border-slate-400"
                                    key={stream.id}
                                >
                                    <div className="relative aspect-video overflow-hidden bg-slate-100">
                                        <a
                                            className="block h-full"
                                            href={`/watch/stream/${encodeURIComponent(stream.user_login)}`}
                                        >
                                            <Image
                                                alt={`${stream.user_name} live on Twitch`}
                                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                                height={360}
                                                sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                                                src={getThumbnailUrl(stream.thumbnail_url)}
                                                width={640}
                                            />
                                            <span className="absolute left-2 top-2 rounded-sm bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                                                LIVE
                                            </span>
                                        </a>
                                        <SaveChannelButton
                                            broadcasterId={stream.user_id}
                                            login={stream.user_login}
                                            displayName={stream.user_name}
                                            className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                                        />
                                    </div>
                                    <a
                                        className="block p-4"
                                        href={`/watch/stream/${encodeURIComponent(stream.user_login)}`}
                                    >
                                        <h3 className="line-clamp-2 font-medium group-hover:text-slate-600">{stream.title}</h3>
                                        <p className="mt-2 text-sm text-slate-600">{stream.user_name} · {stream.game_name || "Just Chatting"}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {stream.viewer_count.toLocaleString("en-US")} viewers
                                            {now !== null && ` · live ${formatDurationSince(stream.started_at, now)}`}
                                        </p>
                                    </a>
                                </article>
                            ))}
                        </div>
                    )}
                </div>}

                {subscriptions && followedChannelsQuery.data && followedChannelsQuery.data.data.length > 0 && (
                    <div className="mt-10 border-t border-slate-200 pt-7">
                        <h2 className="text-lg font-semibold">Your followed channels</h2>
                        <div className="mt-4 flex flex-wrap gap-3">
                            {followedChannelsQuery.data.data.map((channel) => (
                                <a
                                    className="border border-slate-200 px-3 py-2 text-sm hover:border-slate-400"
                                    href={`https://www.twitch.tv/${encodeURIComponent(channel.broadcaster_login)}`}
                                    key={channel.broadcaster_id}
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    {channel.broadcaster_name}
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                {searchTerm && (
                    <div>
                        {categorySearchQuery.isError && (
                            <p className="mb-4 text-sm text-red-600" role="alert">{categorySearchQuery.error.message}</p>
                        )}
                        {categorySearchQuery.data && categorySearchQuery.data.data.length > 0 && (
                            <section className="mb-8">
                                <h2 className="mb-3 text-lg font-semibold">Categories matching “{searchTerm}”</h2>
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {categorySearchQuery.data.data.map((category) => (
                                        <a
                                            className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 hover:border-slate-400"
                                            href={`/?${new URLSearchParams({ categoryId: category.id }).toString()}`}
                                            key={category.id}
                                        >
                                            <Image
                                                alt=""
                                                className="size-14 rounded-sm object-cover"
                                                height={56}
                                                src={category.box_art_url
                                                    .replace(/%?\{width\}/g, "112")
                                                    .replace(/%?\{height\}/g, "112")}
                                                width={56}
                                            />
                                            <span className="font-medium">{category.name}</span>
                                        </a>
                                    ))}
                                </div>
                            </section>
                        )}

                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Channels matching “{searchTerm}”</h2>
                            {channelSearchQuery.isLoading && <span className="text-sm text-slate-500">Searching...</span>}
                        </div>

                        {channelSearchQuery.isError && (
                            <p className="text-sm text-red-600" role="alert">{channelSearchQuery.error.message}</p>
                        )}
                        {channelSearchQuery.data && channelSearchQuery.data.data.length === 0 && (
                            <p className="text-sm text-slate-500">No channels found for “{searchTerm}”.</p>
                        )}
                        {channelSearchQuery.data && channelSearchQuery.data.data.length > 0 && (
                            <div className="space-y-3">
                                {channelSearchQuery.data.data.map((channel) => {
                                    const channelHref = `/watch/stream/${encodeURIComponent(channel.display_name.toLowerCase())}`;
                                    const twitchChannelHref = `https://www.twitch.tv/${encodeURIComponent(channel.display_name.toLowerCase())}`;

                                    if (channel.is_live) {
                                        return (
                                            <article
                                                className="grid overflow-hidden rounded-md border border-slate-200 bg-white hover:border-slate-400 sm:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[minmax(400px,50%)_1fr]"
                                                key={channel.id}
                                            >
                                                <a
                                                    className="group relative block aspect-video overflow-hidden bg-slate-100 sm:aspect-auto sm:self-stretch"
                                                    href={channelHref}
                                                >
                                                    <Image
                                                        alt={`${channel.display_name} live stream`}
                                                        className="object-cover"
                                                        fill
                                                        sizes="(min-width: 1024px) 50vw, (min-width: 640px) 280px, 100vw"
                                                        src={getThumbnailUrl(channel.stream?.thumbnail_url ?? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(channel.display_name.toLowerCase())}-640x360.jpg`)}
                                                    />
                                                    <span className="absolute left-2 top-2 rounded-sm bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                                                        LIVE
                                                    </span>
                                                </a>
                                                <div className="min-w-0 p-3">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <a className="flex min-w-0 items-center gap-3" href={channelHref}>
                                                            <Image
                                                                alt=""
                                                                className="size-10 shrink-0 rounded-full object-cover"
                                                                height={40}
                                                                src={channel.thumbnail_url}
                                                                width={40}
                                                            />
                                                            <div className="min-w-0">
                                                                <h3 className="truncate text-lg font-semibold group-hover:text-slate-600">
                                                                    {channel.display_name}
                                                                </h3>
                                                                <p className="text-sm text-slate-500">Live now</p>
                                                            </div>
                                                        </a>
                                                        <SaveChannelButton
                                                            broadcasterId={channel.id}
                                                            login={channel.display_name.toLowerCase()}
                                                            displayName={channel.display_name}
                                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                                        />
                                                    </div>

                                                    <div className="mt-2 space-y-1 border-t border-slate-100 pt-1">
                                                        <p className="line-clamp-2 font-medium text-slate-900">
                                                            {channel.stream?.title || channel.title || "Live stream"}
                                                        </p>
                                                        <p className="text-sm text-slate-600">
                                                            {channel.stream?.game_name || channel.game_name || "Just Chatting"}
                                                        </p>
                                                        {channel.stream && (
                                                            <p className="text-xs text-slate-500">
                                                                {channel.stream.viewer_count.toLocaleString("en-US")} viewers
                                                                {now !== null && ` · live ${formatDurationSince(channel.stream.started_at, now)}`}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    }

                                    return (
                                        <article
                                            className="relative flex min-h-24 items-center rounded-md border border-slate-200 bg-white p-3 pr-28 hover:border-slate-400"
                                            key={channel.id}
                                        >
                                            <a
                                                className="group flex min-w-0 items-center gap-3"
                                                href={twitchChannelHref}
                                                rel="noreferrer"
                                                target="_blank"
                                            >
                                                <Image
                                                    alt={`${channel.display_name} profile`}
                                                    className="size-14 shrink-0 rounded-full object-cover sm:size-16"
                                                    height={64}
                                                    src={channel.thumbnail_url}
                                                    width={64}
                                                />
                                                <div className="min-w-0">
                                                    <h3 className="font-semibold group-hover:text-slate-600">{channel.display_name}</h3>
                                                    <p className="mt-1 text-sm text-slate-500">Offline</p>
                                                    {channel.title && <p className="mt-1 line-clamp-1 text-sm text-slate-700 sm:line-clamp-2">{channel.title}</p>}
                                                </div>
                                            </a>
                                            <SaveChannelButton
                                                broadcasterId={channel.id}
                                                login={channel.display_name.toLowerCase()}
                                                displayName={channel.display_name}
                                                className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                                            />
                                        </article>
                                    );
                                })}
                            </div>
                        )}

                        {exactChannelMatch && (
                            <div className="mt-10 border-t border-slate-200 pt-7">
                                <h2 className="mb-4 text-lg font-semibold">Recent videos from {exactChannelMatch.display_name}</h2>
                                {videosQuery.isLoading && <p className="text-sm text-slate-500">Loading videos...</p>}
                                {videosQuery.isError && (
                                    <p className="text-sm text-red-600" role="alert">{videosQuery.error.message}</p>
                                )}
                                {videosQuery.data?.data.length === 0 && (
                                    <p className="text-sm text-slate-500">No videos found for {exactChannelMatch.display_name}.</p>
                                )}
                                {videosQuery.data && videosQuery.data.data.length > 0 && (
                                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {videosQuery.data.data.map((video) => (
                                            <a
                                                className="group overflow-hidden rounded-md border border-slate-200 hover:border-slate-400"
                                                href={`/watch/video/${encodeURIComponent(video.id)}`}
                                                key={video.id}
                                            >
                                                <Image
                                                    alt={video.title}
                                                    className="aspect-video w-full object-cover"
                                                    height={360}
                                                    sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                                                    src={getThumbnailUrl(video.thumbnail_url)}
                                                    width={640}
                                                />
                                                <div className="p-4">
                                                    <h3 className="line-clamp-2 font-medium group-hover:text-slate-600">{video.title}</h3>
                                                    <p className="mt-2 text-sm text-slate-500">
                                                        {video.view_count.toLocaleString()} views · {formatDate(video.published_at)}
                                                    </p>
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
};
