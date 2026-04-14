import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../src/stores/dataStore';
import { Card } from '../../src/components/Card';
import { StatusBadge } from '../../src/components/StatusBadge';
import { colors, spacing, statusColors } from '../../src/utils/theme';
import { Song } from '../../src/types';

const STATUS_FILTERS = ['all', 'draft', 'in_progress', 'final', 'released'];

export default function SongsScreen() {
  const router = useRouter();
  const { songs, artists, fetchSongs, fetchArtists, deleteSong, isLoading } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchSongs();
    fetchArtists();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSongs();
    setRefreshing(false);
  };

  const filteredSongs = statusFilter === 'all'
    ? songs
    : songs.filter(s => s.status === statusFilter);

  const getArtistName = (artistId: string | null) => {
    if (!artistId) return 'Unassigned';
    const artist = artists.find(a => a.id === artistId);
    return artist?.name || 'Unknown';
  };

  const handleDelete = (song: Song) => {
    Alert.alert(
      'Delete Song',
      `Are you sure you want to delete "${song.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSong(song.id);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete song');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Song Catalog</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/song/new')}
        >
          <Ionicons name="add" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContainer}
      >
        {STATUS_FILTERS.map((status) => (
          <TouchableOpacity
            key={status}
            style={[
              styles.filterChip,
              statusFilter === status && styles.filterChipActive,
            ]}
            onPress={() => setStatusFilter(status)}
          >
            <Text
              style={[
                styles.filterText,
                statusFilter === status && styles.filterTextActive,
              ]}
            >
              {status === 'all' ? 'All' : status.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {filteredSongs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="disc-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Songs Found</Text>
            <Text style={styles.emptyText}>
              {statusFilter === 'all'
                ? 'Start building your catalog by adding songs'
                : `No songs with status "${statusFilter.replace('_', ' ')}"`}
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/song/new')}
            >
              <Ionicons name="add" size={20} color={colors.text} />
              <Text style={styles.emptyButtonText}>Add Song</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredSongs.map((song) => (
            <Card
              key={song.id}
              style={styles.songCard}
              onPress={() => router.push(`/song/${song.id}`)}
            >
              <View style={styles.songHeader}>
                <View style={styles.songInfo}>
                  <Text style={styles.songTitle}>{song.title}</Text>
                  <Text style={styles.artistName}>
                    {getArtistName(song.artist_id)}
                  </Text>
                </View>
                <StatusBadge status={song.status} />
              </View>

              {(song.genre || song.mood) && (
                <View style={styles.metaRow}>
                  {song.genre && (
                    <View style={styles.metaBadge}>
                      <Ionicons name="musical-notes" size={12} color={colors.primary} />
                      <Text style={styles.metaText}>{song.genre}</Text>
                    </View>
                  )}
                  {song.mood && (
                    <View style={styles.metaBadge}>
                      <Ionicons name="heart" size={12} color={colors.secondary} />
                      <Text style={styles.metaText}>{song.mood}</Text>
                    </View>
                  )}
                </View>
              )}

              {song.versions.length > 0 && (
                <View style={styles.versionsRow}>
                  <Ionicons name="layers" size={14} color={colors.textSecondary} />
                  <Text style={styles.versionsText}>
                    {song.versions.length} version{song.versions.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}

              <View style={styles.songFooter}>
                {song.todo.length > 0 && (
                  <View style={styles.todoIndicator}>
                    <Ionicons name="checkbox-outline" size={14} color={colors.warning} />
                    <Text style={styles.todoText}>{song.todo.length} todos</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(song)}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            </Card>
          ))
        )}
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterScroll: {
    maxHeight: 50,
  },
  filterContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  filterTextActive: {
    color: colors.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  emptyButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  songCard: {
    marginBottom: spacing.md,
  },
  songHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  songInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  songTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  artistName: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  versionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  versionsText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  songFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  todoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  todoText: {
    fontSize: 12,
    color: colors.warning,
  },
  deleteBtn: {
    padding: spacing.xs,
  },
});
