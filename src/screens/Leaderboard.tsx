import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tierFor } from '../game/rating';
import { type LeaderRow, fetchLeaderboard } from '../lib/leaderboard';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, tierStyle } from '../theme/tokens';
import { TouchScale } from '../ui/anim';

const C = {
  bg: '#0B0F17',
  board: '#121826',
  border: '#1D2940',
  text: '#E8F0FB',
  textDim: '#8395AE',
  accent: '#3DDC84',
};

export default function Leaderboard({ myId, onBack }: { myId: string; onBack: () => void }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);

  const load = useCallback(() => {
    setRows(null);
    fetchLeaderboard(50).then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>

      {rows === null ? (
        <ActivityIndicator color={C.accent} accessibilityLabel="lb-loading" />
      ) : rows.length === 0 ? (
        <Text style={styles.empty} accessibilityLabel="lb-empty">No players yet — play a ranked match!</Text>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ gap: 8 }}>
          {rows.map((r, i) => {
            const t = tierFor(r.rating);
            const me = r.id === myId;
            const top = i < 3;
            const medal = ['#FFD75E', '#D8DEE9', '#E0A86A'][i];
            const tail = r.name.includes('-') ? r.name.split('-').pop() ?? r.name : r.name;
            const initials = (tail.replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?').toUpperCase();
            const grad = tierStyle[t.name]?.grad ?? (['#888', '#555'] as const);
            return (
              <View key={r.id} style={[styles.row, me && styles.rowMe]}>
                <View style={[styles.rankWrap, top && { borderColor: medal, backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                  <Text style={[styles.rank, top && { color: medal }]}>{i + 1}</Text>
                </View>
                <View style={[styles.avatar, { borderColor: t.color }]}>
                  <Text style={[styles.avatarText, { color: t.color }]}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.name}
                    {me ? ' (you)' : ''}
                  </Text>
                  <View style={styles.tierRow}>
                    <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tierPill}>
                      <Text style={styles.tierPillText}>{t.name}</Text>
                    </LinearGradient>
                    <Text style={styles.wl}>{r.wins}W {r.losses}L</Text>
                  </View>
                </View>
                <Text style={styles.rating}>{r.rating}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <TouchScale style={styles.btn} onPress={load} accessibilityLabel="lb-refresh">
        <Text style={styles.btnText}>Refresh</Text>
      </TouchScale>
      <TouchScale style={styles.back} onPress={onBack} accessibilityLabel="lb-back">
        <Text style={styles.backText}>Back</Text>
      </TouchScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 44,
    paddingBottom: 24,
    gap: 14,
  },
  title: { fontFamily: fonts.display, color: C.text, fontSize: 26, letterSpacing: 1 },
  empty: { fontFamily: fonts.body, color: C.textDim, fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  list: { width: '100%', maxWidth: 440, flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.board,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  rowMe: { borderWidth: 1, borderColor: '#7CF7D4' },
  rankWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  rank: { fontFamily: fonts.num, color: C.textDim, fontSize: 15 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, backgroundColor: 'rgba(255,255,255,0.04)' },
  avatarText: { fontFamily: fonts.bodyBold, fontSize: 13 },
  name: { fontFamily: fonts.bodyBold, color: C.text, fontSize: 16 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  tierPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tierPillText: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#0A1020' },
  wl: { fontFamily: fonts.body, color: C.textDim, fontSize: 12 },
  rating: { fontFamily: fonts.num, color: C.text, fontSize: 20 },
  btn: { backgroundColor: C.board, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  btnText: { fontFamily: fonts.bodyBold, color: C.text, fontSize: 15 },
  back: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { color: C.textDim, fontSize: 15 },
});
