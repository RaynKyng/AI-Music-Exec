import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Pressable, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../src/stores/dataStore';
import { Card } from '../../src/components/Card';
import { SearchBar } from '../../src/components/SearchBar';
import { colors, spacing } from '../../src/utils/theme';
import { Artist } from '../../src/types';

const SORT_OPTIONS = [
  { id: 'name_asc', label: 'A-Z', icon: 'text' },
  { id: 'name_desc', label: 'Z-A', icon: 'text' },
  { id: 'songs', label: 'Most Songs', icon: 'disc' },
  { id: 'recent', label: 'Recent', icon: 'time' },
];

export default function ArtistsScreen() {
  const router = useRouter();
  const { artists, fetchArtists, deleteArtist } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [genreFilter, setGenreFilter] = useState<string | null>(null);

  useEffect(() => { fetchArtists(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchArtists();
    setRefreshing(false);
  };

  const doSearch = useCallback((text: string) => {
    setSearch(text);
    fetchArtists(text || undefined);
  }, []);

  // Collect all unique genres from artists
  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    artists.forEach(a => a.genres?.forEach(g => genres.add(g)));
    return Array.from(genres).sort();
  }, [artists]);

  // Filter and sort
  const displayArtists = useMemo(() => {
    let list = [...artists];

    // Genre filter
    if (genreFilter) {
      list = list.filter(a => a.genres?.some(g => g.toLowerCase() === genreFilter.toLowerCase()));
    }

    // Sort
    switch (sortBy) {
      case 'name_asc':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name_desc':
        list.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'songs':
        list.sort((a, b) => (b.song_count || 0) - (a.song_count || 0));
        break;
      case 'recent':
        list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
    }

    return list;
  }, [artists, sortBy, genreFilter]);

  const handleDelete = (artist: Artist) => {
    Alert.alert('Delete Artist', `Delete ${artist.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteArtist(artist.id).catch(() => Alert.alert('Error', 'Failed')) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Artist Roster</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity testID="ai-generate-artist-btn" style={styles.aiGenButton} onPress={() => router.push('/artist/ai-generate')}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
            <Text style={styles.aiGenText}>AI Generate</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="add-artist-btn" style={styles.addButton} onPress={() => router.push('/artist/new')}>
            <Ionicons name="add" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={doSearch} placeholder="Search artists..." />
      </View>

      {/* Sort options */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {SORT_OPTIONS.map((opt) => (
          <Pressable key={opt.id} style={[styles.sortChip, sortBy === opt.id && styles.sortChipActive]}
            onPress={() => setSortBy(opt.id)}>
            <Ionicons name={opt.icon as any} size={14} color={sortBy === opt.id ? colors.text : colors.textSecondary} />
            <Text style={[styles.sortText, sortBy === opt.id && styles.sortTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Genre filter */}
      {allGenres.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          <Pressable style={[styles.genreChip, !genreFilter && styles.genreChipActive]}
            onPress={() => setGenreFilter(null)}>
            <Text style={[styles.genreText, !genreFilter && styles.genreTextActive]}>All Genres</Text>
          </Pressable>
          {allGenres.map((genre) => (
            <Pressable key={genre} style={[styles.genreChip, genreFilter === genre && styles.genreChipActive]}
              onPress={() => setGenreFilter(genreFilter === genre ? null : genre)}>
              <Text style={[styles.genreText, genreFilter === genre && styles.genreTextActive]}>{genre}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* Count indicator */}
        <Text style={styles.countLabel}>
          {displayArtists.length} artist{displayArtists.length !== 1 ? 's' : ''}
          {genreFilter ? ` in ${genreFilter}` : ''}
        </Text>

        {displayArtists.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>{search || genreFilter ? 'No Results' : 'No Artists Yet'}</Text>
            <Text style={styles.emptyText}>
              {search ? `No artists matching "${search}"` : genreFilter ? `No artists in ${genreFilter}` : 'Start building your roster'}
            </Text>
            {!search && !genreFilter && (
              <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/artist/new')}>
                <Ionicons name="add" size={20} color={colors.text} />
                <Text style={styles.emptyButtonText}>Add Artist</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          displayArtists.map((artist) => (
            <Card key={artist.id} style={styles.artistCard} onPress={() => router.push(`/artist/${artist.id}`)}>
              <View style={styles.artistHeader}>
                {(artist as any).profile_image || artist.image_url ? (
                  <Image source={{ uri: (artist as any).profile_image || artist.image_url }} style={styles.artistAvatar} />
                ) : (
                  <View style={[styles.artistAvatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarText}>{artist.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.artistInfo}>
                  <Text style={styles.artistName}>{artist.name}</Text>
                  <Text style={styles.artistGenres}>{artist.genres.join(' \u2022 ') || 'No genres'}</Text>
                </View>
                <Pressable style={styles.deleteBtn} onPress={(e) => { e.stopPropagation(); handleDelete(artist); }}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </Pressable>
              </View>
              {artist.unique_sound ? <Text style={styles.artistSound} numberOfLines={2}>{artist.unique_sound}</Text> : null}
              <View style={styles.artistFooter}>
                <View style={styles.songCount}>
                  <Ionicons name="disc" size={16} color={colors.textSecondary} />
                  <Text style={styles.songCountText}>{artist.song_count} songs</Text>
                </View>
                {artist.tone ? (
                  <View style={styles.toneBadge}>
                    <Text style={styles.toneText}>{artist.tone}</Text>
                  </View>
                ) : null}
                {artist.themes.length > 0 && (
                  <View style={styles.themes}>
                    {artist.themes.slice(0, 2).map((theme, i) => (
                      <View key={i} style={styles.themeBadge}><Text style={styles.themeText}>{theme}</Text></View>
                    ))}
                  </View>
                )}
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aiGenButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, height: 44, borderRadius: 22, backgroundColor: colors.primary + '20', borderWidth: 1, borderColor: colors.primary },
  aiGenText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  searchWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  filterRow: { maxHeight: 40, marginBottom: spacing.xs },
  filterContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  sortChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 4 },
  sortChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sortText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  sortTextActive: { color: colors.text },
  genreChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surfaceLight },
  genreChipActive: { backgroundColor: colors.secondary },
  genreText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  genreTextActive: { color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingTop: spacing.xs },
  countLabel: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xl },
  emptyButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 12, marginTop: spacing.lg, gap: spacing.sm },
  emptyButtonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  artistCard: { marginBottom: spacing.md },
  artistHeader: { flexDirection: 'row', alignItems: 'center' },
  artistAvatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPlaceholder: { backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700', color: colors.text },
  artistInfo: { flex: 1, marginLeft: spacing.md },
  artistName: { fontSize: 18, fontWeight: '600', color: colors.text },
  artistGenres: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  deleteBtn: { padding: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  artistSound: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.md, fontStyle: 'italic' },
  artistFooter: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm },
  songCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  songCountText: { fontSize: 14, color: colors.textSecondary },
  toneBadge: { backgroundColor: colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  toneText: { fontSize: 11, color: colors.primary, fontWeight: '500' },
  themes: { flexDirection: 'row', flex: 1, justifyContent: 'flex-end', gap: spacing.xs },
  themeBadge: { backgroundColor: colors.surfaceLight, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 8 },
  themeText: { fontSize: 12, color: colors.textSecondary },
});
