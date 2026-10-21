import { auth } from "@clerk/nextjs/server";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    const clientId = process.env.TWITCH_CLIENT_ID;
    const redirectUri = process.env.TWITCH_REDIRECT_URI;
    if (!clientId || !redirectUri) {
        return new Response("Twitch OAuth is not configured", { status: 500 });
    }

    const state = randomBytes(32).toString("base64url");
    const twitchUrl = new URL("https://id.twitch.tv/oauth2/authorize");
    twitchUrl.searchParams.set("client_id", clientId);
    twitchUrl.searchParams.set("redirect_uri", redirectUri);
    twitchUrl.searchParams.set("response_type", "code");
    twitchUrl.searchParams.set("scope", "user:read:follows");
    twitchUrl.searchParams.set("state", state);

    const response = NextResponse.redirect(twitchUrl);
    response.cookies.set("twitch_oauth_state", state, {
        httpOnly: true,
        maxAge: 600,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
    });

    return response;
}
