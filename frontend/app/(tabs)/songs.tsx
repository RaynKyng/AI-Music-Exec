import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../src/stores/dataStore';
import { Card } from '../../src/components/Card';
import { StatusBadge } from '../../src/components/StatusBadge';
import { SearchBar } from '../../src/components/SearchBar';
import { colors, spacing } from '../../src/utils/theme';
import { Song } from '../../src/types';

const STATUS_FILTERS = ['all', 'draft', 'in_progress', 'final', 'released'];

export default function SongsScreen() {
  const router = useRouter();
  const { songs, artists, fetchSongs, fetchArtists, deleteSong } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [artistFilter, setArtistFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchSongs(); fetchArtists(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchSongs(artistFilter || undefined, statusFilter === 'all' ? undefined : statusFilter, search || undefined);
    setRefreshing(false);
  };

  const applyFilters = useCallback((s?: string, status?: string, artist?: string | null) => {
    const st = (status ?? statusFilter) === 'all' ? undefined : (status ?? statusFilter);
    const ar = artist === undefined ? artistFilter : artist;
    const se = s === undefined ? search : s;
    fetchSongs(ar || undefined, st, se || undefined);
  }, [statusFilter, artistFilter, search]);

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    applyFilters(undefined, status, undefined);
  };

  const handleArtistFilter = (id: string | null) => {
    setArtistFilter(id);
    applyFilters(undefined, undefined, id);
  };

  const handleSearch = (text: string) => {
    setSearch(text);
    applyFilters(text, undefined, undefined);
  };

  const getArtistName = (artistId: string | null) => {
    if (!artistId) return 'Unassigned';
    return artists.find(a => a.id === artistId)?.name || 'Unknown';
  };

  const handleDelete = (song: Song) => {
    Alert.alert('Delete Song', `Delete "${song.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSong(song.id).catch(() => Alert.alert('Error', 'Failed')) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Song Catalog</Text>
        <TouchableOpacity testID="add-song-btn" style={styles.addButton} onPress={() => router.push('/song/new')}>
          <Ionicons name="add" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={handleSearch} placeholder="Search songs, lyrics..." />
      </View>

      {/* Status filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContainer}>
        {STATUS_FILTERS.map((status) => (
          <TouchableOpacity key={status} style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
            onPress={() => handleStatusFilter(status)}>
            <Text style={[styles.filterText, statusFilter === status && styles.filterTextActive]}>
              {status === 'all' ? 'All' : status.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Artist filters */}
      {artists.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContainer}>
          <TouchableOpacity style={[styles.artistChip, !artistFilter && styles.artistChipActive]}
            onPress={() => handleArtistFilter(null)}>
            <Text style={[styles.artistChipText, !artistFilter && styles.artistChipTextActive]}>All Artists</Text>
          </TouchableOpacity>
          {artists.map((a) => (
            <TouchableOpacity key={a.id} style={[styles.artistChip, artistFilter === a.id && styles.artistChipActive]}
              onPress={() => handleArtistFilter(a.id)}>
              <Text style={[styles.artistChipText, artistFilter === a.id && styles.artistChipTextActive]}>{a.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {songs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="disc-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Songs Found</Text>
            <Text style={styles.emptyText}>
              {search ? `No results for "${search}"` : 'Start building your catalog'}
            </Text>
            {!search && (
              <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/song/new')}>
                <Ionicons name="add" size={20} color={colors.text} />
                <Text style={styles.emptyButtonText}>Add Song</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          songs.map((song) => (
            <Card key={song.id} style={styles.songCard} onPress={() => router.push(`/song/${song.id}`)}>
              <View style={styles.songHeader}>
                <View style={styles.songInfo}>
                  <Text style={styles.songTitle}>{song.title}</Text>
                  <Text style={styles.artistName}>{getArtistName(song.artist_id)}</Text>
                </View>
                <StatusBadge status={song.status} />
              </View>
              {(song.genre || song.mood) && (
                <View style={styles.metaRow}>
                  {song.genre ? <View style={styles.metaBadge}><Ionicons name="musical-notes" size={12} color={colors.primary} /><Text style={styles.metaText}>{song.genre}</Text></View> : null}
                  {song.mood ? <View style={styles.metaBadge}><Ionicons name="heart" size={12} color={colors.secondary} /><Text style={styles.metaText}>{song.mood}</Text></View> : null}
                </View>
              )}
              <View style={styles.songFooter}>
                {song.versions?.length > 0 && (
                  <View style={styles.infoChip}><Ionicons name="layers" size={14} color={colors.textSecondary} /><Text style={styles.infoText}>{song.versions.length} ver</Text></View>
                )}
                {(song.suno_generations?.length > 0) && (
                  <View style={styles.infoChip}><Ionicons name="link" size={14} color={colors.primary} /><Text style={styles.infoText}>{song.suno_generations.length} gens</Text></View>
                )}
                {song.todo?.length > 0 && (
                  <View style={styles.infoChip}><Ionicons name="checkbox-outline" size={14} color={colors.warning} /><Text style={styles.infoText}>{song.todo.length} todos</Text></View>
                )}
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(song)}>
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
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  searchWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  filterScroll: { maxHeight: 44, marginBottom: spacing.xs },
  filterContainer: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  filterTextActive: { color: colors.text },
  artistChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surfaceLight, marginRight: 0 },
  artistChipActive: { backgroundColor: colors.secondary },
  artistChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  artistChipTextActive: { color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  emptyButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 12, marginTop: spacing.lg, gap: spacing.sm },
  emptyButtonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  songCard: { marginBottom: spacing.md },
  songHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  songInfo: { flex: 1, marginRight: spacing.md },
  songTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  artistName: { fontSize: 14, color: colors.primary, marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  metaBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceLight, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 8, gap: 4 },
  metaText: { fontSize: 12, color: colors.textSecondary },
  songFooter: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.md },
  infoChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText: { fontSize: 12, color: colors.textSecondary },
  deleteBtn: { marginLeft: 'auto', padding: spacing.xs },
});
