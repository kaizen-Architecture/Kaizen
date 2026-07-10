import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { t } from '../trpc';

export const authRouter = t.router({
  login: t.procedure
    .input(z.object({ username: z.string().min(1), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Auto-initialize admin user if the table is completely empty
      const count = await ctx.prisma.user.count();
      if (count === 0) {
        await ctx.prisma.user.create({
          data: {
            username: 'admin',
            password: 'admin', // plain or basic hashed fallback
            role: 'SUPERADMIN',
          },
        });
      }

      const user = await ctx.prisma.user.findUnique({
        where: { username: input.username },
      });

      if (!user || user.password !== input.password) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid username or password',
        });
      }

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      };
    }),

  checkAdminDefaultPassword: t.procedure.query(async ({ ctx }) => {
    const adminUser = await ctx.prisma.user.findFirst({
      where: { username: 'admin' },
    });
    return adminUser ? adminUser.password === 'admin' : false;
  }),

  getUsers: t.procedure.query(async ({ ctx }) => {
    const users = await ctx.prisma.user.findMany({
      select: {
        id: true,
        createdAt: true,
        username: true,
        role: true,
        apiToken: true,
        lastActiveAt: true,
        lastUserAgent: true,
        apiCallCount: true,
      },
      orderBy: { id: 'asc' },
    });
    return users;
  }),

  generateApiToken: t.procedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const { randomBytes } = await import('crypto');
    const newToken = randomBytes(32).toString('hex');

    return ctx.prisma.user.update({
      where: { id: input.id },
      data: { apiToken: newToken },
      select: { id: true, apiToken: true },
    });
  }),

  createUser: t.procedure
    .input(
      z.object({
        username: z.string().min(2),
        password: z.string().min(3),
        role: z.enum(['SUPERADMIN', 'MANAGER', 'READER', 'SERVICE']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({
        where: { username: input.username },
      });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Username already exists' });
      }

      return ctx.prisma.user.create({
        data: {
          username: input.username,
          password: input.password,
          role: input.role,
        },
        select: { id: true, username: true, role: true },
      });
    }),

  updateUserPassword: t.procedure
    .input(z.object({ id: z.number(), newPassword: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: input.id },
        data: { password: input.newPassword },
        select: { id: true, username: true },
      });
    }),

  updateUserRole: t.procedure
    .input(
      z.object({
        id: z.number(),
        role: z.enum(['SUPERADMIN', 'MANAGER', 'READER', 'SERVICE']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, role } = input;
      const targetUser = await ctx.prisma.user.findUniqueOrThrow({
        where: { id },
      });

      if (targetUser.role === 'SUPERADMIN' && role !== 'SUPERADMIN') {
        const adminCount = await ctx.prisma.user.count({
          where: { role: 'SUPERADMIN' },
        });
        if (adminCount <= 1) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Cannot demote the last remaining SUPERADMIN user account.',
          });
        }
      }

      return ctx.prisma.user.update({
        where: { id },
        data: { role },
        select: { id: true, username: true, role: true },
      });
    }),

  deleteUser: t.procedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const targetUser = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: input.id },
    });

    if (targetUser.role === 'SUPERADMIN') {
      const adminCount = await ctx.prisma.user.count({
        where: { role: 'SUPERADMIN' },
      });
      if (adminCount <= 1) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot delete the last remaining SUPERADMIN user account.',
        });
      }
    }

    return ctx.prisma.user.delete({
      where: { id: input.id },
      select: { id: true, username: true },
    });
  }),

  getApiCallLogs: t.procedure
    .input(
      z.object({
        userId: z.number().optional(),
        limit: z.number().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.apiCallLog.findMany({
        where: input.userId ? { userId: input.userId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        include: {
          user: {
            select: { id: true, username: true, role: true },
          },
        },
      });
    }),
});
