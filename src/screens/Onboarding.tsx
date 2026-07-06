import { type ReactElement, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette as C, gradients, fonts, elevation } from '../theme/tokens';
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

function Dot({ color, glow }: { color: string; glow?: boolean }) {
  return (
    <View
      style={[
        styles.cell,
        { backgroundColor: color },
        glow && { shadowColor: color, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
      ]}
    />
  );
}

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    title: 'ob1Title',
    body: 'ob1Body',
    visual: () => (
      <View style={styles.vizRow}>
        <Dot color={C.redHead} glow />
        <Dot color={C.red} />
        <Dot color={C.red} />
        <View style={{ width: 18 }} />
        <Dot color={C.blueHead} glow />
        <Dot color={C.blue} />
        <Dot color={C.blue} />
      </View>
    ),
  },
  {
    key: 'colors',
    title: 'ob2Title',
    body: 'ob2Body',
    visual: () => (
      <View style={styles.vizRow}>
        <View style={styles.vizItem}>
          <View style={[styles.foodDot, { backgroundColor: C.red, shadowColor: C.red }]} />
          <Text style={[styles.vizMark, { color: C.accent }]}>{t('obEat')}</Text>
        </View>
        <View style={styles.vizItem}>
          <View style={[styles.foodDot, { backgroundColor: C.blue, shadowColor: C.blue }]} />
          <Text style={[styles.vizMark, { color: C.danger }]}>{t('obDeath')}</Text>
        </View>
      </View>
    ),
  },
  {
    key: 'boost',
    title: 'ob3Title',
    body: 'ob3Body',
    visual: () => (
      <View style={styles.vizRow}>
        <View style={[styles.foodDot, styles.boostDot]}>
          <View style={styles.boostCore} />
        </View>
        <Text style={[styles.vizMark, { color: C.coinHi }]}>{t('obSpeed')}</Text>
      </View>
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
  card: { alignItems: 'center', gap: 16, maxWidth: 380 },
  viz: {
    width: '100%', minHeight: 110, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.borderGlass, paddingVertical: 22,
    ...elevation.card,
  },
  vizRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  vizItem: { alignItems: 'center', gap: 8 },
  cell: { width: 22, height: 22, borderRadius: 7 },
  foodDot: { width: 30, height: 30, borderRadius: 15, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6, alignItems: 'center', justifyContent: 'center' },
  boostDot: { backgroundColor: '#FFE680', shadowColor: '#FFD75E' },
  boostCore: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#fff' },
  vizMark: { fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1 },
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
