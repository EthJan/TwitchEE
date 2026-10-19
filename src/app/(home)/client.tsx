"use client";

import { FormEvent, useState } from "react";
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

export const PageClient = () => {
    const [login, setLogin] = useState("");
    const [submittedLogin, setSubmittedLogin] = useState("");
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