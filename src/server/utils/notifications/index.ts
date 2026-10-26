import { prisma } from '../../db/client';
import { logger } from '../../../utils/logging';
import { getCachedSettings } from '../settings-cache';
import { NotificationEventType, NotificationPayload } from './types';
import { WhatsAppProvider } from './providers/whatsapp';
import { DiscordProvider } from './providers/discord';
import { TelegramProvider } from './providers/telegram';
import { getNotificationI18n, buildDigestMessage } from './i18n';

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
export function resolvePayloadForLang(
  payload: NotificationPayload,
  lang?: string | null,
  baseUrl?: string | null,
): NotificationPayload {
  const i18n = getNotificationI18n(lang);
  let title = payload.title;
  let body = payload.body;
  let url = payload.url;

  if (payload.event === 'DOWNLOAD_DIGEST') {
    if (payload.digestData) {
      const built = buildDigestMessage(payload.digestData, lang || 'es', url || baseUrl);
      title = built.title;
      body = built.body;
    } else {
      title = i18n.digestTitle;
    }
  } else if (payload.event === 'SOURCE_DEACTIVATED' && payload.source) {
    title = i18n.sourceDeactivatedTitle(payload.source);
    body = i18n.sourceDeactivatedBody(payload.source);
  } else if (payload.event === 'CHAPTER_DOWNLOAD_FAILED' && payload.mangaTitle && payload.chapterIndex !== undefined) {
    title = i18n.downloadFailedTitle(payload.mangaTitle);
    const fallbackSource = (lang || '').toLowerCase().startsWith('en') ? 'primary' : 'primaria';
    body = i18n.downloadFailedBody(payload.chapterIndex + 1, payload.source || fallbackSource, payload.errorText || body);
  } else if (payload.event === 'FAVORITE_CHAPTER_DOWNLOADED' && payload.mangaTitle && payload.chapterIndex !== undefined) {
    title = i18n.favoriteChapterTitle(payload.mangaTitle);
    const fallbackSource = (lang || '').toLowerCase().startsWith('en') ? 'primary' : 'primaria';
    body = i18n.favoriteChapterBody(payload.chapterIndex + 1, payload.mangaTitle, payload.source || fallbackSource);
  } else if (payload.event === 'MANGA_REQUEST_AVAILABLE' && payload.mangaTitle) {
    title = i18n.mangaRequestAvailableTitle(payload.mangaTitle);
    body = i18n.mangaRequestAvailableBody(payload.mangaTitle);
  } else if (payload.event === 'SERVER_CRITICAL_ERROR') {
    title = payload.title || i18n.serverCriticalErrorTitle();
  } else if (payload.event === 'TEST') {
    title = i18n.testNotificationTitle();
    body = i18n.testNotificationBody();
  }

  // Auto-generate URL if baseUrl is available and payload doesn't already have one
  if (!url && baseUrl) {
    const cleanBase = baseUrl.trim().replace(/\/+$/, '');
    if (payload.mangaId) {
      url = `${cleanBase}/manga/${payload.mangaId}`;
    } else if (payload.event === 'SOURCE_DEACTIVATED') {
      url = `${cleanBase}/sources`;
    } else if (payload.event === 'DOWNLOAD_DIGEST' || payload.event === 'CHAPTER_DOWNLOAD_FAILED') {
      url = `${cleanBase}/`;
    }
  }

  return {
    ...payload,
    title,
    body,
    url,
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
  const baseUrl =
    (settings as any)?.serverBaseUrl ||
    process.env.APP_URL ||
    process.env.KAIZEN_URL ||
    process.env.NEXTAUTH_URL ||
    null;
  const sentTargets = new Set<string>();

  try {
    // Helper to send to a user with deduplication & logging
    const sendToUserSafe = async (user: any) => {
      const userLang = user.language || serverLang;
      const localizedPayload = resolvePayloadForLang(fullPayload, userLang, baseUrl);

      // WhatsApp
      const waEnabled = Boolean(user.whatsappEnabled);
      const waPhone = user.whatsappPhone || (user.role === 'SUPERADMIN' ? settings?.whatsappPhone : null);
      const waKey = user.whatsappApiKey || (user.role === 'SUPERADMIN' ? settings?.whatsappApiKey : null);
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
      const dcEnabled = Boolean(user.discordEnabled);
      const dcWebhook = user.discordWebhookUrl || (user.role === 'SUPERADMIN' ? settings?.discordWebhookUrl : null);
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
      const tgEnabled = Boolean(user.telegramEnabled);
      const tgChatId = user.telegramChatId || (user.role === 'SUPERADMIN' ? settings?.telegramChatId : null);
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

    // 3. Notificación de eventos del sistema / administración (Fuente caída, descarga fallida, digest, etc.)
    const systemEvents: NotificationEventType[] = [
      'SOURCE_DEACTIVATED',
      'CHAPTER_DOWNLOAD_FAILED',
      'NEW_MANGA_REQUEST',
      'SERVER_CRITICAL_ERROR',
      'DOWNLOAD_DIGEST',
    ];

    if (systemEvents.includes(event)) {
      const managerUsers = await prisma.user.findMany({
        where: { role: { in: ['SUPERADMIN', 'MANAGER'] } },
      });

      const userPromises = managerUsers
        .filter((u) => {
          if (u.notificationsEnabled === false) return false;
          if (u.notifyEvents.includes(event)) return true;
          // Backwards compatibility for DOWNLOAD_DIGEST
          if (event === 'DOWNLOAD_DIGEST') {
            return (
              u.notifyEvents.includes('DOWNLOAD_DIGEST') ||
              u.notifyEvents.includes('CHAPTER_DOWNLOAD_FAILED') ||
              u.notifyEvents.includes('SERVER_CRITICAL_ERROR')
            );
          }
          return false;
        })
        .map((u) => sendToUserSafe(u));

      await Promise.allSettled(userPromises);

      // Enviar a los canales globales del servidor si aún no han sido enviados por deduplicación
      if (settings) {
        const serverPayload = resolvePayloadForLang(fullPayload, serverLang, baseUrl);

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
