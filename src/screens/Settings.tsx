import { useState, type ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { palette as C, fonts } from '../theme/tokens';
import { TouchScale } from '../ui/anim';
import { GameButton } from '../ui/GameButton';
import { ScreenShell, ScreenTitle } from '../ui/Screen';
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
import { LANGS, getLang, setLang as saveLang, t, type Lang } from '../lib/i18n';

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
  const [sound, setSound] = useState(!isMuted());
  const [hap, setHap] = useState(hapticsOn());
  const [cb, setCb] = useState(colorblindOn());
  const [scheme, setScheme] = useState<CtrlScheme>(getCtrlScheme());
  const [side, setSide] = useState<CtrlSide>(getCtrlSide());
  const [lang, setLangState] = useState<Lang>(getLang());
  const [saveMsg, setSaveMsg] = useState('');
  // Ошибка записи в AsyncStorage больше не глотается молча (C): пользователь видит,
  // что настройка может сброситься после перезапуска.
  const guard = (p: Promise<void>) => p.catch(() => setSaveMsg(t('saveError')));

  return (
    <ScreenShell maxWidth={412}>
      <ScreenTitle>{t('settings')}</ScreenTitle>

      <View style={styles.box}>
        <SegRow<Lang>
          label={t('language')}
          options={LANGS.map((l) => ({ key: l.code, title: l.label }))}
          value={lang}
          a11y="set-lang"
          onChange={(v) => {
            setLangState(v);
            guard(saveLang(v));
          }}
        />
        <View style={styles.sep} />
        <Row
          label={t('sound')}
          desc={t('soundDesc')}
          value={sound}
          a11y="set-sound"
          onValueChange={(v) => {
            setSound(v);
            guard(setMuted(!v));
          }}
        />
        <View style={styles.sep} />
        <Row
          label={t('haptics')}
          desc={t('hapticsDesc')}
          value={hap}
          a11y="set-haptics"
          onValueChange={(v) => {
            setHap(v);
            guard(setHaptics(v));
          }}
        />
        <View style={styles.sep} />
        <Row
          label={t('colorblind')}
          desc={t('colorblindDesc')}
          value={cb}
          a11y="set-colorblind"
          onValueChange={(v) => {
            setCb(v);
            guard(setColorblind(v));
          }}
        />
        <View style={styles.sep} />
        <SegRow<CtrlScheme>
          label={t('controls')}
          desc={t('controlsDesc')}
          options={[
            { key: 'dpad', title: t('ctrlDpad') },
            { key: 'split', title: t('ctrlSplit') },
            { key: 'swipe', title: t('ctrlSwipe') },
          ]}
          value={scheme}
          a11y="set-ctrl"
          onChange={(v) => {
            setScheme(v);
            guard(setCtrlScheme(v));
          }}
        />
        {scheme === 'dpad' && (
          <>
            <View style={styles.sep} />
            <SegRow<CtrlSide>
              label={t('dpadPos')}
              desc={t('dpadPosDesc')}
              options={[
                { key: 'left', title: t('left') },
                { key: 'center', title: t('center') },
                { key: 'right', title: t('right') },
              ]}
              value={side}
              a11y="set-side"
              onChange={(v) => {
                setSide(v);
                guard(setCtrlSide(v));
              }}
            />
          </>
        )}
      </View>

      {!!saveMsg && <Text style={styles.saveMsg}>{saveMsg}</Text>}

      <GameButton title={t('back')} variant="ghost" onPress={onBack} a11y="settings-back" />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
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
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segBtn: {
    flexGrow: 1,
    flexBasis: '28%',
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
  saveMsg: { fontFamily: fonts.body, color: C.danger, fontSize: 13, textAlign: 'center' },
});
