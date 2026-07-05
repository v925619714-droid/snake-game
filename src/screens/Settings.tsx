import { useState, type ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette as C, fonts } from '../theme/tokens';
import { TouchScale } from '../ui/anim';
import { isMuted, setMuted } from '../lib/sound';
import {
  hapticsOn,
  setHaptics,
  colorblindOn,
  setColorblind,
  getCtrlScheme,
  setCtrlScheme,
  getCtrlSide,
  setCtrlSide,
  type CtrlScheme,
  type CtrlSide,
} from '../lib/settings';

// Сегментированный выбор (2-3 опции в ряд) — для схемы управления и стороны D-pad.
function SegRow<T extends string>({
  label,
  desc,
  options,
  value,
  onChange,
  a11y,
}: {
  label: string;
  desc?: string;
  options: { key: T; title: string }[];
  value: T;
  onChange: (v: T) => void;
  a11y: string;
}): ReactNode {
  return (
    <View style={styles.segRow}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!desc && <Text style={styles.rowDesc}>{desc}</Text>}
      </View>
      <View style={styles.seg}>
        {options.map((o) => {
          const active = o.key === value;
          return (
            <TouchScale
              key={o.key}
              style={[styles.segBtn, active && styles.segBtnActive]}
              onPress={() => onChange(o.key)}
              accessibilityLabel={`${a11y}-${o.key}`}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{o.title}</Text>
            </TouchScale>
          );
        })}
      </View>
    </View>
  );
}

function Row({
  label,
  desc,
  value,
  onValueChange,
  a11y,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  a11y: string;
}): ReactNode {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!desc && <Text style={styles.rowDesc}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: C.accent, false: C.surfaceHi }}
        thumbColor="#ffffff"
        accessibilityLabel={a11y}
      />
    </View>
  );
}

export default function Settings({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [sound, setSound] = useState(!isMuted());
  const [hap, setHap] = useState(hapticsOn());
  const [cb, setCb] = useState(colorblindOn());
  const [scheme, setScheme] = useState<CtrlScheme>(getCtrlScheme());
  const [side, setSide] = useState<CtrlSide>(getCtrlSide());

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.box}>
        <Row
          label="Sound"
          desc="Game sound effects"
          value={sound}
          a11y="set-sound"
          onValueChange={(v) => {
            setSound(v);
            void setMuted(!v);
          }}
        />
        <View style={styles.sep} />
        <Row
          label="Haptics"
          desc="Vibration feedback (device only)"
          value={hap}
          a11y="set-haptics"
          onValueChange={(v) => {
            setHap(v);
            void setHaptics(v);
          }}
        />
        <View style={styles.sep} />
        <Row
          label="Color-blind shapes"
          desc="Distinct food shapes in duels (square = rival)"
          value={cb}
          a11y="set-colorblind"
          onValueChange={(v) => {
            setCb(v);
            void setColorblind(v);
          }}
        />
        <View style={styles.sep} />
        <SegRow<CtrlScheme>
          label="Controls"
          desc="Swipe works everywhere in every scheme"
          options={[
            { key: 'dpad', title: 'D-pad' },
            { key: 'split', title: 'Split' },
            { key: 'swipe', title: 'Swipe' },
          ]}
          value={scheme}
          a11y="set-ctrl"
          onChange={(v) => {
            setScheme(v);
            void setCtrlScheme(v);
          }}
        />
        {scheme === 'dpad' && (
          <>
            <View style={styles.sep} />
            <SegRow<CtrlSide>
              label="D-pad position"
              desc="Dock to a side for one-handed play"
              options={[
                { key: 'left', title: 'Left' },
                { key: 'center', title: 'Center' },
                { key: 'right', title: 'Right' },
              ]}
              value={side}
              a11y="set-side"
              onChange={(v) => {
                setSide(v);
                void setCtrlSide(v);
              }}
            />
          </>
        )}
      </View>

      <TouchScale style={styles.back} onPress={onBack} accessibilityLabel="settings-back">
        <Text style={styles.backText}>Back</Text>
      </TouchScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 18 },
  title: { fontFamily: fonts.display, color: C.text, fontSize: 26, letterSpacing: 1 },
  box: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.borderGlass,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: fonts.bodyBold, color: C.text, fontSize: 16 },
  rowDesc: { fontFamily: fonts.body, color: C.textDim, fontSize: 12, marginTop: 2 },
  sep: { height: 1, backgroundColor: C.borderGlass },
  segRow: { paddingVertical: 14, gap: 10 },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: C.surfaceHi,
    borderWidth: 1,
    borderColor: C.borderGlass,
  },
  segBtnActive: { backgroundColor: C.btnPressed, borderColor: C.borderGlow },
  segText: { fontFamily: fonts.bodyBold, color: C.textDim, fontSize: 13 },
  segTextActive: { color: C.brand1 },
  back: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { fontFamily: fonts.body, color: C.textDim, fontSize: 15 },
});
