"use client";

import Image from "next/image";
import { useAuth } from "@clerk/nextjs";
import { trpc } from "@/trpc/client";
import { SaveChannelButton } from "@/modules/home/ui/components/save-channel-button";
import { getBrowserLanguage } from "@/lib/browser-language";
import { useEffect, useState } from "react";

function getThumbnailUrl(url: string) {
    return url
        .replace(/%?\{width\}/g, "640")
        .replace(/%?\{height\}/g, "360");
}

interface WatchSuggestionsProps {
    excludeLogin?: string;
}

export function WatchSuggestions({ excludeLogin }: WatchSuggestionsProps) {
    const { isLoaded, isSignedIn } = useAuth();
    const [browserLanguage, setBrowserLanguage] = useState<string>();
    const [languageReady, setLanguageReady] = useState(false);

    useEffect(() => {
        setBrowserLanguage(getBrowserLanguage());
        setLanguageReady(true);
    }, []);

    const suggestionsQuery = trpc.twitch.twoTowerStreams.useQuery(
        { first: 12, language: browserLanguage },
        {
            enabled: isLoaded && isSignedIn === true && languageReady,
            refetchInterval: 60_000,
            refetchOnWindowFocus: true,
        },
    );
    const suggestions = (suggestionsQuery.data?.data ?? [])
        .filter((stream) =>
            !browserLanguage || stream.language.toLowerCase() === browserLanguage,
        )
        .filter((stream) => stream.user_login !== excludeLogin)
        .slice(0, 8);

    return (
        <section className="mt-8 border-t border-slate-200 pt-7" aria-labelledby="suggestions-heading">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id="suggestions-heading" className="text-lg font-semibold">Suggested streams</h2>
                {(suggestionsQuery.isLoading || !languageReady) && (
                    <span className="text-sm text-slate-500">Loading...</span>
                )}
            </div>

            {suggestionsQuery.isError && (
                <p className="text-sm text-slate-500">Suggestions are unavailable right now.</p>
            )}

            {isLoaded && !isSignedIn && (
                <p className="text-sm text-slate-500">Sign in to see personalized stream suggestions.</p>
            )}

            {suggestions.length > 0 && (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {suggestions.map((stream) => (
                        <article
                            className="group overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-slate-400"
                            key={stream.id}
                        >
                            <div className="relative aspect-video overflow-hidden bg-slate-100">
                                <a className="block h-full" href={`/watch/stream/${encodeURIComponent(stream.user_login)}`}>
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
                            <a className="block p-4" href={`/watch/stream/${encodeURIComponent(stream.user_login)}`}>
                                <h3 className="line-clamp-2 font-medium group-hover:text-slate-600">{stream.title}</h3>
                                <p className="mt-2 text-sm text-slate-600">
                                    {stream.user_name} · {stream.game_name || "Just Chatting"}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                    {stream.viewer_count.toLocaleString("en-US")} viewers
                                </p>
                            </a>
                        </article>
                    ))}
                </div>
            )}

            {isSignedIn && !suggestionsQuery.isLoading && !suggestionsQuery.isError && suggestions.length === 0 && (
                <p className="text-sm text-slate-500">No two-tower recommendations are available right now.</p>
            )}
        </section>
    );
}
