import 'server-only';

import { db } from '@/db';
import { twitchCurrentStreams, twitchRecommendationRecords } from '@/db/schema';
import { getTwitchStreams } from '@/lib/twitch/client';
import { lt } from 'drizzle-orm';

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
