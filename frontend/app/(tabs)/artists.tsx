import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Pressable, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../src/stores/dataStore';
import { Card } from '../../src/components/Card';
import { SearchBar } from '../../src/components/SearchBar';
import { ListErrorBanner } from '../../src/components/ListErrorBanner';
import { colors, spacing } from '../../src/utils/theme';
import { confirmDestructive } from '../../src/utils/confirm';
import { Artist } from '../../src/types';

const SORT_OPTIONS = [
  { id: 'name_asc', label: 'A-Z', icon: 'text' },
  { id: 'name_desc', label: 'Z-A', icon: 'text' },
  { id: 'songs', label: 'Most Songs', icon: 'disc' },
  { id: 'recent', label: 'Recent', icon: 'time' },
];

export default function ArtistsScreen() {
  const router = useRouter();
  const {
    artists,
    artistsError,
    artistsLoadedOnce,
    fetchArtists,
    deleteArtist,
  } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');

  useFocusEffect(
    useCallback(() => {
      fetchArtists();
    }, [fetchArtists])
  );

  useEffect(() => {
    AsyncStorage.getItem('artistsViewMode').then((v) => {
      if (v === 'list' || v === 'cards') setViewMode(v);
    });
  }, []);

  const toggleViewMode = () => {
    const next = viewMode === 'list' ? 'cards' : 'list';
    setViewMode(next);
    AsyncStorage.setItem('artistsViewMode', next);
  };

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
    if (Array.isArray(artists)) {
      artists.forEach(a => a.genres?.forEach(g => genres.add(g)));
    }
    return Array.from(genres).sort();
  }, [artists]);

  // Filter and sort
  const displayArtists = useMemo(() => {
    let list = Array.isArray(artists) ? [...artists] : [];

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
    confirmDestructive(`Delete ${artist.name}?`, 'Delete Artist').then((ok) => {
      if (ok) deleteArtist(artist.id).catch(() => Alert.alert('Error', 'Failed'));
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>Artist Roster</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            testID="view-toggle-btn"
            style={styles.viewToggleBtn}
            onPress={toggleViewMode}
            accessibilityLabel={viewMode === 'list' ? 'Switch to card view' : 'Switch to list view'}
          >
            <Ionicons name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="ai-generate-artist-btn"
            style={styles.aiGenButton}
            onPress={() => router.push('/artist/ai-generate')}
            accessibilityLabel="AI Generate Artist"
          >
            <Ionicons name="sparkles" size={18} color={colors.primary} />
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

        {/* Failed-refresh banner: shown when the last fetchArtists() rejected.
            Distinct from the empty state so a 500 never looks like silent
            data deletion. */}
        <ListErrorBanner
          error={artistsError}
          onRetry={onRefresh}
          hasStaleList={artists.length > 0}
        />

        {/* Count indicator */}
        <Text style={styles.countLabel}>
          {displayArtists.length} artist{displayArtists.length !== 1 ? 's' : ''}
          {genreFilter ? ` in ${genreFilter}` : ''}
        </Text>
	<Text style={{ color: 'yellow', paddingHorizontal: 16 }}>
	  DEBUG raw={artists.length} displayed={displayArtists.length}
	  {' '}loaded={String(artistsLoadedOnce)}
	  {' '}error={artistsError ? artistsError.message : 'none'}
	</Text>

        {displayArtists.length === 0 ? (
          // Three distinct states:
          //   1) Active filter or search (no matches in already-loaded data)
          //   2) "Couldn't load" — fetch failed AND we never had a list before
          //   3) Genuinely empty roster (loaded successfully, 0 records)
          (artistsError && !artistsLoadedOnce) ? (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={64} color={colors.warning} />
              <Text style={styles.emptyTitle}>Artists could not be loaded</Text>
              <Text style={styles.emptyText}>
                We hit a problem talking to the server. Pull down to refresh, or tap retry on the banner above.
              </Text>
            </View>
          ) : (
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
          )
        ) : viewMode === 'list' ? (
          // === COMPACT LIST VIEW (default) ===
          <View style={styles.listContainer}>
            {displayArtists.map((artist) => (
              <Pressable
                key={artist.id}
                style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
                onPress={(e: any) => {
                  try {
                    const tgt = e?.nativeEvent?.target as HTMLElement | undefined;
                    if (tgt && typeof tgt.closest === 'function' && tgt.closest('[data-stop-parent="true"]')) return;
                  } catch {}
                  router.push(`/artist/${artist.id}`);
                }}
              >
                {(artist as any).profile_image || artist.image_url ? (
                  <Image source={{ uri: (artist as any).profile_image || artist.image_url }} style={styles.listAvatar} />
                ) : (
                  <View style={[styles.listAvatar, styles.avatarPlaceholder]}>
                    <Text style={styles.listAvatarText}>{artist.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.listRowLeft}>
                  <Text style={styles.listTitle} numberOfLines={1}>{artist.name}</Text>
                  <Text style={styles.listSubtitle} numberOfLines={1}>
                    {artist.song_count || 0} {(artist.song_count || 0) === 1 ? 'song' : 'songs'}
                    {artist.genres?.length > 0 && ` • ${artist.genres.slice(0, 2).join(', ')}`}
                    {artist.genres?.length > 2 && ` +${artist.genres.length - 2}`}
                  </Text>
                </View>
                <View dataSet={{ stopParent: 'true' }}>
                  <Pressable
                    style={styles.listIconBtn}
                    hitSlop={6}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      handleDelete(artist);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </Pressable>
                </View>
              </Pressable>
            ))}
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
                  <Text style={styles.artistName} numberOfLines={1}>{artist.name}</Text>
                  <Text style={styles.artistGenres} numberOfLines={1}>{artist.genres.join(' \u2022 ') || 'No genres'}</Text>
                </View>
                <View dataSet={{ stopParent: 'true' }}>
                <Pressable style={styles.deleteBtn} onPress={(e) => { e.stopPropagation(); handleDelete(artist); }}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </Pressable>
                </View>
              </View>
              {artist.unique_sound ? <Text style={styles.artistSound} numberOfLines={2}>{artist.unique_sound}</Text> : null}
              <View style={styles.artistFooter}>
                <View style={styles.songCount}>
                  <Ionicons name="disc" size={16} color={colors.textSecondary} />
                  <Text style={styles.songCountText}>{artist.song_count} songs</Text>
                </View>
                {artist.tone ? (
                  <View style={styles.toneBadge}>
                    <Text style={styles.toneText} numberOfLines={1}>{artist.tone}</Text>
                  </View>
                ) : null}
                {artist.themes.length > 0 && (
                  <View style={styles.themes}>
                    {artist.themes.slice(0, 2).map((theme, i) => (
                      <View key={i} style={styles.themeBadge}><Text style={styles.themeText} numberOfLines={1}>{theme}</Text></View>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, flex: 1, flexShrink: 1 },
  addButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  viewToggleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  // Compact list view
  listContainer: { backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border + '60', minHeight: 60, gap: 12 },
  listRowPressed: { backgroundColor: colors.surfaceLight },
  listAvatar: { width: 40, height: 40, borderRadius: 20 },
  listAvatarText: { fontSize: 16, fontWeight: '700', color: colors.text },
  listRowLeft: { flex: 1, gap: 2 },
  listTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  listSubtitle: { fontSize: 12, color: colors.textMuted },
  listIconBtn: { padding: 6, borderRadius: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 0 },
  aiGenButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary + '20', borderWidth: 1, borderColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
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
  artistFooter: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm, flexWrap: 'wrap' },
  songCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  songCountText: { fontSize: 14, color: colors.textSecondary },
  toneBadge: { backgroundColor: colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, maxWidth: 140 },
  toneText: { fontSize: 11, color: colors.primary, fontWeight: '500' },
  themes: { flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.xs, marginLeft: 'auto' },
  themeBadge: { backgroundColor: colors.surfaceLight, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 8, maxWidth: 120 },
  themeText: { fontSize: 12, color: colors.textSecondary },
});
