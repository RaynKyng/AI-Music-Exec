import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { useDataStore } from '../../src/stores/dataStore';
import { Card } from '../../src/components/Card';
import { colors, spacing, statusColors } from '../../src/utils/theme';

export default function Dashboard() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { stats, fetchStats, isLoading } = useDataStore();

  useEffect(() => {
    fetchStats();
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name || 'Music Executive'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={fetchStats}
            tintColor={colors.primary}
          />
        }
      >
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

        <Text style={styles.sectionTitle}>Recent Songs</Text>
        {stats?.recent_songs?.map((song) => (
          <Card
            key={song.id}
            style={styles.recentCard}
            onPress={() => router.push(`/song/${song.id}`)}
          >
            <View style={styles.recentRow}>
              <Ionicons name="musical-note" size={20} color={colors.primary} />
              <Text style={styles.recentTitle}>{song.title}</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusColors[song.status as keyof typeof statusColors] + '20' },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: statusColors[song.status as keyof typeof statusColors] },
                  ]}
                >
                  {song.status}
                </Text>
              </View>
            </View>
          </Card>
        ))}

        <Text style={styles.sectionTitle}>Recent Ideas</Text>
        {stats?.recent_ideas?.map((idea) => (
          <Card
            key={idea.id}
            style={styles.recentCard}
            onPress={() => router.push(`/idea/${idea.id}`)}
          >
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  greeting: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  logoutBtn: {
    padding: spacing.sm,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  statusCard: {
    padding: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  statusItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
  },
  statusCount: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  recentCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recentTitle: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  ideaType: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
  bottomPadding: {
    height: 40,
  },
});
