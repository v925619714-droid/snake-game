// Экран корпоративного режима «Shake Work Off» (FFA 5–10).
// Ф2: ЛОКАЛЬНЫЙ прогон (слот 0 — игрок, остальные слоты — боты) для проверки рендера
// и управления. Сетевой матч (лобби по коду, реальные игроки) добавляется в Ф3 поверх
// этого же экрана. Существующие режимы не затронуты — отдельный модуль.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type PartyState, partyNewMatch, partyStep, partyTurn } from '../game/party';
import { partyBotDir } from '../game/partyBot';
import { type Direction, swipeToDirection } from '../game/logic';
import { fonts, shade } from '../theme/tokens';
import { TouchScale, FadePop, Confetti } from '../ui/anim';
import { hLight, hSuccess, hError } from '../lib/settings';
import { play as playSfx } from '../lib/sound';

const TICK_MS = 150;

const C = {
  bg: '#0B0F17',
  board: '#0C111B',
  text: '#E8F0FB',
  textDim: '#8395AE',
  surface: '#121826',
  border: 'rgba(255,255,255,0.08)',
  accent: '#3DDC84',
};

// Палитра на 10 слотов (различимые цвета).
const PARTY_COLORS = [
  { body: '#ff5c5c', head: '#ffb0a3' },
  { body: '#5cc8ff', head: '#b3e8ff' },
  { body: '#67e08a', head: '#bff5cf' },
  { body: '#ffd75e', head: '#fff0b8' },
  { body: '#c98bff', head: '#e7c9ff' },
  { body: '#ff9f43', head: '#ffd8a8' },
  { body: '#3ddc97', head: '#a9f0d4' },
  { body: '#ff7bd5', head: '#ffc4ec' },
  { body: '#9aa7ff', head: '#cdd4ff' },
  { body: '#9ad34d', head: '#d8f0a8' },
];

const COUNT_OPTIONS = [5, 6, 8, 10];

export default function PartyGame({ onExit }: { onExit: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(5);
  const [state, setState] = useState<PartyState | null>(null);
  const overDone = useRef(false);

  const pad = { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 };
  const boardPx = Math.max(
    260,
    Math.floor(Math.min(width - 20, height - insets.top - insets.bottom - 240, 480)),
  );
  const cell = state ? boardPx / state.board : 0;

  const start = useCallback((n: number) => {
    overDone.current = false;
    setState(partyNewMatch(n));
  }, []);

  const handleTurn = useCallback((dir: Direction) => {
    setState((s) => (s && s.status === 'playing' ? partyTurn(s, 0, dir) : s));
  }, []);

  // Самопланирующийся локальный цикл: каждый тик боты (слоты 1..n-1) решают ход, затем шаг.
  useEffect(() => {
    if (!state || state.status !== 'playing') return;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setState((prev) => {
        if (!prev || prev.status !== 'playing') return prev;
        let s = prev;
        for (let i = 1; i < s.snakes.length; i++) {
          if (s.alive[i]) s = partyTurn(s, i, partyBotDir(s, i));
        }
        return partyStep(s);
      });
      id = setTimeout(tick, TICK_MS);
    };
    id = setTimeout(tick, TICK_MS);
    return () => clearTimeout(id);
  }, [state?.status]);

  // Звук/хаптика на финише (однократно).
  useEffect(() => {
    if (!state || state.status !== 'over' || overDone.current) return;
    overDone.current = true;
    const won = state.winner === 0;
    playSfx(won ? 'win' : 'lose');
    if (won) hSuccess();
    else hError();
  }, [state?.status, state?.winner]);

  const doTurn = useCallback(
    (dir: Direction) => {
      if (state?.status !== 'playing' || !state.alive[0]) return;
      hLight();
      handleTurn(dir);
    },
    [state?.status, state?.alive, handleTurn],
  );

  const swipe = useMemo(() => {
    let committed = false;
    return Gesture.Pan()
      .onBegin(() => {
        committed = false;
      })
      .onUpdate((e) => {
        if (committed) return;
        if (Math.abs(e.translationX) + Math.abs(e.translationY) < 12) return;
        const dir = swipeToDirection(e.translationX, e.translationY);
        if (dir) {
          committed = true;
          doTurn(dir);
        }
      });
  }, [doTurn]);

  // ── ЛОББИ (выбор числа игроков) ──
  if (!state) {
    return (
      <View style={[styles.container, pad]}>
        <Text style={styles.title}>Shake Work Off</Text>
        <Text style={styles.subtitle}>Last snake standing — winner doesn't work today</Text>
        <Text style={styles.practiceNote}>Practice vs bots (local)</Text>

        <View style={styles.countRow}>
          {COUNT_OPTIONS.map((n) => (
            <TouchScale
              key={n}
              style={[styles.countBtn, count === n && styles.countBtnActive]}
              onPress={() => setCount(n)}
              accessibilityLabel={`count-${n}`}
            >
              <Text style={[styles.countText, count === n && styles.countTextActive]}>{n}</Text>
            </TouchScale>
          ))}
        </View>
        <Text style={styles.subtle}>players</Text>

        <TouchScale style={styles.bigBtn} onPress={() => start(count)} accessibilityLabel="party-start">
          <Text style={styles.bigBtnText}>Start</Text>
        </TouchScale>

        <TouchScale style={styles.backBtn} onPress={onExit} accessibilityLabel="party-back">
          <Text style={styles.backText}>Back</Text>
        </TouchScale>
      </View>
    );
  }

  // ── МАТЧ ──
  const total = state.snakes.length;
  const aliveCount = state.alive.filter(Boolean).length;
  const youAlive = state.alive[0];
  const youPos = state.placements.indexOf(0);
  const youPlace = youPos < 0 ? 1 : total - youPos;
  const z = state.shrink; // смещение зоны (сжатие)

  return (
    <View style={[styles.container, pad]}>
      <View style={styles.hud}>
        <View style={[styles.chip, { borderColor: PARTY_COLORS[0].head }]}>
          <Text style={styles.chipLabel}>YOU</Text>
          <Text style={[styles.chipVal, { color: PARTY_COLORS[0].head }]}>
            {youAlive ? 'alive' : `#${youPlace}`}
          </Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipLabel}>ALIVE</Text>
          <Text style={styles.chipVal}>{aliveCount}/{total}</Text>
        </View>
      </View>

      <GestureDetector gesture={swipe}>
        <View style={[styles.boardWrap, { width: boardPx, height: boardPx }]}>
          {/* играбельная зона (сжатие визуально) */}
          {z > 0 && (
            <View
              style={{
                position: 'absolute',
                left: z * cell,
                top: z * cell,
                width: (state.board - 2 * z) * cell,
                height: (state.board - 2 * z) * cell,
                borderWidth: 1,
                borderColor: 'rgba(255,90,90,0.5)',
              }}
            />
          )}

          {state.snakes.map((snake, si) => {
            if (!state.alive[si]) return null;
            const col = PARTY_COLORS[si % PARTY_COLORS.length];
            return snake.map((p, i) => {
              const isHead = i === 0;
              const mine = si === 0;
              return (
                <View
                  key={`${si}-${i}`}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: cell,
                    height: cell,
                    padding: 0.5,
                    transform: [{ translateX: p.x * cell }, { translateY: p.y * cell }],
                  }}
                >
                  <View
                    style={[
                      {
                        flex: 1,
                        borderRadius: cell * (isHead ? 0.34 : 0.28),
                        backgroundColor: isHead ? col.head : shade(col.body, (i / snake.length) * 0.5),
                      },
                      isHead && {
                        shadowColor: col.head,
                        shadowOpacity: 0.9,
                        shadowRadius: mine ? 7 : 4,
                        shadowOffset: { width: 0, height: 0 },
                        elevation: mine ? 7 : 4,
                      },
                      isHead && mine && { borderWidth: 1.5, borderColor: '#fff' },
                    ]}
                  />
                </View>
              );
            });
          })}

          {state.foods.map((f, i) => (
            <View
              key={`f-${i}`}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: cell,
                height: cell,
                padding: 1.5,
                transform: [{ translateX: f.pos.x * cell }, { translateY: f.pos.y * cell }],
              }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: cell / 2,
                  backgroundColor: '#F4F8FF',
                  shadowColor: '#cfe0ff',
                  shadowOpacity: 0.9,
                  shadowRadius: 5,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 5,
                }}
              />
            </View>
          ))}

          {state.status === 'over' && (
            <View style={styles.overlay}>
              {state.winner === 0 && <Confetti />}
              <FadePop style={styles.overlayInner}>
                <Text style={styles.overlayTitle}>
                  {state.winner === 0
                    ? "You don't work today! 🎉"
                    : state.winner < 0
                      ? 'Draw'
                      : `You placed #${youPlace}`}
                </Text>
                <Text style={styles.overlaySub}>
                  {state.winner >= 0 && state.winner !== 0
                    ? `Winner: Player ${state.winner + 1}`
                    : 'Last snake standing wins'}
                </Text>
                <TouchScale style={styles.bigBtn} onPress={() => start(count)} accessibilityLabel="party-again">
                  <Text style={styles.bigBtnText}>Play again</Text>
                </TouchScale>
                <TouchScale style={styles.backBtn} onPress={onExit} accessibilityLabel="party-back">
                  <Text style={styles.backText}>Back</Text>
                </TouchScale>
              </FadePop>
            </View>
          )}
        </View>
      </GestureDetector>

      {state.status === 'playing' && (
        <>
          <Text style={styles.hint}>
            {youAlive ? 'Swipe or use the D-pad — eat to grow, outlast everyone' : 'You are out — watch who wins'}
          </Text>
          <Dpad onPress={doTurn} />
        </>
      )}

      <TouchScale style={styles.leaveBtn} onPress={onExit} accessibilityLabel="party-leave">
        <Text style={styles.backText}>Leave</Text>
      </TouchScale>
    </View>
  );
}

function DirButton({ label, dir, onPress }: { label: string; dir: Direction; onPress: (d: Direction) => void }) {
  return (
    <TouchScale style={styles.dirBtn} onPress={() => onPress(dir)} accessibilityLabel={`dir-${dir}`}>
      <Text style={styles.dirBtnText}>{label}</Text>
    </TouchScale>
  );
}

const Dpad = memo(function Dpad({ onPress }: { onPress: (d: Direction) => void }) {
  return (
    <View style={styles.dpad}>
      <DirButton label="▲" dir="up" onPress={onPress} />
      <View style={styles.dpadRow}>
        <DirButton label="◀" dir="left" onPress={onPress} />
        <DirButton label="▼" dir="down" onPress={onPress} />
        <DirButton label="▶" dir="right" onPress={onPress} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'web' ? 16 : 40,
    paddingBottom: 16,
    gap: 12,
  },
  title: { fontFamily: fonts.display, color: C.text, fontSize: 28, letterSpacing: 1 },
  subtitle: { fontFamily: fonts.body, color: C.textDim, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  practiceNote: { fontFamily: fonts.bodyBold, color: C.accent, fontSize: 12 },
  countRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  countBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  countBtnActive: { borderColor: C.accent, backgroundColor: 'rgba(61,220,132,0.12)' },
  countText: { fontFamily: fonts.num, color: C.textDim, fontSize: 22 },
  countTextActive: { color: C.text },
  subtle: { color: C.textDim, fontSize: 13 },
  bigBtn: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40, alignItems: 'center' },
  bigBtnText: { fontFamily: fonts.display, color: '#06180E', fontSize: 17 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { color: C.textDim, fontSize: 15 },
  leaveBtn: { paddingVertical: 6, paddingHorizontal: 20 },
  hud: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  chip: {
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 90,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipLabel: { fontFamily: fonts.bodyBold, color: C.textDim, fontSize: 10, letterSpacing: 1 },
  chipVal: { fontFamily: fonts.num, color: C.text, fontSize: 18 },
  boardWrap: {
    backgroundColor: C.board,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(124,247,212,0.20)',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(7,10,16,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayInner: { alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  overlayTitle: { fontFamily: fonts.display, color: C.text, fontSize: 24, textAlign: 'center' },
  overlaySub: { fontFamily: fonts.body, color: C.textDim, fontSize: 15, textAlign: 'center' },
  hint: { fontFamily: fonts.body, color: C.textDim, fontSize: 12, textAlign: 'center', paddingHorizontal: 16 },
  dpad: { alignItems: 'center', gap: 10 },
  dpadRow: { flexDirection: 'row', gap: 10 },
  dirBtn: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  dirBtnText: { color: C.text, fontSize: 24 },
});
