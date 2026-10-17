export type SupportedLanguage = 'es' | 'en';

export const notificationI18n = {
  es: {
    sourceDeactivatedTitle: (source: string) => `Fuente Auto-Desactivada: ${source}`,
    sourceDeactivatedBody: (source: string, threshold = 5) =>
      `La fuente "${source}" ha fallado ${threshold} veces consecutivas y ha sido desactivada automáticamente para proteger el sistema.`,

    downloadFailedTitle: (manga: string) => `Fallo de Descarga: ${manga}`,
    downloadFailedBody: (chapter: number, source: string, error: string) =>
      `Error al descargar el capítulo #${chapter} desde la fuente "${source}": ${error}`,

    favoriteChapterTitle: (manga: string) => `Nuevo Capítulo: ${manga}`,
    favoriteChapterBody: (chapter: number, manga: string, source: string) =>
      `Se ha descargado el capítulo #${chapter} de "${manga}" desde ${source}.`,

    mangaRequestAvailableTitle: (manga: string) => `Manga Solicitado Disponible: ${manga}`,
    mangaRequestAvailableBody: (manga: string) =>
      `¡El manga "${manga}" que solicitaste ya está descargado y disponible para leer en tu biblioteca!`,

    serverCriticalErrorTitle: () => `Error Crítico del Servidor`,

    testNotificationTitle: () => `Prueba de Notificación Kaizen`,
    testNotificationBody: () =>
      `¡Todo listo! Las notificaciones de Kaizen están configuradas y funcionando correctamente.`,

    // Digest
    digestTitle: '📊 Kaizen: Resumen de Actividad de Descargas',
    digestFailuresHeader: '❌ Fallos de descarga detectados:',
    digestDownloadsHeader: '✅ Nuevos capítulos descargados:',
    digestChapters: 'Cap.',
    digestTo: 'al',
    digestSource: 'Fuente:',
    digestTotal: 'Total de eventos procesados:',
    digestAction: '👉 Revisa la pestaña de descargas o las fuentes para más detalles.',
  },

  en: {
    sourceDeactivatedTitle: (source: string) => `Source Auto-Deactivated: ${source}`,
    sourceDeactivatedBody: (source: string, threshold = 5) =>
      `Source "${source}" failed ${threshold} consecutive times and was automatically deactivated to protect the system.`,

    downloadFailedTitle: (manga: string) => `Download Failed: ${manga}`,
    downloadFailedBody: (chapter: number, source: string, error: string) =>
      `Failed to download chapter #${chapter} from source "${source}": ${error}`,

    favoriteChapterTitle: (manga: string) => `New Chapter: ${manga}`,
    favoriteChapterBody: (chapter: number, manga: string, source: string) =>
      `Chapter #${chapter} of "${manga}" has been downloaded from ${source}.`,

    mangaRequestAvailableTitle: (manga: string) => `Requested Manga Available: ${manga}`,
    mangaRequestAvailableBody: (manga: string) =>
      `The manga "${manga}" you requested is now downloaded and available to read in your library!`,

    serverCriticalErrorTitle: () => `Server Critical Error`,

    testNotificationTitle: () => `Kaizen Notification Test`,
    testNotificationBody: () =>
      `All set! Kaizen notifications are configured and working properly.`,

    // Digest
    digestTitle: '📊 Kaizen: Download Activity Digest',
    digestFailuresHeader: '❌ Detected download failures:',
    digestDownloadsHeader: '✅ New chapters downloaded:',
    digestChapters: 'Ch.',
    digestTo: 'to',
    digestSource: 'Source:',
    digestTotal: 'Total events processed:',
    digestAction: '👉 Check the downloads tab or sources for more details.',
  },
};

export function getNotificationI18n(lang?: string | null) {
  const normalized = (lang || '').toLowerCase().startsWith('en') ? 'en' : 'es';
  return notificationI18n[normalized];
}
