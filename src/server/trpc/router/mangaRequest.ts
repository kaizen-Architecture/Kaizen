import { z } from 'zod';
import { t } from '../trpc';

function getSessionUser(req: any) {
  const sessionCookie = req?.cookies?.['kaizen-session'];
  if (!sessionCookie) return null;
  try {
    let decoded = sessionCookie;
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded);
    }
    if (decoded.startsWith('"') && decoded.endsWith('"')) {
      decoded = decoded.substring(1, decoded.length - 1);
    }
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

export const mangaRequestRouter = t.router({
  create: t.procedure
    .input(
      z.object({
        title: z.string().trim().min(1),
        startChapter: z.number().int().min(1).default(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const user = getSessionUser(ctx.req);
      let userId: number | null = null;
      if (user?.id) {
        const userInDb = await ctx.prisma.user.findUnique({ where: { id: user.id } });
        if (userInDb) {
          userId = userInDb.id;
        }
      }

      return ctx.prisma.mangaRequest.create({
        data: {
          title: input.title,
          startChapter: input.startChapter,
          userId,
        },
      });
    }),

  list: t.procedure.query(async ({ ctx }) => {
    const user = getSessionUser(ctx.req);
    const isReader = user?.role === 'READER';

    const requests = await ctx.prisma.mangaRequest.findMany({
      where: isReader && user?.id ? { userId: user.id } : undefined,
      include: {
        user: {
          select: {
            username: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Check dynamically if APPROVED requests now have chapters in library, and update them to AVAILABLE
    const syncedRequests = await Promise.all(
      requests.map(async (req) => {
        if (req.status === 'APPROVED') {
          const manga = await ctx.prisma.manga.findFirst({
            where: {
              title: {
                equals: req.title,
                mode: 'insensitive',
              },
            },
            include: {
              _count: {
                select: { chapters: true },
              },
            },
          });
          if (manga && manga._count.chapters > 0) {
            const updated = await ctx.prisma.mangaRequest.update({
              where: { id: req.id },
              data: { status: 'AVAILABLE' },
              include: {
                user: {
                  select: {
                    username: true,
                    role: true,
                  },
                },
              },
            });
            return updated;
          }
        }
        return req;
      }),
    );

    return syncedRequests;
  }),

  updateStatus: t.procedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(['PENDING', 'APPROVED', 'CANCELLED', 'AVAILABLE']),
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return ctx.prisma.mangaRequest.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.title ? { title: input.title } : {}),
        },
      });
    }),
});
