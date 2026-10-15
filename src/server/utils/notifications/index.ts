import { prisma } from '../../db/client';
import { logger } from '../../../utils/logging';
import { getCachedSettings } from '../settings-cache';
import { NotificationEventType, NotificationPayload } from './types';
import { WhatsAppProvider } from './providers/whatsapp';
import { DiscordProvider } from './providers/discord';
import { TelegramProvider } from './providers/telegram';

const whatsappProvider = new WhatsAppProvider();
const discordProvider = new DiscordProvider();
const telegramProvider = new TelegramProvider();

export const notificationProviders = {
  whatsapp: whatsappProvider,
  discord: discordProvider,
  telegram: telegramProvider,
};

export async function dispatchNotification(
  event: NotificationEventType,
  payloadData: Omit<NotificationPayload, 'event'>,
  targetUserId?: number,
): Promise<void> {
  const fullPayload: NotificationPayload = {
    ...payloadData,
    event,
  };

  const settings = await getCachedSettings().catch(() => null);

  try {
    // 1. Notificación dirigida a un usuario específico (ej: Manga solicitado disponible)
    if (targetUserId) {
      const user = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (user && user.notificationsEnabled !== false && user.notifyEvents.includes(event)) {
        await Promise.allSettled([
          whatsappProvider.sendToUser(user, fullPayload),
          discordProvider.sendToUser(user, fullPayload),
          telegramProvider.sendToUser(user, fullPayload, settings),
        ]);
      }
      return;
    }

    // 2. Notificación de nuevo capítulo para lectores que tienen el manga en favoritos
    if (event === 'FAVORITE_CHAPTER_DOWNLOADED' && fullPayload.mangaId) {
      const favoriteUsers = await prisma.userFavoriteManga.findMany({
        where: { mangaId: fullPayload.mangaId },
        include: { user: true },
      });

      const promises = favoriteUsers
        .filter((fav) => fav.user.notificationsEnabled !== false && fav.user.notifyEvents.includes(event))
        .flatMap((fav) => [
          whatsappProvider.sendToUser(fav.user, fullPayload),
          discordProvider.sendToUser(fav.user, fullPayload),
          telegramProvider.sendToUser(fav.user, fullPayload, settings),
        ]);

      await Promise.allSettled(promises);
      return;
    }

    // 3. Notificación de eventos del sistema / administración (Fuente caída, descarga fallida, etc.)
    const systemEvents: NotificationEventType[] = [
      'SOURCE_DEACTIVATED',
      'CHAPTER_DOWNLOAD_FAILED',
      'NEW_MANGA_REQUEST',
      'SERVER_CRITICAL_ERROR',
    ];

    if (systemEvents.includes(event)) {
      const managerUsers = await prisma.user.findMany({
        where: { role: { in: ['SUPERADMIN', 'MANAGER'] } },
      });

      const userPromises = managerUsers
        .filter((u) => u.notificationsEnabled !== false && u.notifyEvents.includes(event))
        .flatMap((u) => [
          whatsappProvider.sendToUser(u, fullPayload),
          discordProvider.sendToUser(u, fullPayload),
          telegramProvider.sendToUser(u, fullPayload, settings),
        ]);

      // Enviar también a los canales globales del servidor si están configurados en Settings
      const globalPromises: Promise<boolean>[] = [];
      if (settings) {
        if (settings.whatsappEnabled) globalPromises.push(whatsappProvider.sendSystem(settings, fullPayload));
        if (settings.discordEnabled) globalPromises.push(discordProvider.sendSystem(settings, fullPayload));
        if (settings.telegramEnabled) globalPromises.push(telegramProvider.sendSystem(settings, fullPayload));
      }

      await Promise.allSettled([...userPromises, ...globalPromises]);
    }
  } catch (err: any) {
    logger.error(`[Notification Dispatcher] Error dispatching event ${event}: ${err?.message || err}`);
  }
}

// Fallback retrocompatible para código existente que llamaba a sendNotification
export const sendNotification = async (title: string, body: string, url?: string) => {
  return dispatchNotification('SERVER_CRITICAL_ERROR', {
    title,
    body,
    url,
    severity: 'warn',
  });
};
