// Шеринг результата (виральность). Нативно — системный share-лист (react-native Share),
// на web — navigator.share, иначе копирование в буфер. Офлайн-безопасно (no-op при ошибке).
import { Platform, Share } from 'react-native';

// Публичная ссылка на игру (для бэклинка в шеринге).
export const GAME_URL = 'https://snake.skillmake.ru/';

export type ShareOutcome = 'shared' | 'copied' | 'failed';

export async function shareResult(message: string, url: string = GAME_URL): Promise<ShareOutcome> {
  const full = `${message} ${url}`;
  try {
    if (Platform.OS === 'web') {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.share) {
        await nav.share({ text: message, url });
        return 'shared';
      }
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(full);
        return 'copied';
      }
      return 'failed';
    }
    await Share.share({ message: full });
    return 'shared';
  } catch {
    return 'failed';
  }
}
