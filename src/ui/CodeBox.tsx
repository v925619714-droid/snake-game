// Карточка кода комнаты (B1): label + крупный код (Space Grotesk) + подсказки.
// Была скопирована в DuelGame и PartyGame с разными размерами.
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, fonts, radius } from '../theme/tokens';

export function CodeBox({
  label,
  code,
  hints = [],
  a11y,
  children,
}: {
  label: string;
  code: string;
  hints?: string[];
  a11y?: string;
  children?: ReactNode; // кнопки шаринга между кодом и хинтами
}) {
  return (
    <View style={styles.box}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} accessibilityLabel={a11y}>{code}</Text>
      {children}
      {hints.map((h) => (
        <Text key={h} style={styles.hint}>{h}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: palette.borderGlass,
  },
  label: { fontFamily: fonts.body, color: palette.textDim, fontSize: 13 },
  value: { fontFamily: fonts.num, color: palette.brand1, fontSize: 40, letterSpacing: 8 },
  hint: { fontFamily: fonts.body, color: palette.textDim, fontSize: 12 },
});
