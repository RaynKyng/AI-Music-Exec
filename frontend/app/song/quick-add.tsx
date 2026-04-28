import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDataStore } from '../../src/stores/dataStore';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { colors, spacing } from '../../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const AUTHORSHIP = [
  { id: 'original', label: 'Written by Me', icon: 'pencil' },
  { id: 'ai_generated', label: 'AI Generated', icon: 'sparkles' },
  { id: 'collab', label: 'Collab (AI + Me)', icon: 'people' },
];

export default function QuickAddScreen() {
  const router = useRouter();
  const { artists, fetchArtists } = useDataStore();
  const [title, setTitle] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [artistId, setArtistId] = useState<string | null>(null);
  const [authorship, setAuthorship] = useState('original');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => { fetchArtists(); }, []);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = await AsyncStorage.getItem('token');
    return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  };

  const handleQuickAdd = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Title is required'); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${API_URL}/api/songs/quick-add`, {
        method: 'POST',
        body: JSON.stringify({ title, lyrics, style_prompt: stylePrompt, artist_id: artistId, authorship }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setResult(data);
    } catch (e) {
      Alert.alert('Error', 'Failed to add song');
    } finally {
      setSaving(false);
    }
  };

  const handleApplySuggestions = async (suggestions: any) => {
    if (!result?.song?.id) return;
    try {
      await authFetch(`${API_URL}/api/songs/${result.song.id}/apply-suggestions`, {
        method: 'POST',
        body: JSON.stringify(suggestions),
      });
      Alert.alert('Applied', 'AI suggestions applied to song');
      router.push(`/song/${result.song.id}`);
    } catch {
      Alert.alert('Error', 'Failed to apply');
    }
  };

  const handleSkipToEdit = () => {
    if (result?.song?.id) {
      router.push(`/song/${result.song.id}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Quick Add Song</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

          {!result ? (
            <>
              <Text style={styles.desc}>Add the essentials — AI will analyze and suggest the rest.</Text>

              <Input label="Song Title *" placeholder="What's it called?" value={title} onChangeText={setTitle} />

              <Input label="Lyrics" placeholder="Paste lyrics here..." value={lyrics} onChangeText={setLyrics}
                multiline numberOfLines={8} style={styles.lyricsInput} />

              <Input label="Primary Style (optional)" placeholder="Suno style prompt if you have one..."
                value={stylePrompt} onChangeText={setStylePrompt} multiline numberOfLines={3} />

              <Text style={styles.label}>Who wrote it?</Text>
              <View style={styles.authRow}>
                {AUTHORSHIP.map(a => (
                  <Pressable key={a.id} style={[styles.authChip, authorship === a.id && styles.authChipActive]}
                    onPress={() => setAuthorship(a.id)}>
                    <Ionicons name={a.icon as any} size={16} color={authorship === a.id ? colors.text : colors.textSecondary} />
                    <Text style={[styles.authText, authorship === a.id && styles.authTextActive]}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>

              {artists.length > 0 && (
                <>
                  <Text style={styles.label}>Assign to Artist (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.artistScroll}>
                    <Pressable style={[styles.chip, !artistId && styles.chipActive]} onPress={() => setArtistId(null)}>
                      <Text style={[styles.chipText, !artistId && styles.chipTextActive]}>None / Decide Later</Text>
                    </Pressable>
                    {artists.map(a => (
                      <Pressable key={a.id} style={[styles.chip, artistId === a.id && styles.chipActive]}
                        onPress={() => setArtistId(a.id)}>
                        <Text style={[styles.chipText, artistId === a.id && styles.chipTextActive]}>{a.name}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              <Button title="Add Song & Analyze" onPress={handleQuickAdd} loading={saving}
                icon={<Ionicons name="sparkles" size={18} color={colors.text} />} style={styles.addBtn} />
            </>
          ) : (
            <>
              <Card style={styles.successCard}>
                <Ionicons name="checkmark-circle" size={32} color={colors.success} />
                <Text style={styles.successTitle}>"{result.song.title}" Added!</Text>
                <Text style={styles.successSub}>Saved as draft. Here's what the AI suggests:</Text>
                <View style={styles.savedBanner}>
                  <Ionicons name="bookmark" size={14} color={colors.primary} />
                  <Text style={styles.savedBannerText}>Full analysis saved to this song&rsquo;s AI Prompts Gallery — you can refer back anytime.</Text>
                </View>
              </Card>

              {result.ai_suggestions && !result.ai_suggestions.raw ? (
                <>
                  {/* AI Suggestions */}
                  <Card style={styles.sugCard}>
                    <Text style={styles.sugTitle}>Suggested Details</Text>
                    {result.ai_suggestions.genre && (
                      <View style={styles.sugRow}><Text style={styles.sugLabel}>Genre:</Text><Text style={styles.sugValue}>{result.ai_suggestions.genre}</Text></View>
                    )}
                    {result.ai_suggestions.mood && (
                      <View style={styles.sugRow}><Text style={styles.sugLabel}>Mood:</Text><Text style={styles.sugValue}>{result.ai_suggestions.mood}</Text></View>
                    )}
                    {result.ai_suggestions.tempo && (
                      <View style={styles.sugRow}><Text style={styles.sugLabel}>Tempo:</Text><Text style={styles.sugValue}>{result.ai_suggestions.tempo}</Text></View>
                    )}
                    {result.ai_suggestions.themes?.length > 0 && (
                      <View style={styles.sugRow}>
                        <Text style={styles.sugLabel}>Themes:</Text>
                        <View style={styles.themesWrap}>
                          {result.ai_suggestions.themes.map((t: string, i: number) => (
                            <View key={i} style={styles.themeChip}><Text style={styles.themeText}>{t}</Text></View>
                          ))}
                        </View>
                      </View>
                    )}
                  </Card>

                  {result.ai_suggestions.style_suggestions?.length > 0 && (
                    <Card style={styles.sugCard}>
                      <Text style={styles.sugTitle}>Style Suggestions (Top 3)</Text>
                      {result.ai_suggestions.style_suggestions.map((s: string, i: number) => (
                        <View key={i} style={styles.styleItem}>
                          <View style={[styles.styleBadge, { backgroundColor: i === 0 ? colors.primary : i === 1 ? colors.secondary : colors.warning }]}>
                            <Text style={styles.styleBadgeText}>{i === 0 ? 'A' : i === 1 ? 'B' : 'C'}</Text>
                          </View>
                          <Text style={styles.styleText}>{s}</Text>
                        </View>
                      ))}
                    </Card>
                  )}

                  {result.ai_suggestions.suggested_artists?.length > 0 && (
                    <Card style={styles.sugCard}>
                      <Text style={styles.sugTitle}>Suggested Artists</Text>
                      {result.ai_suggestions.suggested_artists.map((a: string, i: number) => (
                        <Text key={i} style={styles.sugArtist}>{a}</Text>
                      ))}
                    </Card>
                  )}

                  {result.ai_suggestions.next_steps?.length > 0 && (
                    <Card style={styles.sugCard}>
                      <Text style={styles.sugTitle}>Suggested Next Steps</Text>
                      {result.ai_suggestions.next_steps.map((s: string, i: number) => (
                        <View key={i} style={styles.nextStep}>
                          <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                          <Text style={styles.nextStepText}>{s}</Text>
                        </View>
                      ))}
                    </Card>
                  )}

                  <View style={styles.actionRow}>
                    <Button title="Apply All & Edit" onPress={() => handleApplySuggestions(result.ai_suggestions)} style={{ flex: 1 }} />
                    <Button title="Skip to Edit" onPress={handleSkipToEdit} variant="outline" style={{ flex: 1 }} />
                  </View>
                </>
              ) : (
                <View style={styles.actionRow}>
                  <Button title="Edit Song" onPress={handleSkipToEdit} style={{ flex: 1 }} />
                  <Button title="Add Another" onPress={() => { setResult(null); setTitle(''); setLyrics(''); setStylePrompt(''); }} variant="outline" style={{ flex: 1 }} />
                </View>
              )}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  backBtn: { padding: spacing.sm, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '600', color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  desc: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  lyricsInput: { minHeight: 150 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
  authRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  authChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.surfaceLight, gap: 6 },
  authChipActive: { backgroundColor: colors.primary },
  authText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  authTextActive: { color: colors.text },
  artistScroll: { marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 20, backgroundColor: colors.surfaceLight, marginRight: spacing.sm },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
  chipTextActive: { color: colors.text },
  addBtn: { marginTop: spacing.lg },
  // Results
  successCard: { alignItems: 'center', padding: spacing.lg, marginBottom: spacing.md },
  successTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: spacing.sm },
  successSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  savedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: 8, backgroundColor: colors.primary + '20', borderRadius: 10 },
  savedBannerText: { flex: 1, fontSize: 11, color: colors.primary, lineHeight: 16 },
  sugCard: { marginBottom: spacing.md },
  sugTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  sugRow: { flexDirection: 'row', marginBottom: spacing.sm, gap: spacing.sm },
  sugLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, width: 60 },
  sugValue: { fontSize: 13, color: colors.text, flex: 1 },
  themesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 },
  themeChip: { backgroundColor: colors.surfaceLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  themeText: { fontSize: 12, color: colors.textSecondary },
  styleItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  styleBadge: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  styleBadgeText: { fontSize: 12, fontWeight: '700', color: colors.text },
  styleText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  sugArtist: { fontSize: 14, color: colors.primary, fontWeight: '500', marginBottom: 4 },
  nextStep: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  nextStepText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
