/* eslint-disable import/no-cycle */
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../utils/logging';
import { dispatchNotification } from './notifications';
import { mangalExec } from './mangal';

const failureCounters: Record<string, number> = {};
const FAILURE_THRESHOLD = 5;

export const resetSourceFailure = (source: string) => {
  if (failureCounters[source] !== undefined) {
    if (failureCounters[source] > 0) {
      logger.info(`Resetting failure counter for source ${source}`);
    }
    failureCounters[source] = 0;
  }
};

export const trackSourceFailure = async (source: string, errorText: string) => {
  const isCritical =
    errorText.includes('403') ||
    errorText.includes('404') ||
    errorText.toLowerCase().includes('timeout') ||
    errorText.toLowerCase().includes('cloudflare') ||
    errorText.toLowerCase().includes('forbidden');

  if (!isCritical) return;

  failureCounters[source] = (failureCounters[source] || 0) + 1;
  const currentFailures = failureCounters[source];

  logger.warn(`Source ${source} has failed ${currentFailures}/${FAILURE_THRESHOLD} consecutive times.`);

  if (currentFailures >= FAILURE_THRESHOLD) {
    try {
      logger.error(`Source ${source} reached failure threshold. Deactivating automatically.`);

      const { stdout: sourcesPath } = await mangalExec(['where', '-s']);
      const cleanPath = sourcesPath.trim();
      const failedPath = path.join(cleanPath, 'disabled', 'failed');

      // Ensure disabled/failed directory exists
      try {
        await fs.mkdir(failedPath, { recursive: true });
      } catch (e) {
        /* ignore */
      }

      const fileName = `${source}.lua`;
      const activeFile = path.join(cleanPath, fileName);
      const targetFile = path.join(failedPath, fileName);

      // Check if it exists in active sources before moving
      try {
        await fs.access(activeFile);
        await fs.rename(activeFile, targetFile);
        logger.info(`Moved ${fileName} to failed directory: ${failedPath}`);

        // Notify managers and admins via WhatsApp/Discord/Telegram
        await dispatchNotification('SOURCE_DEACTIVATED', {
          title: `Fuente Auto-Desactivada: ${source}`,
          body: `La fuente "${source}" ha fallado ${FAILURE_THRESHOLD} veces consecutivas y ha sido desactivada automáticamente para proteger el sistema.`,
          source,
          severity: 'warn',
        });
      } catch (e) {
        logger.warn(`Source ${source} not found in active directory, it might already be moved or disabled.`);
      }

      // Reset counter after action
      failureCounters[source] = 0;
    } catch (err) {
      logger.error(`Failed to handle auto-deactivation for source ${source}: ${err}`);
    }
  }
};
