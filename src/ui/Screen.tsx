// Каркас подэкрана (B1): виньетка LinearGradient + safe-area + центрированная
// maxWidth-колонка. Раньше Duel/Party/Account/Leaderboard/Settings рисовались на
// плоском bg без виньетки — визуально выпадали из меню. Плюс ScreenTitle (6 копий).
import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, gradients, fonts } from '../theme/tokens';

export function ScreenShell({
  children,
  maxWidth = 520,
  center = true,
  style,
}: {
  children: ReactNode;
  maxWidth?: number;
  center?: boolean; // false = контент прижат к верху (игровые экраны сами рулят flex)
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={gradients.vignette} style={styles.bg}>
      <View
        style={[
          styles.column,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, maxWidth },
          center && styles.center,
          style,
        ]}
      >
        {children}
      </View>
    </LinearGradient>
  );
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  bg: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  center: { justifyContent: 'center' },
  title: { fontFamily: fonts.display, color: palette.text, fontSize: 26, letterSpacing: 1 },
});
