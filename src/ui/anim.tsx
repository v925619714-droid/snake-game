// Общие анимационные примитивы (Фаза 4). Без новых зависимостей — встроенный Animated.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { hSelect } from '../lib/settings';

const CONFETTI_COLORS = ['#7CF7D4', '#5CC8FF', '#9B6CFF', '#FF8A8A', '#FFE680'];

// Pressable как анимируемый компонент — чтобы layout-стиль (width/alignSelf и т.п.)
// и scale-трансформ были на ОДНОМ элементе, участвующем в раскладке.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Разовая вспышка конфетти (на победе). pointerEvents none — не мешает кнопкам.
export function Confetti({ count = 22 }: { count?: number }) {
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        a: new Animated.Value(0),
        dx: (Math.random() * 2 - 1) * 150,
        dy: -70 - Math.random() * 130,
        rot: (Math.random() * 2 - 1) * 540,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 6,
        delay: Math.random() * 140,
      })),
    [count],
  );
  useEffect(() => {
    parts.forEach((p) =>
      Animated.timing(p.a, { toValue: 1, duration: 1200, delay: p.delay, useNativeDriver: true }).start(),
    );
  }, [parts]);
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      {parts.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size * 0.6,
            borderRadius: 2,
            backgroundColor: p.color,
            opacity: p.a.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: p.a.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              { translateY: p.a.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, p.dy, p.dy + 190] }) },
              { rotate: p.a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rot}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

// Кнопка с «живым» нажатием: лёгкий scale + selection-хаптик. Замена Pressable.
export function TouchScale({
  children,
  onPress,
  style,
  accessibilityLabel,
  disabled,
  haptic = true,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  disabled?: boolean;
  haptic?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPressIn={() => {
        to(0.94);
        if (haptic) hSelect();
      }}
      onPressOut={() => to(1)}
      onPress={onPress}
      style={[style, { transform: [{ scale }] }, disabled ? { opacity: 0.4 } : null]}
    >
      {children}
    </AnimatedPressable>
  );
}

// Пульсирующая точка «идёт ожидание» (C): рядом со статусами вроде «Ждём соперника…».
export function PulsingDot({ color = '#7CF7D4', size = 8 }: { color?: string; size?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
        transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) }],
      }}
    />
  );
}

// Появление с fade + scale (для оверлеев Ready/Game over/round/match).
export function FadePop({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
  }, [a]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}
