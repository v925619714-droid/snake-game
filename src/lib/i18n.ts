// Локализация UI: 5 языков, лёгкий словарь без библиотек (по образцу settings.ts —
// sync-геттеры, загрузка один раз на старте). Первый запуск — язык системы
// (expo-localization), дальше — выбор пользователя в Settings (AsyncStorage).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';

export type Lang = 'en' | 'ru' | 'es' | 'de' | 'pt';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
];

const LANG_KEY = 'snake:lang';
let lang: Lang = 'en';

function systemLang(): Lang {
  try {
    const code = (getLocales()[0]?.languageCode || 'en').toLowerCase();
    if (code === 'ru' || code === 'be' || code === 'kk' || code === 'uk') return 'ru';
    if (code === 'es') return 'es';
    if (code === 'de') return 'de';
    if (code === 'pt') return 'pt';
  } catch {}
  return 'en';
}

export async function initI18n(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ru' || saved === 'es' || saved === 'de' || saved === 'pt') {
      lang = saved;
    } else {
      lang = systemLang();
    }
  } catch {
    lang = systemLang();
  }
}

export const getLang = (): Lang => lang;

export async function setLang(v: Lang): Promise<void> {
  lang = v;
  try {
    await AsyncStorage.setItem(LANG_KEY, v);
  } catch {}
}

type Entry = Record<Lang, string>;

const S = {
  // Меню
  tagline: { en: 'LAST SNAKE STANDING', ru: 'ПОСЛЕДНЯЯ ЗМЕЙКА В ОФИСЕ', es: 'LA ÚLTIMA SERPIENTE EN PIE', de: 'DIE LETZTE SCHLANGE GEWINNT', pt: 'A ÚLTIMA COBRA DE PÉ' },
  guestChip: { en: 'Guest · sign in to sync', ru: 'Гость · войди для синхронизации', es: 'Invitado · inicia sesión', de: 'Gast · anmelden zum Sync', pt: 'Convidado · entre p/ sincronizar' },
  daily: { en: 'Daily', ru: 'Бонус дня', es: 'Diario', de: 'Täglich', pt: 'Diário' },
  day: { en: 'Day', ru: 'День', es: 'Día', de: 'Tag', pt: 'Dia' },
  claim: { en: 'Claim', ru: 'Забрать', es: 'Reclamar', de: 'Abholen', pt: 'Resgatar' },
  best: { en: 'BEST', ru: 'РЕКОРД', es: 'RÉCORD', de: 'REKORD', pt: 'RECORDE' },
  play: { en: 'Play', ru: 'Играть', es: 'Jugar', de: 'Spielen', pt: 'Jogar' },
  versus: { en: 'Versus', ru: 'Дуэль', es: 'Versus', de: 'Versus', pt: 'Versus' },
  ranked: { en: 'Ranked', ru: 'Рейтинг', es: 'Clasificatoria', de: 'Rangliste', pt: 'Ranqueada' },
  party: { en: 'Office Royale (beta)', ru: 'Office Royale (бета)', es: 'Office Royale (beta)', de: 'Office Royale (Beta)', pt: 'Office Royale (beta)' },
  shop: { en: 'Shop', ru: 'Магазин', es: 'Tienda', de: 'Shop', pt: 'Loja' },
  leaderboard: { en: 'Leaderboard', ru: 'Лидеры', es: 'Clasificación', de: 'Bestenliste', pt: 'Classificação' },
  dailyQuests: { en: '🎯 Daily quests', ru: '🎯 Задания дня', es: '🎯 Misiones diarias', de: '🎯 Tagesquests', pt: '🎯 Missões diárias' },
  howToPlay: { en: 'How to play', ru: 'Как играть', es: 'Cómo jugar', de: 'Spielanleitung', pt: 'Como jogar' },

  // Соло
  score: { en: 'SCORE', ru: 'СЧЁТ', es: 'PUNTOS', de: 'PUNKTE', pt: 'PONTOS' },
  menuBack: { en: '‹ Menu', ru: '‹ Меню', es: '‹ Menú', de: '‹ Menü', pt: '‹ Menu' },
  swipeHint: { en: 'Swipe anywhere or use the D-pad', ru: 'Свайп в любом месте или кнопки', es: 'Desliza o usa la cruceta', de: 'Wischen oder Steuerkreuz nutzen', pt: 'Deslize ou use o direcional' },
  paused: { en: 'Paused', ru: 'Пауза', es: 'Pausa', de: 'Pause', pt: 'Pausa' },
  resume: { en: 'Resume', ru: 'Продолжить', es: 'Continuar', de: 'Weiter', pt: 'Continuar' },
  gameOver: { en: 'Game over', ru: 'Игра окончена', es: 'Fin del juego', de: 'Game Over', pt: 'Fim de jogo' },
  ready: { en: 'Ready?', ru: 'Готов?', es: '¿Listo?', de: 'Bereit?', pt: 'Pronto?' },
  start: { en: 'Start', ru: 'Старт', es: 'Empezar', de: 'Start', pt: 'Começar' },
  again: { en: 'Again', ru: 'Ещё раз', es: 'Otra vez', de: 'Nochmal', pt: 'De novo' },
  shareScore: { en: 'Share score', ru: 'Поделиться', es: 'Compartir', de: 'Teilen', pt: 'Compartilhar' },
  linkCopied: { en: 'Link copied!', ru: 'Ссылка скопирована!', es: '¡Enlace copiado!', de: 'Link kopiert!', pt: 'Link copiado!' },

  // Магазин
  skins: { en: 'Skins', ru: 'Скины', es: 'Aspectos', de: 'Skins', pt: 'Skins' },
  getCoins: { en: 'Get coins', ru: 'Купить монеты', es: 'Conseguir monedas', de: 'Münzen kaufen', pt: 'Obter moedas' },
  coins: { en: 'coins', ru: 'монет', es: 'monedas', de: 'Münzen', pt: 'moedas' },
  free: { en: 'Free', ru: 'Бесплатно', es: 'Gratis', de: 'Gratis', pt: 'Grátis' },
  selected: { en: 'Selected', ru: 'Выбран', es: 'Elegido', de: 'Gewählt', pt: 'Escolhido' },
  select: { en: 'Select', ru: 'Выбрать', es: 'Elegir', de: 'Wählen', pt: 'Escolher' },
  buy: { en: 'Buy', ru: 'Купить', es: 'Comprar', de: 'Kaufen', pt: 'Comprar' },
  close: { en: 'Close', ru: 'Закрыть', es: 'Cerrar', de: 'Schließen', pt: 'Fechar' },

  // Настройки
  settings: { en: 'Settings', ru: 'Настройки', es: 'Ajustes', de: 'Einstellungen', pt: 'Ajustes' },
  sound: { en: 'Sound', ru: 'Звук', es: 'Sonido', de: 'Ton', pt: 'Som' },
  soundDesc: { en: 'Game sound effects', ru: 'Звуковые эффекты игры', es: 'Efectos de sonido', de: 'Soundeffekte', pt: 'Efeitos sonoros' },
  haptics: { en: 'Haptics', ru: 'Вибрация', es: 'Vibración', de: 'Haptik', pt: 'Vibração' },
  hapticsDesc: { en: 'Vibration feedback (device only)', ru: 'Виброотклик (на устройстве)', es: 'Respuesta háptica (solo móvil)', de: 'Vibrationsfeedback (nur Gerät)', pt: 'Resposta tátil (só no aparelho)' },
  colorblind: { en: 'Color-blind shapes', ru: 'Формы для дальтоников', es: 'Formas p/ daltónicos', de: 'Formen f. Farbenblinde', pt: 'Formas p/ daltônicos' },
  colorblindDesc: { en: 'Distinct food shapes in duels (square = rival)', ru: 'Разные формы еды в дуэли (квадрат = чужая)', es: 'Formas distintas en duelos (cuadrado = rival)', de: 'Futterformen im Duell (Quadrat = Gegner)', pt: 'Formas na comida em duelos (quadrado = rival)' },
  controls: { en: 'Controls', ru: 'Управление', es: 'Controles', de: 'Steuerung', pt: 'Controles' },
  controlsDesc: { en: 'Swipe works everywhere in every scheme', ru: 'Свайп работает всегда в любой схеме', es: 'Deslizar funciona siempre', de: 'Wischen geht immer', pt: 'Deslizar funciona sempre' },
  ctrlDpad: { en: 'D-pad', ru: 'Кнопки', es: 'Cruceta', de: 'Steuerkreuz', pt: 'Direcional' },
  ctrlSplit: { en: 'Split', ru: 'Двумя руками', es: 'Dividido', de: 'Geteilt', pt: 'Dividido' },
  ctrlSwipe: { en: 'Swipe', ru: 'Свайп', es: 'Deslizar', de: 'Wischen', pt: 'Deslizar' },
  dpadPos: { en: 'D-pad position', ru: 'Положение кнопок', es: 'Posición de cruceta', de: 'Position Steuerkreuz', pt: 'Posição do direcional' },
  dpadPosDesc: { en: 'Dock to a side for one-handed play', ru: 'Прижать к краю для игры одной рукой', es: 'Al borde para jugar con una mano', de: 'Am Rand für Einhandspiel', pt: 'Na borda p/ jogar com uma mão' },
  left: { en: 'Left', ru: 'Слева', es: 'Izquierda', de: 'Links', pt: 'Esquerda' },
  center: { en: 'Center', ru: 'По центру', es: 'Centro', de: 'Mitte', pt: 'Centro' },
  right: { en: 'Right', ru: 'Справа', es: 'Derecha', de: 'Rechts', pt: 'Direita' },
  language: { en: 'Language', ru: 'Язык', es: 'Idioma', de: 'Sprache', pt: 'Idioma' },
  back: { en: 'Back', ru: 'Назад', es: 'Atrás', de: 'Zurück', pt: 'Voltar' },
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof S;

export function t(key: StringKey): string {
  return S[key][lang] ?? S[key].en;
}
