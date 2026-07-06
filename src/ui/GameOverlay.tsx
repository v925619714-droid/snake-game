// Оверлей поверх игрового поля (B1): плотный скрим + FadePop + заголовок/подзаголовок.
// Был скопирован в App/DuelGame/PartyGame (3 копии) и разъезжался по прозрачности.
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, fonts } from '../theme/tokens';
import { FadePop } from './anim';

export function GameOverlay({
  title,
  sub,
  children,
  backdrop,
}: {
  title?: string;
  sub?: string;
  children?: ReactNode; // кнопки/доп. контент под заголовком
  backdrop?: ReactNode; // полноэкранный слой ПОД контентом (например Confetti)
}) {
  return (
    <View style={styles.overlay}>
      {backdrop}
      <FadePop style={styles.inner}>
        {!!title && <Text style={styles.title}>{title}</Text>}
        {!!sub && <Text style={styles.sub}>{sub}</Text>}
        {children}
      </FadePop>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // 0.86 — сквозь «Готов?» не должна просвечивать змейка (аудит A6/B1).
    backgroundColor: 'rgba(7,10,16,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 20 },
  title: { fontFamily: fonts.display, color: palette.text, fontSize: 26, textAlign: 'center' },
  sub: { fontFamily: fonts.body, color: palette.textDim, fontSize: 16, textAlign: 'center' },
});
