// Единая кнопка экранов игры (B1): primary (accent-заливка) / secondary (surface с
// бордером) / ghost (текстовая). Закрывает прежние дубли bigBtn/altBtn/backBtn/
// startBtn/copyBtn/joinBtn, разъехавшиеся между DuelGame/PartyGame/App.
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { palette, fonts, radius } from '../theme/tokens';
import { TouchScale } from './anim';

export type GameButtonVariant = 'primary' | 'secondary' | 'ghost';

export function GameButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
  a11y,
  style,
  color,
}: {
  title: string;
  onPress?: () => void;
  variant?: GameButtonVariant;
  disabled?: boolean;
  a11y?: string;
  style?: StyleProp<ViewStyle>;
  color?: string; // override фона primary (напр. цвет скина на оверлее соло)
}) {
  return (
    <TouchScale
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        color ? { backgroundColor: color } : null,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={a11y}
    >
      <Text
        style={[
          variant === 'primary' ? styles.primaryText : variant === 'secondary' ? styles.secondaryText : styles.ghostText,
          disabled && styles.disabledText,
        ]}
      >
        {title}
      </Text>
    </TouchScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  primary: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 36,
  },
  primaryText: { fontFamily: fonts.display, color: palette.onAccent, fontSize: 17 },
  secondary: {
    backgroundColor: palette.surface,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: palette.borderGlass,
  },
  secondaryText: { fontFamily: fonts.bodyBold, color: palette.text, fontSize: 15 },
  ghost: { paddingVertical: 8, paddingHorizontal: 20 },
  ghostText: { fontFamily: fonts.body, color: palette.textDim, fontSize: 15 },
  disabled: { opacity: 0.45 },
  disabledText: { color: palette.textDim },
});
