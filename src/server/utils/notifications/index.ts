import { prisma } from '../../db/client';
import { logger } from '../../../utils/logging';
import { getCachedSettings } from '../settings-cache';
import { NotificationEventType, NotificationPayload } from './types';
import { WhatsAppProvider } from './providers/whatsapp';
import { DiscordProvider } from './providers/discord';
import { TelegramProvider } from './providers/telegram';
import { getNotificationI18n } from './i18n';

const whatsappProvider = new WhatsAppProvider();
const discordProvider = new DiscordProvider();
const telegramProvider = new TelegramProvider();

export const notificationProviders = {
  whatsapp: whatsappProvider,
  discord: discordProvider,
  telegram: telegramProvider,
};

/**
 * Log notification attempt to NotificationLog table
 */
async function logNotification(
  channel: string,
  event: string,
  success: boolean,
  recipient?: string | null,
  error?: string | null,
) {
  try {
    await prisma.notificationLog.create({
      data: {
        channel,
        event,
        success,
        recipient: recipient || undefined,
        error: error || undefined,
      },
    });
  } catch (err) {
    // Non-blocking log failure
  }
}

/**
 * Translates and resolves title & body according to recipient language
 */
export function resolvePayloadForLang(payload: NotificationPayload, lang?: string | null): NotificationPayload {
  const i18n = getNotificationI18n(lang);
  let title = payload.title;
  let body = payload.body;

  if (payload.event === 'SOURCE_DEACTIVATED' && payload.source) {
    title = i18n.sourceDeactivatedTitle(payload.source);
    body = i18n.sourceDeactivatedBody(payload.source);
  } else if (payload.event === 'CHAPTER_DOWNLOAD_FAILED' && payload.mangaTitle && payload.chapterIndex !== undefined) {
    title = i18n.downloadFailedTitle(payload.mangaTitle);
    body = i18n.downloadFailedBody(payload.chapterIndex + 1, payload.source || 'primaria', payload.errorText || body);
  } else if (payload.event === 'FAVORITE_CHAPTER_DOWNLOADED' && payload.mangaTitle && payload.chapterIndex !== undefined) {
    title = i18n.favoriteChapterTitle(payload.mangaTitle);
    body = i18n.favoriteChapterBody(payload.chapterIndex + 1, payload.mangaTitle, payload.source || 'primaria');
  } else if (payload.event === 'MANGA_REQUEST_AVAILABLE' && payload.mangaTitle) {
    title = i18n.mangaRequestAvailableTitle(payload.mangaTitle);
    body = i18n.mangaRequestAvailableBody(payload.mangaTitle);
  } else if (payload.event === 'SERVER_CRITICAL_ERROR') {
    title = i18n.serverCriticalErrorTitle();
  } else if (payload.event === 'TEST') {
    title = i18n.testNotificationTitle();
    body = i18n.testNotificationBody();
  }

  return {
    ...payload,
    title,
    body,
  };
}

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
  const serverLang = (settings as any)?.serverLanguage || 'es';
  const sentTargets = new Set<string>();

  try {
    // Helper to send to a user with deduplication & logging
    const sendToUserSafe = async (user: any) => {
      const userLang = user.language || serverLang;
      const localizedPayload = resolvePayloadForLang(fullPayload, userLang);

      // WhatsApp
      const waPhone = user.whatsappPhone || (user.role === 'SUPERADMIN' ? settings?.whatsappPhone : null);
      const waKey = user.whatsappApiKey || (user.role === 'SUPERADMIN' ? settings?.whatsappApiKey : null);
      const waEnabled = user.whatsappEnabled || (user.role === 'SUPERADMIN' && settings?.whatsappEnabled);
      if (waEnabled && waPhone && waKey) {
        const key = `wa:${waPhone.replace(/[\s+-]/g, '')}`;
        if (!sentTargets.has(key)) {
          sentTargets.add(key);
          const ok = await whatsappProvider.sendToUser(
            { ...user, whatsappEnabled: true, whatsappPhone: waPhone, whatsappApiKey: waKey },
            localizedPayload,
          );
          await logNotification('whatsapp', event, ok, waPhone, ok ? null : 'CallMeBot dispatch failed');
        }
      }

      // Discord
      const dcWebhook = user.discordWebhookUrl || (user.role === 'SUPERADMIN' ? settings?.discordWebhookUrl : null);
      const dcEnabled = user.discordEnabled || (user.role === 'SUPERADMIN' && settings?.discordEnabled);
      if (dcEnabled && dcWebhook) {
        const key = `dc:${dcWebhook}`;
        if (!sentTargets.has(key)) {
          sentTargets.add(key);
          const ok = await discordProvider.sendToUser(
            { ...user, discordEnabled: true, discordWebhookUrl: dcWebhook },
            localizedPayload,
          );
          await logNotification('discord', event, ok, 'webhook', ok ? null : 'Discord webhook failed');
        }
      }

      // Telegram
      const tgChatId = user.telegramChatId || (user.role === 'SUPERADMIN' ? settings?.telegramChatId : null);
      const tgEnabled = user.telegramEnabled || (user.role === 'SUPERADMIN' && settings?.telegramEnabled);
      if (tgEnabled && tgChatId) {
        const key = `tg:${tgChatId}`;
        if (!sentTargets.has(key)) {
          sentTargets.add(key);
          const ok = await telegramProvider.sendToUser(
            { ...user, telegramEnabled: true, telegramChatId: tgChatId },
            localizedPayload,
            settings,
          );
          await logNotification('telegram', event, ok, tgChatId, ok ? null : 'Telegram dispatch failed');
        }
      }
    };

    // 1. Notificación dirigida a un usuario específico (ej: Manga solicitado disponible)
    if (targetUserId) {
      const user = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (user && user.notificationsEnabled !== false && user.notifyEvents.includes(event)) {
        await sendToUserSafe(user);
      }
      return;
    }

    // 2. Notificación de nuevo capítulo para lectores que tienen el manga en favoritos
    if (event === 'FAVORITE_CHAPTER_DOWNLOADED' && fullPayload.mangaId) {
      const favoriteUsers = await prisma.userFavoriteManga.findMany({
        where: { mangaId: fullPayload.mangaId },
        include: { user: true },
      });

      const activeUsers = favoriteUsers
        .filter((fav) => fav.user.notificationsEnabled !== false && fav.user.notifyEvents.includes(event))
        .map((fav) => fav.user);

      await Promise.allSettled(activeUsers.map((u) => sendToUserSafe(u)));
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
        .map((u) => sendToUserSafe(u));

      await Promise.allSettled(userPromises);

      // Enviar a los canales globales del servidor si aún no han sido enviados por deduplicación
      if (settings) {
        const serverPayload = resolvePayloadForLang(fullPayload, serverLang);

        if (settings.whatsappEnabled && settings.whatsappPhone && settings.whatsappApiKey) {
          const key = `wa:${settings.whatsappPhone.replace(/[\s+-]/g, '')}`;
          if (!sentTargets.has(key)) {
            sentTargets.add(key);
            const ok = await whatsappProvider.sendSystem(settings, serverPayload);
            await logNotification('whatsapp', event, ok, settings.whatsappPhone, ok ? null : 'System CallMeBot failed');
          }
        }

        if (settings.discordEnabled && settings.discordWebhookUrl) {
          const key = `dc:${settings.discordWebhookUrl}`;
          if (!sentTargets.has(key)) {
            sentTargets.add(key);
            const ok = await discordProvider.sendSystem(settings, serverPayload);
            await logNotification('discord', event, ok, 'system-webhook', ok ? null : 'System Discord webhook failed');
          }
        }

        if (settings.telegramEnabled && settings.telegramChatId && settings.telegramToken) {
          const key = `tg:${settings.telegramChatId}`;
          if (!sentTargets.has(key)) {
            sentTargets.add(key);
            const ok = await telegramProvider.sendSystem(settings, serverPayload);
            await logNotification('telegram', event, ok, settings.telegramChatId, ok ? null : 'System Telegram failed');
          }
        }
      }
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
