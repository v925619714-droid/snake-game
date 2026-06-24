import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette as C, gradients, fonts } from '../theme/tokens';
import { TouchScale } from '../ui/anim';
import { type AuthUser, sendEmailCode, signOut, verifyEmailCode } from '../lib/auth';

export default function Account({
  user,
  onBack,
  onChanged,
}: {
  user: AuthUser | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'idle' | 'code'>('idle');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const signedIn = Boolean(user && !user.isAnon && user.email);

  const send = async () => {
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
      setMsg('Code sent — check your email.');
    } else {
      setMsg(r.error || 'Could not send the code.');
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
      setMsg('Signed in! Progress now syncs across devices.');
      setStage('idle');
      setCode('');
      onChanged();
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

  return (
    <View style={styles.container}>
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
            <TouchScale style={styles.cta} onPress={send} disabled={busy} accessibilityLabel="send-code">
              <LinearGradient colors={gradients.play} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGrad}>
                <Text style={styles.ctaText}>{busy ? 'Sending…' : 'Send code'}</Text>
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
  linkBtn: { alignItems: 'center', paddingVertical: 4 },
  linkText: { fontFamily: fonts.body, color: C.textDim, fontSize: 13 },
  msg: { fontFamily: fonts.body, color: C.textDim, fontSize: 13, textAlign: 'center', maxWidth: 360 },
  back: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { fontFamily: fonts.body, color: C.textDim, fontSize: 15 },
});
