import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../src/stores/authStore';
import { useDataStore } from '../../src/stores/dataStore';
import { Card } from '../../src/components/Card';
import { colors, spacing, statusColors } from '../../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function Dashboard() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { stats, fetchStats, isLoading } = useDataStore();
  const [revenue, setRevenue] = useState<any>(null);

  useEffect(() => { fetchStats(); loadRevenue(); }, []);

  const authFetch = async (url: string) => {
    const token = await AsyncStorage.getItem('token');
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  };

  const loadRevenue = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/revenue/chart`);
      const data = await res.json();
      setRevenue(data);
    } catch { /* ignore */ }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };
  const onRefresh = () => { fetchStats(); loadRevenue(); };

  const maxPlatformAmount = revenue?.by_platform?.length > 0 
    ? Math.max(...revenue.by_platform.map((p: any) => p.amount)) : 0;

  const platformColors: Record<string, string> = {
    spotify: '#1DB954', apple_music: '#FC3C44', youtube: '#FF0000',
    tiktok: '#00F2EA', instagram: '#E1306C', soundcloud: '#FF5500',
    twitter: '#1DA1F2', licensing: '#F59E0B', merch: '#8B5CF6',
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name || 'Music Executive'}</Text>
        </View>
        <Pressable testID="logout-btn" onPress={handleLogout} style={styles.logoutBtn}>
          <View style={styles.logoutInner}>
            <Ionicons name="log-out-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </View>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.primary} />}>
        
        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <Card style={styles.statCard}>
            <Ionicons name="people" size={28} color={colors.primary} />
            <Text style={styles.statNumber}>{stats?.artist_count || 0}</Text>
            <Text style={styles.statLabel}>Artists</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="disc" size={28} color={colors.secondary} />
            <Text style={styles.statNumber}>{stats?.song_count || 0}</Text>
            <Text style={styles.statLabel}>Songs</Text>
          </Card>
          <Card style={styles.statCard}>
            <Ionicons name="bulb" size={28} color={colors.warning} />
            <Text style={styles.statNumber}>{stats?.idea_count || 0}</Text>
            <Text style={styles.statLabel}>Ideas</Text>
          </Card>
        </View>

        {/* Song Status */}
        <Text style={styles.sectionTitle}>Song Status</Text>
        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: statusColors.draft }]} />
              <Text style={styles.statusLabel}>Draft</Text>
              <Text style={styles.statusCount}>{stats?.song_status?.draft || 0}</Text>
            </View>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: statusColors.in_progress }]} />
              <Text style={styles.statusLabel}>In Progress</Text>
              <Text style={styles.statusCount}>{stats?.song_status?.in_progress || 0}</Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: statusColors.final }]} />
              <Text style={styles.statusLabel}>Final</Text>
              <Text style={styles.statusCount}>{stats?.song_status?.final || 0}</Text>
            </View>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: statusColors.released }]} />
              <Text style={styles.statusLabel}>Released</Text>
              <Text style={styles.statusCount}>{stats?.song_status?.released || 0}</Text>
            </View>
          </View>
        </Card>

        {/* Revenue Section */}
        <Text style={styles.sectionTitle}>Revenue</Text>
        <Card style={styles.revenueCard}>
          <View style={styles.revenueHeader}>
            <View>
              <Text style={styles.revenueTotal}>${(revenue?.total || 0).toFixed(2)}</Text>
              <Text style={styles.revenueSub}>Total earnings</Text>
            </View>
            <View style={styles.revenueCount}>
              <Text style={styles.revenueCountNum}>{revenue?.entry_count || 0}</Text>
              <Text style={styles.revenueSub}>entries</Text>
            </View>
          </View>

          {/* Platform Bar Chart */}
          {revenue?.by_platform?.length > 0 && (
            <View style={styles.chartSection}>
              <Text style={styles.chartTitle}>By Platform</Text>
              {revenue.by_platform.map((p: any) => (
                <View key={p.platform} style={styles.barRow}>
                  <Text style={styles.barLabel}>{p.platform.replace('_', ' ')}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, {
                      width: `${maxPlatformAmount > 0 ? (p.amount / maxPlatformAmount) * 100 : 0}%`,
                      backgroundColor: platformColors[p.platform] || colors.primary,
                    }]} />
                  </View>
                  <Text style={styles.barAmount}>${p.amount.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Period Chart */}
          {revenue?.by_period?.length > 0 && (
            <View style={styles.chartSection}>
              <Text style={styles.chartTitle}>By Period</Text>
              {revenue.by_period.slice(-6).map((p: any) => (
                <View key={p.period} style={styles.barRow}>
                  <Text style={styles.barLabel}>{p.period}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, {
                      width: `${revenue.total > 0 ? (p.amount / revenue.total) * 100 : 0}%`,
                      backgroundColor: colors.success,
                    }]} />
                  </View>
                  <Text style={styles.barAmount}>${p.amount.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Top Songs */}
          {revenue?.top_songs?.length > 0 && (
            <View style={styles.chartSection}>
              <Text style={styles.chartTitle}>Top Earning Songs</Text>
              {revenue.top_songs.slice(0, 5).map((s: any, i: number) => (
                <View key={s.song_id} style={styles.topSongRow}>
                  <Text style={styles.topSongRank}>#{i + 1}</Text>
                  <Text style={styles.topSongTitle} numberOfLines={1}>{s.title}</Text>
                  <Text style={styles.topSongAmount}>${s.amount.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}

          {(!revenue || revenue.entry_count === 0) && (
            <View style={styles.revenueEmpty}>
              <Ionicons name="trending-up" size={32} color={colors.textMuted} />
              <Text style={styles.revenueEmptyText}>Track your earnings as songs get distributed</Text>
            </View>
          )}
        </Card>

        {/* Recent Songs */}
        <Text style={styles.sectionTitle}>Recent Songs</Text>
        {stats?.recent_songs?.map((song) => (
          <Card key={song.id} style={styles.recentCard} onPress={() => router.push(`/song/${song.id}`)}>
            <View style={styles.recentRow}>
              <Ionicons name="musical-note" size={20} color={colors.primary} />
              <Text style={styles.recentTitle}>{song.title}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColors[song.status as keyof typeof statusColors] + '20' }]}>
                <Text style={[styles.statusBadgeText, { color: statusColors[song.status as keyof typeof statusColors] }]}>{song.status}</Text>
              </View>
            </View>
          </Card>
        ))}

        {/* Recent Ideas */}
        <Text style={styles.sectionTitle}>Recent Ideas</Text>
        {stats?.recent_ideas?.map((idea) => (
          <Card key={idea.id} style={styles.recentCard} onPress={() => router.push(`/idea/${idea.id}`)}>
            <View style={styles.recentRow}>
              <Ionicons name="bulb" size={20} color={colors.warning} />
              <Text style={styles.recentTitle}>{idea.title}</Text>
              <Text style={styles.ideaType}>{idea.type}</Text>
            </View>
          </Card>
        ))}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  greeting: { fontSize: 14, color: colors.textSecondary },
  userName: { fontSize: 24, fontWeight: '700', color: colors.text },
  logoutBtn: { padding: spacing.sm, backgroundColor: colors.surfaceLight, borderRadius: 8, minWidth: 100, minHeight: 44 },
  logoutInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: spacing.sm },
  logoutText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  scroll: { flex: 1, paddingHorizontal: spacing.lg },
  statsGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  statCard: { flex: 1, alignItems: 'center', padding: spacing.md },
  statNumber: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: spacing.md, marginTop: spacing.md },
  statusCard: { padding: spacing.md },
  statusRow: { flexDirection: 'row', marginBottom: spacing.sm },
  statusItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  statusCount: { fontSize: 16, fontWeight: '600', color: colors.text },
  // Revenue
  revenueCard: { padding: spacing.md },
  revenueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  revenueTotal: { fontSize: 32, fontWeight: '700', color: colors.success },
  revenueSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  revenueCount: { alignItems: 'flex-end' },
  revenueCountNum: { fontSize: 20, fontWeight: '600', color: colors.text },
  chartSection: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  chartTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  barLabel: { width: 80, fontSize: 12, color: colors.textSecondary, textTransform: 'capitalize' },
  barTrack: { flex: 1, height: 16, backgroundColor: colors.surfaceLight, borderRadius: 8, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 8, minWidth: 4 },
  barAmount: { width: 60, fontSize: 12, fontWeight: '600', color: colors.text, textAlign: 'right' },
  topSongRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  topSongRank: { fontSize: 14, fontWeight: '700', color: colors.primary, width: 28 },
  topSongTitle: { flex: 1, fontSize: 14, color: colors.text },
  topSongAmount: { fontSize: 14, fontWeight: '600', color: colors.success },
  revenueEmpty: { alignItems: 'center', paddingVertical: spacing.lg },
  revenueEmptyText: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  // Recent
  recentCard: { marginBottom: spacing.sm, padding: spacing.md },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recentTitle: { flex: 1, fontSize: 16, color: colors.text },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  ideaType: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  bottomPadding: { height: 40 },
});
