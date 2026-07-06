import { type ReactElement, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette as C, gradients, fonts, elevation, glow } from '../theme/tokens';
import { TouchScale, FadePop } from '../ui/anim';
import { EVENTS, track } from '../lib/analytics';
import { t, type StringKey } from '../lib/i18n';

// Первый запуск: коротко объясняем суть и (главное) правила дуэли — без этого
// новички не понимают «ешь свой цвет / выживай». Бьёт по D1-удержанию (T26).

interface Slide {
  key: string;
  title: StringKey; // ключи i18n — слайды локализуются при рендере
  body: StringKey;
  visual: () => ReactElement;
}

// ── Мини-сцены на сетке поля (C1): иллюстрации выглядят как настоящая игра ──
const SC = 18; // клетка мини-сцены

// Тёмная мини-доска с сеткой — фон каждой сценки.
function SceneBoard({ cols = 12, rows = 5, children }: { cols?: number; rows?: number; children: ReactElement | ReactElement[] }) {
  return (
    <View style={[styles.sceneBoard, { width: cols * SC + 3, height: rows * SC + 3 }]}>
      {Array.from({ length: cols * rows }, (_, i) => (
        <View key={i} style={styles.sceneGridCell} />
      ))}
      {children}
    </View>
  );
}

// Сегмент змейки в клетке (cx, cy); голова — с глазами и свечением.
function Seg({ cx, cy, color, head, headColor }: { cx: number; cy: number; color: string; head?: boolean; headColor?: string }) {
  return (
    <View style={[styles.sceneAbs, { left: cx * SC + 2.5, top: cy * SC + 2.5 }]}>
      <View
        style={[
          styles.seg,
          { backgroundColor: color, borderRadius: head ? 6 : 5 },
          head && headColor ? glow(headColor, 6, 0.9) : null,
        ]}
      >
        {head && (
          <>
            <View style={[styles.segEye, { left: 3 }]} />
            <View style={[styles.segEye, { right: 3 }]} />
          </>
        )}
      </View>
    </View>
  );
}

// Еда в клетке: круглая цветная или золотая «жирная».
function FoodDot({ cx, cy, color, fat }: { cx: number; cy: number; color?: string; fat?: boolean }) {
  const c = fat ? '#FFE680' : color ?? C.food;
  return (
    <View style={[styles.sceneAbs, { left: cx * SC + 3, top: cy * SC + 3 }]}>
      <View style={[styles.sceneFood, { backgroundColor: c }, glow(fat ? '#FFD75E' : c, 6, 0.95)]}>
        {fat && <View style={styles.sceneFoodCore} />}
      </View>
    </View>
  );
}

// Пометка ✓/✕ над клеткой.
function Mark({ cx, cy, text, color }: { cx: number; cy: number; text: string; color: string }) {
  return (
    <Text style={[styles.sceneMark, { left: cx * SC - SC, top: cy * SC - 1, color }]}>{text}</Text>
  );
}

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    // Две змейки идут навстречу на настоящем поле.
    title: 'ob1Title',
    body: 'ob1Body',
    visual: () => (
      <SceneBoard>
        <Seg cx={1} cy={3} color={C.red} />
        <Seg cx={2} cy={3} color={C.red} />
        <Seg cx={3} cy={3} color={C.red} />
        <Seg cx={4} cy={3} color={C.redHead} head headColor={C.redHead} />
        <Seg cx={10} cy={1} color={C.blue} />
        <Seg cx={9} cy={1} color={C.blue} />
        <Seg cx={8} cy={1} color={C.blue} />
        <Seg cx={7} cy={1} color={C.blueHead} head headColor={C.blueHead} />
      </SceneBoard>
    ),
  },
  {
    key: 'colors',
    // Красная змейка между своей (✓) и чужой (✕) едой.
    title: 'ob2Title',
    body: 'ob2Body',
    visual: () => (
      <SceneBoard>
        <Seg cx={1} cy={2} color={C.red} />
        <Seg cx={2} cy={2} color={C.red} />
        <Seg cx={3} cy={2} color={C.redHead} head headColor={C.redHead} />
        <FoodDot cx={6} cy={2} color={C.red} />
        <Mark cx={6} cy={1} text={t('obEat')} color={C.accent} />
        <FoodDot cx={9} cy={3} color={C.blue} />
        <Mark cx={9} cy={4} text={t('obDeath')} color={C.danger} />
      </SceneBoard>
    ),
  },
  {
    key: 'boost',
    // Золотая еда и змейка с «трейлом скорости».
    title: 'ob3Title',
    body: 'ob3Body',
    visual: () => (
      <SceneBoard>
        <Seg cx={2} cy={2} color={'rgba(255,92,92,0.25)'} />
        <Seg cx={3} cy={2} color={'rgba(255,92,92,0.45)'} />
        <Seg cx={4} cy={2} color={C.red} />
        <Seg cx={5} cy={2} color={C.red} />
        <Seg cx={6} cy={2} color={C.redHead} head headColor={C.redHead} />
        <FoodDot cx={9} cy={2} fat />
        <Mark cx={9} cy={0} text={t('obSpeed')} color={C.coinHi} />
      </SceneBoard>
    ),
  },
  {
    key: 'ranked',
    title: 'ob4Title',
    body: 'ob4Body',
    visual: () => (
      <View style={styles.vizRow}>
        <LinearGradient colors={gradients.ranked} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
          <Text style={styles.badgeText}>{t('obRanked')}</Text>
        </LinearGradient>
        <LinearGradient colors={gradients.coin} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.coinBadge} />
      </View>
    ),
  },
];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const finished = useRef(false);
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];

  useEffect(() => {
    track(EVENTS.onboardingShown);
  }, []);

  const finish = (skipped: boolean) => {
    if (finished.current) return;
    finished.current = true;
    track(EVENTS.onboardingDone, { skipped, step: i, total: SLIDES.length });
    onDone();
  };

  return (
    <LinearGradient colors={gradients.vignette} style={styles.root}>
      <View style={styles.top}>
        {!last && (
          <TouchScale style={styles.skip} onPress={() => finish(true)} accessibilityLabel="onboarding-skip">
            <Text style={styles.skipText}>{t('skip')}</Text>
          </TouchScale>
        )}
      </View>

      <FadePop key={slide.key} style={styles.card}>
        <View style={styles.viz}>{slide.visual()}</View>
        <Text style={styles.title}>{t(slide.title)}</Text>
        <Text style={styles.body}>{t(slide.body)}</Text>
      </FadePop>

      <View style={styles.dots}>
        {SLIDES.map((s, idx) => (
          <View key={s.key} style={[styles.pageDot, idx === i && styles.pageDotActive]} />
        ))}
      </View>

      <TouchScale
        style={styles.ctaWrap}
        onPress={() => (last ? finish(false) : setI((v) => v + 1))}
        accessibilityLabel={last ? 'onboarding-start' : 'onboarding-next'}
      >
        <LinearGradient colors={gradients.play} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
          <Text style={styles.ctaText}>{last ? t('letsPlay') : t('next')}</Text>
        </LinearGradient>
      </TouchScale>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 20, zIndex: 50 },
  top: { position: 'absolute', top: 48, right: 20 },
  skip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999 },
  skipText: { fontFamily: fonts.bodyBold, color: C.textDim, fontSize: 14 },
  // Фиксированная высота карточки: пейджер и CTA больше не прыгают между слайдами (C1).
  card: { alignItems: 'center', gap: 16, maxWidth: 380, height: 330 },
  viz: {
    width: '100%', height: 150, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.borderGlass,
    ...elevation.card,
  },
  vizRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  // Мини-сцена: доска с сеткой + абсолютные клетки.
  sceneBoard: {
    backgroundColor: C.board,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.borderGlow,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 1.5,
  },
  sceneGridCell: { width: 18, height: 18, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.035)' },
  sceneAbs: { position: 'absolute' },
  seg: { width: 13, height: 13, alignItems: 'center', justifyContent: 'center' },
  segEye: { position: 'absolute', top: 3, width: 2.6, height: 2.6, borderRadius: 1.3, backgroundColor: '#06121e' },
  sceneFood: { width: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  sceneFoodCore: { width: 4.5, height: 4.5, borderRadius: 2.5, backgroundColor: '#fff' },
  sceneMark: { position: 'absolute', width: 18 * 3, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.5 },
  badge: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999 },
  badgeText: { fontFamily: fonts.display, color: C.onBrand, fontSize: 14, letterSpacing: 1 },
  coinBadge: { width: 28, height: 28, borderRadius: 14 },
  title: { fontFamily: fonts.display, color: C.text, fontSize: 24, letterSpacing: 0.5, textAlign: 'center' },
  body: { fontFamily: fonts.body, color: C.textDim, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 8 },
  pageDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.surfaceHi },
  pageDotActive: { backgroundColor: C.brand1, width: 22 },
  ctaWrap: { borderRadius: 999, overflow: 'hidden', ...elevation.glow },
  cta: { paddingVertical: 14, paddingHorizontal: 56, alignItems: 'center' },
  ctaText: { fontFamily: fonts.display, color: C.onAccent, fontSize: 17, letterSpacing: 0.5 },
});
