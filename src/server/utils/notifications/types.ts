export type NotificationEventType =
  | 'MANGA_REQUEST_AVAILABLE'
  | 'FAVORITE_CHAPTER_DOWNLOADED'
  | 'SOURCE_DEACTIVATED'
  | 'CHAPTER_DOWNLOAD_FAILED'
  | 'NEW_MANGA_REQUEST'
  | 'SERVER_CRITICAL_ERROR'
  | 'TEST';

export interface NotificationPayload {
  event: NotificationEventType;
  title: string;
  body: string;
  url?: string;
  mangaId?: number;
  mangaTitle?: string;
  chapterIndex?: number;
  chapterFileName?: string;
  source?: string;
  severity?: 'info' | 'success' | 'warn' | 'error';
}

export interface INotificationProvider {
  name: string;
  sendToUser: (user: any, payload: NotificationPayload) => Promise<boolean>;
  sendSystem: (settings: any, payload: NotificationPayload) => Promise<boolean>;
  test: (config: any) => Promise<{ success: boolean; message: string }>;
}
