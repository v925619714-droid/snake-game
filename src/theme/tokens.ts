// Единый источник правды по дизайну (Neon Arena). Импортируется во всех экранах
// вместо локальных COLORS/C. Фаза 0 — палитра/радиусы/отступы/тени; шрифты добавим в Фазе 2.

export const palette = {
  // База (тёмная, с глубиной)
  void: '#070A10', // края виньетки
  bg: '#0B0F17', // основной фон
  surface: '#121826', // карточки/панели
  surfaceHi: '#19223A', // приподнятая панель
  board: '#0C111B', // игровое поле — темнее карточек («провал» внутрь)
  border: '#1D2940',
  borderGlass: 'rgba(255,255,255,0.07)', // тонкий «стеклянный» бордер
  borderGlow: 'rgba(124,247,212,0.20)', // светящийся бордер (рамка поля)
  btn: '#121826',
  btnPressed: '#19223A',

  // Текст
  text: '#E8F0FB',
  textDim: '#8395AE',
  textFaint: '#46566C',

  // Бренд-акцент (тот самый градиент teal→blue→violet)
  brand1: '#7CF7D4',
  brand2: '#5CC8FF',
  brand3: '#9B6CFF',
  accent: '#3DDC84',
  onAccent: '#06180E', // текст на светлых акцентах/градиентах
  onBrand: '#F4ECFF',

  // Игроки / еда / монета
  red: '#FF5C5C',
  redHead: '#FFB0A3',
  blue: '#5CC8FF',
  blueHead: '#B3E8FF',
  food: '#FF5C5C',
  coin: '#F1C40F',
  coinHi: '#FFE680',
  danger: '#FF6B6B',
};

// Градиенты (expo-linear-gradient). Горизонтальные задаём start/end в компоненте.
export const gradients = {
  vignette: ['#16213C', '#0B0F17', '#070A10'] as const, // фон (вертикальный)
  brand: ['#7CF7D4', '#5CC8FF', '#9B6CFF'] as const,
  play: ['#7CF7D4', '#3DDC84'] as const, // Versus / Start
  ranked: ['#9B6CFF', '#6B46C9'] as const, // Ranked
  coin: ['#FFE680', '#F1C40F'] as const,
  redP: ['#FF8A8A', '#FF5C5C'] as const,
  blueP: ['#9BDCFF', '#5CC8FF'] as const,
};

// Тиры: цвет + градиент для бейджей.
export const tierStyle: Record<string, { color: string; grad: readonly [string, string] }> = {
  Bronze: { color: '#E0A86A', grad: ['#E0A86A', '#9C6B34'] },
  Silver: { color: '#D8DEE9', grad: ['#EAEFF6', '#A8B2C2'] },
  Gold: { color: '#FFD75E', grad: ['#FFE680', '#E0A800'] },
  Platinum: { color: '#7FE0FF', grad: ['#B3E8FF', '#5CC8FF'] },
  Diamond: { color: '#B9F2FF', grad: ['#E8FBFF', '#8FE3F5'] },
};

// Шрифты (грузятся через useFonts в App).
// ⚠️ Space Grotesk НЕ содержит кириллицу → на переводимом тексте падал в системный serif.
// display (переводимые заголовки/CTA) — Manrope (полная кириллица);
// brand — Space Grotesk ТОЛЬКО для непереводимого: логотип «SHAKE WORK OFF»;
// num — Space Grotesk для чисел и кодов комнат (цифры/латиница).
export const fonts = {
  display: 'Manrope_800ExtraBold',
  displayMed: 'Manrope_600SemiBold',
  brand: 'SpaceGrotesk_700Bold',
  num: 'SpaceGrotesk_700Bold',
  body: 'Inter_500Medium',
  bodyBold: 'Inter_600SemiBold',
};

// Затемнение hex-цвета (t: 0 = исходный, 1 = чёрный). Для градиента яркости тела змейки.
export function shade(hex: string, t: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const f = (c: number) => Math.round(c * (1 - t));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export const radius = { sm: 12, md: 14, lg: 18, xl: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const elevation = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  glow: {
    shadowColor: '#5CC8FF',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
};
