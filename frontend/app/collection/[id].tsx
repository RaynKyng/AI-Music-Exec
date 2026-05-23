import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, TextInput,
  KeyboardAvoidingView, Platform, Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDataStore } from '../../src/stores/dataStore';
import { usePlayerStore } from '../../src/stores/playerStore';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { StatusBadge } from '../../src/components/StatusBadge';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { colors, spacing, statusColors } from '../../src/utils/theme';
import { safeGoBack } from '../../src/utils/nav';

const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || "https://artist-catalog-pro.emergent.host");
const COLL_TYPES = ['EP', 'LP', 'Single', 'Album', 'Playlist'];
const STATUS_OPTS = ['in_progress', 'completed', 'released'];

export default function CollectionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { artists, fetchArtists } = useDataStore();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [tracks, setTracks] = useState<any[]>([]);
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [pickerSongs, setPickerSongs] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [pickerArtistFilter, setPickerArtistFilter] = useState<string>('');
  const [form, setForm] = useState({
    title: '', artist_id: '', collection_type: 'EP', cover_image_url: '',
    description: '', release_date: '', status: 'in_progress', notes: '',
  });

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = await AsyncStorage.getItem('token');
    return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  };

  useEffect(() => {
    fetchArtists();
    if (!isNew && id) loadCollection();
  }, [id]);

  // Reload tracklist when screen regains focus (after editing a song's track number)
  useFocusEffect(
    useCallback(() => {
      if (!isNew && id) loadCollection();
    }, [id, isNew])
  );

  const loadCollection = async () => {
    try {
      const [collRes, tracksRes] = await Promise.all([
        authFetch(`${API_URL}/api/collections/${id}`),
        authFetch(`${API_URL}/api/collections/${id}/songs`),
      ]);
      if (collRes.ok) {
        const coll = await collRes.json();
        setForm({
          title: coll.title || '', artist_id: coll.artist_id || '',
          collection_type: coll.collection_type || 'EP',
          cover_image_url: coll.cover_image_url || '',
          description: coll.description || '', release_date: coll.release_date || '',
          status: coll.status || 'in_progress', notes: coll.notes || '',
        });
      }
      if (tracksRes.ok) {
        const t = await tracksRes.json();
        setTracks(Array.isArray(t) ? t : []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const reorderTrack = async (songId: string, swapSongId: string, newPos: number, oldPos: number) => {
    // Swap track_number between the two songs
    const newTracks = [...tracks];
    const temp = newTracks[oldPos];
    newTracks[oldPos] = newTracks[newPos];
    newTracks[newPos] = temp;
    setTracks(newTracks);

    // Update both songs on backend with new track numbers (1-indexed)
    try {
      await Promise.all([
        authFetch(`${API_URL}/api/songs/${songId}`, {
          method: 'PUT',
          body: JSON.stringify({ ...newTracks[newPos], track_number: newPos + 1 }),
        }),
        authFetch(`${API_URL}/api/songs/${swapSongId}`, {
          method: 'PUT',
          body: JSON.stringify({ ...newTracks[oldPos], track_number: oldPos + 1 }),
        }),
      ]);
    } catch { /* reload to get correct state */ }
    await loadCollection();
  };

  // === Add songs from catalog (picker) ===
  const openSongPicker = async () => {
    setShowSongPicker(true);
    setPickerSelected(new Set());
    setPickerSearch('');
    setPickerArtistFilter('');
    setPickerLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/songs`);
      if (res.ok) {
        const all = await res.json();
        // Filter: exclude songs already in this playlist
        const existingIds = new Set(tracks.map((t: any) => t.id));
        setPickerSongs(all.filter((s: any) => !existingIds.has(s.id)));
      }
    } finally {
      setPickerLoading(false);
    }
  };

  const togglePickerSong = (songId: string) => {
    setPickerSelected(prev => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  };

  const confirmAddSongs = async () => {
    if (pickerSelected.size === 0) {
      setShowSongPicker(false);
      return;
    }
    try {
      const res = await authFetch(`${API_URL}/api/collections/${id}/add-songs`, {
        method: 'POST',
        body: JSON.stringify({ song_ids: Array.from(pickerSelected) }),
      });
      if (!res.ok) throw new Error('Failed');
      setShowSongPicker(false);
      await loadCollection();
    } catch {
      Alert.alert('Error', 'Could not add songs');
    }
  };

  const removeSongFromPlaylist = async (songId: string, songTitle: string) => {
    Alert.alert(
      'Remove from this playlist?',
      `"${songTitle}" stays in your catalog — only removed from this playlist.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await authFetch(`${API_URL}/api/collections/${id}/songs/${songId}`, { method: 'DELETE' });
            await loadCollection();
          } catch {
            Alert.alert('Error', 'Could not remove');
          }
        }},
      ]
    );
  };

  const filteredPickerSongs = pickerSongs.filter((s: any) => {
    if (pickerSearch && !s.title?.toLowerCase().includes(pickerSearch.toLowerCase())) return false;
    if (pickerArtistFilter && s.artist_id !== pickerArtistFilter) return false;
    return true;
  });

  const handleSave = async () => {
    if (!form.title.trim()) { Alert.alert('Error', 'Title required'); return; }
    setSaving(true);
    try {
      const url = isNew ? `${API_URL}/api/collections` : `${API_URL}/api/collections/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await authFetch(url, { method, body: JSON.stringify(form) });
      if (!res.ok) throw new Error('Failed');
      safeGoBack('/collections');
    } catch { Alert.alert('Error', 'Failed to save'); }
    finally { setSaving(false); }
  };

  const statusColor = (s: string) => s === 'released' ? colors.primary : s === 'completed' ? colors.success : colors.warning;

  if (loading) return <LoadingSpinner />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack('/collections')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{isNew ? 'New Release' : 'Edit Release'}</Text>
        {isNew ? (
          <View style={styles.placeholder} />
        ) : (
          <Pressable
            style={styles.brainstormBtn}
            onPress={() => router.push(`/collection/${id}/brainstorm`)}
            hitSlop={8}
          >
            <Ionicons name="bulb" size={16} color={colors.primary} />
            <Text style={styles.brainstormBtnText}>Brainstorm</Text>
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

          {/* Cover Art */}
          <View style={styles.coverSection}>
            {form.cover_image_url ? (
              <Image source={{ uri: form.cover_image_url }} style={styles.coverLarge} />
            ) : (
              <View style={[styles.coverLarge, styles.coverPlaceholder]}>
                <Ionicons name="albums" size={48} color={colors.textMuted} />
                <Text style={styles.coverHint}>Add cover art URL below</Text>
              </View>
            )}
          </View>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            <Input label="Title *" placeholder="Release name" value={form.title}
              onChangeText={t => setForm({ ...form, title: t })} />
            <Input label="Cover Art URL" placeholder="https://..." value={form.cover_image_url}
              onChangeText={t => setForm({ ...form, cover_image_url: t })} autoCapitalize="none" />
            <Input label="Description" placeholder="About this release..." value={form.description}
              onChangeText={t => setForm({ ...form, description: t })} multiline numberOfLines={3} />
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Type</Text>
            <View style={styles.chipRow}>
              {COLL_TYPES.map(t => (
                <Pressable key={t} style={[styles.chip, form.collection_type === t && styles.chipActive]}
                  onPress={() => {
                    // When switching to Playlist, clear artist_id (playlists are artist-agnostic)
                    setForm({
                      ...form,
                      collection_type: t,
                      ...(t === 'Playlist' ? { artist_id: '' } : {}),
                    });
                  }}>
                  <Text style={[styles.chipText, form.collection_type === t && styles.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
            {form.collection_type === 'Playlist' && (
              <Text style={styles.helpText}>
                Playlists are artist-agnostic — they're curated vibe mixes that can include songs from any artist in your catalog.
              </Text>
            )}
          </Card>

          {form.collection_type !== 'Playlist' && (
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Artist</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {artists.map(a => (
                  <Pressable key={a.id} style={[styles.chip, form.artist_id === a.id && styles.chipActive]}
                    onPress={() => setForm({ ...form, artist_id: a.id })}>
                    <Text style={[styles.chipText, form.artist_id === a.id && styles.chipTextActive]}>{a.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Card>
          )}

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.chipRow}>
              {STATUS_OPTS.map(s => (
                <Pressable key={s} style={[styles.chip, form.status === s && { backgroundColor: statusColor(s) }]}
                  onPress={() => setForm({ ...form, status: s })}>
                  <Text style={[styles.chipText, form.status === s && styles.chipTextActive]}>
                    {s.replace('_', ' ')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>

          <Card style={styles.section}>
            <Input label="Release Date" placeholder="e.g., 2026-06-15" value={form.release_date}
              onChangeText={t => setForm({ ...form, release_date: t })} />
            <Input label="Notes" placeholder="Additional notes..." value={form.notes}
              onChangeText={t => setForm({ ...form, notes: t })} multiline />
          </Card>

          {/* Tracklist */}
          {!isNew && (
            <Card style={styles.section}>
              <View style={styles.tracklistHeader}>
                <Text style={[styles.sectionTitle, { marginBottom: 0, flex: 1 }]}>Tracklist ({tracks.length})</Text>
                <Pressable
                  style={styles.addFromCatalogBtn}
                  onPress={openSongPicker}>
                  <Ionicons name="add-circle" size={14} color={colors.primary} />
                  <Text style={styles.addFromCatalogText}>Add</Text>
                </Pressable>
                {tracks.length > 0 && (
                  <Pressable
                    style={styles.playAllBtn}
                    onPress={() => {
                      const playable = tracks.map((s, idx) => {
                        const url = s.suno_generations?.[0]?.audio_url || s.suno_generations?.[0]?.suno_url || s.versions?.find((v: any) => v.audio_url || v.suno_link)?.audio_url || s.versions?.find((v: any) => v.audio_url || v.suno_link)?.suno_link;
                        if (!url) return null;
                        const fullUrl = url.startsWith('/api/') ? `${(process.env.EXPO_PUBLIC_BACKEND_URL || "https://artist-catalog-pro.emergent.host")}${url}` : url;
                        return {
                          id: `${s.id}-tracklist`,
                          url: fullUrl,
                          title: s.title,
                          artist: artists.find((a: any) => a.id === s.artist_id)?.name || '',
                          source: 'song' as const,
                          source_id: s.id,
                        };
                      }).filter(Boolean) as any[];
                      if (playable.length === 0) {
                        Alert.alert('No playable audio', 'None of these songs have audio URLs yet. Add a Suno generation with an audio URL or upload an audio file.');
                        return;
                      }
                      usePlayerStore.getState().play(playable[0], playable);
                    }}>
                    <Ionicons name="play" size={14} color={colors.text} />
                    <Text style={styles.playAllText}>Play All</Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.tracklistHint}>Plays in track order, song-by-song without interruption.</Text>
              {tracks.length === 0 ? (
                <Text style={styles.emptyTracks}>
                  No songs assigned yet. Edit a song and select this release.
                </Text>
              ) : (
                tracks.map((song, i) => (
                  <Pressable key={song.id} style={styles.trackRow}
                    onPress={() => router.push(`/song/${song.id}`)}>
                    <View style={styles.trackReorder}>
                      <Pressable style={styles.reorderBtn} onPress={async (e) => {
                        e.stopPropagation();
                        if (i === 0) return;
                        await reorderTrack(song.id, tracks[i - 1]?.id, i - 1, i);
                      }}>
                        <Ionicons name="chevron-up" size={18} color={i === 0 ? colors.border : colors.textSecondary} />
                      </Pressable>
                      <Text style={styles.trackNum}>{i + 1}</Text>
                      <Pressable style={styles.reorderBtn} onPress={async (e) => {
                        e.stopPropagation();
                        if (i === tracks.length - 1) return;
                        await reorderTrack(song.id, tracks[i + 1]?.id, i + 1, i);
                      }}>
                        <Ionicons name="chevron-down" size={18} color={i === tracks.length - 1 ? colors.border : colors.textSecondary} />
                      </Pressable>
                    </View>
                    <View style={styles.trackInfo}>
                      <Text style={styles.trackTitle}>{song.title}</Text>
                      {song.style_prompt ? (
                        <Text style={styles.trackStyle} numberOfLines={1}>
                          {song.style_prompt}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.trackStatus, { backgroundColor: (statusColors as any)[song.status] + '20' }]}>
                      <Text style={[styles.trackStatusText, { color: (statusColors as any)[song.status] }]}>
                        {song.status}
                      </Text>
                    </View>
                    <View dataSet={{ stopParent: 'true' }}>
                      <Pressable
                        style={styles.removeFromPlaylistBtn}
                        hitSlop={8}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          removeSongFromPlaylist(song.id, song.title);
                        }}
                      >
                        <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  </Pressable>
                ))
              )}
            </Card>
          )}

          <Button title={isNew ? 'Create Release' : 'Save Changes'} onPress={handleSave} loading={saving} style={styles.saveBtn} />

          {!isNew && (
            <Pressable style={styles.deleteBtn} onPress={() => {
              Alert.alert('Delete Release', 'This will unlink all songs. Delete?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: async () => {
                  await authFetch(`${API_URL}/api/collections/${id}`, { method: 'DELETE' });
                  safeGoBack('/collections');
                }},
              ]);
            }}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={styles.deleteBtnText}>Delete Release</Text>
            </Pressable>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Song Picker Modal */}
      <Modal visible={showSongPicker} animationType="slide" transparent={true} onRequestClose={() => setShowSongPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add songs from catalog</Text>
              <Pressable onPress={() => setShowSongPicker(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search songs by title…"
                placeholderTextColor={colors.textMuted}
                value={pickerSearch}
                onChangeText={setPickerSearch}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.artistFilterScroll} contentContainerStyle={{ gap: 6, paddingHorizontal: spacing.md }}>
              <Pressable
                style={[styles.filterChip, !pickerArtistFilter && styles.filterChipActive]}
                onPress={() => setPickerArtistFilter('')}
              >
                <Text style={[styles.filterChipText, !pickerArtistFilter && styles.filterChipTextActive]}>All</Text>
              </Pressable>
              {artists.map((a: any) => (
                <Pressable
                  key={a.id}
                  style={[styles.filterChip, pickerArtistFilter === a.id && styles.filterChipActive]}
                  onPress={() => setPickerArtistFilter(pickerArtistFilter === a.id ? '' : a.id)}
                >
                  <Text style={[styles.filterChipText, pickerArtistFilter === a.id && styles.filterChipTextActive]} numberOfLines={1}>{a.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView style={styles.pickerList}>
              {pickerLoading ? (
                <Text style={styles.pickerEmpty}>Loading…</Text>
              ) : filteredPickerSongs.length === 0 ? (
                <Text style={styles.pickerEmpty}>No songs match. Try a different filter.</Text>
              ) : (
                filteredPickerSongs.map((s: any) => {
                  const selected = pickerSelected.has(s.id);
                  const artistName = artists.find((a: any) => a.id === s.artist_id)?.name || '';
                  return (
                    <Pressable
                      key={s.id}
                      style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                      onPress={() => togglePickerSong(s.id)}
                    >
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={selected ? colors.primary : colors.textMuted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerTitle} numberOfLines={1}>{s.title}</Text>
                        <Text style={styles.pickerSubtitle} numberOfLines={1}>
                          {artistName}{s.status ? ` • ${s.status}` : ''}{s.genre ? ` • ${s.genre}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <Text style={styles.selectedCount}>{pickerSelected.size} selected</Text>
              <Pressable
                style={[styles.confirmBtn, pickerSelected.size === 0 && styles.confirmBtnDisabled]}
                onPress={confirmAddSongs}
                disabled={pickerSelected.size === 0}
              >
                <Text style={styles.confirmBtnText}>Add to playlist</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  backBtn: { padding: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '600', color: colors.text },
  placeholder: { width: 44 },
  brainstormBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primary + '20' },
  brainstormBtnText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  coverSection: { alignItems: 'center', marginBottom: spacing.lg },
  coverLarge: { width: 180, height: 180, borderRadius: 16 },
  coverPlaceholder: { backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  coverHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  section: { marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.md },
  tracklistHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  tracklistHint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },
  playAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.primary },
  playAllText: { fontSize: 12, fontWeight: '700', color: colors.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 20, backgroundColor: colors.surfaceLight, marginRight: spacing.sm, marginBottom: spacing.xs },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
  chipTextActive: { color: colors.text },
  emptyTracks: { fontSize: 14, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center', paddingVertical: spacing.lg },
  trackRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  trackReorder: { alignItems: 'center', width: 32 },
  reorderBtn: { padding: 2, minHeight: 24, justifyContent: 'center', alignItems: 'center' },
  trackNum: { fontSize: 14, fontWeight: '700', color: colors.textMuted, textAlign: 'center' },
  trackInfo: { flex: 1 },
  trackTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  trackStyle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  trackStatus: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  trackStatusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  saveBtn: { marginTop: spacing.md },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, marginTop: spacing.md, gap: spacing.sm },
  deleteBtnText: { fontSize: 15, color: colors.error, fontWeight: '500' },

  // Song picker (add from catalog)
  addFromCatalogBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.primary + '20', marginRight: 8 },
  addFromCatalogText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  removeFromPlaylistBtn: { padding: 6, marginLeft: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', minHeight: '60%', borderTopWidth: 1, borderTopColor: colors.border },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.md, marginVertical: 8, paddingHorizontal: 12, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 10 },
  artistFilterScroll: { maxHeight: 40, marginBottom: 8 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, color: colors.textSecondary, maxWidth: 120 },
  filterChipTextActive: { color: colors.text, fontWeight: '700' },
  pickerList: { flex: 1, paddingHorizontal: spacing.md },
  pickerEmpty: { textAlign: 'center', color: colors.textMuted, padding: spacing.lg, fontSize: 14 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, borderBottomWidth: 1, borderBottomColor: colors.border + '60' },
  pickerRowSelected: { backgroundColor: colors.primary + '15' },
  pickerTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  pickerSubtitle: { fontSize: 12, color: colors.textMuted },
  modalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: 12 },
  selectedCount: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  confirmBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  helpText: { fontSize: 12, color: colors.textMuted, marginTop: 8, fontStyle: 'italic', lineHeight: 17 },
});
