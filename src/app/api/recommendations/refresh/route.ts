import { auth } from "@clerk/nextjs/server";
import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse } from "next/server";

import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const refreshRateLimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1, "5m"),
    prefix: "recommendation-workflow-refresh",
});

export async function POST(request: Request) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Sign in to refresh recommendations." }, { status: 401 });
    }

    if (request.headers.get("origin") !== new URL(request.url).origin) {
        return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }

    const token = process.env.GITHUB_ACTIONS_DISPATCH_TOKEN;
    if (!token) {
        return NextResponse.json(
            { error: "Recommendation refresh is not configured on the server." },
            { status: 503 },
        );
    }

    let rateLimit;
    try {
        rateLimit = await refreshRateLimit.limit("global");
    } catch (error) {
        console.error("Recommendation refresh rate limit failed", error);
        return NextResponse.json(
            { error: "Unable to verify the recommendation refresh limit." },
            { status: 503 },
        );
    }

    if (!rateLimit.success) {
        const retryAfter = Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000));
        return NextResponse.json(
            { error: "Recommendations were refreshed recently. Please try again later." },
            { status: 429, headers: { "Retry-After": String(retryAfter) } },
        );
    }

    const repository = process.env.GITHUB_REPOSITORY ?? "EthJan/TwitchEE";
    const [owner, name] = repository.split("/");
    if (!owner || !name || repository.split("/").length !== 2) {
        return NextResponse.json(
            { error: "The GitHub repository is not configured correctly." },
            { status: 500 },
        );
    }

    let response: Response;
    try {
        response = await fetch(
            `https://api.github.com/repos/${owner}/${name}/actions/workflows/recommendations.yml/dispatches`,
            {
                method: "POST",
                headers: {
                    Accept: "application/vnd.github+json",
                    Authorization: `Bearer ${token}`,
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    ref: process.env.GITHUB_DEFAULT_BRANCH ?? "main",
                }),
            },
        );
    } catch (error) {
        console.error("Unable to reach GitHub Actions for recommendation refresh", error);
        return NextResponse.json(
            { error: "Unable to contact GitHub Actions." },
            { status: 502 },
        );
    }

    if (!response.ok) {
        console.error("GitHub rejected the recommendation workflow dispatch", response.status);
        return NextResponse.json(
            { error: `GitHub could not queue the refresh workflow (HTTP ${response.status}).` },
            { status: 502 },
        );
    }

    return NextResponse.json({ status: "queued" }, { status: 202 });
}
