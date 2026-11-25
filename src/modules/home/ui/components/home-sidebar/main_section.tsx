"use client";

import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FlameIcon, HomeIcon, PlaySquareIcon, ArrowUpDown } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useMemo, useState } from "react";
import { trpc } from "@/trpc/client";
const items = [
    {
        title: "Home",
        url: "/",
        icon: HomeIcon,

    },
    {
        title: "Following",
        url: "/feed/subscriptions",
        icon: PlaySquareIcon,
        auth: true,

    },
    {
        title: "Trending",
        url: "/feed/trending",
        icon: FlameIcon,

    },
    // Todo: Add recommended tab
];

export const MainSection = () => {
    const { isSignedIn } = useAuth();
    const [sortDescending, setSortDescending] = useState(true);
    const visibleItems = items.filter((item) => !item.auth || isSignedIn);
    const followedChannelsQuery = trpc.twitch.followedChannels.useQuery(
        { first: 100 },
        { enabled: isSignedIn === true, retry: false },
    );
    const followedStreamsQuery = trpc.twitch.followedStreams.useQuery(
        { first: 100 },
        {
            enabled: isSignedIn === true,
            retry: false,
            refetchInterval: 15_000,
            refetchOnWindowFocus: true,
        },
    );
    const followedStreamsByUserId = useMemo(
        () => new Map((followedStreamsQuery.data?.data ?? []).map((stream) => [stream.user_id, stream])),
        [followedStreamsQuery.data],
    );
    const followedChannels = useMemo(() => {
        const channels = followedChannelsQuery.data?.data ?? [];
        return channels
            .filter((channel) => followedStreamsByUserId.has(channel.broadcaster_id))
            .sort((a, b) => {
                const aStream = followedStreamsByUserId.get(a.broadcaster_id)!;
                const bStream = followedStreamsByUserId.get(b.broadcaster_id)!;
                return sortDescending
                    ? bStream.viewer_count - aStream.viewer_count
                    : aStream.viewer_count - bStream.viewer_count;
            });
    }, [followedChannelsQuery.data, followedStreamsByUserId, sortDescending]);

    return(
        <>
            <SidebarGroup>
                <SidebarGroupContent>
                    <SidebarMenu>
                        {visibleItems.map((item) => (
                            <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton
                                    tooltip={item.title}
                                    asChild
                                    isActive={false}
                                >
                                    <Link href={item.url} className="flex items-center gap-4">
                                        <item.icon />
                                        <span className="text-sm">{item.title}</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
            {isSignedIn && (
                <SidebarGroup>
                    <SidebarGroupLabel className="flex items-center justify-between">
                        <span>Followed Channels</span>
                        {followedChannels.length > 0 && (
                            <button
                                aria-label={`Sort followed channels by viewers, ${sortDescending ? "low to high" : "high to low"}`}
                                className="rounded p-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                onClick={() => setSortDescending((descending) => !descending)}
                                title={`Sort by viewers: ${sortDescending ? "low to high" : "high to low"}`}
                                type="button"
                            >
                                <ArrowUpDown className="size-3.5" />
                            </button>
                        )}
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        {followedChannelsQuery.isError ? (
                            <p className="px-2 text-xs text-muted-foreground">
                                {followedChannelsQuery.error.message.includes("Connect your Twitch") ? (
                                    <>Connect Twitch on <Link className="underline" href="/feed/subscriptions">Following</Link> to see followed channels.</>
                                ) : (
                                    <>Unable to load followed channels. See <Link className="underline" href="/feed/subscriptions">Following</Link> for details.</>
                                )}
                            </p>
                        ) : (
                            <SidebarMenu>
                                {followedChannels.map((channel) => {
                                    const stream = followedStreamsByUserId.get(channel.broadcaster_id);
                                    return (
                                        <SidebarMenuItem key={channel.broadcaster_id}>
                                            <SidebarMenuButton
                                                asChild
                                                className="group-data-[collapsible=icon]:!p-0"
                                                tooltip={`${channel.broadcaster_name}${stream ? ` · ${stream.viewer_count.toLocaleString("en-US")} viewers` : " · Offline"}`}
                                            >
                                                <Link
                                                    className="flex min-w-0 items-center gap-2"
                                                    href={`/watch/stream/${encodeURIComponent(channel.broadcaster_login)}`}
                                                >
                                                    <Avatar className="size-7">
                                                        <AvatarImage alt="" src={channel.profile_image_url} />
                                                        <AvatarFallback className="text-xs">
                                                            {channel.broadcaster_name.slice(0, 1).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="min-w-0 flex-1 truncate text-sm group-data-[collapsible=icon]:hidden">
                                                        {channel.broadcaster_name}
                                                    </span>
                                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground group-data-[collapsible=icon]:hidden">
                                                        {stream!.viewer_count.toLocaleString("en-US")}
                                                    </span>
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    );
                                })}
                                {followedChannelsQuery.isSuccess && followedChannels.length === 0 && (
                                    <li className="px-2 text-xs text-muted-foreground">No followed channels yet.</li>
                                )}
                            </SidebarMenu>
                        )}
                    </SidebarGroupContent>
                </SidebarGroup>
            )}
        </>
    )
}