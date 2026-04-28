import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../src/components/Card';
import { useDataStore } from '../src/stores/dataStore';
import { usePlayerStore, Track } from '../src/stores/playerStore';
import { colors, spacing } from '../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const isPlayableUrl = (url: string) => {
  if (!url) return false;
  const u = url.toLowerCase();
  return /\.(mp3|wav|m4a|aac|ogg|flac|webm)(\?|$)/.test(u) || u.includes('cdn1.suno.ai') || u.includes('audiopipe.suno.ai') || u.includes('suno-audio') || u.startsWith('/api/audio/') || u.includes('/api/audio/');
};

const fullUrl = (url: string) => {
  if (!url) return url;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/api/audio/')) return `${API_URL}${url}`;
  return url;
};

export default function LibraryScreen() {
  const router = useRouter();
  const { songs, artists, fetchSongs, fetchArtists } = useDataStore();
  const { current, isPlaying, play, togglePlayPause } = usePlayerStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'uploaded' | 'suno'>('all');

  useEffect(() => {
    (async () => {
      await Promise.all([fetchArtists(), fetchSongs()]);
      setLoading(false);
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchArtists(), fetchSongs()]);
    setRefreshing(false);
  };

  // Build playable tracks list
  const tracks = useMemo(() => {
    const out: (Track & { song_id: string; isUploaded: boolean })[] = [];
    songs.forEach(song => {
      const artistName = artists.find(a => a.id === song.artist_id)?.name || '';
      // Check suno_generations
      (song.suno_generations || []).forEach((gen: any, i: number) => {
        const url = gen.audio_url || gen.suno_url;
        if (url && isPlayableUrl(url)) {
          out.push({
            id: `${song.id}-gen-${gen.id || i}`,
            url: fullUrl(url),
            title: song.title,
            artist: artistName,
            source: 'suno',
            source_id: song.id,
            song_id: song.id,
            isUploaded: !!gen.audio_url && (gen.audio_url.startsWith('/api/audio/') || gen.audio_url.includes('/api/audio/')),
          });
        }
      });
      // Check versions
      (song.versions || []).forEach((v: any, i: number) => {
        const url = v.audio_url || v.suno_link;
        if (url && isPlayableUrl(url)) {
          out.push({
            id: `${song.id}-ver-${v.id || i}`,
            url: fullUrl(url),
            title: `${song.title}${v.version_label ? ` (${v.version_label})` : ''}`,
            artist: artistName,
            source: 'version',
            source_id: song.id,
            song_id: song.id,
            isUploaded: !!v.audio_url && (v.audio_url.startsWith('/api/audio/') || v.audio_url.includes('/api/audio/')),
          });
        }
      });
    });
    return out;
  }, [songs, artists]);

  const filteredTracks = useMemo(() => {
    if (filter === 'uploaded') return tracks.filter(t => t.isUploaded);
    if (filter === 'suno') return tracks.filter(t => !t.isUploaded);
    return tracks;
  }, [tracks, filter]);

  const playAll = () => {
    if (filteredTracks.length === 0) return;
    play(filteredTracks[0], filteredTracks);
  };

  const onTrackPress = (t: typeof filteredTracks[0]) => {
    if (current?.id === t.id) {
      togglePlayPause();
    } else {
      play(t, filteredTracks);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Library</Text>
        <Pressable onPress={playAll} style={styles.iconBtn} disabled={filteredTracks.length === 0}>
          <Ionicons name="play-circle" size={28} color={filteredTracks.length === 0 ? colors.textMuted : colors.primary} />
        </Pressable>
      </View>

      <View style={styles.filterBar}>
        {([
          { key: 'all', label: `All (${tracks.length})`, icon: 'list' },
          { key: 'uploaded', label: `Uploaded (${tracks.filter(t => t.isUploaded).length})`, icon: 'cloud-upload' },
          { key: 'suno', label: `Suno (${tracks.filter(t => !t.isUploaded).length})`, icon: 'musical-notes' },
        ] as const).map(f => (
          <Pressable key={f.key} style={[styles.filterChip, filter === f.key && styles.filterChipActive]} onPress={() => setFilter(f.key)}>
            <Ionicons name={f.icon as any} size={14} color={filter === f.key ? colors.text : colors.textSecondary} />
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : filteredTracks.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="musical-notes-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No tracks here yet</Text>
          <Text style={styles.emptyDesc}>{filter === 'uploaded' ? 'Upload audio files on a song\u2019s Suno generation to see them here.' : filter === 'suno' ? 'Add Suno generations with audio URLs to populate this.' : 'Add a Suno generation to a song or upload an audio file to start your library.'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {filteredTracks.map((t, i) => {
            const isCurrent = current?.id === t.id;
            return (
              <Pressable key={t.id} style={[styles.trackRow, isCurrent && styles.trackRowActive]} onPress={() => onTrackPress(t)}>
                <View style={styles.trackNum}>
                  {isCurrent ? (
                    <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={colors.primary} />
                  ) : (
                    <Text style={styles.trackNumText}>{i + 1}</Text>
                  )}
                </View>
                <View style={styles.trackArt}>
                  <Ionicons name={t.isUploaded ? 'cloud-done' : 'musical-note'} size={16} color={t.isUploaded ? colors.success : colors.primary} />
                </View>
                <View style={styles.trackInfo}>
                  <Text style={[styles.trackTitle, isCurrent && { color: colors.primary }]} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>{t.artist || 'Unknown'} {t.isUploaded ? ' · uploaded' : ' · suno'}</Text>
                </View>
                <Pressable onPress={(e) => { e.stopPropagation?.(); router.push(`/song/${t.song_id}`); }} style={styles.openBtn}>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </Pressable>
              </Pressable>
            );
          })}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  filterBar: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  filterTextActive: { color: colors.text, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: spacing.sm },
  emptyDesc: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', maxWidth: 280, lineHeight: 19 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  trackRowActive: { backgroundColor: colors.primary + '15', borderRadius: 8, paddingHorizontal: 8 },
  trackNum: { width: 28, alignItems: 'center' },
  trackNumText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  trackArt: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  trackInfo: { flex: 1 },
  trackTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  trackArtist: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  openBtn: { padding: 6 },
});
