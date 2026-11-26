"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Grip, MessageCircle, X } from "lucide-react";
import { SaveChannelButton } from "@/modules/home/ui/components/save-channel-button";
import { getBrowserLanguage } from "@/lib/browser-language";
import {
    readWatchTimeHistory,
    watchTimeHistoryUpdatedEvent,
    watchTimeStrength,
    type WatchTimeHistoryEntry,
} from "@/lib/watch-time-history";
import { WatchTimeTracker } from "@/modules/home/ui/components/watch-time-tracker";
import { trpc } from "@/trpc/client";

function getThumbnailUrl(url: string) {
    return url
        .replace(/%?\{width\}/g, "1280")
        .replace(/%?\{height\}/g, "720");
}

type ChatInteraction = {
    kind: "move" | "resize";
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
};

const SCROLL_ONBOARDING_STORAGE_KEY = "twitch-scroll-onboarding-seen";

export const ScrollView = () => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<HTMLDivElement>(null);
    const interactionRef = useRef<ChatInteraction | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [language, setLanguage] = useState<string>();
    const [parentHost, setParentHost] = useState<string>();
    const [ready, setReady] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [showStreamDetails, setShowStreamDetails] = useState(false);
    const [showScrollInstructions, setShowScrollInstructions] = useState(false);
    const [mobileChatExpanded, setMobileChatExpanded] = useState(false);
    const [chatPosition, setChatPosition] = useState<{ left: number; top: number }>();
    const [chatSize, setChatSize] = useState({ width: 360, height: 500 });

    useEffect(() => {
        setLanguage(getBrowserLanguage());
        setParentHost(window.location.hostname);
        try {
            setShowScrollInstructions(
                window.localStorage.getItem(SCROLL_ONBOARDING_STORAGE_KEY) !== "true",
            );
        } catch (error) {
            console.error("Unable to read scroll onboarding state", error);
            setShowScrollInstructions(true);
        }
        setReady(true);
    }, []);

    useEffect(() => {
        const updateWatchTimeHistory = () => setWatchTimeHistory(readWatchTimeHistory());
        updateWatchTimeHistory();
        const eventName = watchTimeHistoryUpdatedEvent();
        window.addEventListener(eventName, updateWatchTimeHistory);
        window.addEventListener("storage", updateWatchTimeHistory);
        return () => {
            window.removeEventListener(eventName, updateWatchTimeHistory);
            window.removeEventListener("storage", updateWatchTimeHistory);
        };
    }, []);

    const streamsQuery = trpc.twitch.recommendationStreams.useQuery(
        { first: 50, language },
        {
            enabled: ready,
            refetchOnWindowFocus: true,
        },
    );
    const refetchRecommendations = streamsQuery.refetch;
    const [additionalStreams, setAdditionalStreams] = useState<NonNullable<typeof streamsQuery.data>["data"]>([]);
    const [nextCursor, setNextCursor] = useState<string>();
    const [hasMoreStreams, setHasMoreStreams] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [loadMoreError, setLoadMoreError] = useState<string>();
    const [watchTimeHistory, setWatchTimeHistory] = useState<WatchTimeHistoryEntry[]>([]);
    const [savedPreferences, setSavedPreferences] = useState<Array<{
        broadcasterId: string;
        gameId: string;
        gameName: string;
    }>>([]);
    const loadingMoreRef = useRef(false);
    const trpcUtils = trpc.useUtils();
    const recommendedStreams = streamsQuery.data?.data;
    const streams = useMemo(() => {
        const seenIds = new Set<string>();
        return [...(recommendedStreams ?? []), ...additionalStreams].filter((stream) => {
            if (seenIds.has(stream.id)) return false;
            seenIds.add(stream.id);
            return true;
        });
    }, [additionalStreams, recommendedStreams]);
    const orderedStreams = useMemo(() => {
        const currentAndSeen = streams.slice(0, activeIndex + 1);
        const upcoming = streams.slice(activeIndex + 1);
        const savedPreferenceScore = (stream: typeof streams[number]) => {
            let score = 0;
            for (const preference of savedPreferences) {
                if (stream.user_id === preference.broadcasterId) return 2;
                if (
                    (preference.gameId && stream.game_id === preference.gameId) ||
                    (preference.gameName && stream.game_name.toLowerCase() === preference.gameName.toLowerCase())
                ) {
                    score = 1;
                }
            }
            return score;
        };
        const rankedUpcoming = upcoming
            .map((stream, index) => ({
                stream,
                index,
                savedScore: savedPreferenceScore(stream),
                watchTimeScore: watchTimeStrength(stream, watchTimeHistory),
            }))
            .sort((a, b) =>
                b.savedScore - a.savedScore ||
                b.watchTimeScore - a.watchTimeScore ||
                a.index - b.index,
            )
            .map(({ stream }) => stream);

        return [...currentAndSeen, ...rankedUpcoming];
    }, [activeIndex, savedPreferences, streams, watchTimeHistory]);
    const activeStream = orderedStreams[activeIndex];

    useEffect(() => {
        if (!showStreamDetails) return;
        const timeout = window.setTimeout(() => setShowStreamDetails(false), 5_000);
        return () => window.clearTimeout(timeout);
    }, [activeStream?.id, showStreamDetails]);

    const handleFeedScroll = () => {
        setShowStreamDetails(false);
        if (!showScrollInstructions) return;

        setShowScrollInstructions(false);
        try {
            window.localStorage.setItem(SCROLL_ONBOARDING_STORAGE_KEY, "true");
        } catch (error) {
            console.error("Unable to save scroll onboarding state", error);
        }
    };

    const loadMoreStreams = useCallback(async () => {
        if (!ready || !hasMoreStreams || loadingMoreRef.current) return;

        loadingMoreRef.current = true;
        setIsLoadingMore(true);
        setLoadMoreError(undefined);
        try {
            const page = await trpcUtils.twitch.popularStreams.fetch({
                first: 100,
                language,
                after: nextCursor,
            });
            setAdditionalStreams((current) => {
                const seenIds = new Set([
                    ...(recommendedStreams ?? []).map((stream) => stream.id),
                    ...current.map((stream) => stream.id),
                ]);
                const newStreams = page.data.filter((stream) => {
                    if (seenIds.has(stream.id)) return false;
                    seenIds.add(stream.id);
                    return true;
                });
                return [...current, ...newStreams];
            });
            setNextCursor(page.pagination.cursor);
            setHasMoreStreams(Boolean(page.pagination.cursor));
        } catch (error) {
            setLoadMoreError(error instanceof Error ? error.message : "Could not load more live streams.");
        } finally {
            loadingMoreRef.current = false;
            setIsLoadingMore(false);
        }
    }, [hasMoreStreams, language, nextCursor, ready, recommendedStreams, trpcUtils.twitch.popularStreams]);

    useEffect(() => {
        if (
            streams.length > 0 &&
            activeIndex >= streams.length - 4 &&
            hasMoreStreams &&
            !isLoadingMore &&
            !loadMoreError
        ) {
            void loadMoreStreams();
        }
    }, [activeIndex, hasMoreStreams, isLoadingMore, loadMoreError, loadMoreStreams, streams.length]);

    useEffect(() => {
        setActiveIndex((index) => Math.min(index, Math.max(0, streams.length - 1)));
    }, [streams.length]);

    const playerUrl = useMemo(() => {
        if (!activeStream || !parentHost) return undefined;
        const params = new URLSearchParams({
            channel: activeStream.user_login,
            parent: parentHost,
            autoplay: "true",
            muted: "true",
        });
        return `https://player.twitch.tv/?${params.toString()}`;
    }, [activeStream, parentHost]);

    const chatUrl = useMemo(() => {
        if (!activeStream || !parentHost) return undefined;
        const params = new URLSearchParams({ parent: parentHost });
        return `https://www.twitch.tv/embed/${encodeURIComponent(activeStream.user_login)}/chat?${params.toString()}`;
    }, [activeStream, parentHost]);

    useEffect(() => {
        const root = scrollRef.current;
        if (!root || streams.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const mostVisible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                const index = Number(mostVisible?.target.getAttribute("data-stream-index"));
                if (Number.isInteger(index)) setActiveIndex(index);
            },
            { root, threshold: [0.5, 0.75] },
        );

        root.querySelectorAll("[data-stream-index]").forEach((item) => observer.observe(item));
        return () => observer.disconnect();
    }, [streams.length]);

    const scrollToStream = useCallback((index: number) => {
        const target = scrollRef.current?.querySelector(`[data-stream-index="${index}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    const refreshFeed = useCallback(() => {
        setAdditionalStreams([]);
        setNextCursor(undefined);
        setHasMoreStreams(true);
        setLoadMoreError(undefined);
        setActiveIndex(0);
        scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        void refetchRecommendations();
    }, [refetchRecommendations]);

    const beginChatInteraction = (
        kind: ChatInteraction["kind"],
        event: React.PointerEvent<HTMLElement>,
    ) => {
        if (
            window.matchMedia("(max-width: 767px)").matches ||
            (event.target instanceof Element && event.target.closest("button")) ||
            !chatRef.current
        ) return;
        const rect = chatRef.current.getBoundingClientRect();
        interactionRef.current = {
            kind,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: rect.left,
            startTop: rect.top,
            startWidth: rect.width,
            startHeight: rect.height,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const moveChatInteraction = (event: React.PointerEvent<HTMLElement>) => {
        const interaction = interactionRef.current;
        if (!interaction || interaction.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - interaction.startX;
        const deltaY = event.clientY - interaction.startY;
        if (interaction.kind === "move") {
            setChatPosition({
                left: Math.max(0, Math.min(window.innerWidth - interaction.startWidth, interaction.startLeft + deltaX)),
                top: Math.max(72, Math.min(window.innerHeight - interaction.startHeight, interaction.startTop + deltaY)),
            });
            return;
        }

        setChatSize({
            width: Math.max(280, Math.min(window.innerWidth - interaction.startLeft, interaction.startWidth + deltaX)),
            height: Math.max(300, Math.min(window.innerHeight - interaction.startTop, interaction.startHeight + deltaY)),
        });
    };

    const endChatInteraction = (event: React.PointerEvent<HTMLElement>) => {
        if (interactionRef.current?.pointerId === event.pointerId) {
            interactionRef.current = null;
        }
    };

    return (
        <section className="relative h-[calc(100svh-4rem)] overflow-hidden bg-black text-white">
            {streamsQuery.isLoading && (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-300" role="status">
                    Finding live streams for you...
                </div>
            )}

            {streamsQuery.isError && (
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-sm text-red-300" role="alert">{streamsQuery.error.message}</p>
                    <button
                        className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
                        onClick={() => void streamsQuery.refetch()}
                        type="button"
                    >
                        Try again
                    </button>
                </div>
            )}

            {streamsQuery.isSuccess && streams.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                    <p className="text-lg font-semibold">No live streams to scroll through right now.</p>
                    <p className="text-sm text-zinc-400">Check back soon for more live channels.</p>
                </div>
            )}

            {streams.length > 0 && (
                <>
                    {showScrollInstructions && (
                        <>
                            <header className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pt-4 sm:px-8">
                                <div className="w-fit rounded-lg bg-black/60 px-3 py-2 shadow-lg backdrop-blur-sm">
                                    <p className="text-sm font-semibold tracking-wide">LIVE DISCOVERY</p>
                                    <p className="text-xs text-zinc-300">Scroll to find your next stream</p>
                                </div>
                            </header>
                            <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center">
                                <span className="rounded-full bg-black/55 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
                                    Scroll for next
                                </span>
                            </div>
                        </>
                    )}

                    <div
                        aria-label="Live streams"
                        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        onScroll={handleFeedScroll}
                        ref={scrollRef}
                        role="region"
                        tabIndex={0}
                    >
                        {orderedStreams.map((stream, index) => {
                            const isActive = index === activeIndex;
                            return (
                                <article
                                    className="relative h-full min-h-full snap-start snap-always overflow-hidden bg-black"
                                    data-stream-index={index}
                                    key={stream.id}
                                >
                                    <div className="absolute inset-0 bg-black">
                                        {isActive && playerUrl ? (
                                            <iframe
                                                allow="autoplay; fullscreen"
                                                className="h-full w-full"
                                                src={playerUrl}
                                                title={`${stream.user_name} live on Twitch`}
                                            />
                                        ) : (
                                            <Image
                                                alt={`${stream.user_name} live stream preview`}
                                                className="h-full w-full object-cover"
                                                height={720}
                                                priority={index < 2}
                                                sizes="(min-width: 1024px) 80vw, 100vw"
                                                src={getThumbnailUrl(stream.thumbnail_url)}
                                                width={1280}
                                            />
                                        )}
                                    </div>

                                    {isActive && (
                                        <>
                                            <WatchTimeTracker
                                                broadcasterId={stream.user_id}
                                                broadcasterLogin={stream.user_login}
                                                gameId={stream.game_id}
                                                gameName={stream.game_name}
                                                minimumWatchSeconds={5}
                                            />
                                            {!showStreamDetails && (
                                                <button
                                                    aria-label="Show stream details and controls"
                                                    className="absolute inset-0 z-10 cursor-default bg-transparent"
                                                    onClick={() => setShowStreamDetails(true)}
                                                    type="button"
                                                />
                                            )}
                                            {showStreamDetails && (
                                                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-6 pt-32 sm:px-8 sm:pb-8">
                                                    <div className="pointer-events-auto min-w-0 flex-1">
                                                        <div className="mb-3 flex items-center gap-2">
                                                            <span className="rounded bg-red-600 px-2.5 py-1 text-xs font-bold tracking-wide">
                                                                LIVE
                                                            </span>
                                                            <span className="rounded bg-black/60 px-2.5 py-1 text-xs font-medium">
                                                                {stream.viewer_count.toLocaleString("en-US")} watching
                                                            </span>
                                                        </div>
                                                        <p className="truncate text-sm font-semibold text-violet-300">{stream.user_name}</p>
                                                        <h1 className="mt-1 line-clamp-2 text-base font-semibold sm:text-lg">{stream.title}</h1>
                                                        <p className="mt-1 truncate text-sm text-zinc-300">
                                                            {stream.game_name || "Just Chatting"}
                                                        </p>
                                                    </div>
                                                    <div className="pointer-events-auto flex shrink-0 flex-col gap-2">
                                                        <SaveChannelButton
                                                            broadcasterId={stream.user_id}
                                                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/20 bg-black/50 px-3 text-xs font-medium backdrop-blur-sm hover:bg-white/20"
                                                            displayName={stream.user_name}
                                                            gameId={stream.game_id}
                                                            gameName={stream.game_name}
                                                            login={stream.user_login}
                                                            onPreferenceChange={(isSaved) => {
                                                                setSavedPreferences((current) => {
                                                                    const withoutChannel = current.filter(
                                                                        (preference) => preference.broadcasterId !== stream.user_id,
                                                                    );
                                                                    return isSaved
                                                                        ? [...withoutChannel, {
                                                                            broadcasterId: stream.user_id,
                                                                            gameId: stream.game_id,
                                                                            gameName: stream.game_name,
                                                                        }]
                                                                        : withoutChannel;
                                                                });
                                                            }}
                                                        />
                                                        <button
                                                            aria-pressed={chatOpen}
                                                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-violet-600 px-3 text-xs font-semibold hover:bg-violet-500"
                                                            onClick={() => setChatOpen((open) => !open)}
                                                            type="button"
                                                        >
                                                            <MessageCircle aria-hidden="true" size={16} />
                                                            {chatOpen ? "Hide chat" : "Chat"}
                                                        </button>
                                                        <button
                                                            aria-label="Previous stream"
                                                            className="inline-flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-zinc-200 hover:bg-white/10 disabled:opacity-40"
                                                            disabled={index === 0}
                                                            onClick={() => scrollToStream(index - 1)}
                                                            type="button"
                                                        >
                                                            <ChevronUp aria-hidden="true" size={20} />
                                                        </button>
                                                        <button
                                                            aria-label="Next stream"
                                                            className="inline-flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-zinc-200 hover:bg-white/10 disabled:opacity-40"
                                                            disabled={index === streams.length - 1}
                                                            onClick={() => scrollToStream(index + 1)}
                                                            type="button"
                                                        >
                                                            <ChevronDown aria-hidden="true" size={20} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </article>
                            );
                        })}
                        {isLoadingMore && (
                            <div className="flex min-h-24 items-center justify-center text-sm text-zinc-300" role="status">
                                Finding more live streams...
                            </div>
                        )}
                        {loadMoreError && (
                            <div className="flex min-h-24 flex-col items-center justify-center gap-2 px-4 text-center">
                                <p className="text-sm text-red-300" role="alert">{loadMoreError}</p>
                                <button
                                    className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
                                    onClick={() => void loadMoreStreams()}
                                    type="button"
                                >
                                    Try loading more
                                </button>
                            </div>
                        )}
                        {!hasMoreStreams && !isLoadingMore && !loadMoreError && (
                            <div className="flex min-h-32 flex-col items-center justify-center gap-3 px-4 text-center">
                                <p className="text-sm text-zinc-300">You’ve seen all the live streams available right now.</p>
                                <button
                                    className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
                                    onClick={refreshFeed}
                                    type="button"
                                >
                                    Refresh live streams
                                </button>
                            </div>
                        )}
                    </div>

                    {chatOpen && activeStream && chatUrl && (
                        <div
                            className={`fixed z-40 flex flex-col overflow-hidden rounded-xl border border-white/15 bg-[#18181b] shadow-2xl shadow-black/60 max-md:!bottom-3 max-md:!left-3 max-md:!right-3 max-md:!top-auto max-md:!h-[44svh] max-md:!w-auto ${mobileChatExpanded ? "max-md:!h-[88svh]" : ""}`}
                            ref={chatRef}
                            style={{
                                ...(chatPosition
                                    ? { left: `${chatPosition.left}px`, top: `${chatPosition.top}px` }
                                    : { right: "1.5rem", top: "5rem" }),
                                width: `${chatSize.width}px`,
                                height: `${chatSize.height}px`,
                            }}
                        >
                            <header
                                className="flex min-h-12 touch-none items-center justify-between border-b border-white/10 px-3"
                                onPointerCancel={endChatInteraction}
                                onPointerDown={(event) => beginChatInteraction("move", event)}
                                onPointerMove={moveChatInteraction}
                                onPointerUp={endChatInteraction}
                            >
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <Grip aria-hidden="true" className="hidden cursor-move text-zinc-500 md:block" size={16} />
                                    {activeStream.user_name} chat
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        aria-label={mobileChatExpanded ? "Collapse chat" : "Expand chat"}
                                        className="inline-flex size-9 items-center justify-center rounded-md hover:bg-white/10 md:hidden"
                                        onClick={() => setMobileChatExpanded((expanded) => !expanded)}
                                        type="button"
                                    >
                                        {mobileChatExpanded
                                            ? <ChevronDown aria-hidden="true" size={18} />
                                            : <ChevronUp aria-hidden="true" size={18} />}
                                    </button>
                                    <button
                                        aria-label="Close chat"
                                        className="inline-flex size-9 items-center justify-center rounded-md hover:bg-white/10"
                                        onClick={() => setChatOpen(false)}
                                        type="button"
                                    >
                                        <X aria-hidden="true" size={18} />
                                    </button>
                                </div>
                            </header>
                            <iframe
                                className="min-h-0 flex-1 bg-white"
                                src={chatUrl}
                                title={`${activeStream.user_name} Twitch chat`}
                            />
                            <div
                                aria-label="Resize chat panel"
                                className="absolute bottom-0 right-0 hidden size-6 cursor-se-resize touch-none md:block"
                                onPointerCancel={endChatInteraction}
                                onPointerDown={(event) => beginChatInteraction("resize", event)}
                                onPointerMove={moveChatInteraction}
                                onPointerUp={endChatInteraction}
                                role="separator"
                            >
                                <Grip aria-hidden="true" className="absolute bottom-1 right-1 rotate-[-45deg] text-zinc-500" size={14} />
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    );
};
