"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatDuration(duration: string) {
    const parts = duration.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    if (!parts) return duration;

    const hours = Number(parts[1] ?? 0);
    const minutes = Number(parts[2] ?? 0);
    const seconds = Number(parts[3] ?? 0);
    return [hours > 0 ? `${hours}h` : null, `${minutes}m`, `${seconds}s`]
        .filter(Boolean)
        .join(" ");
}

function formatDate(date: string) {
    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
    }).format(new Date(date));
}

function formatFollowedDate(date: string) {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(date));
}

export const PageClient = () => {
    const { isSignedIn } = useAuth();
    const [login, setLogin] = useState("");
    const [submittedLogin, setSubmittedLogin] = useState("");
    const followedChannelsQuery = trpc.twitch.followedChannels.useQuery(
        { first: 20 },
        { enabled: isSignedIn === true, retry: false },
    );
    const isTwitchConnected = followedChannelsQuery.isSuccess;
    const videosQuery = trpc.twitch.videos.useQuery(
        { userLogin: submittedLogin, first: 20, sort: "time" },
        { enabled: Boolean(submittedLogin) },
    );

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedLogin = login.trim().replace(/^@/, "");
        if (normalizedLogin) setSubmittedLogin(normalizedLogin);
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] bg-zinc-950 px-6 py-10 text-zinc-100">
            <div className="mx-auto max-w-6xl">
                <div className="mb-10 max-w-2xl">
                    <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-orange-400">
                        Twitch video explorer
                    </p>
                    <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                        Find the latest videos from any channel.
                    </h1>
                    <p className="mt-4 text-zinc-400">
                        This page is connected to Twitch through the server-side Helix client.
                    </p>
                </div>

                <section className="mb-12 border border-zinc-800 bg-zinc-900/70 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium uppercase tracking-[0.2em] text-orange-400">
                                Your follows
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold">Channels you follow on Twitch</h2>
                        </div>
                        {isSignedIn && isTwitchConnected ? (
                            <span className="border border-emerald-500/50 px-4 py-2 text-sm font-medium text-emerald-400">
                                Twitch connected
                            </span>
                        ) : isSignedIn ? (
                            <a
                                className="border border-orange-500 px-4 py-2 text-sm font-medium text-orange-400 hover:bg-orange-500 hover:text-black"
                                href="/api/twitch/connect"
                            >
                                Connect Twitch
                            </a>
                        ) : (
                            <Link
                                className="border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-orange-500 hover:text-orange-400"
                                href="/sign-in"
                            >
                                Sign in to connect
                            </Link>
                        )}
                    </div>

                    {!isSignedIn && (
                        <p className="mt-5 text-sm text-zinc-400">
                            Sign in first, then connect your Twitch account to load your followed channels.
                        </p>
                    )}

                    {isSignedIn && followedChannelsQuery.isLoading && (
                        <p className="mt-5 text-sm text-zinc-400">Loading your followed channels...</p>
                    )}

                    {isSignedIn && followedChannelsQuery.isError && (
                        <p className="mt-5 text-sm text-zinc-400">
                            {followedChannelsQuery.error.message.includes("Connect your Twitch")
                                ? "Connect Twitch above to load your followed channels."
                                : followedChannelsQuery.error.message}
                        </p>
                    )}

                    {followedChannelsQuery.data && followedChannelsQuery.data.data.length === 0 && (
                        <p className="mt-5 text-sm text-zinc-400">You are not following any channels yet.</p>
                    )}

                    {followedChannelsQuery.data && followedChannelsQuery.data.data.length > 0 && (
                        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {followedChannelsQuery.data.data.map((channel) => (
                                <a
                                    className="border border-zinc-800 p-4 hover:border-orange-500"
                                    href={`https://www.twitch.tv/${encodeURIComponent(channel.broadcaster_login)}`}
                                    key={channel.broadcaster_id}
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    <p className="font-medium text-zinc-100">{channel.broadcaster_name}</p>
                                    <p className="mt-1 text-sm text-zinc-500">
                                        Followed {formatFollowedDate(channel.followed_at)}
                                    </p>
                                </a>
                            ))}
                        </div>
                    )}
                </section>

                <form className="mb-10 flex max-w-xl gap-3" onSubmit={handleSubmit}>
                    <Input
                        aria-label="Twitch channel login"
                        className="h-11 border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                        onChange={(event) => setLogin(event.target.value)}
                        placeholder="Enter a Twitch username"
                        value={login}
                    />
                    <Button className="h-11 shrink-0 bg-orange-500 text-black hover:bg-orange-400" type="submit">
                        Search videos
                    </Button>
                </form>

                {videosQuery.isLoading && (
                    <p className="text-zinc-400">Loading videos for @{submittedLogin}...</p>
                )}

                {videosQuery.isError && (
                    <div className="border border-red-900 bg-red-950/40 p-4 text-red-200">
                        {videosQuery.error.message}
                    </div>
                )}

                {!submittedLogin && !videosQuery.isLoading && (
                    <p className="text-zinc-500">Try a channel such as `twitch` or `riotgamesinc`.</p>
                )}

                {videosQuery.data && videosQuery.data.data.length === 0 && (
                    <p className="text-zinc-400">No videos were found for @{submittedLogin}.</p>
                )}

                {videosQuery.data && videosQuery.data.data.length > 0 && (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {videosQuery.data.data.map((video) => (
                            <a
                                className="group overflow-hidden border border-zinc-800 bg-zinc-900 transition-colors hover:border-orange-500"
                                href={video.url}
                                key={video.id}
                                rel="noreferrer"
                                target="_blank"
                            >
                                <div className="relative aspect-video overflow-hidden bg-zinc-800">
                                    <img
                                        alt={video.title}
                                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                        src={video.thumbnail_url.replace("%{width}", "640").replace("%{height}", "360")}
                                    />
                                    <span className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 text-xs text-white">
                                        {formatDuration(video.duration)}
                                    </span>
                                </div>
                                <div className="p-4">
                                    <h2 className="line-clamp-2 font-medium text-zinc-100 group-hover:text-orange-400">
                                        {video.title}
                                    </h2>
                                    <p className="mt-3 text-sm text-zinc-400">
                                        {video.view_count.toLocaleString()} views · {formatDate(video.published_at)}
                                    </p>
                                </div>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};