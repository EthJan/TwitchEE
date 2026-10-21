import { categoriesRouter } from '@/modules/categories/server/procedures';
import { baseProcedure, createTRPCRouter, protectedProcedure } from '../init';
import { db } from '@/db';
import { twitchAccounts } from '@/db/schema';
import {
  getTwitchFollowedChannels,
  getTwitchUserByLogin,
  getTwitchVideos,
  refreshTwitchAccessToken,
} from '@/lib/twitch/client';
import { decryptTwitchToken, encryptTwitchToken } from '@/lib/twitch/token-crypto';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
 
export const appRouter = createTRPCRouter({
  categories: categoriesRouter,
  twitch: createTRPCRouter({
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
          return await getTwitchFollowedChannels({
            accessToken,
            userId: account.twitchUserId,
            first: input?.first,
            after: input?.after,
          });
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Twitch followed channels request failed',
          });
        }
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