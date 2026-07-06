import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tierFor } from '../game/rating';
import { type LeaderRow, fetchLeaderboard } from '../lib/leaderboard';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, fonts, radius, rgba, tierStyle } from '../theme/tokens';
import { GameButton } from '../ui/GameButton';
import { ScreenShell, ScreenTitle } from '../ui/Screen';
import { t as tr, tierName } from '../lib/i18n';

// Инициалы: юникод-буквы/цифры (кириллица и т.п.), а не только [A-Za-z0-9] —
// у русских имён аватар был «?» (B6).
function initialsOf(name: string): string {
  const tail = name.includes('-') ? name.split('-').pop() ?? name : name;
  const letters = [...tail].filter((ch) => /[\p{L}\p{N}]/u.test(ch));
  return (letters.slice(0, 2).join('') || '?').toUpperCase();
}

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
    <ScreenShell maxWidth={472}>
      <ScreenTitle>{tr('leaderboard')}</ScreenTitle>

      {rows === null ? (
        <ActivityIndicator color={palette.accent} accessibilityLabel="lb-loading" />
      ) : rows.length === 0 ? (
        <Text style={styles.empty} accessibilityLabel="lb-empty">{tr('lbEmpty')}</Text>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ gap: 8 }}>
          {rows.map((r, i) => {
            const t = tierFor(r.rating);
            const me = r.id === myId;
            const top = i < 3;
            const medal = ['#FFD75E', '#D8DEE9', '#E0A86A'][i];
            const initials = initialsOf(r.name);
            const grad = tierStyle[t.name]?.grad ?? (['#888', '#555'] as const);
            return (
              <View
                key={r.id}
                style={[
                  styles.row,
                  // Тинт-подложка тир-цвета для топ-3 (B6).
                  top && { backgroundColor: rgba(t.color.startsWith('#') ? t.color : '#888888', 0.08), borderColor: rgba(t.color, 0.25) },
                  me && styles.rowMe,
                ]}
              >
                <View style={[styles.rankWrap, top && { borderColor: medal, backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                  <Text style={[styles.rank, top && { color: medal }]}>{i + 1}</Text>
                </View>
                <View style={[styles.avatar, { borderColor: t.color }]}>
                  <Text style={[styles.avatarText, { color: t.color }]}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.name}
                    {me ? ` ${tr('youSuffix')}` : ''}
                  </Text>
                  <View style={styles.tierRow}>
                    <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tierPill}>
                      <Text style={styles.tierPillText}>{tierName(t.name)}</Text>
                    </LinearGradient>
                    <Text style={styles.wl}>{tr('wlShort', { w: r.wins, l: r.losses })}</Text>
                  </View>
                </View>
                <Text style={styles.rating}>{r.rating}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <GameButton title={tr('refresh')} variant="secondary" onPress={load} a11y="lb-refresh" />
      <GameButton title={tr('back')} variant="ghost" onPress={onBack} a11y="lb-back" />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: fonts.body, color: palette.textDim, fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  list: { width: '100%', flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.borderGlass,
  },
  rowMe: { borderWidth: 1, borderColor: palette.brand1 },
  rankWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  rank: { fontFamily: fonts.num, color: palette.textDim, fontSize: 15 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, backgroundColor: 'rgba(255,255,255,0.04)' },
  avatarText: { fontFamily: fonts.bodyBold, fontSize: 13 },
  name: { fontFamily: fonts.bodyBold, color: palette.text, fontSize: 16 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  tierPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tierPillText: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#0A1020' },
  wl: { fontFamily: fonts.body, color: palette.textDim, fontSize: 12 },
  rating: { fontFamily: fonts.num, color: palette.text, fontSize: 20 },
});
