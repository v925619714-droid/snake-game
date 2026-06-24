import { useState, type ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette as C, fonts } from '../theme/tokens';
import { TouchScale } from '../ui/anim';
import { isMuted, setMuted } from '../lib/sound';
import { hapticsOn, setHaptics, colorblindOn, setColorblind } from '../lib/settings';

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
  back: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { fontFamily: fonts.body, color: C.textDim, fontSize: 15 },
});
