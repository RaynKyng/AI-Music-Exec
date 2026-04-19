import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useDataStore } from '../../../src/stores/dataStore';
import { Card } from '../../../src/components/Card';
import { colors, spacing } from '../../../src/utils/theme';
import { SharingFormats, PlatformFormat } from '../../../src/types';

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E1306C' },
  { id: 'tiktok', label: 'TikTok', icon: 'musical-notes', color: '#00F2EA' },
  { id: 'youtube', label: 'YouTube', icon: 'logo-youtube', color: '#FF0000' },
  { id: 'twitter', label: 'Twitter / X', icon: 'logo-twitter', color: '#1DA1F2' },
  { id: 'spotify', label: 'Spotify', icon: 'disc', color: '#1DB954' },
  { id: 'apple_music', label: 'Apple Music', icon: 'musical-note', color: '#FC3C44' },
  { id: 'soundcloud', label: 'SoundCloud', icon: 'cloud', color: '#FF5500' },
];

export default function ShareScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getShareFormats } = useDataStore();
  const [formats, setFormats] = useState<SharingFormats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadFormats();
  }, [id]);

  const loadFormats = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getShareFormats(id, PLATFORMS.map(p => p.id));
      setFormats(data);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to load sharing formats');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied!', `${label} copied to clipboard`);
  };

  const getMainText = (platform: string, format: PlatformFormat): string => {
    if (format.caption) return format.caption;
    if (format.tweet) return format.tweet;
    if (format.description) return format.description;
    if (format.pitch_description) return format.pitch_description;
    return '';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Share Song</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Generating platform formats...</Text>
        </View>
      ) : formats ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.songTitle}>{formats.song_title}</Text>
          <Text style={styles.artistLabel}>by {formats.artist_name}</Text>

          {PLATFORMS.map((platform) => {
            const format = formats.formats[platform.id];
            if (!format) return null;
            const isExpanded = expanded === platform.id;
            const mainText = getMainText(platform.id, format);

            return (
              <Card key={platform.id} style={styles.platformCard} onPress={() => setExpanded(isExpanded ? null : platform.id)}>
                <View style={styles.platformHeader}>
                  <View style={[styles.platformIcon, { backgroundColor: platform.color + '20' }]}>
                    <Ionicons name={platform.icon as any} size={22} color={platform.color} />
                  </View>
                  <View style={styles.platformInfo}>
                    <Text style={styles.platformName}>{platform.label}</Text>
                    {format.char_limit && (
                      <Text style={styles.charLimit}>{format.char_limit} char limit</Text>
                    )}
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
                </View>

                {isExpanded && (
                  <View style={styles.platformContent}>
                    {format.title && (
                      <View style={styles.fieldBlock}>
                        <View style={styles.fieldHeader}>
                          <Text style={styles.fieldLabel}>Title</Text>
                          <Pressable onPress={() => copyToClipboard(format.title!, 'Title')}>
                            <Ionicons name="copy-outline" size={16} color={colors.primary} />
                          </Pressable>
                        </View>
                        <Text style={styles.fieldText}>{format.title}</Text>
                      </View>
                    )}

                    {mainText ? (
                      <View style={styles.fieldBlock}>
                        <View style={styles.fieldHeader}>
                          <Text style={styles.fieldLabel}>
                            {format.caption ? 'Caption' : format.tweet ? 'Tweet' : format.description ? 'Description' : 'Pitch'}
                          </Text>
                          <Pressable onPress={() => copyToClipboard(mainText, 'Content')}>
                            <Ionicons name="copy-outline" size={16} color={colors.primary} />
                          </Pressable>
                        </View>
                        <Text style={styles.fieldText}>{mainText}</Text>
                      </View>
                    ) : null}

                    {format.tags && format.tags.length > 0 && (
                      <View style={styles.fieldBlock}>
                        <Text style={styles.fieldLabel}>Tags</Text>
                        <View style={styles.tagsRow}>
                          {format.tags.map((tag, i) => (
                            <View key={i} style={styles.tagBadge}>
                              <Text style={styles.tagText}>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {format.notes ? (
                      <View style={styles.notesBox}>
                        <Ionicons name="information-circle" size={16} color={colors.warning} />
                        <Text style={styles.notesText}>{format.notes}</Text>
                      </View>
                    ) : null}

                    <Pressable style={styles.copyAllBtn} onPress={() => {
                      const all = [format.title, mainText, format.notes].filter(Boolean).join('\n\n');
                      copyToClipboard(all, `All ${platform.label} content`);
                    }}>
                      <Ionicons name="copy" size={16} color={colors.text} />
                      <Text style={styles.copyAllText}>Copy All</Text>
                    </Pressable>
                  </View>
                )}
              </Card>
            );
          })}

          <View style={styles.bottomPadding} />
        </ScrollView>
      ) : (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>No data available</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  backBtn: { padding: spacing.sm },
  title: { fontSize: 20, fontWeight: '600', color: colors.text },
  placeholder: { width: 40 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textSecondary, marginTop: spacing.md, fontSize: 14 },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  songTitle: { fontSize: 24, fontWeight: '700', color: colors.text },
  artistLabel: { fontSize: 16, color: colors.primary, marginBottom: spacing.lg },
  platformCard: { marginBottom: spacing.md },
  platformHeader: { flexDirection: 'row', alignItems: 'center' },
  platformIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  platformInfo: { flex: 1, marginLeft: spacing.md },
  platformName: { fontSize: 16, fontWeight: '600', color: colors.text },
  charLimit: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  platformContent: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  fieldBlock: { marginBottom: spacing.md },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldText: { fontSize: 14, color: colors.text, lineHeight: 20, backgroundColor: colors.surfaceLight, borderRadius: 8, padding: spacing.sm },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tagBadge: { backgroundColor: colors.surfaceLight, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 8 },
  tagText: { fontSize: 12, color: colors.textSecondary },
  notesBox: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.warning + '15', borderRadius: 8, padding: spacing.sm },
  notesText: { flex: 1, fontSize: 13, color: colors.warning, lineHeight: 18 },
  copyAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: 8, paddingVertical: spacing.sm, marginTop: spacing.sm, gap: spacing.sm },
  copyAllText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  bottomPadding: { height: 40 },
});
