import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert,
  Modal, KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDataStore } from '../../src/stores/dataStore';
import { Card } from '../../src/components/Card';
import { StatusBadge } from '../../src/components/StatusBadge';
import { SearchBar } from '../../src/components/SearchBar';
import { Button } from '../../src/components/Button';
import { colors, spacing } from '../../src/utils/theme';
import { Song } from '../../src/types';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const STATUS_FILTERS = ['all', 'draft', 'in_progress', 'final', 'released'];

export default function SongsScreen() {
  const router = useRouter();
  const { songs, artists, fetchSongs, fetchArtists, deleteSong } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [artistFilter, setArtistFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // CSV Import
  const [importModal, setImportModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvArtist, setCsvArtist] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

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

  const handleStatusFilter = (status: string) => { setStatusFilter(status); applyFilters(undefined, status, undefined); };
  const handleArtistFilter = (id: string | null) => { setArtistFilter(id); applyFilters(undefined, undefined, id); };
  const handleSearch = (text: string) => { setSearch(text); applyFilters(text, undefined, undefined); };

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

  const handleCSVImport = async () => {
    if (!csvText.trim()) { Alert.alert('Error', 'Paste your CSV data'); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/songs/csv-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csv_text: csvText, artist_id: csvArtist, delimiter: ',' }),
      });
      const data = await res.json();
      setImportResult(data);
      if (data.imported > 0) {
        fetchSongs();
      }
    } catch (e) {
      Alert.alert('Error', 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Song Catalog</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity testID="csv-import-btn" style={styles.importButton} onPress={() => { setImportModal(true); setImportResult(null); setCsvText(''); }}>
            <Ionicons name="cloud-upload" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity testID="add-song-btn" style={styles.addButton} onPress={() => router.push('/song/new')}>
            <Ionicons name="add" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={handleSearch} placeholder="Search songs, lyrics..." />
      </View>

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
            <Text style={styles.emptyText}>{search ? `No results for "${search}"` : 'Start building your catalog'}</Text>
            <View style={styles.emptyActions}>
              <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/song/new')}>
                <Ionicons name="add" size={20} color={colors.text} />
                <Text style={styles.emptyButtonText}>Add Song</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.emptyButton, { backgroundColor: colors.surfaceLight }]} onPress={() => setImportModal(true)}>
                <Ionicons name="cloud-upload" size={20} color={colors.primary} />
                <Text style={[styles.emptyButtonText, { color: colors.primary }]}>Import CSV</Text>
              </TouchableOpacity>
            </View>
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
                {song.versions?.length > 0 && <View style={styles.infoChip}><Ionicons name="layers" size={14} color={colors.textSecondary} /><Text style={styles.infoText}>{song.versions.length} ver</Text></View>}
                {(song.suno_generations?.length > 0) && <View style={styles.infoChip}><Ionicons name="link" size={14} color={colors.primary} /><Text style={styles.infoText}>{song.suno_generations.length} gens</Text></View>}
                {song.todo?.length > 0 && <View style={styles.infoChip}><Ionicons name="checkbox-outline" size={14} color={colors.warning} /><Text style={styles.infoText}>{song.todo.length} todos</Text></View>}
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(song)}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* CSV Import Modal */}
      <Modal visible={importModal} animationType="slide" transparent onRequestClose={() => setImportModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Import from CSV</Text>
              <TouchableOpacity onPress={() => setImportModal(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>

            <Text style={styles.modalDesc}>
              Paste CSV from Google Sheets. Use columns: title, genre, mood, style_prompt, status, lyrics, tempo, themes
            </Text>

            <View style={styles.csvExample}>
              <Text style={styles.csvExampleTitle}>Example format:</Text>
              <Text style={styles.csvExampleText}>title,genre,mood,status{'\n'}My Song,Lo-fi,Chill,draft{'\n'}Another,Pop,Upbeat,final</Text>
            </View>

            <TextInput
              style={styles.csvInput}
              placeholder="Paste your CSV data here..."
              placeholderTextColor={colors.textMuted}
              value={csvText}
              onChangeText={setCsvText}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
            />

            {artists.length > 0 && (
              <>
                <Text style={styles.assignLabel}>Assign all to artist (optional):</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assignScroll}>
                  <TouchableOpacity style={[styles.assignChip, !csvArtist && styles.assignChipActive]} onPress={() => setCsvArtist(null)}>
                    <Text style={[styles.assignText, !csvArtist && styles.assignTextActive]}>None</Text>
                  </TouchableOpacity>
                  {artists.map(a => (
                    <TouchableOpacity key={a.id} style={[styles.assignChip, csvArtist === a.id && styles.assignChipActive]} onPress={() => setCsvArtist(a.id)}>
                      <Text style={[styles.assignText, csvArtist === a.id && styles.assignTextActive]}>{a.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {importResult && (
              <View style={[styles.resultBox, importResult.errors > 0 && styles.resultBoxError]}>
                <Ionicons name={importResult.errors > 0 ? 'warning' : 'checkmark-circle'} size={20} color={importResult.errors > 0 ? colors.warning : colors.success} />
                <View style={styles.resultInfo}>
                  <Text style={styles.resultText}>{importResult.imported} songs imported</Text>
                  {importResult.errors > 0 && <Text style={styles.resultError}>{importResult.errors} errors</Text>}
                </View>
              </View>
            )}

            <Button title={importing ? 'Importing...' : 'Import Songs'} onPress={handleCSVImport} loading={importing} style={styles.importBtn} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  importButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.primary },
  searchWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  filterScroll: { maxHeight: 44, marginBottom: spacing.xs },
  filterContainer: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  filterTextActive: { color: colors.text },
  artistChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surfaceLight },
  artistChipActive: { backgroundColor: colors.secondary },
  artistChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  artistChipTextActive: { color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  emptyActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  emptyButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 12, gap: spacing.sm },
  emptyButtonText: { color: colors.text, fontSize: 14, fontWeight: '600' },
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
  // Modal
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xxl, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 20, fontWeight: '600', color: colors.text },
  modalDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 18 },
  csvExample: { backgroundColor: colors.surfaceLight, borderRadius: 8, padding: spacing.sm, marginBottom: spacing.md },
  csvExampleTitle: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginBottom: 4 },
  csvExampleText: { fontSize: 12, color: colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  csvInput: { backgroundColor: colors.surfaceLight, borderRadius: 12, padding: spacing.md, color: colors.text, fontSize: 14, minHeight: 120, maxHeight: 200, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top', marginBottom: spacing.md },
  assignLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  assignScroll: { marginBottom: spacing.md, maxHeight: 40 },
  assignChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surfaceLight, marginRight: spacing.sm },
  assignChipActive: { backgroundColor: colors.primary },
  assignText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  assignTextActive: { color: colors.text },
  resultBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.success + '15', borderRadius: 8, padding: spacing.sm, marginBottom: spacing.md, gap: spacing.sm },
  resultBoxError: { backgroundColor: colors.warning + '15' },
  resultInfo: { flex: 1 },
  resultText: { fontSize: 14, fontWeight: '600', color: colors.success },
  resultError: { fontSize: 12, color: colors.warning },
  importBtn: { marginTop: spacing.xs },
});
