"use client";

import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem} from "@/components/ui/sidebar";
import { FlameIcon, HomeIcon, PlaySquareIcon } from "lucide-react";
import { useAuth} from "@clerk/nextjs";
import Link from "next/link";
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
    const { isSignedIn} = useAuth();
    const visibleItems = items.filter((item) => !item.auth || isSignedIn);

    return(
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
                                <Link href={item.url} className = "flex items-center gap-4">
                                <item.icon/>
                                <span className="text-sm">{item.title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}

                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}