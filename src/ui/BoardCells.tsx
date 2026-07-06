// Мемо-ячейки игрового поля (B7): раньше каждый тик пересоздавал inline-объекты
// стилей для каждой клетки во всех трёх режимах (давление на GC + лишний Reconciler).
// Статика — в StyleSheet, динамика — узкий массив; memo отсекает неизменившиеся клетки.
// Тени — кроссплатформенный boxShadow (B2).
import { memo, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { glow } from '../theme/tokens';

export const SnakeCell = memo(function SnakeCell({
  x,
  y,
  cell,
  color,
  isHead = false,
  glowColor,
  pad = 1,
  eyeSize = 0.16,
  eyeInset = 0.24,
  outlined = false,
  badge,
}: {
  x: number;
  y: number;
  cell: number;
  color: string;
  isHead?: boolean;
  glowColor?: string; // свечение головы
  pad?: number;
  eyeSize?: number; // доля клетки; 0 = без глаз
  eyeInset?: number;
  outlined?: boolean; // белая обводка (своя змейка в party)
  badge?: ReactNode; // имя над головой (party)
}) {
  return (
    <View
      style={[
        styles.wrap,
        { width: cell, height: cell, padding: pad, transform: [{ translateX: x * cell }, { translateY: y * cell }] },
      ]}
    >
      <View
        style={[
          styles.inner,
          { borderRadius: cell * (isHead ? 0.34 : 0.28), backgroundColor: color },
          isHead && glowColor ? glow(glowColor, 6, 0.9) : null,
          outlined && styles.outlined,
        ]}
      >
        {isHead && eyeSize > 0 && (
          <>
            <View
              style={[
                styles.eye,
                { top: cell * 0.26, left: cell * eyeInset, width: cell * eyeSize, height: cell * eyeSize, borderRadius: cell * eyeSize * 0.5 },
              ]}
            />
            <View
              style={[
                styles.eye,
                { top: cell * 0.26, right: cell * eyeInset, width: cell * eyeSize, height: cell * eyeSize, borderRadius: cell * eyeSize * 0.5 },
              ]}
            />
          </>
        )}
        {badge}
      </View>
    </View>
  );
});

// Еда: round (обычная), square (чужой цвет в дуэли при дальтоник-режиме), fat (золотая
// «жирная» с белым ядром). scale — общий Animated-пульс (стабильная ссылка, мемо не рвёт).
export const FoodCell = memo(function FoodCell({
  x,
  y,
  cell,
  color = '#FF5C5C',
  kind = 'round',
  pad = 1,
  opacity = 1,
  scale,
}: {
  x: number;
  y: number;
  cell: number;
  color?: string;
  kind?: 'round' | 'square' | 'fat';
  pad?: number;
  opacity?: number;
  scale?: Animated.AnimatedInterpolation<number>;
}) {
  const fat = kind === 'fat';
  const body = (
    <View
      style={[
        styles.foodInner,
        {
          borderRadius: kind === 'square' ? cell * 0.12 : cell / 2,
          backgroundColor: fat ? '#FFE680' : color,
        },
        fat ? glow('#FFD75E', 7, 1) : glow(color, 6, 0.95),
      ]}
    >
      {fat && <View style={{ width: cell * 0.34, height: cell * 0.34, borderRadius: cell * 0.2, backgroundColor: '#fff' }} />}
    </View>
  );
  return (
    <View
      style={[
        styles.wrap,
        { width: cell, height: cell, padding: pad, opacity, transform: [{ translateX: x * cell }, { translateY: y * cell }] },
      ]}
    >
      {scale ? <Animated.View style={{ flex: 1, transform: [{ scale }] }}>{body}</Animated.View> : body}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, top: 0 },
  inner: { flex: 1 },
  outlined: { borderWidth: 1.5, borderColor: '#fff' },
  eye: { position: 'absolute', backgroundColor: '#06121e' },
  foodInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
