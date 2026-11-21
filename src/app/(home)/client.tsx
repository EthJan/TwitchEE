"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { trpc } from "@/trpc/client";

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
}

export const PageClient = ({ searchTerm, categoryId, subscriptions = false }: TwitchHomeProps) => {
    const { isLoaded, isSignedIn } = useAuth();
    const [now, setNow] = useState<number | null>(null);
    const [sortMode, setSortMode] = useState<"recommended" | "viewers-desc" | "viewers-asc">("recommended");
    const { mutate: gatherPublicData } = trpc.twitch.gatherPublicData.useMutation();
    const { mutate: gatherUserData } = trpc.twitch.gatherUserData.useMutation();
    const trpcUtils = trpc.useUtils();

    useEffect(() => {
        const updateNow = () => setNow(Date.now());
        updateNow();
        const interval = window.setInterval(updateNow, 30_000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!isLoaded || subscriptions || categoryId) return;

        gatherPublicData(undefined, {
            onSuccess: () => trpcUtils.twitch.recommendationStreams.invalidate(),
        });
    }, [isLoaded, subscriptions, categoryId, gatherPublicData, trpcUtils.twitch.recommendationStreams]);

    useEffect(() => {
        if (isSignedIn) gatherUserData();
    }, [isSignedIn, gatherUserData]);

    useEffect(() => {
        setSortMode(categoryId ? "viewers-desc" : "recommended");
    }, [categoryId]);

    const followedChannelsQuery = trpc.twitch.followedChannels.useQuery(
        { first: 20 },
        { enabled: isSignedIn === true && subscriptions, retry: false },
    );
    const followedStreamsQuery = trpc.twitch.followedStreams.useQuery(
        { first: 20 },
        {
            enabled: isSignedIn === true && subscriptions,
            retry: false,
            refetchInterval: 30_000,
            refetchOnWindowFocus: true,
        },
    );
    const recommendationStreamsQuery = trpc.twitch.recommendationStreams.useQuery(
        { first: 50 },
        {
            enabled: !subscriptions && !categoryId,
            refetchInterval: 30_000,
            refetchOnWindowFocus: true,
        },
    );
    const categoryStreamsQuery = trpc.twitch.popularStreams.useQuery(
        { first: 50, gameId: categoryId },
        {
            enabled: !subscriptions && Boolean(categoryId),
            refetchInterval: 30_000,
            refetchOnWindowFocus: true,
        },
    );
    const videosQuery = trpc.twitch.videos.useQuery(
        { userLogin: searchTerm ?? "", first: 20, sort: "time" },
        { enabled: Boolean(searchTerm) },
    );
    const liveStreamsQuery = subscriptions
        ? followedStreamsQuery
        : categoryId
            ? categoryStreamsQuery
            : recommendationStreamsQuery;
    const isTwitchConnected = subscriptions && followedChannelsQuery.isSuccess;
    const activeSortMode = categoryId && sortMode === "recommended" ? "viewers-desc" : sortMode;
    const sortedStreams = useMemo(() => {
        const streams = liveStreamsQuery.data?.data ?? [];
        if (activeSortMode === "recommended") return streams;

        return [...streams].sort((a, b) =>
            activeSortMode === "viewers-desc"
                ? b.viewer_count - a.viewer_count
                : a.viewer_count - b.viewer_count,
        );
    }, [activeSortMode, liveStreamsQuery.data]);

    return (
        <section className="border-b border-slate-200 bg-white text-slate-950">
            <div className="mx-auto max-w-[2400px] px-4 py-8">
                {subscriptions && isSignedIn && (
                    <div className="flex justify-end">
                        {isTwitchConnected ? (
                            <span className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                                Twitch connected
                            </span>
                        ) : (
                            <a
                                className="bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                                href="/api/twitch/connect"
                            >
                                Connect Twitch
                            </a>
                        )}
                    </div>
                )}

                <div className={subscriptions ? "mt-6" : ""}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-lg font-semibold">
                            {subscriptions ? "Live now" : categoryId ? "Live streams in this category" : "Recommended to you"}
                        </h2>
                        <div className="flex items-center gap-3">
                            {liveStreamsQuery.data && (
                                <span className="text-sm text-slate-500">
                                    {liveStreamsQuery.data.data.length} channel{liveStreamsQuery.data.data.length === 1 ? "" : "s"}
                                </span>
                            )}
                            {liveStreamsQuery.data && liveStreamsQuery.data.data.length > 0 && (
                                <select
                                    aria-label="Sort streams"
                                    className="border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={activeSortMode}
                                    onChange={(event) => {
                                        const value = event.currentTarget.value;
                                        if (value === "recommended" || value === "viewers-desc" || value === "viewers-asc") {
                                            setSortMode(value);
                                        }
                                    }}
                                >
                                    {!categoryId && <option value="recommended">Recommended</option>}
                                    <option value="viewers-desc">Viewers: high to low</option>
                                    <option value="viewers-asc">Viewers: low to high</option>
                                </select>
                            )}
                        </div>
                    </div>

                    {liveStreamsQuery.isLoading && (
                        <p className="mt-3 text-sm text-slate-500">
                            {subscriptions
                                ? "Checking your followed channels for live streams..."
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
                                <a
                                    className="group overflow-hidden border border-slate-200 bg-white hover:border-slate-400"
                                    href={`/watch/stream/${encodeURIComponent(stream.user_login)}`}
                                    key={stream.id}
                                >
                                    <div className="relative aspect-video overflow-hidden bg-slate-100">
                                        <Image
                                            alt={`${stream.user_name} live on Twitch`}
                                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                            height={360}
                                            sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                                            src={getThumbnailUrl(stream.thumbnail_url)}
                                            width={640}
                                        />
                                        <span className="absolute left-2 top-2 bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                                            LIVE
                                        </span>
                                    </div>
                                    <div className="p-4">
                                        <h3 className="line-clamp-2 font-medium group-hover:text-slate-600">{stream.title}</h3>
                                        <p className="mt-2 text-sm text-slate-600">{stream.user_name} · {stream.game_name || "Just Chatting"}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {stream.viewer_count.toLocaleString("en-US")} viewers
                                            {now !== null && ` · live ${formatDurationSince(stream.started_at, now)}`}
                                        </p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </div>

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
                    <div className="mt-10 border-t border-slate-200 pt-7">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold">Videos from @{searchTerm}</h2>
                            {videosQuery.isLoading && <span className="text-sm text-slate-500">Loading...</span>}
                        </div>

                        {videosQuery.isError && <p className="text-sm text-red-600">{videosQuery.error.message}</p>}
                        {videosQuery.data && videosQuery.data.data.length === 0 && (
                            <p className="text-sm text-slate-500">No videos found for @{searchTerm}.</p>
                        )}
                        {videosQuery.data && videosQuery.data.data.length > 0 && (
                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {videosQuery.data.data.map((video) => (
                                    <a
                                        className="group overflow-hidden border border-slate-200 hover:border-slate-400"
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
        </section>
    );
};
