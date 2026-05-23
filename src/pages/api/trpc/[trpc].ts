import { createNextApiHandler } from '@trpc/server/adapters/next';
import { env } from '../../../env/server.mjs';
import { createContext } from '../../../server/trpc/context';
import { appRouter } from '../../../server/trpc/router';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimit: false,
  },
};

// export API handler
export default createNextApiHandler({
  router: appRouter,
  createContext,
  onError:
    env.NODE_ENV === 'development'
      ? ({ path, error }) => {
          // eslint-disable-next-line no-console
          console.error(`❌ tRPC failed on ${path}: ${error}`);
        }
      : undefined,
});
