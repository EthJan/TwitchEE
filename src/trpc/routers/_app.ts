import { z } from 'zod';
import { baseProcedure, createTRPCRouter } from '../init';
import { TRPCError } from '@trpc/server';
import { getTwitchUserByLogin, getTwitchVideos } from '@/lib/twitch/client';

export const appRouter = createTRPCRouter({
  hello: baseProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .query((opts) => { 
      return {
        greeting: `hello ${opts.input.text}`,
      };
    }),
  twitch: createTRPCRouter({
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