import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../src/stores/dataStore';
import { Card } from '../../src/components/Card';
import { SearchBar } from '../../src/components/SearchBar';
import { colors, spacing } from '../../src/utils/theme';
import { Artist } from '../../src/types';

export default function ArtistsScreen() {
  const router = useRouter();
  const { artists, fetchArtists, deleteArtist } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

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
        <TouchableOpacity testID="add-artist-btn" style={styles.addButton} onPress={() => router.push('/artist/new')}>
          <Ionicons name="add" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={doSearch} placeholder="Search artists..." />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {artists.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>{search ? 'No Results' : 'No Artists Yet'}</Text>
            <Text style={styles.emptyText}>
              {search ? `No artists matching "${search}"` : 'Start building your roster'}
            </Text>
            {!search && (
              <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/artist/new')}>
                <Ionicons name="add" size={20} color={colors.text} />
                <Text style={styles.emptyButtonText}>Add Artist</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          artists.map((artist) => (
            <Card key={artist.id} style={styles.artistCard} onPress={() => router.push(`/artist/${artist.id}`)}>
              <View style={styles.artistHeader}>
                <View style={styles.artistAvatar}>
                  <Text style={styles.avatarText}>{artist.name.charAt(0).toUpperCase()}</Text>
                </View>
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
                {artist.themes.length > 0 && (
                  <View style={styles.themes}>
                    {artist.themes.slice(0, 3).map((theme, i) => (
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
  searchWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingTop: 0 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xl },
  emptyButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 12, marginTop: spacing.lg, gap: spacing.sm },
  emptyButtonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  artistCard: { marginBottom: spacing.md },
  artistHeader: { flexDirection: 'row', alignItems: 'center' },
  artistAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '700', color: colors.text },
  artistInfo: { flex: 1, marginLeft: spacing.md },
  artistName: { fontSize: 18, fontWeight: '600', color: colors.text },
  artistGenres: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  deleteBtn: { padding: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  artistSound: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.md, fontStyle: 'italic' },
  artistFooter: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  songCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  songCountText: { fontSize: 14, color: colors.textSecondary },
  themes: { flexDirection: 'row', flex: 1, justifyContent: 'flex-end', gap: spacing.xs },
  themeBadge: { backgroundColor: colors.surfaceLight, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 8 },
  themeText: { fontSize: 12, color: colors.textSecondary },
});
