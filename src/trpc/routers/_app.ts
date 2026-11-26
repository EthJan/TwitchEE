import { categoriesRouter } from '@/modules/categories/server/procedures';
import { baseProcedure, createTRPCRouter, protectedProcedure } from '../init';
import { db } from '@/db';
import { twitchAccounts, twitchCurrentStreams, twitchRecommendationRecords, twitchSavedChannels, twitchUserContextRecords, twitchUserRecommendationRecords, users } from '@/db/schema';
import {
  getTwitchFollowedChannels,
  getTwitchFollowedStreams,
  getTwitchStreams,
  getTwitchTopGames,
  getTwitchUserByLogin,
  getTwitchUsersByIds,
  getTwitchVideos,
  refreshTwitchAccessToken,
  searchTwitchCategories,
  searchTwitchChannels,
} from '@/lib/twitch/client';
import type { TwitchStream } from '@/lib/twitch/client';
import { decryptTwitchToken, encryptTwitchToken } from '@/lib/twitch/token-crypto';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { gatherPublicTwitchSnapshot, gatherTwitchUserSnapshot, publicStreamStaleBefore } from '@/lib/twitch/data-gather';

function recommendationStreamFromPayload(payload: Record<string, unknown>): TwitchStream {
  const userLogin = String(payload.user_login ?? '');
  return {
    id: String(payload.id ?? ''),
    user_id: String(payload.user_id ?? ''),
    user_login: userLogin,
    user_name: String(payload.user_name ?? ''),
    game_id: String(payload.game_id ?? ''),
    game_name: String(payload.game_name ?? ''),
    type: 'live',
    title: String(payload.title ?? ''),
    viewer_count: Number(payload.viewer_count ?? 0),
    started_at: String(payload.started_at ?? ''),
    language: String(payload.language ?? ''),
    thumbnail_url: String(payload.thumbnail_url ?? '') || `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(userLogin)}-640x360.jpg`,
    tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
    is_mature: Boolean(payload.is_mature),
  };
}

async function getPreferredLanguage(userId: string): Promise<string | undefined> {
  const result = await db.execute(sql`
    WITH latest_snapshot AS (
      SELECT MAX(${twitchUserContextRecords.collectedAt}) AS collected_at
      FROM ${twitchUserContextRecords}
      WHERE ${twitchUserContextRecords.userId} = ${userId}
        AND ${twitchUserContextRecords.dataset} = 'followed_channel_profiles'
    )
    SELECT LOWER(${twitchUserContextRecords.payload}->>'broadcaster_language') AS language
    FROM ${twitchUserContextRecords}
    JOIN latest_snapshot
      ON ${twitchUserContextRecords.collectedAt} = latest_snapshot.collected_at
    WHERE ${twitchUserContextRecords.userId} = ${userId}
      AND ${twitchUserContextRecords.dataset} = 'followed_channel_profiles'
      AND NULLIF(${twitchUserContextRecords.payload}->>'broadcaster_language', '') IS NOT NULL
    AND LENGTH(${twitchUserContextRecords.payload}->>'broadcaster_language') = 2
    GROUP BY LOWER(${twitchUserContextRecords.payload}->>'broadcaster_language')
    ORDER BY COUNT(DISTINCT ${twitchUserContextRecords.recordKey}) DESC,
      MAX(${twitchUserContextRecords.collectedAt}) DESC
    LIMIT 1
  `);
  const language = result.rows[0]?.language;
  return typeof language === 'string' ? language : undefined;
}
 
export const appRouter = createTRPCRouter({
  categories: categoriesRouter,
  twitch: createTRPCRouter({
    twoTowerStreams: protectedProcedure
      .input(z.object({
        first: z.number().int().min(1).max(50).optional(),
        language: z.string().length(2).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const first = input?.first ?? 12;
        const language = input?.language ?? await getPreferredLanguage(ctx.user.id);
        const result = await db.execute(sql`
          WITH latest_snapshot AS (
            SELECT MAX(${twitchUserRecommendationRecords.collectedAt}) AS collected_at
            FROM ${twitchUserRecommendationRecords}
            WHERE ${twitchUserRecommendationRecords.userId} = ${ctx.user.id}
              AND ${twitchUserRecommendationRecords.payload}->>'recommendation_model' = 'two_tower'
          )
          SELECT ${twitchUserRecommendationRecords.payload} AS payload
          FROM ${twitchUserRecommendationRecords}
          LEFT JOIN ${twitchCurrentStreams}
            ON ${twitchCurrentStreams.id} = ${twitchUserRecommendationRecords.recordKey}
            AND ${twitchCurrentStreams.lastSeenAt} > ${publicStreamStaleBefore()}
          JOIN latest_snapshot
            ON ${twitchUserRecommendationRecords.collectedAt} = latest_snapshot.collected_at
          WHERE ${twitchUserRecommendationRecords.userId} = ${ctx.user.id}
            AND ${twitchUserRecommendationRecords.payload}->>'recommendation_model' = 'two_tower'
            AND (
              ${twitchCurrentStreams.id} IS NOT NULL
              OR ${twitchUserRecommendationRecords.collectedAt} > ${publicStreamStaleBefore()}
            )
            ${language ? sql`AND LOWER(${twitchUserRecommendationRecords.payload}->>'language') = ${language}` : sql``}
          ORDER BY COALESCE((${twitchUserRecommendationRecords.payload}->>'recommendation_score')::double precision, 0) DESC
          LIMIT ${first}
        `);

        if (result.rows.length > 0) {
          return {
            data: result.rows.map((row) =>
              recommendationStreamFromPayload(row.payload as Record<string, unknown>),
            ),
            pagination: {},
          };
        }

        const freshContextStreams = await db.execute(sql`
          SELECT DISTINCT ON (
            ${twitchUserContextRecords.dataset},
            ${twitchUserContextRecords.recordKey}
          ) ${twitchUserContextRecords.dataset} AS dataset,
            ${twitchUserContextRecords.payload} AS payload
          FROM ${twitchUserContextRecords}
          WHERE ${twitchUserContextRecords.userId} = ${ctx.user.id}
            AND ${twitchUserContextRecords.dataset} IN (
              'followed_streams',
              'followed_category_streams'
            )
            AND ${twitchUserContextRecords.collectedAt} > ${publicStreamStaleBefore()}
            ${language ? sql`AND LOWER(${twitchUserContextRecords.payload}->>'language') = ${language}` : sql``}
          ORDER BY
            ${twitchUserContextRecords.dataset},
            ${twitchUserContextRecords.recordKey},
            ${twitchUserContextRecords.collectedAt} DESC
        `);
        const seenStreamIds = new Set<string>();
        const contextStreams = freshContextStreams.rows
          .sort((a, b) => {
            const aDataset = String(a.dataset);
            const bDataset = String(b.dataset);
            if (aDataset !== bDataset) {
              return aDataset === 'followed_streams' ? -1 : 1;
            }
            const aPayload = a.payload as Record<string, unknown>;
            const bPayload = b.payload as Record<string, unknown>;
            return Number(bPayload.viewer_count ?? 0) - Number(aPayload.viewer_count ?? 0);
          })
          .map((row) => row.payload as Record<string, unknown>)
          .filter((payload) => {
            const streamId = String(payload.id ?? '');
            if (!streamId || seenStreamIds.has(streamId)) return false;
            seenStreamIds.add(streamId);
            return true;
          })
          .slice(0, first)
          .map(recommendationStreamFromPayload);

        if (contextStreams.length > 0) {
          return { data: contextStreams, pagination: {} };
        }

        const currentStreams = await db
          .select()
          .from(twitchCurrentStreams)
          .where(and(
            gt(twitchCurrentStreams.lastSeenAt, publicStreamStaleBefore()),
            ...(language
              ? [sql`LOWER(${twitchCurrentStreams.payload}->>'language') = ${language}`]
              : []),
          ))
          .orderBy(desc(twitchCurrentStreams.viewerCount))
          .limit(first);

        if (currentStreams.length > 0) {
          return {
            data: currentStreams.map(({ payload }) =>
              recommendationStreamFromPayload(payload),
            ),
            pagination: {},
          };
        }

        return {
          data: result.rows.map((row) =>
            recommendationStreamFromPayload(row.payload as Record<string, unknown>),
          ),
          pagination: {},
        };
      }),
    topGames: baseProcedure
      .input(z.object({ first: z.number().int().min(1).max(100).optional() }).optional())
      .query(async ({ input }) => {
        try {
          return await getTwitchTopGames(input?.first ?? 10);
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Twitch top categories request failed',
          });
        }
      }),
    searchChannels: baseProcedure
      .input(z.object({
        query: z.string().trim().min(1).max(100),
        first: z.number().int().min(1).max(100).optional(),
        after: z.string().min(1).optional(),
        liveOnly: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        try {
          const channels = await searchTwitchChannels(input);
          const streamData = channels.data.length > 0
            ? (await getTwitchStreams({
              userIds: channels.data.map((channel) => channel.id),
            })).data
            : [];
          const streamsByUserId = new Map(
            streamData.map((stream) => [stream.user_id, stream]),
          );

          return {
            ...channels,
            data: channels.data
              .map((channel) => ({
                ...channel,
                stream: streamsByUserId.get(channel.id) ?? null,
              }))
              .sort((a, b) => Number(b.is_live) - Number(a.is_live)),
          };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Twitch channel search failed',
          });
        }
      }),
    searchCategories: baseProcedure
      .input(z.object({
        query: z.string().trim().min(1).max(100),
        first: z.number().int().min(1).max(100).optional(),
        after: z.string().min(1).optional(),
      }))
      .query(async ({ input }) => {
        try {
          return await searchTwitchCategories(input);
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Twitch category search failed',
          });
        }
      }),
    searchSuggestions: baseProcedure
      .input(z.object({
        query: z.string().trim().min(2).max(100),
        first: z.number().int().min(1).max(20).optional(),
      }))
      .query(async ({ input }) => {
        try {
          const [channels, categories] = await Promise.all([
            searchTwitchChannels({ query: input.query, first: input.first }),
            searchTwitchCategories({ query: input.query, first: input.first }),
          ]);
          return { channels: channels.data, categories: categories.data };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Twitch search suggestions failed',
          });
        }
      }),
    popularStreams: baseProcedure
      .input(z.object({ first: z.number().int().min(1).max(100).optional(), language: z.string().length(2).optional(), gameId: z.string().min(1).optional() }).optional())
      .query(async ({ input, ctx }) => {
        try {
          let language = input?.language;
          if (!language && ctx.clerkUserId) {
            const [user] = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.clerkId, ctx.clerkUserId));
            if (user) language = await getPreferredLanguage(user.id);
          }
          return await getTwitchStreams({
            first: input?.first,
            language,
            gameId: input?.gameId,
          });
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Twitch streams request failed',
          });
        }
      }),
    recommendationStreams: baseProcedure
      .input(z.object({
        first: z.number().int().min(1).max(50).optional(),
        language: z.string().length(2).optional(),
      }).optional())
      .query(async ({ input, ctx }) => {
        const first = input?.first ?? 50;
        let language: string | undefined = input?.language;
        if (ctx.clerkUserId) {
          const [user] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.clerkId, ctx.clerkUserId));
          if (user) {
            language ??= await getPreferredLanguage(user.id);
            const personalized = await db.execute(sql`
              WITH latest_snapshot AS (
                SELECT MAX(${twitchUserRecommendationRecords.collectedAt}) AS collected_at
                FROM ${twitchUserRecommendationRecords}
                WHERE ${twitchUserRecommendationRecords.userId} = ${user.id}
              )
              SELECT ${twitchUserRecommendationRecords.payload} AS payload
              FROM ${twitchUserRecommendationRecords}
              LEFT JOIN ${twitchCurrentStreams}
                ON ${twitchCurrentStreams.id} = ${twitchUserRecommendationRecords.recordKey}
                AND ${twitchCurrentStreams.lastSeenAt} > ${publicStreamStaleBefore()}
              JOIN latest_snapshot
                ON ${twitchUserRecommendationRecords.collectedAt} = latest_snapshot.collected_at
              WHERE ${twitchUserRecommendationRecords.userId} = ${user.id}
                AND (
                  ${twitchCurrentStreams.id} IS NOT NULL
                  OR ${twitchUserRecommendationRecords.collectedAt} > ${publicStreamStaleBefore()}
                )
                ${language ? sql`AND LOWER(${twitchUserRecommendationRecords.payload}->>'language') = ${language}` : sql``}
              ORDER BY COALESCE((${twitchUserRecommendationRecords.payload}->>'recommendation_score')::double precision, 0) DESC
              LIMIT ${first}
            `);
            if (personalized.rows.length > 0) {
              const personalizedStreams = personalized.rows.map((row) =>
                recommendationStreamFromPayload(row.payload as Record<string, unknown>),
              );
              if (personalizedStreams.length < first) {
                const fillStreams = await db
                  .select()
                  .from(twitchCurrentStreams)
                  .where(and(
                    gt(twitchCurrentStreams.lastSeenAt, publicStreamStaleBefore()),
                    ...(language
                      ? [sql`LOWER(${twitchCurrentStreams.payload}->>'language') = ${language}`]
                      : []),
                  ))
                  .orderBy(desc(twitchCurrentStreams.viewerCount))
                  .limit(first);
                const seenIds = new Set(personalizedStreams.map((stream) => stream.id));
                for (const stream of fillStreams) {
                  if (seenIds.has(stream.id)) continue;
                  personalizedStreams.push(recommendationStreamFromPayload(stream.payload));
                  seenIds.add(stream.id);
                  if (personalizedStreams.length >= first) break;
                }
              }
              return {
                data: personalizedStreams,
                pagination: {},
              };
            }
          }
        }

        const currentStreams = await db
          .select()
          .from(twitchCurrentStreams)
          .where(and(
            gt(twitchCurrentStreams.lastSeenAt, publicStreamStaleBefore()),
            ...(language
              ? [sql`LOWER(${twitchCurrentStreams.payload}->>'language') = ${language}`]
              : []),
          ))
          .orderBy(desc(twitchCurrentStreams.viewerCount))
          .limit(first);

        if (currentStreams.length > 0) {
          return {
            data: currentStreams.map(({ payload }) =>
              recommendationStreamFromPayload(payload),
            ),
            pagination: {},
          };
        }

        const result = await db.execute(sql`
          WITH latest_snapshot AS (
            SELECT MAX(${twitchRecommendationRecords.collectedAt}) AS collected_at
            FROM ${twitchRecommendationRecords}
            WHERE ${twitchRecommendationRecords.dataset} = 'embedding_top_50'
              ${language ? sql`AND LOWER(${twitchRecommendationRecords.payload}->>'language') = ${language}` : sql``}
          )
          SELECT ${twitchRecommendationRecords.payload} AS payload
          FROM ${twitchRecommendationRecords}
          JOIN latest_snapshot
            ON ${twitchRecommendationRecords.collectedAt} = latest_snapshot.collected_at
          WHERE ${twitchRecommendationRecords.dataset} = 'embedding_top_50'
          ORDER BY COALESCE((${twitchRecommendationRecords.payload}->>'embedding_score')::double precision, 0) DESC
          LIMIT ${first}
        `);

        const data = result.rows.map((row) => {
          const payload = row.payload as Record<string, unknown>;
          const userLogin = String(payload.user_login ?? '');
          const thumbnailUrl = String(payload.thumbnail_url ?? '');
          return {
            id: String(payload.id),
            user_id: String(payload.user_id),
            user_login: userLogin,
            user_name: String(payload.user_name ?? ''),
            game_id: String(payload.game_id ?? ''),
            game_name: String(payload.game_name ?? ''),
            type: 'live' as const,
            title: String(payload.title ?? ''),
            viewer_count: Number(payload.viewer_count ?? 0),
            started_at: String(payload.started_at ?? ''),
            language: String(payload.language ?? ''),
            thumbnail_url: thumbnailUrl || `https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(userLogin)}-640x360.jpg`,
            tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
            is_mature: Boolean(payload.is_mature),
          };
        });

        return { data, pagination: {} };
      }),
    gatherPublicData: baseProcedure.mutation(async () => {
      try {
        return await gatherPublicTwitchSnapshot();
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Twitch data gather failed',
        });
      }
    }),
    gatherUserData: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        return await gatherTwitchUserSnapshot(ctx.user.id);
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Twitch user data gather failed',
        });
      }
    }),
    followedStreams: protectedProcedure
      .input(z.object({ first: z.number().int().min(1).max(100).optional(), after: z.string().min(1).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const [account] = await db.select().from(twitchAccounts).where(eq(twitchAccounts.userId, ctx.user.id));
        if (!account) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Connect your Twitch account to view live channels.',
          });
        }

        let accessToken = decryptTwitchToken(account.accessToken);
        if (account.expiresAt.getTime() <= Date.now() + 60_000) {
          const refreshedToken = await refreshTwitchAccessToken(decryptTwitchToken(account.refreshToken));
          accessToken = refreshedToken.access_token;
          await db.update(twitchAccounts).set({
            accessToken: encryptTwitchToken(refreshedToken.access_token),
            refreshToken: encryptTwitchToken(refreshedToken.refresh_token),
            expiresAt: new Date(Date.now() + refreshedToken.expires_in * 1000),
            updatedAt: new Date(),
          }).where(eq(twitchAccounts.id, account.id));
        }

        try {
          return await getTwitchFollowedStreams({
            accessToken,
            userId: account.twitchUserId,
            first: input?.first,
            after: input?.after,
          });
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Twitch followed streams request failed',
          });
        }
      }),
    followedChannels: protectedProcedure
      .input(z.object({ first: z.number().int().min(1).max(100).optional(), after: z.string().min(1).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const [account] = await db.select().from(twitchAccounts).where(eq(twitchAccounts.userId, ctx.user.id));
        if (!account) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Connect your Twitch account to view followed channels.',
          });
        }

        let accessToken = decryptTwitchToken(account.accessToken);
        if (account.expiresAt.getTime() <= Date.now() + 60_000) {
          const refreshedToken = await refreshTwitchAccessToken(decryptTwitchToken(account.refreshToken));
          accessToken = refreshedToken.access_token;
          await db.update(twitchAccounts).set({
            accessToken: encryptTwitchToken(refreshedToken.access_token),
            refreshToken: encryptTwitchToken(refreshedToken.refresh_token),
            expiresAt: new Date(Date.now() + refreshedToken.expires_in * 1000),
            updatedAt: new Date(),
          }).where(eq(twitchAccounts.id, account.id));
        }

        try {
          const followedChannels = await getTwitchFollowedChannels({
            accessToken,
            userId: account.twitchUserId,
            first: input?.first,
            after: input?.after,
          });
          const users = followedChannels.data.length > 0
            ? await getTwitchUsersByIds(followedChannels.data.map((channel) => channel.broadcaster_id))
            : { data: [] };
          const profileImagesById = new Map(
            users.data.map((user) => [user.id, user.profile_image_url]),
          );

          return {
            ...followedChannels,
            data: followedChannels.data.map((channel) => ({
              ...channel,
              profile_image_url: profileImagesById.get(channel.broadcaster_id) ?? '',
            })),
          };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Twitch followed channels request failed',
          });
        }
      }),
    savedChannels: protectedProcedure.query(async ({ ctx }) => {
      return db
        .select({
          broadcasterId: twitchSavedChannels.broadcasterId,
          login: twitchSavedChannels.login,
          displayName: twitchSavedChannels.displayName,
        })
        .from(twitchSavedChannels)
        .where(eq(twitchSavedChannels.userId, ctx.user.id))
        .orderBy(desc(twitchSavedChannels.createdAt));
    }),
    saveChannel: protectedProcedure
      .input(z.object({
        broadcasterId: z.string().min(1).max(64),
        login: z.string().min(1).max(64),
        displayName: z.string().min(1).max(128),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.insert(twitchSavedChannels).values({
          userId: ctx.user.id,
          ...input,
        }).onConflictDoNothing();
      }),
    unsaveChannel: protectedProcedure
      .input(z.object({ broadcasterId: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        await db.delete(twitchSavedChannels).where(and(
          eq(twitchSavedChannels.userId, ctx.user.id),
          eq(twitchSavedChannels.broadcasterId, input.broadcasterId),
        ));
      }),
    videos: baseProcedure
      .input(
        z
          .object({
            userId: z.string().min(1).optional(),
            userLogin: z.string().min(1).optional(),
            gameId: z.string().min(1).optional(),
            language: z.string().length(2).optional(),
            period: z.enum(['all', 'day', 'week', 'month']).optional(),
            sort: z.enum(['time', 'trending', 'views']).optional(),
            type: z.enum(['all', 'archive', 'highlight', 'upload']).optional(),
            first: z.number().int().min(1).max(100).optional(),
            after: z.string().min(1).optional(),
          })
          .refine(
            (input) => input.userId || input.userLogin || input.gameId,
            'Provide userId, userLogin, or gameId',
          ),
      )
      .query(async ({ input }) => {
        let userId = input.userId;

        if (!userId && input.userLogin) {
          const user = await getTwitchUserByLogin(input.userLogin);
          if (!user) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Twitch user not found: ${input.userLogin}`,
            });
          }
          userId = user.id;
        }

        try {
          return await getTwitchVideos({
            userId,
            gameId: input.gameId,
            language: input.language,
            period: input.period,
            sort: input.sort,
            type: input.type,
            first: input.first,
            after: input.after,
          });
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Twitch API request failed',
          });
        }
      }),
  }),
});
 
// export type definition of API
export type AppRouter = typeof appRouter;