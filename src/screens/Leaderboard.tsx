import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tierFor } from '../game/rating';
import { type LeaderRow, fetchLeaderboard } from '../lib/leaderboard';

const C = {
  bg: '#0e1116',
  board: '#161b22',
  border: '#222b36',
  text: '#e6edf3',
  textDim: '#8b949e',
  accent: '#3ddc84',
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
            return (
              <View key={r.id} style={[styles.row, me && styles.rowMe]}>
                <Text style={styles.rank}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {r.name}
                    {me ? ' (you)' : ''}
                  </Text>
                  <Text style={[styles.tier, { color: t.color }]}>
                    {t.name} · {r.wins}W {r.losses}L
                  </Text>
                </View>
                <Text style={styles.rating}>{r.rating}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Pressable style={styles.btn} onPress={load} accessibilityLabel="lb-refresh">
        <Text style={styles.btnText}>Refresh</Text>
      </Pressable>
      <Pressable style={styles.back} onPress={onBack} accessibilityLabel="lb-back">
        <Text style={styles.backText}>Back</Text>
      </Pressable>
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
  title: { color: C.text, fontSize: 26, fontWeight: '700', letterSpacing: 1 },
  empty: { color: C.textDim, fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  list: { width: '100%', maxWidth: 440, flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.board,
    borderRadius: 12,
    padding: 12,
  },
  rowMe: { borderWidth: 1, borderColor: C.accent },
  rank: { color: C.textDim, fontSize: 16, fontWeight: '700', width: 28, textAlign: 'center' },
  name: { color: C.text, fontSize: 16, fontWeight: '500' },
  tier: { fontSize: 13 },
  rating: { color: C.text, fontSize: 20, fontWeight: '700' },
  btn: { backgroundColor: C.board, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 28, borderWidth: 1, borderColor: C.border },
  btnText: { color: C.text, fontSize: 15, fontWeight: '500' },
  back: { paddingVertical: 8, paddingHorizontal: 20 },
  backText: { color: C.textDim, fontSize: 15 },
});
