import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { twitchUserContextRecords, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const watchTimeSchema = z.object({
    broadcasterId: z.string().regex(/^\d{1,32}$/),
    broadcasterLogin: z.string().regex(/^[a-zA-Z0-9_]{1,25}$/),
    gameId: z.string().regex(/^\d{1,32}$/).optional(),
    gameName: z.string().trim().max(100).optional(),
    watchSeconds: z.number().int().min(1).max(60),
});

export async function POST(request: Request) {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
        return NextResponse.json({ error: "Sign in to record watch time." }, { status: 401 });
    }

    if (request.headers.get("origin") !== new URL(request.url).origin) {
        return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const parsedBody = watchTimeSchema.safeParse(body);
    if (!parsedBody.success) {
        return NextResponse.json({ error: "Invalid watch-time event." }, { status: 400 });
    }

    const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkId, clerkUserId));
    if (!user) {
        return NextResponse.json({ error: "User account was not found." }, { status: 401 });
    }

    const { broadcasterId, broadcasterLogin, gameId, gameName, watchSeconds } = parsedBody.data;
    await db.insert(twitchUserContextRecords).values({
        userId: user.id,
        dataset: "watch_time",
        recordKey: randomUUID(),
        collectedAt: new Date(),
        payload: {
            broadcaster_id: broadcasterId,
            broadcaster_login: broadcasterLogin.toLowerCase(),
            game_id: gameId ?? "",
            game_name: gameName ?? "",
            watch_seconds: watchSeconds,
        },
    });

    return NextResponse.json({ status: "recorded" }, { status: 201 });
}
