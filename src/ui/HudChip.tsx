// Чип игрового HUD (B1): label + крупное значение (+ подпись). Дубли были в
// DuelGame (ScoreChip-стили) и PartyGame (chip/chipLabel/chipVal).
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, fonts, radius } from '../theme/tokens';

export function HudChip({
  label,
  value,
  sub,
  borderColor,
  valueColor,
  children,
  a11y,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  borderColor?: string;
  valueColor?: string;
  children?: ReactNode; // напр. цветная точка игрока рядом с label
  a11y?: string;
}) {
  return (
    <View style={[styles.chip, borderColor ? { borderColor } : null]}>
      <View style={styles.top}>
        {children}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]} accessibilityLabel={a11y}>
        {value}
      </Text>
      {sub != null && <Text style={styles.sub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
    minWidth: 92,
    borderWidth: 1,
    borderColor: palette.borderGlass,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontFamily: fonts.bodyBold, color: palette.textDim, fontSize: 11, letterSpacing: 1 },
  value: { fontFamily: fonts.num, color: palette.text, fontSize: 22 },
  sub: { fontFamily: fonts.body, color: palette.textDim, fontSize: 11 },
});
