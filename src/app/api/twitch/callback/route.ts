import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { twitchAccounts, users } from "@/db/schema";
import {
    exchangeTwitchAuthorizationCode,
    getTwitchAuthenticatedUser,
} from "@/lib/twitch/client";
import { encryptTwitchToken } from "@/lib/twitch/token-crypto";

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const redirectHome = (status: "connected" | "error") => {
        const url = new URL("/", request.url);
        url.searchParams.set("twitch", status);
        return NextResponse.redirect(url);
    };

    const { userId: clerkId } = await auth();
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    const savedState = request.headers.get("cookie")?.match(/(?:^|; )twitch_oauth_state=([^;]+)/)?.[1];

    if (!clerkId || !code || !state || !savedState || state !== savedState) {
        return redirectHome("error");
    }

    const redirectUri = process.env.TWITCH_REDIRECT_URI;
    if (!redirectUri) return redirectHome("error");

    try {
        const token = await exchangeTwitchAuthorizationCode(code, redirectUri);
        const twitchUser = await getTwitchAuthenticatedUser(token.access_token);
        let [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId));

        if (!user) {
            const clerkUser = await currentUser();
            if (!clerkUser) return redirectHome("error");

            await db.insert(users).values({
                clerkId,
                name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || "TwitchEE user",
                imageUrl: clerkUser.imageUrl,
            }).onConflictDoNothing({ target: users.clerkId });

            [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId));
        }

        if (!user) return redirectHome("error");

        await db.insert(twitchAccounts).values({
            userId: user.id,
            twitchUserId: twitchUser.id,
            twitchLogin: twitchUser.login,
            twitchDisplayName: twitchUser.display_name,
            accessToken: encryptTwitchToken(token.access_token),
            refreshToken: encryptTwitchToken(token.refresh_token),
            expiresAt: new Date(Date.now() + token.expires_in * 1000),
        }).onConflictDoUpdate({
            target: twitchAccounts.userId,
            set: {
                twitchUserId: twitchUser.id,
                twitchLogin: twitchUser.login,
                twitchDisplayName: twitchUser.display_name,
                accessToken: encryptTwitchToken(token.access_token),
                refreshToken: encryptTwitchToken(token.refresh_token),
                expiresAt: new Date(Date.now() + token.expires_in * 1000),
                updatedAt: new Date(),
            },
        });

        const response = redirectHome("connected");
        response.cookies.delete("twitch_oauth_state");
        return response;
    } catch (error) {
        console.error("Twitch OAuth callback failed", error);
        return redirectHome("error");
    }
}
