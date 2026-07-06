// Общий D-pad для solo/duel/party (раньше был скопирован в трёх экранах и разошёлся).
// Поворот срабатывает на onPressIn (касание), а не onPress (отпускание) — на быстрых
// тиках экономит 60-100мс задержки ввода. Раскладка — классический ромб: ▲/▼ разнесены
// от ◀/▶ по вертикали, промах больше не бьёт по противоположному направлению.
import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Direction } from '../game/logic';
import { palette } from '../theme/tokens';
import { hLight } from '../lib/settings';

export type ControlScheme = 'dpad' | 'split' | 'swipe';
export type DpadSide = 'left' | 'center' | 'right';

const BTN = 64;
// GAP 14 при hitSlop 5: между тач-зонами остаётся мёртвая зона 4px — меньше
// случайных двойных активаций при быстрых движениях (C).
const GAP = 14;
const SLOP = { top: 5, bottom: 5, left: 5, right: 5 };

// Фирменный глиф — неоновый шеврон (рисуется бордерами, не системный ▲): единый
// вид на iOS/Android/web, подсветка brand1 при нажатии.
const CHEVRON_ROT: Record<Direction, string> = {
  up: '-45deg',
  down: '135deg',
  left: '-135deg',
  right: '45deg',
};

function Chevron({ dir, color }: { dir: Direction; color: string }) {
  // Смещаем шеврон к центру масс, чтобы визуально сидел по центру кнопки.
  const shift = 3;
  const offset =
    dir === 'up' ? { marginTop: shift } : dir === 'down' ? { marginBottom: shift } : dir === 'left' ? { marginLeft: shift } : { marginRight: shift };
  return (
    <View
      style={[
        styles.chevron,
        offset,
        { borderTopColor: color, borderRightColor: color, transform: [{ rotate: CHEVRON_ROT[dir] }] },
      ]}
    />
  );
}

function DirBtn({ dir, onTurn }: { dir: Direction; onTurn: (d: Direction) => void }) {
  // Явный pressed-стейт вместо style-колбэка Pressable: не пересоздаём массивы
  // стилей на каждый кадр нажатия (аудит P2-13).
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityLabel={`dir-${dir}`}
      hitSlop={SLOP}
      onPressIn={() => {
        onTurn(dir);
        hLight();
        setPressed(true);
      }}
      onPressOut={() => setPressed(false)}
      style={[styles.btn, pressed && styles.btnPressed]}
    >
      <Chevron dir={dir} color={pressed ? palette.brand1 : palette.text} />
    </Pressable>
  );
}

export const Dpad = memo(function Dpad({
  onTurn,
  scheme = 'dpad',
  side = 'center',
}: {
  onTurn: (d: Direction) => void;
  scheme?: ControlScheme;
  side?: DpadSide;
}) {
  if (scheme === 'swipe') return null;

  // Split: ◀▶ парой слева, ▲▼ парой справа — для двуручного хвата большие пальцы
  // чередуются (валидный поворот в змейке всегда меняет ось).
  if (scheme === 'split') {
    return (
      <View style={styles.splitRow}>
        <View style={styles.hPair}>
          <DirBtn dir="left" onTurn={onTurn} />
          <DirBtn dir="right" onTurn={onTurn} />
        </View>
        <View style={styles.vPair}>
          <DirBtn dir="up" onTurn={onTurn} />
          <DirBtn dir="down" onTurn={onTurn} />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.diamond, side === 'left' && styles.dockL, side === 'right' && styles.dockR]}
    >
      <DirBtn dir="up" onTurn={onTurn} />
      <View style={styles.midRow}>
        <DirBtn dir="left" onTurn={onTurn} />
        <View style={{ width: BTN }} />
        <DirBtn dir="right" onTurn={onTurn} />
      </View>
      <DirBtn dir="down" onTurn={onTurn} />
    </View>
  );
});

const styles = StyleSheet.create({
  btn: {
    width: BTN,
    height: BTN,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(18,24,38,0.78)',
    borderColor: palette.borderGlass,
  },
  btnPressed: {
    backgroundColor: palette.surfaceHi,
    borderColor: palette.borderGlow,
    transform: [{ scale: 0.92 }],
  },
  chevron: {
    width: 18,
    height: 18,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 2,
  },
  diamond: { alignItems: 'center', gap: GAP, alignSelf: 'center' },
  midRow: { flexDirection: 'row', gap: GAP },
  dockL: { alignSelf: 'flex-start', marginLeft: 12 },
  dockR: { alignSelf: 'flex-end', marginRight: 12 },
  splitRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    // box-none: тапы между кластерами уходят вниз (свайп-зоне); prop deprecated → style (B2)
    pointerEvents: 'box-none',
  },
  hPair: { flexDirection: 'row', gap: GAP },
  vPair: { gap: GAP },
});
