export interface WatchTimeHistoryEntry {
    broadcasterId: string;
    broadcasterLogin: string;
    gameId: string;
    gameName: string;
    watchSeconds: number;
    updatedAt: number;
}

const HISTORY_STORAGE_KEY = "twitch-watch-time-history-v1";
const HISTORY_UPDATED_EVENT = "twitch-watch-time-history-updated";
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_ENTRIES = 200;

function isWatchTimeHistoryEntry(value: unknown): value is WatchTimeHistoryEntry {
    if (!value || typeof value !== "object") return false;
    const entry = value as Record<string, unknown>;
    return (
        typeof entry.broadcasterId === "string" &&
        typeof entry.broadcasterLogin === "string" &&
        typeof entry.gameId === "string" &&
        typeof entry.gameName === "string" &&
        typeof entry.watchSeconds === "number" &&
        Number.isFinite(entry.watchSeconds) &&
        entry.watchSeconds > 0 &&
        typeof entry.updatedAt === "number" &&
        Number.isFinite(entry.updatedAt)
    );
}

export function readWatchTimeHistory(): WatchTimeHistoryEntry[] {
    try {
        const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!stored) return [];

        const parsed: unknown = JSON.parse(stored);
        if (!Array.isArray(parsed)) {
            throw new Error("Stored watch-time history is not a list.");
        }

        const cutoff = Date.now() - HISTORY_RETENTION_MS;
        return parsed.filter(
            (entry): entry is WatchTimeHistoryEntry =>
                isWatchTimeHistoryEntry(entry) && entry.updatedAt >= cutoff,
        );
    } catch (error) {
        console.error("Unable to read local watch-time history", error);
        return [];
    }
}

export function recordLocalWatchTime(
    stream: Omit<WatchTimeHistoryEntry, "watchSeconds" | "updatedAt">,
    watchSeconds: number,
) {
    const history = readWatchTimeHistory();
    const now = Date.now();
    const existingIndex = history.findIndex(
        (entry) =>
            entry.broadcasterId === stream.broadcasterId &&
            entry.gameId === stream.gameId,
    );

    if (existingIndex >= 0) {
        history[existingIndex] = {
            ...history[existingIndex],
            broadcasterLogin: stream.broadcasterLogin,
            gameName: stream.gameName,
            watchSeconds: history[existingIndex].watchSeconds + watchSeconds,
            updatedAt: now,
        };
    } else {
        history.push({ ...stream, watchSeconds, updatedAt: now });
    }

    history.sort((a, b) => b.updatedAt - a.updatedAt);
    try {
        window.localStorage.setItem(
            HISTORY_STORAGE_KEY,
            JSON.stringify(history.slice(0, MAX_HISTORY_ENTRIES)),
        );
        window.dispatchEvent(new Event(HISTORY_UPDATED_EVENT));
    } catch (error) {
        console.error("Unable to save local watch-time history", error);
    }
}

export function watchTimeStrength(
    stream: { user_id: string; game_id: string; game_name: string },
    history: WatchTimeHistoryEntry[],
): number {
    let channelSeconds = 0;
    let categorySeconds = 0;
    for (const entry of history) {
        if (entry.broadcasterId === stream.user_id) {
            channelSeconds += entry.watchSeconds;
        }
        if (
            (stream.game_id && entry.gameId === stream.game_id) ||
            (stream.game_name &&
                entry.gameName.toLowerCase() === stream.game_name.toLowerCase())
        ) {
            categorySeconds += entry.watchSeconds;
        }
    }

    const durationStrength = (seconds: number) => seconds / (seconds + 600);
    return Math.max(
        durationStrength(channelSeconds),
        0.8 * durationStrength(categorySeconds),
    );
}

export function rankStreamsByWatchTime<
    T extends { user_id: string; game_id: string; game_name: string },
>(streams: T[], history: WatchTimeHistoryEntry[]): T[] {
    if (history.length === 0) return streams;
    return streams
        .map((stream, index) => ({
            stream,
            index,
            score: watchTimeStrength(stream, history),
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(({ stream }) => stream);
}

export function watchTimeHistoryUpdatedEvent() {
    return HISTORY_UPDATED_EVENT;
}
