// Вектор-иконки в неон-стиле (C): рисуются View-ами — без эмодзи (у эмодзи
// разный вид по платформам и «детский» стиль) и без новой нативной зависимости
// react-native-svg (приложение уже в сторе, сборку не трогаем).
import { StyleSheet, View } from 'react-native';
import { palette } from '../theme/tokens';

// 🎯 → мишень: концентрические кольца.
export function IconTarget({ size = 16, color = palette.brand1 }: { size?: number; color?: string }) {
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: size * 0.11, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, borderWidth: size * 0.11, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: size * 0.16, height: size * 0.16, borderRadius: size * 0.08, backgroundColor: color }} />
        </View>
      </View>
    </View>
  );
}

// ⚙️ → «слайдеры» (tune): три линии с бегунками — современная иконка настроек.
export function IconSliders({ size = 16, color = palette.text }: { size?: number; color?: string }) {
  const line = (dotLeft: number) => (
    <View style={[styles.sliderLine, { width: size, height: Math.max(1.5, size * 0.09), backgroundColor: color, opacity: 0.55 }]}>
      <View
        style={{
          position: 'absolute',
          left: dotLeft * size,
          top: -(size * 0.14),
          width: size * 0.28,
          height: size * 0.28,
          borderRadius: size * 0.14,
          backgroundColor: color,
        }}
      />
    </View>
  );
  return (
    <View style={{ width: size, height: size, justifyContent: 'space-between', paddingVertical: size * 0.08 }}>
      {line(0.12)}
      {line(0.6)}
      {line(0.32)}
    </View>
  );
}

// 🎁 → подарок: коробка + лента + крышка.
export function IconGift({ size = 16, color = palette.onAccent }: { size?: number; color?: string }) {
  const stroke = Math.max(1.5, size * 0.11);
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      {/* крышка */}
      <View style={{ width: size, height: size * 0.28, borderWidth: stroke, borderColor: color, borderRadius: size * 0.08 }} />
      {/* коробка */}
      <View style={{ width: size * 0.82, height: size * 0.62, borderWidth: stroke, borderColor: color, borderTopWidth: 0, borderBottomLeftRadius: size * 0.08, borderBottomRightRadius: size * 0.08, marginTop: -stroke / 2 }} />
      {/* лента вертикальная */}
      <View style={{ position: 'absolute', top: 0, width: stroke, height: size, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  sliderLine: { borderRadius: 2, position: 'relative' },
});
