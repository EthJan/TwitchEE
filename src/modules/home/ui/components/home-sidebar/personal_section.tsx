"use client";

import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { BookmarkIcon, CircleUserRound } from "lucide-react";
import { useClerk, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/trpc/client";

const items = [
    {
        title: "Saved channels",
        url: "/channels/saved",
        icon: BookmarkIcon,
        auth: true,
    },
];

export const PersonalSection = () => {
    const clerk = useClerk();
    const { isLoaded, isSignedIn } = useAuth();
    const followedChannelsQuery = trpc.twitch.followedChannels.useQuery(
        { first: 20 },
        { enabled: isSignedIn === true, retry: false },
    );
    const isTwitchConnected = followedChannelsQuery.isSuccess;

    return (
        <SidebarGroup>
            <SidebarGroupLabel>
                You
            </SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    {items.map((item) => (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                                tooltip={item.title}
                                asChild
                                isActive={false}
                                onClick={(e) => {
                                    if (!isSignedIn && item.auth) {
                                        e.preventDefault();
                                        return clerk.openSignIn();
                                    }
                                }}
                            >
                                <Link href={item.url} className="flex items-center gap-4">
                                    <item.icon />
                                    <span className="text-sm">{item.title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
                {isLoaded && !isSignedIn && (
                    <Card className="mx-2 mt-3 border-sidebar-border bg-transparent shadow-none group-data-[collapsible=icon]:hidden">
                        <CardContent className="space-y-3 p-3">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Make it yours</p>
                                <p className="text-xs text-muted-foreground">
                                    Sign in to follow channels and save your favorites.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full justify-start rounded-full border-muted-foreground/30 bg-transparent text-sky-400 hover:bg-transparent hover:text-sky-400"
                                onClick={() => clerk.openSignIn()}
                            >
                                <CircleUserRound aria-hidden="true" />
                                Sign in
                            </Button>
                        </CardContent>
                    </Card>
                )}
                {isLoaded && isSignedIn && !followedChannelsQuery.isLoading && (
                    <Card className="mx-2 mt-3 border-sidebar-border bg-transparent shadow-none group-data-[collapsible=icon]:hidden">
                        <CardContent className="p-3">
                            {isTwitchConnected ? (
                                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                                    Twitch connected
                                </div>
                            ) : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-start rounded-full border-muted-foreground/30 bg-transparent text-sky-400 hover:bg-transparent hover:text-sky-400"
                                    asChild
                                >
                                    <a href="/api/twitch/connect">Connect Twitch</a>
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                )}
            </SidebarGroupContent>
        </SidebarGroup>
    )
}