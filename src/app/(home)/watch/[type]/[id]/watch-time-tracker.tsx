"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { recordLocalWatchTime } from "@/lib/watch-time-history";

interface WatchTimeTrackerProps {
    broadcasterId: string;
    broadcasterLogin: string;
    gameId: string;
    gameName: string;
}

const REPORT_INTERVAL_MS = 30_000;

export function WatchTimeTracker({
    broadcasterId,
    broadcasterLogin,
    gameId,
    gameName,
}: WatchTimeTrackerProps) {
    const { isLoaded, isSignedIn } = useAuth();

    useEffect(() => {
        if (!isLoaded) return;

        let lastTick = performance.now();
        let pendingMilliseconds = 0;

        const report = (watchSeconds: number, useBeacon = false) => {
            recordLocalWatchTime(
                { broadcasterId, broadcasterLogin, gameId, gameName },
                watchSeconds,
            );
            if (!isSignedIn) return;

            const body = JSON.stringify({
                broadcasterId,
                broadcasterLogin,
                gameId: gameId || undefined,
                gameName,
                watchSeconds,
            });

            if (useBeacon && navigator.sendBeacon) {
                const accepted = navigator.sendBeacon(
                    "/api/watch-time",
                    new Blob([body], { type: "application/json" }),
                );
                if (!accepted) console.error("Browser could not queue watch-time data.");
                return;
            }

            void fetch("/api/watch-time", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
                keepalive: true,
            }).then((response) => {
                if (!response.ok) {
                    console.error("Watch-time recording failed", response.status);
                }
            }).catch((error: unknown) => {
                console.error("Watch-time recording request failed", error);
            });
        };

        const flush = (useBeacon = false) => {
            const seconds = Math.floor(pendingMilliseconds / 1000);
            if (seconds < 1) return;
            pendingMilliseconds -= seconds * 1000;
            report(seconds, useBeacon);
        };

        const tick = () => {
            const now = performance.now();
            if (document.visibilityState === "visible" && document.hasFocus()) {
                pendingMilliseconds += Math.min(now - lastTick, 2_000);
            }
            lastTick = now;
            if (pendingMilliseconds >= REPORT_INTERVAL_MS) flush();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") flush();
            lastTick = performance.now();
        };
        const handlePageHide = () => flush(true);

        const interval = window.setInterval(tick, 1_000);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("pagehide", handlePageHide);

        return () => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("pagehide", handlePageHide);
            flush(true);
        };
    }, [broadcasterId, broadcasterLogin, gameId, gameName, isLoaded, isSignedIn]);

    return null;
}
