import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { palette as C, gradients, fonts } from '../theme/tokens';
import { TouchScale } from '../ui/anim';
import { type AuthUser, deleteAccount, sendEmailCode, signOut, verifyEmailCode } from '../lib/auth';

const PRIVACY_URL = 'https://v925619714-droid.github.io/snake-game/privacy.html';

export default function Account({
  user,
  onBack,
  onChanged,
  onDeleted,
}: {
  user: AuthUser | null;
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'idle' | 'code'>('idle');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [cooldown, setCooldown] = useState(0); // анти-спам: пауза перед повторной отправкой
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const signedIn = Boolean(user && !user.isAnon && user.email);

  const send = async () => {
    if (cooldown > 0 || busy) return;
    if (!email.includes('@')) {
      setMsg('Enter a valid email');
      return;
    }
    setBusy(true);
    setMsg('');
    const r = await sendEmailCode(email);
    setBusy(false);
    if (r.ok) {
      setStage('code');
      setCooldown(30); // не даём спамить отправку
      setMsg('Code sent — check your email.');
    } else {
      // generic-сообщение (не светим внутренние ошибки провайдера)
      setMsg('Could not send the code. Please try again shortly.');
    }
  };

  const verify = async () => {
    if (code.trim().length < 4) {
      setMsg('Enter the code from the email');
      return;
    }
    setBusy(true);
    setMsg('');
    const r = await verifyEmailCode(email, code);
    setBusy(false);
    if (r.ok) {
      setMsg('Signed in! Taking you back…');
      setStage('idle');
      setCode('');
      onChanged();
      setTimeout(onBack, 900); // авто-возврат на главный экран
    } else {
      setMsg(r.error || 'Invalid or expired code.');
    }
  };

  const out = async () => {
    setBusy(true);
    await signOut();
    setBusy(false);
    onChanged();
  };

  const del = async () => {
    if (!confirmDel) {
      setConfirmDel(true);
      setMsg('This permanently deletes your account and all progress. Tap again to confirm.');
      return;
    }
    setBusy(true);
    setMsg('');
    const r = await deleteAccount();
    setBusy(false);
    setConfirmDel(false);
    if (r.ok) {
      onDeleted();
    } else {
      setMsg(r.error || 'Could not delete the account.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <Text style={styles.title}>Account</Text>

      {signedIn ? (
        <View style={styles.box}>
          <Text style={styles.label}>SIGNED IN</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.hint}>Your rating and progress sync on every device with this email.</Text>
          <TouchScale style={styles.ghost} onPress={out} disabled={busy} accessibilityLabel="sign-out">
            <Text style={styles.ghostText}>{busy ? 'Signing out…' : 'Sign out'}</Text>
          </TouchScale>
        </View>
      ) : (
        <View style={styles.box}>
          <Text style={styles.label}>GUEST</Text>
          <Text style={styles.hint}>Sign in with email to save your progress and continue on any device (phone, browser).</Text>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            placeholderTextColor={C.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={stage === 'idle' && !busy}
            accessibilityLabel="account-email"
          />

          {stage === 'idle' ? (
            <TouchScale style={styles.cta} onPress={send} disabled={busy || cooldown > 0} accessibilityLabel="send-code">
              <LinearGradient colors={gradients.play} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGrad}>
                <Text style={styles.ctaText}>{cooldown > 0 ? `Resend in ${cooldown}s` : busy ? 'Sending…' : 'Send code'}</Text>
              </LinearGradient>
            </TouchScale>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="Code from email"
                placeholderTextColor={C.textFaint}
                keyboardType="number-pad"
                accessibilityLabel="account-code"
              />
              <TouchScale style={styles.cta} onPress={verify} disabled={busy} accessibilityLabel="verify-code">
                <LinearGradient colors={gradients.play} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGrad}>
                  <Text style={styles.ctaText}>{busy ? 'Verifying…' : 'Verify & sign in'}</Text>
                </LinearGradient>
              </TouchScale>
              <TouchScale style={styles.linkBtn} onPress={() => { setStage('idle'); setCode(''); setMsg(''); }} accessibilityLabel="change-email">
                <Text style={styles.linkText}>Use a different email</Text>
              </TouchScale>
            </>
          )}
        </View>
      )}

      {!!msg && <Text style={styles.msg}>{msg}</Text>}

      <View style={styles.footRow}>
        <TouchScale style={styles.linkBtn} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} accessibilityLabel="privacy-policy">
          <Text style={styles.linkText}>Privacy Policy</Text>
        </TouchScale>
        <Text style={styles.dot}>·</Text>
        <TouchScale style={styles.linkBtn} onPress={del} disabled={busy} accessibilityLabel="delete-account">
          <Text style={[styles.linkText, styles.delText]}>{confirmDel ? 'Confirm delete' : 'Delete account'}</Text>
        </TouchScale>
      </View>

      <TouchScale style={styles.back} onPress={onBack} accessibilityLabel="account-back">
        <Text style={styles.backText}>Back</Text>
      </TouchScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 },
  title: { fontFamily: fonts.display, color: C.text, fontSize: 26, letterSpacing: 1 },
  box: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.borderGlass,
    padding: 18,
    gap: 12,
  },
  label: { fontFamily: fonts.bodyBold, color: C.textDim, fontSize: 11, letterSpacing: 2 },
  email: { fontFamily: fonts.bodyBold, color: C.brand1, fontSize: 18 },
  hint: { fontFamily: fonts.body, color: C.textDim, fontSize: 13, lineHeight: 19 },
  input: {
    backgroundColor: C.board,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cta: { borderRadius: 999, overflow: 'hidden' },
  ctaGrad: { paddingVertical: 12, alignItems: 'center' },
  ctaText: { fontFamily: fonts.display, color: C.onAccent, fontSize: 15 },
  ghost: { backgroundColor: C.surfaceHi, borderRadius: 999, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: C.borderGlass },
  ghostText: { fontFamily: fonts.bodyBold, color: C.text, fontSize: 15 },
  linkBtn: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 4 },
  linkText: { fontFamily: fonts.body, color: C.textDim, fontSize: 13 },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { color: C.textFaint, fontSize: 13 },
  delText: { color: C.danger },
  msg: { fontFamily: fonts.body, color: C.textDim, fontSize: 13, textAlign: 'center', maxWidth: 360 },
  back: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { fontFamily: fonts.body, color: C.textDim, fontSize: 15 },
});
