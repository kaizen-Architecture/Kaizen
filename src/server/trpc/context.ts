// src/server/router/context.ts
import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../db/client';

/**
 * Replace this with an object if you want to pass things to createContextInner
 */
interface CreateContextOptions {
  req?: NextApiRequest;
  res?: NextApiResponse;
}

/** Use this helper for:
 *  - testing, where we dont have to Mock Next.js' req/res
 *  - trpc's `createSSGHelpers` where we don't have req/res
 */
export const createContextInner = async (opts: CreateContextOptions) => {
  return {
    prisma,
    req: opts.req,
    res: opts.res,
  };
};

/**
 * This is the actual context you'll use in your router
 * @link https://trpc.io/docs/context
 * */
export const createContext = async (opts: trpcNext.CreateNextContextOptions) => {
  return createContextInner({
    req: opts.req,
    res: opts.res,
  });
};

export type Context = trpc.inferAsyncReturnType<typeof createContext>;
