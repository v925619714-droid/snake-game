// Общий D-pad для solo/duel/party (раньше был скопирован в трёх экранах и разошёлся).
// Поворот срабатывает на onPressIn (касание), а не onPress (отпускание) — на быстрых
// тиках экономит 60-100мс задержки ввода. Раскладка — классический ромб: ▲/▼ разнесены
// от ◀/▶ по вертикали, промах больше не бьёт по противоположному направлению.
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Direction } from '../game/logic';
import { palette } from '../theme/tokens';
import { hLight } from '../lib/settings';

export type ControlScheme = 'dpad' | 'split' | 'swipe';
export type DpadSide = 'left' | 'center' | 'right';

const BTN = 64;
const GAP = 10;
// hitSlop 5 схлопывает зазор между кнопками, не создавая перекрытия целей (5+5 = GAP).
const SLOP = { top: 5, bottom: 5, left: 5, right: 5 };

const GLYPHS: Record<Direction, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

function DirBtn({ dir, onTurn }: { dir: Direction; onTurn: (d: Direction) => void }) {
  return (
    <Pressable
      accessibilityLabel={`dir-${dir}`}
      hitSlop={SLOP}
      onPressIn={() => {
        onTurn(dir);
        hLight();
      }}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
    >
      {({ pressed }) => (
        <Text style={[styles.glyph, pressed && styles.glyphPressed]}>{GLYPHS[dir]}</Text>
      )}
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
      <View style={styles.splitRow} pointerEvents="box-none">
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
  glyph: { color: palette.text, fontSize: 28 },
  glyphPressed: { color: palette.brand1 },
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
  },
  hPair: { flexDirection: 'row', gap: GAP },
  vPair: { gap: GAP },
});
