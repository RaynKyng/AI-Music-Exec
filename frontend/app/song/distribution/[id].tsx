import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../../src/stores/dataStore';
import { Card } from '../../../src/components/Card';
import { Input } from '../../../src/components/Input';
import { Button } from '../../../src/components/Button';
import { colors, spacing } from '../../../src/utils/theme';

const PLATFORMS = [
  { id: 'spotify', label: 'Spotify', icon: 'disc', color: '#1DB954' },
  { id: 'apple_music', label: 'Apple Music', icon: 'musical-note', color: '#FC3C44' },
  { id: 'youtube', label: 'YouTube', icon: 'logo-youtube', color: '#FF0000' },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E1306C' },
  { id: 'tiktok', label: 'TikTok', icon: 'musical-notes', color: '#00F2EA' },
  { id: 'soundcloud', label: 'SoundCloud', icon: 'cloud', color: '#FF5500' },
  { id: 'twitter', label: 'Twitter / X', icon: 'logo-twitter', color: '#1DA1F2' },
  { id: 'bandcamp', label: 'Bandcamp', icon: 'headset', color: '#629AA9' },
];

const STATUS_OPTIONS = [
  { id: 'pending', label: 'Pending', color: '#6B7280' },
  { id: 'submitted', label: 'Submitted', color: '#F59E0B' },
  { id: 'live', label: 'Live', color: '#10B981' },
  { id: 'rejected', label: 'Rejected', color: '#EF4444' },
];

export default function DistributionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { distributions, fetchDistributions, createDistribution, updateDistribution, songs } = useDataStore();
  const [dist, setDist] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editPlatform, setEditPlatform] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editStatus, setEditStatus] = useState('pending');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const song = songs.find(s => s.id === id);

  useEffect(() => {
    if (id) loadDistribution();
  }, [id]);

  const loadDistribution = async () => {
    await fetchDistributions(id);
    const existing = distributions.find(d => d.song_id === id);
    if (existing) setDist(existing);
  };

  // Re-check after distributions update
  useEffect(() => {
    const existing = distributions.find(d => d.song_id === id);
    if (existing) setDist(existing);
  }, [distributions, id]);

  const openEdit = (platformId: string) => {
    const entry = dist?.entries?.find((e: any) => e.platform === platformId);
    setEditPlatform(platformId);
    setEditUrl(entry?.url || '');
    setEditStatus(entry?.status || 'pending');
    setEditNotes(entry?.format_notes || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const entries = dist?.entries ? [...dist.entries] : [];
      const idx = entries.findIndex((e: any) => e.platform === editPlatform);
      const entry = {
        platform: editPlatform,
        url: editUrl,
        status: editStatus,
        format_notes: editNotes,
        submitted_at: editStatus === 'submitted' ? new Date().toISOString() : null,
      };

      if (idx >= 0) {
        entries[idx] = entry;
      } else {
        entries.push(entry);
      }

      if (dist?.id) {
        await updateDistribution(dist.id, { song_id: id!, entries, notes: dist.notes || '' });
      } else {
        await createDistribution({ song_id: id!, entries, notes: '' });
      }

      await fetchDistributions(id);
      setModalVisible(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const getEntryForPlatform = (platformId: string) => {
    return dist?.entries?.find((e: any) => e.platform === platformId);
  };

  const getStatusColor = (status: string) => {
    return STATUS_OPTIONS.find(s => s.id === status)?.color || '#6B7280';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Distribution</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.songTitle}>{song?.title || 'Song'}</Text>
        <Text style={styles.subtitle}>Track where this song is shared and its status on each platform</Text>

        {PLATFORMS.map((platform) => {
          const entry = getEntryForPlatform(platform.id);
          return (
            <Card key={platform.id} style={styles.platformCard} onPress={() => openEdit(platform.id)}>
              <View style={styles.platformRow}>
                <View style={[styles.platformIcon, { backgroundColor: platform.color + '20' }]}>
                  <Ionicons name={platform.icon as any} size={22} color={platform.color} />
                </View>
                <View style={styles.platformInfo}>
                  <Text style={styles.platformName}>{platform.label}</Text>
                  {entry?.url ? (
                    <Text style={styles.platformUrl} numberOfLines={1}>{entry.url}</Text>
                  ) : (
                    <Text style={styles.platformUrl}>Not configured</Text>
                  )}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(entry?.status || 'pending') + '20' }]}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(entry?.status || 'pending') }]} />
                  <Text style={[styles.statusText, { color: getStatusColor(entry?.status || 'pending') }]}>
                    {entry?.status || 'pending'}
                  </Text>
                </View>
              </View>
              {entry?.format_notes ? (
                <Text style={styles.entryNotes} numberOfLines={2}>{entry.format_notes}</Text>
              ) : null}
            </Card>
          );
        })}

        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {PLATFORMS.find(p => p.id === editPlatform)?.label || 'Platform'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Input label="URL" placeholder="https://..." value={editUrl} onChangeText={setEditUrl} autoCapitalize="none" />

            <Text style={styles.label}>Status</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((status) => (
                <TouchableOpacity key={status.id}
                  style={[styles.statusChip, editStatus === status.id && { backgroundColor: status.color }]}
                  onPress={() => setEditStatus(status.id)}>
                  <Text style={[styles.statusChipText, editStatus === status.id && { color: colors.text }]}>{status.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input label="Notes" placeholder="Format notes, requirements..." value={editNotes} onChangeText={setEditNotes} multiline />

            <Button title="Save" onPress={handleSave} loading={saving} style={styles.saveBtn} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  backBtn: { padding: spacing.sm },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  placeholder: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  songTitle: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  platformCard: { marginBottom: spacing.sm },
  platformRow: { flexDirection: 'row', alignItems: 'center' },
  platformIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  platformInfo: { flex: 1, marginLeft: spacing.md },
  platformName: { fontSize: 16, fontWeight: '600', color: colors.text },
  platformUrl: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 12, gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  entryNotes: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.sm, fontStyle: 'italic' },
  bottomPadding: { height: 40 },
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xxl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: '600', color: colors.text },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  statusChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 20, backgroundColor: colors.surfaceLight },
  statusChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  saveBtn: { marginTop: spacing.md },
});
