import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Card } from './Card';
import { colors, spacing } from '../utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type Activity = {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  target_type: string;
  target_id: string;
  details?: { title?: string; new_status?: string; mode?: string; preview?: string };
  created_at: string;
};

const ACTION_ICON: Record<string, any> = {
  created: 'add-circle',
  updated: 'pencil',
  commented: 'chatbubble-ellipses',
  generated: 'sparkles',
  version_added: 'git-branch',
  prompted: 'bulb',
  reanalyzed: 'refresh',
  brainstormed: 'bulb-outline',
};

const ACTION_VERB: Record<string, string> = {
  created: 'added',
  updated: 'updated',
  commented: 'commented on',
  generated: 'generated for',
  version_added: 'added a version to',
  prompted: 'saved a prompt for',
  reanalyzed: 're-analyzed',
  brainstormed: 'brainstormed for',
};

function timeAgo(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const sec = Math.floor((Date.now() - t) / 1000);
    if (sec < 60) return 'just now';
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}

const TYPE_PATH: Record<string, string> = {
  song: '/song/',
  artist: '/artist/',
  collection: '/collection/',
  idea: '/idea/',
};

export function TeamActivityFeed() {
  const router = useRouter();
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'song' | 'artist' | 'collection' | 'idea'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/activity/recent?limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : (data.activities || []));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(a => filter === 'all' || a.target_type === filter);

  const openItem = (a: Activity) => {
    const path = TYPE_PATH[a.target_type];
    if (path && a.target_id) router.push(`${path}${a.target_id}`);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Ionicons name="people-circle" size={20} color={colors.primary} />
          <Text style={styles.title}>Team Activity</Text>
        </View>
        <Pressable onPress={load} hitSlop={8} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'song', 'artist', 'collection', 'idea'] as const).map(f => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'All' : f === 'collection' ? 'Collections' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 16 }} />
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>No team activity yet. Get to work! 🎶</Text>
      ) : (
        <View style={styles.list}>
          {filtered.slice(0, 12).map((a) => {
            const icon = ACTION_ICON[a.action] || 'ellipse';
            const verb = ACTION_VERB[a.action] || a.action;
            const title = a.details?.title || '';
            const detail = a.action === 'updated' && a.details?.new_status
              ? `→ ${a.details.new_status}`
              : a.details?.preview ? `: "${a.details.preview}"` : '';
            return (
              <Pressable key={a.id} style={styles.row} onPress={() => openItem(a)}>
                <View style={styles.iconCircle}>
                  <Ionicons name={icon as any} size={14} color={colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowText} numberOfLines={2}>
                    <Text style={styles.actor}>{a.user_name || 'Someone'}</Text>
                    <Text style={styles.verb}> {verb} {a.target_type}</Text>
                    {title ? <Text style={styles.targetTitle}> "{title}"</Text> : null}
                    {detail ? <Text style={styles.detail}> {detail}</Text> : null}
                  </Text>
                  <Text style={styles.timeAgo}>{timeAgo(a.created_at)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  refreshBtn: { padding: 4 },
  filterRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginBottom: 6 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 11, color: colors.textSecondary },
  filterChipTextActive: { color: colors.text, fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.textMuted, paddingVertical: 12, fontSize: 13 },
  list: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border + '40' },
  iconCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center' },
  rowContent: { flex: 1, gap: 2 },
  rowText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  actor: { fontWeight: '700', color: colors.text },
  verb: { color: colors.textSecondary },
  targetTitle: { color: colors.primary, fontWeight: '600' },
  detail: { color: colors.textMuted, fontStyle: 'italic' },
  timeAgo: { fontSize: 11, color: colors.textMuted },
});
