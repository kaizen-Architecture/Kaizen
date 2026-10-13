import { INotificationProvider, NotificationPayload } from '../types';
import { logger } from '../../../utils/logging';

export class WhatsAppProvider implements INotificationProvider {
  name = 'whatsapp';

  private async sendCallMeBot(phone: string, apiKey: string, text: string): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/[\s+-]/g, '');
      const encodedText = encodeURIComponent(text);
      const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodedText}&apikey=${apiKey}`;

      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        logger.error(`[WhatsApp CallMeBot] Failed to send message. HTTP ${res.status}`);
        return false;
      }
      return true;
    } catch (err: any) {
      logger.error(`[WhatsApp CallMeBot] Error sending notification: ${err?.message || err}`);
      return false;
    }
  }

  async sendToUser(user: any, payload: NotificationPayload): Promise<boolean> {
    if (!user.whatsappEnabled || !user.whatsappPhone || !user.whatsappApiKey) {
      return false;
    }

    const icon = payload.severity === 'error' ? '❌' : payload.severity === 'warn' ? '🚨' : payload.severity === 'success' ? '✅' : '📖';
    const text = `*${icon} [Kaizen] ${payload.title}*\n\n${payload.body}${payload.url ? `\n\n🔗 ${payload.url}` : ''}`;

    return this.sendCallMeBot(user.whatsappPhone, user.whatsappApiKey, text);
  }

  async sendSystem(settings: any, payload: NotificationPayload): Promise<boolean> {
    if (!settings.whatsappEnabled || !settings.whatsappPhone || !settings.whatsappApiKey) {
      return false;
    }

    const icon = payload.severity === 'error' ? '❌' : payload.severity === 'warn' ? '🚨' : 'ℹ️';
    const text = `*${icon} [Kaizen Alerta Global] ${payload.title}*\n\n${payload.body}${payload.url ? `\n\n🔗 ${payload.url}` : ''}`;

    return this.sendCallMeBot(settings.whatsappPhone, settings.whatsappApiKey, text);
  }

  async test(config: { phone: string; apiKey: string }): Promise<{ success: boolean; message: string }> {
    if (!config.phone || !config.apiKey) {
      return { success: false, message: 'Phone number and API Key are required.' };
    }
    const testText = '✅ *[Kaizen]* ¡Conexión con WhatsApp verificada con éxito!';
    const ok = await this.sendCallMeBot(config.phone, config.apiKey, testText);
    return ok
      ? { success: true, message: 'Mensaje de prueba enviado con éxito a WhatsApp.' }
      : { success: false, message: 'No se pudo enviar el mensaje. Verifica tu número y tu API Key de CallMeBot.' };
  }
}
