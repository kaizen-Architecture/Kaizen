import { t } from '../trpc';

import { libraryRouter } from './library';
import { mangaRouter } from './manga';
import { settingsRouter } from './settings';
import { sourcesRouter } from './sources';
import { authRouter } from './auth';
import { mangaRequestRouter } from './mangaRequest';
import { queuesRouter } from './queues';

export const appRouter = t.router({
  library: libraryRouter,
  manga: mangaRouter,
  settings: settingsRouter,
  sources: sourcesRouter,
  auth: authRouter,
  mangaRequest: mangaRequestRouter,
  queues: queuesRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
