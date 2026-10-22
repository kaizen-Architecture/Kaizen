import { INotificationProvider, NotificationPayload } from '../types';
import { logger } from '../../../../utils/logging';

export class DiscordProvider implements INotificationProvider {
  name = 'discord';

  private getEmbedColor(severity?: string): number {
    switch (severity) {
      case 'error':
        return 0xef4444; // Red
      case 'warn':
        return 0xf59e0b; // Amber / Orange
      case 'success':
        return 0x10b981; // Green
      default:
        return 0x6366f1; // Indigo (Kaizen primary)
    }
  }

  private async sendWebhook(webhookUrl: string, payload: NotificationPayload): Promise<boolean> {
    try {
      if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        logger.warn('[Discord] Invalid webhook URL provided.');
        return false;
      }

      const color = this.getEmbedColor(payload.severity);
      const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

      if (payload.mangaTitle) {
        fields.push({ name: 'Manga', value: payload.mangaTitle, inline: true });
      }
      if (payload.chapterIndex !== undefined) {
        fields.push({ name: 'Capítulo', value: `#${payload.chapterIndex + 1}`, inline: true });
      }
      if (payload.source) {
        fields.push({ name: 'Fuente', value: payload.source, inline: true });
      }

      const body = {
        username: 'Kaizen Alertas',
        avatar_url: 'https://raw.githubusercontent.com/kaizen-Architecture/Kaizen/main/public/kaizen.png',
        embeds: [
          {
            title: payload.title,
            description: payload.body,
            url: payload.url || undefined,
            color,
            fields: fields.length > 0 ? fields : undefined,
            footer: {
              text: 'Kaizen Manga Downloader & Manager',
            },
            timestamp: new Date().toISOString(),
          },
        ],
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        logger.error(`[Discord] Failed to send webhook. HTTP ${res.status}`);
        return false;
      }
      return true;
    } catch (err: any) {
      logger.error(`[Discord] Error sending webhook: ${err?.message || err}`);
      return false;
    }
  }

  async sendToUser(user: any, payload: NotificationPayload): Promise<boolean> {
    if (!user.discordEnabled || !user.discordWebhookUrl) {
      return false;
    }
    return this.sendWebhook(user.discordWebhookUrl, payload);
  }

  async sendSystem(settings: any, payload: NotificationPayload): Promise<boolean> {
    if (!settings.discordEnabled || !settings.discordWebhookUrl) {
      return false;
    }
    return this.sendWebhook(settings.discordWebhookUrl, payload);
  }

  async test(config: { webhookUrl: string }): Promise<{ success: boolean; message: string }> {
    if (!config.webhookUrl) {
      return { success: false, message: 'Webhook URL is required.' };
    }
    const testPayload: NotificationPayload = {
      event: 'TEST',
      title: 'Conexión con Discord verificada',
      body: '¡Este es un mensaje de prueba exitoso enviado desde tu servidor Kaizen!',
      severity: 'success',
    };
    const ok = await this.sendWebhook(config.webhookUrl, testPayload);
    return ok
      ? { success: true, message: 'Mensaje de prueba enviado con éxito a Discord.' }
      : { success: false, message: 'No se pudo enviar el webhook. Verifica la URL de Discord.' };
  }
}
