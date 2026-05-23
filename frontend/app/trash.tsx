import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '../src/components/Card';
import { useDataStore } from '../src/stores/dataStore';
import { colors, spacing } from '../src/utils/theme';
import { confirmDestructive, confirmAction } from '../src/utils/confirm';

const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || "https://artist-catalog-pro.emergent.host");

export default function TrashScreen() {
  const router = useRouter();
  const { fetchArtists, fetchSongs, fetchCollections, fetchIdeas } = useDataStore();
  const [trash, setTrash] = useState<any>({ artists: [], songs: [], collections: [], ideas: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'artists' | 'songs' | 'collections' | 'ideas'>('songs');

  const authFetch = async (path: string, options: RequestInit = {}) => {
    const token = await AsyncStorage.getItem('token');
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
  };

  const loadTrash = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/trash');
      if (res.ok) setTrash(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadTrash(); }, []);

  const refreshAll = async () => {
    await Promise.all([fetchArtists(), fetchSongs(), fetchCollections(), fetchIdeas()]);
    await loadTrash();
  };

  const restore = (type: string, item: any) => {
    confirmAction(
      `"${item.name || item.title}" will be restored and visible again in your catalog.`,
      'Restore?',
      'Restore'
    ).then(async (ok) => {
      if (!ok) return;
      setBusyId(item.id);
      try {
        const res = await authFetch(`/api/trash/${type}/${item.id}/restore`, { method: 'POST' });
        if (res.ok) {
          await refreshAll();
        } else {
          Alert.alert('Error', 'Could not restore');
        }
      } finally {
        setBusyId(null);
      }
    });
  };

  const permanentDelete = (type: string, item: any) => {
    confirmDestructive(
      `"${item.name || item.title}" will be permanently deleted. This CANNOT be undone.`,
      'Delete forever?'
    ).then(async (ok) => {
      if (!ok) return;
      setBusyId(item.id);
      try {
        const res = await authFetch(`/api/trash/${type}/${item.id}/permanent`, { method: 'DELETE' });
        if (res.ok) await loadTrash();
      } finally {
        setBusyId(null);
      }
    });
  };

  const tabs = [
    { key: 'songs', label: 'Songs', icon: 'musical-note', count: trash.songs.length },
    { key: 'artists', label: 'Artists', icon: 'people', count: trash.artists.length },
    { key: 'collections', label: 'Releases', icon: 'albums', count: trash.collections.length },
    { key: 'ideas', label: 'Ideas', icon: 'bulb', count: trash.ideas.length },
  ] as const;

  const items: any[] = trash[activeTab] || [];
  const total = trash.songs.length + trash.artists.length + trash.collections.length + trash.ideas.length;

  const fmtDate = (iso: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = Date.now();
      const diff = Math.floor((now - d.getTime()) / 86400000);
      if (diff === 0) return 'Today';
      if (diff === 1) return 'Yesterday';
      if (diff < 7) return `${diff} days ago`;
      return d.toLocaleDateString();
    } catch { return ''; }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Recently Deleted</Text>
        <View style={{ width: 44 }} />
      </View>

      <Text style={styles.note}>Items here are kept for 30 days. Restore them or delete permanently.</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {tabs.map(t => (
          <Pressable key={t.key} style={[styles.tab, activeTab === t.key && styles.tabActive]} onPress={() => setActiveTab(t.key as any)}>
            <Ionicons name={t.icon as any} size={14} color={activeTab === t.key ? colors.text : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label} ({t.count})</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : total === 0 ? (
        <View style={styles.center}>
          <Ionicons name="trash-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Trash is empty</Text>
          <Text style={styles.emptyDesc}>Deleted items appear here. You can restore them within 30 days.</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyDesc}>No deleted {activeTab} yet.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {items.map(item => (
            <Card key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Ionicons name={tabs.find(t => t.key === activeTab)?.icon as any} size={18} color={colors.primary} />
                <Text style={styles.itemTitle}>{item.name || item.title}</Text>
              </View>
              {(item.bio || item.lyrics || item.description || item.content) && (
                <Text style={styles.itemDesc} numberOfLines={2}>
                  {(item.bio || item.lyrics || item.description || item.content || '').slice(0, 160)}
                </Text>
              )}
              <Text style={styles.itemMeta}>Deleted {fmtDate(item.deleted_at)}</Text>
              <View style={styles.itemActions}>
                <Pressable
                  style={styles.restoreBtn}
                  onPress={() => restore(activeTab, item)}
                  disabled={busyId === item.id}>
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={14} color={colors.text} />
                      <Text style={styles.restoreText}>Restore</Text>
                    </>
                  )}
                </Pressable>
                <Pressable style={styles.permDelBtn} onPress={() => permanentDelete(activeTab, item)}>
                  <Ionicons name="trash" size={14} color={colors.error} />
                  <Text style={styles.permDelText}>Delete forever</Text>
                </Pressable>
              </View>
            </Card>
          ))}
          <View style={{ height: 80 }} />
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
  note: { paddingHorizontal: spacing.lg, fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
  tabBar: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxHeight: 50 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surface, marginRight: 6, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: colors.text, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: spacing.sm },
  emptyDesc: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', maxWidth: 280, lineHeight: 19 },
  listContent: { padding: spacing.lg, paddingBottom: 100 },
  itemCard: { marginBottom: spacing.sm },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  itemTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  itemDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, marginBottom: 6 },
  itemMeta: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic', marginBottom: spacing.sm },
  itemActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  restoreBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary },
  restoreText: { fontSize: 12, color: colors.text, fontWeight: '700' },
  permDelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.error + '15' },
  permDelText: { fontSize: 12, color: colors.error, fontWeight: '600' },
});
