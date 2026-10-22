import TelegramBot from 'node-telegram-bot-api';
import { INotificationProvider, NotificationPayload } from '../types';
import { logger } from '../../../../utils/logging';

export class TelegramProvider implements INotificationProvider {
  name = 'telegram';

  private async sendMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
    try {
      const bot = new TelegramBot(botToken);
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
      return true;
    } catch (err: any) {
      logger.error(`[Telegram] Failed to send notification: ${err?.message || err}`);
      return false;
    }
  }

  async sendToUser(user: any, payload: NotificationPayload, globalSettings?: any): Promise<boolean> {
    const token = globalSettings?.telegramToken;
    if (!user.telegramEnabled || !user.telegramChatId || !token) {
      return false;
    }

    const icon = payload.severity === 'error' ? '❌' : payload.severity === 'warn' ? '🚨' : payload.severity === 'success' ? '✅' : '📖';
    const text = `<b>${icon} [Kaizen] ${payload.title}</b>\n\n${payload.body}${payload.url ? `\n\n<a href="${payload.url}">Abrir enlace</a>` : ''}`;

    return this.sendMessage(token, user.telegramChatId, text);
  }

  async sendSystem(settings: any, payload: NotificationPayload): Promise<boolean> {
    if (!settings.telegramEnabled || !settings.telegramChatId || !settings.telegramToken) {
      return false;
    }

    const icon = payload.severity === 'error' ? '❌' : payload.severity === 'warn' ? '🚨' : 'ℹ️';
    const text = `<b>${icon} [Kaizen Alerta] ${payload.title}</b>\n\n${payload.body}${payload.url ? `\n\n<a href="${payload.url}">Abrir enlace</a>` : ''}`;

    return this.sendMessage(settings.telegramToken, settings.telegramChatId, text);
  }

  async test(config: { token: string; chatId: string }): Promise<{ success: boolean; message: string }> {
    if (!config.token || !config.chatId) {
      return { success: false, message: 'Bot Token and Chat ID are required.' };
    }
    const testText = '<b>✅ [Kaizen]</b> ¡Conexión con Telegram verificada con éxito!';
    const ok = await this.sendMessage(config.token, config.chatId, testText);
    return ok
      ? { success: true, message: 'Mensaje de prueba enviado con éxito a Telegram.' }
      : { success: false, message: 'No se pudo enviar el mensaje a Telegram. Verifica el Bot Token y el Chat ID.' };
  }
}
