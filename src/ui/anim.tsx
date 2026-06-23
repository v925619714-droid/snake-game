// Общие анимационные примитивы (Фаза 4). Без новых зависимостей — встроенный Animated.
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

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
    <Pressable
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPressIn={() => {
        to(0.94);
        if (haptic && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      }}
      onPressOut={() => to(1)}
      onPress={onPress}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled ? { opacity: 0.4 } : null]}>
        {children}
      </Animated.View>
    </Pressable>
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
