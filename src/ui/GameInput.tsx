// Текстовый инпут (B4): прямоугольник radius.md (не pill), текст слева, рамка
// фокуса brand2 — чтобы поле ввода не выглядело кнопкой (CODE-инпут путали с кнопкой).
import { useState } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native';
import { palette, fonts, radius } from '../theme/tokens';

export function GameInput({
  value,
  onChangeText,
  placeholder,
  a11y,
  maxLength,
  autoCapitalize,
  keyboardType,
  editable,
  mono = false, // крупный моноширинный ввод кода комнаты
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  a11y?: string;
  maxLength?: number;
  autoCapitalize?: 'none' | 'characters' | 'sentences' | 'words';
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  editable?: boolean;
  mono?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      style={[styles.input, mono && styles.mono, focused && styles.focused, style]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={palette.textFaint}
      maxLength={maxLength}
      autoCapitalize={autoCapitalize}
      keyboardType={keyboardType}
      editable={editable}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityLabel={a11y}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: palette.board,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.text,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    textAlign: 'left',
  },
  mono: { fontFamily: fonts.num, fontSize: 22, letterSpacing: 4 },
  focused: { borderColor: palette.brand2 },
});
