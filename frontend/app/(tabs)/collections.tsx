import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, Alert,
  Modal, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { SearchBar } from '../../src/components/SearchBar';
import { useDataStore } from '../../src/stores/dataStore';
import { colors, spacing } from '../../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const COLL_TYPES = ['EP', 'LP', 'Single', 'Album', 'Playlist'];

export default function CollectionsScreen() {
  const router = useRouter();
  const { artists, fetchArtists } = useDataStore();
  const [collections, setCollections] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ title: '', artist_id: '', collection_type: 'EP', description: '', cover_image_url: '', status: 'in_progress', notes: '' });
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'releases' | 'playlists'>('releases');

  useEffect(() => { fetchArtists(); loadCollections(); }, []);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = await AsyncStorage.getItem('token');
    return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  };

  const loadCollections = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/collections`);
      const data = await res.json();
      setCollections(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  };

  const onRefresh = async () => { setRefreshing(true); await loadCollections(); setRefreshing(false); };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.artist_id) { Alert.alert('Error', 'Title and artist required'); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${API_URL}/api/collections`, { method: 'POST', body: JSON.stringify(form) });
      if (!res.ok) throw new Error('Failed');
      await loadCollections();
      setModalVisible(false);
      setForm({ title: '', artist_id: '', collection_type: 'EP', description: '', cover_image_url: '', status: 'in_progress', notes: '' });
    } catch { Alert.alert('Error', 'Failed to create'); }
    finally { setSaving(false); }
  };

  const handleDelete = (coll: any) => {
    Alert.alert('Delete', `Delete "${coll.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await authFetch(`${API_URL}/api/collections/${coll.id}`, { method: 'DELETE' });
        loadCollections();
      }},
    ]);
  };

  const getArtistName = (id: string) => artists.find(a => a.id === id)?.name || 'Unknown';

  const statusColor = (s: string) => s === 'released' ? colors.primary : s === 'completed' ? colors.success : colors.warning;

  const isPlaylist = (c: any) => (c.collection_type || '').toLowerCase() === 'playlist';
  const filteredByView = collections.filter(c => activeView === 'playlists' ? isPlaylist(c) : !isPlaylist(c));
  const filtered = filteredByView.filter(c => !search || c.title.toLowerCase().includes(search.toLowerCase()) || getArtistName(c.artist_id).toLowerCase().includes(search.toLowerCase()));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{activeView === 'playlists' ? 'Playlists' : 'Releases'}</Text>
        <Pressable testID="add-collection-btn" style={styles.addButton} onPress={() => {
          setForm({ ...form, collection_type: activeView === 'playlists' ? 'Playlist' : 'EP' });
          setModalVisible(true);
        }}>
          <Ionicons name="add" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.viewToggle}>
        <Pressable style={[styles.toggleChip, activeView === 'releases' && styles.toggleChipActive]} onPress={() => setActiveView('releases')}>
          <Ionicons name="albums" size={14} color={activeView === 'releases' ? colors.text : colors.textSecondary} />
          <Text style={[styles.toggleText, activeView === 'releases' && styles.toggleTextActive]}>Releases ({collections.filter(c => !isPlaylist(c)).length})</Text>
        </Pressable>
        <Pressable style={[styles.toggleChip, activeView === 'playlists' && styles.toggleChipActive]} onPress={() => setActiveView('playlists')}>
          <Ionicons name="list" size={14} color={activeView === 'playlists' ? colors.text : colors.textSecondary} />
          <Text style={[styles.toggleText, activeView === 'playlists' && styles.toggleTextActive]}>Playlists ({collections.filter(c => isPlaylist(c)).length})</Text>
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder={activeView === 'playlists' ? 'Search playlists...' : 'Search releases...'} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name={activeView === 'playlists' ? 'list-outline' : 'albums-outline'} size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>{activeView === 'playlists' ? 'No Playlists Yet' : 'No Releases Yet'}</Text>
            <Text style={styles.emptyText}>{activeView === 'playlists' ? 'Curate songs across artists into themed playlists for testing in your car.' : 'Organize songs into EPs, LPs, and Albums.'}</Text>
            <Pressable style={styles.emptyButton} onPress={() => {
              setForm({ ...form, collection_type: activeView === 'playlists' ? 'Playlist' : 'EP' });
              setModalVisible(true);
            }}>
              <Ionicons name="add" size={20} color={colors.text} />
              <Text style={styles.emptyButtonText}>{activeView === 'playlists' ? 'New Playlist' : 'New Release'}</Text>
            </Pressable>
          </View>
        ) : (
          filtered.map((coll) => (
            <Card key={coll.id} style={styles.collCard} onPress={() => router.push(`/collection/${coll.id}`)}>
              <View style={styles.collRow}>
                {coll.cover_image_url ? (
                  <Image source={{ uri: coll.cover_image_url }} style={styles.coverImg} />
                ) : (
                  <View style={[styles.coverImg, styles.coverPlaceholder]}>
                    <Ionicons name="albums" size={28} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.collInfo}>
                  <Text style={styles.collTitle}>{coll.title}</Text>
                  <Text style={styles.collArtist}>{getArtistName(coll.artist_id)}</Text>
                  <View style={styles.collMeta}>
                    <View style={[styles.typeBadge, { backgroundColor: colors.surfaceLight }]}>
                      <Text style={styles.typeText}>{coll.collection_type}</Text>
                    </View>
                    <View style={[styles.statusDot, { backgroundColor: statusColor(coll.status) }]} />
                    <Text style={[styles.statusLabel, { color: statusColor(coll.status) }]}>{coll.status.replace('_', ' ')}</Text>
                  </View>
                </View>
                <Pressable style={styles.deleteBtn} onPress={(e) => { e.stopPropagation(); handleDelete(coll); }}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </Pressable>
              </View>
              <View style={styles.trackCount}>
                <Ionicons name="musical-notes" size={14} color={colors.textSecondary} />
                <Text style={styles.trackText}>{coll.track_count || 0} tracks</Text>
              </View>
              {coll.description ? <Text style={styles.collDesc} numberOfLines={2}>{coll.description}</Text> : null}
            </Card>
          ))
        )}
      </ScrollView>

      {/* Create Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Release</Text>
              <Pressable onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
            </View>
            <Input label="Title" placeholder="Album/EP name" value={form.title} onChangeText={t => setForm({...form, title: t})} />
            <Text style={styles.label}>Artist</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {artists.map(a => (
                <Pressable key={a.id} style={[styles.chip, form.artist_id === a.id && styles.chipActive]} onPress={() => setForm({...form, artist_id: a.id})}>
                  <Text style={[styles.chipText, form.artist_id === a.id && styles.chipTextActive]}>{a.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.label}>Type</Text>
            <View style={styles.typeRow}>
              {COLL_TYPES.map(t => (
                <Pressable key={t} style={[styles.chip, form.collection_type === t && styles.chipActive]} onPress={() => setForm({...form, collection_type: t})}>
                  <Text style={[styles.chipText, form.collection_type === t && styles.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <Input label="Cover Art URL" placeholder="https://..." value={form.cover_image_url} onChangeText={t => setForm({...form, cover_image_url: t})} autoCapitalize="none" />
            <Input label="Description" placeholder="About this release" value={form.description} onChangeText={t => setForm({...form, description: t})} multiline />
            <Button title="Create Release" onPress={handleCreate} loading={saving} style={styles.saveBtn} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  searchWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  viewToggle: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm },
  toggleChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  toggleChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  toggleTextActive: { color: colors.text, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingTop: 0 },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.sm },
  emptyButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 12, marginTop: spacing.lg, gap: spacing.sm },
  emptyButtonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  collCard: { marginBottom: spacing.md },
  collRow: { flexDirection: 'row', alignItems: 'center' },
  coverImg: { width: 64, height: 64, borderRadius: 8 },
  coverPlaceholder: { backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  collInfo: { flex: 1, marginLeft: spacing.md },
  collTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  collArtist: { fontSize: 13, color: colors.primary, marginTop: 2 },
  collMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '500', textTransform: 'capitalize' },
  deleteBtn: { padding: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  trackCount: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  trackText: { fontSize: 13, color: colors.textSecondary },
  collDesc: { fontSize: 13, color: colors.textMuted, marginTop: spacing.xs },
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xxl, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: '600', color: colors.text },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  chipScroll: { marginBottom: spacing.md },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 20, backgroundColor: colors.surfaceLight, marginRight: spacing.sm },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
  chipTextActive: { color: colors.text },
  saveBtn: { marginTop: spacing.md },
});
