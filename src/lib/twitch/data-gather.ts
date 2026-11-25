import 'server-only';

import { db } from '@/db';
import { twitchAccounts, twitchCurrentStreams, twitchRecommendationRecords, twitchUserContextRecords } from '@/db/schema';
import {
  getTwitchFollowedChannels,
  getTwitchFollowedStreams,
  getTwitchStreams,
  refreshTwitchAccessToken,
} from '@/lib/twitch/client';
import { decryptTwitchToken, encryptTwitchToken } from '@/lib/twitch/token-crypto';
import { eq, lt } from 'drizzle-orm';

const STALE_STREAM_AFTER_MS = 10 * 60 * 1000;

export async function gatherPublicTwitchSnapshot() {
  const collectedAt = new Date();
  const response = await getTwitchStreams({ first: 100 });
  const streams = response.data.filter((stream) => stream.type === 'live');

  if (streams.length > 0) {
    await db
      .insert(twitchCurrentStreams)
      .values(
        streams.map((stream) => ({
          id: stream.id,
          viewerCount: stream.viewer_count,
          lastSeenAt: collectedAt,
          payload: stream,
        })),
      )
      .onConflictDoUpdate({
        target: twitchCurrentStreams.id,
        set: {
          viewerCount: twitchCurrentStreams.viewerCount,
          lastSeenAt: collectedAt,
          payload: twitchCurrentStreams.payload,
        },
      });

    await db.insert(twitchRecommendationRecords).values(
      streams.map((stream) => ({
        dataset: 'live_streams_raw',
        recordKey: stream.id,
        collectedAt,
        payload: stream,
      })),
    );
  }

  const staleBefore = new Date(Date.now() - STALE_STREAM_AFTER_MS);
  const removed = await db
    .delete(twitchCurrentStreams)
    .where(lt(twitchCurrentStreams.lastSeenAt, staleBefore))
    .returning({ id: twitchCurrentStreams.id });

  return {
    collectedAt: collectedAt.toISOString(),
    collected: streams.length,
    removed: removed.length,
  };
}

export const publicStreamStaleBefore = () =>
  new Date(Date.now() - STALE_STREAM_AFTER_MS);

export async function gatherTwitchUserSnapshot(userId: string) {
  const [account] = await db
    .select()
    .from(twitchAccounts)
    .where(eq(twitchAccounts.userId, userId));

  if (!account) {
    return { connected: false, collected: 0 };
  }

  let accessToken = decryptTwitchToken(account.accessToken);
  if (account.expiresAt.getTime() <= Date.now() + 60_000) {
    const refreshedToken = await refreshTwitchAccessToken(
      decryptTwitchToken(account.refreshToken),
    );
    accessToken = refreshedToken.access_token;
    await db
      .update(twitchAccounts)
      .set({
        accessToken: encryptTwitchToken(refreshedToken.access_token),
        refreshToken: encryptTwitchToken(refreshedToken.refresh_token),
        expiresAt: new Date(Date.now() + refreshedToken.expires_in * 1000),
        updatedAt: new Date(),
      })
      .where(eq(twitchAccounts.id, account.id));
  }

  const [channels, streams] = await Promise.all([
    getTwitchFollowedChannels({
      accessToken,
      userId: account.twitchUserId,
      first: 100,
    }),
    getTwitchFollowedStreams({
      accessToken,
      userId: account.twitchUserId,
      first: 100,
    }),
  ]);
  const followedGameCounts = new Map<string, number>();
  for (const stream of streams.data) {
    if (stream.game_id) {
      followedGameCounts.set(
        stream.game_id,
        (followedGameCounts.get(stream.game_id) ?? 0) + 1,
      );
    }
  }
  const followedGames = [...followedGameCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([gameId]) => gameId);
  const categoryResponses = await Promise.all(
    followedGames.map((gameId) => getTwitchStreams({ first: 50, gameId })),
  );
  const collectedAt = new Date();
  const records = [
    ...channels.data.map((payload) => ({
      userId,
      dataset: 'followed_channels',
      recordKey: payload.broadcaster_id,
      collectedAt,
      payload,
    })),
    ...streams.data.map((payload) => ({
      userId,
      dataset: 'followed_streams',
      recordKey: payload.id,
      collectedAt,
      payload,
    })),
    ...categoryResponses.flatMap((response) =>
      response.data
        .filter((payload) => payload.type === 'live')
        .map((payload) => ({
          userId,
          dataset: 'followed_category_streams',
          recordKey: `${payload.game_id}:${payload.id}`,
          collectedAt,
          payload,
        })),
    ),
  ];

  if (records.length > 0) {
    await db.insert(twitchUserContextRecords).values(records);
  }

  return {
    connected: true,
    collected: records.length,
    collectedAt: collectedAt.toISOString(),
  };
}
