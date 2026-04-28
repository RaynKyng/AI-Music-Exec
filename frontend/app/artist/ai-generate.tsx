import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { colors, spacing } from '../../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const PRESET_GENRES = ['hip-hop', 'trap', 'r&b', 'pop', 'rock', 'indie', 'electronic', 'lo-fi', 'emo rap', 'drill', 'afrobeats', 'dancehall', 'country'];
const PRESET_VIBES = ['moody & introspective', 'energetic & playful', 'dark & cinematic', 'romantic & smooth', 'rebellious & raw', 'dreamy & ethereal'];

export default function AIGenerateArtistScreen() {
  const router = useRouter();
  const [location, setLocation] = useState('');
  const [influenceInput, setInfluenceInput] = useState('');
  const [influences, setInfluences] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [vibe, setVibe] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [editName, setEditName] = useState('');

  const authFetch = async (path: string, options: RequestInit = {}) => {
    const token = await AsyncStorage.getItem('token');
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
  };

  const addInfluence = () => {
    const v = influenceInput.trim();
    if (v && !influences.includes(v)) {
      setInfluences([...influences, v]);
      setInfluenceInput('');
    }
  };

  const removeInfluence = (i: number) => setInfluences(influences.filter((_, idx) => idx !== i));

  const toggleGenre = (g: string) => {
    setGenres(genres.includes(g) ? genres.filter(x => x !== g) : [...genres, g]);
  };

  const handleGenerate = async () => {
    if (influences.length === 0 && !customPrompt.trim()) {
      Alert.alert('Add influences', 'Add at least one real-life influence (e.g., Travis Scott) or a custom direction.');
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await authFetch('/api/artists/ai-generate', {
        method: 'POST',
        body: JSON.stringify({ location, influences, genres, vibe, custom_prompt: customPrompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Generation failed');
      }
      const data = await res.json();
      setResult(data);
      setEditName(data.primary_name || (data.name_suggestions?.[0]) || '');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'AI generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreate = async () => {
    if (!result || !editName.trim()) {
      Alert.alert('Pick a name', 'Choose or type a name for the new artist');
      return;
    }
    setCreating(true);
    try {
      const res = await authFetch('/api/artists/from-ai-generation', {
        method: 'POST',
        body: JSON.stringify({
          profile: result,
          brief: { location, influences, genres, vibe, custom_prompt: customPrompt },
          name: editName.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const artist = await res.json();
      Alert.alert('Created!', `"${artist.name}" added to your roster. Full AI generation log saved to their profile.`, [
        { text: 'View Artist', onPress: () => router.replace(`/artist/${artist.id}`) },
        { text: 'Generate Another', onPress: () => { setResult(null); setEditName(''); } },
      ]);
    } catch {
      Alert.alert('Error', 'Could not create artist');
    } finally {
      setCreating(false);
    }
  };

  const copyAll = async () => {
    if (!result) return;
    const text = JSON.stringify(result, null, 2);
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Full generation copied as JSON');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>AI Artist Generator</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {!result ? (
            <>
              <Text style={styles.intro}>Tell the AI what kind of artist you want and it&rsquo;ll fuse the influences into a brand-new fictional artist with backstory, sound, branding, and starter songs.</Text>

              <Card style={styles.section}>
                <Input
                  label="Location / Origin"
                  placeholder="e.g., Baltimore, MD"
                  value={location}
                  onChangeText={setLocation}
                />

                <Text style={styles.label}>Real-Life Influences *</Text>
                <Text style={styles.hint}>Add 1-5 real-world artists. The AI will analyze each one&rsquo;s actual sound and pull specific elements.</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.influenceInput}
                    placeholder="e.g., Juice WRLD"
                    placeholderTextColor={colors.textMuted}
                    value={influenceInput}
                    onChangeText={setInfluenceInput}
                    onSubmitEditing={addInfluence}
                    returnKeyType="done"
                  />
                  <Pressable style={styles.addBtn} onPress={addInfluence}>
                    <Ionicons name="add" size={22} color={colors.text} />
                  </Pressable>
                </View>
                <View style={styles.chipsWrap}>
                  {influences.map((inf, i) => (
                    <Pressable key={i} style={styles.influenceChip} onPress={() => removeInfluence(i)}>
                      <Text style={styles.influenceChipText}>{inf}</Text>
                      <Ionicons name="close" size={12} color={colors.text} />
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Genre Hints (optional)</Text>
                <View style={styles.chipsWrap}>
                  {PRESET_GENRES.map(g => (
                    <Pressable key={g} style={[styles.tagChip, genres.includes(g) && styles.tagChipActive]} onPress={() => toggleGenre(g)}>
                      <Text style={[styles.tagChipText, genres.includes(g) && styles.tagChipTextActive]}>{g}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Vibe (optional)</Text>
                <View style={styles.chipsWrap}>
                  {PRESET_VIBES.map(v => (
                    <Pressable key={v} style={[styles.vibeChip, vibe === v && styles.vibeChipActive]} onPress={() => setVibe(vibe === v ? '' : v)}>
                      <Text style={[styles.tagChipText, vibe === v && styles.tagChipTextActive]}>{v}</Text>
                    </Pressable>
                  ))}
                </View>

                <Input
                  label="Custom direction (optional)"
                  placeholder="e.g., 'female perspective, queer love stories, southern gothic visuals'"
                  value={customPrompt}
                  onChangeText={setCustomPrompt}
                  multiline
                  numberOfLines={3}
                />
              </Card>

              <Button
                title="Generate Artist Profile"
                onPress={handleGenerate}
                loading={generating}
                icon={<Ionicons name="sparkles" size={18} color={colors.text} />}
              />
              <Text style={styles.note}>Takes ~10 seconds. Nothing is saved until you tap "Add to Roster" on the result.</Text>
            </>
          ) : (
            <>
              {/* Synthesis */}
              <Card style={styles.section}>
                <View style={styles.resultHead}>
                  <Ionicons name="sparkles" size={20} color={colors.primary} />
                  <Text style={styles.resultTitle}>The AI cooked up:</Text>
                  <Pressable onPress={copyAll} style={styles.iconBtnSm}>
                    <Ionicons name="copy-outline" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <Text style={styles.synthesis}>{result.synthesized_profile}</Text>
              </Card>

              {/* Name picker */}
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Pick a name</Text>
                <View style={styles.chipsWrap}>
                  {(result.name_suggestions || []).map((n: string, i: number) => (
                    <Pressable key={i} style={[styles.nameChip, editName === n && styles.nameChipActive]} onPress={() => setEditName(n)}>
                      <Text style={[styles.nameChipText, editName === n && styles.nameChipTextActive]}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
                <Input label="Or type your own" value={editName} onChangeText={setEditName} placeholder="Artist name" />
              </Card>

              {/* Bio + backstory */}
              {result.bio ? (
                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Bio</Text>
                  <Text style={styles.bodyText}>{result.bio}</Text>
                </Card>
              ) : null}
              {result.backstory ? (
                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Backstory</Text>
                  <Text style={styles.bodyText}>{result.backstory}</Text>
                </Card>
              ) : null}
              {result.unique_sound ? (
                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Sonic Signature</Text>
                  <Text style={styles.bodyText}>{result.unique_sound}</Text>
                </Card>
              ) : null}

              {/* Influence breakdown */}
              {result.influence_breakdown?.length > 0 && (
                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Influence Breakdown</Text>
                  <Text style={styles.hint}>What we&rsquo;re pulling from each real-life artist:</Text>
                  {result.influence_breakdown.map((inf: any, i: number) => (
                    <View key={i} style={styles.infCard}>
                      <Text style={styles.infName}>{inf.influence}</Text>
                      <View style={styles.infRow}>
                        <Text style={styles.infLabel}>Their signature:</Text>
                        <Text style={styles.infText}>{inf.signature_sound}</Text>
                      </View>
                      <View style={styles.infRow}>
                        <Text style={[styles.infLabel, { color: colors.success }]}>✓ Pulling:</Text>
                        <Text style={styles.infText}>{inf.what_we_pull}</Text>
                      </View>
                      <View style={styles.infRow}>
                        <Text style={[styles.infLabel, { color: colors.warning }]}>✗ Dropping:</Text>
                        <Text style={styles.infText}>{inf.what_we_drop}</Text>
                      </View>
                    </View>
                  ))}
                </Card>
              )}

              {/* Branding */}
              {result.branding && (
                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Branding</Text>
                  {result.branding.visual_style ? <Text style={styles.bodyText}>Style: {result.branding.visual_style}</Text> : null}
                  {result.branding.aesthetic ? <Text style={styles.bodyText}>Aesthetic: {result.branding.aesthetic}</Text> : null}
                  {result.branding.mood_keywords?.length > 0 && (
                    <View style={[styles.chipsWrap, { marginTop: spacing.sm }]}>
                      {result.branding.mood_keywords.map((m: string, i: number) => (
                        <View key={i} style={styles.moodChip}><Text style={styles.moodChipText}>{m}</Text></View>
                      ))}
                    </View>
                  )}
                  {result.branding.color_palette?.length > 0 && (
                    <View style={[styles.chipsWrap, { marginTop: spacing.sm }]}>
                      {result.branding.color_palette.map((c: string, i: number) => (
                        <View key={i} style={styles.moodChip}><Text style={styles.moodChipText}>{c}</Text></View>
                      ))}
                    </View>
                  )}
                </Card>
              )}

              {/* Suno setup */}
              {(result.suno_voice_suggestion || result.suno_style_template) && (
                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Suno Setup</Text>
                  {result.suno_voice_suggestion ? <Text style={styles.bodyText}>Voice: {result.suno_voice_suggestion}</Text> : null}
                  {result.suno_style_template ? (
                    <View style={styles.codeBlock}>
                      <Text style={styles.codeText}>{result.suno_style_template}</Text>
                      <Pressable style={styles.codeCopy} onPress={async () => { await Clipboard.setStringAsync(result.suno_style_template); Alert.alert('Copied'); }}>
                        <Ionicons name="copy-outline" size={14} color={colors.primary} />
                      </Pressable>
                    </View>
                  ) : null}
                  {result.suno_exclusions ? <Text style={styles.bodyTextMuted}>Exclusions: {result.suno_exclusions}</Text> : null}
                </Card>
              )}

              {/* Starter songs */}
              {result.first_3_song_ideas?.length > 0 && (
                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Starter Song Ideas</Text>
                  {result.first_3_song_ideas.map((s: any, i: number) => (
                    <View key={i} style={styles.songIdea}>
                      <Text style={styles.songTitle}>{i + 1}. {s.title}</Text>
                      <Text style={styles.bodyText}>{s.concept}</Text>
                      {s.suno_style ? <Text style={styles.songSuno}>Suno: {s.suno_style}</Text> : null}
                    </View>
                  ))}
                </Card>
              )}

              {/* Themes */}
              {result.themes?.length > 0 && (
                <Card style={styles.section}>
                  <Text style={styles.sectionTitle}>Recurring Themes</Text>
                  <View style={styles.chipsWrap}>
                    {result.themes.map((t: string, i: number) => (
                      <View key={i} style={styles.themeChip}><Text style={styles.themeText}>{t}</Text></View>
                    ))}
                  </View>
                </Card>
              )}

              <View style={styles.actionRow}>
                <Button title="Regenerate" variant="outline" onPress={handleGenerate} loading={generating} style={{ flex: 1 }} />
                <Button title="Add to Roster" onPress={handleCreate} loading={creating} style={{ flex: 1 }} icon={<Ionicons name="checkmark" size={18} color={colors.text} />} />
              </View>
              <Pressable onPress={() => setResult(null)} style={styles.startOver}>
                <Text style={styles.startOverText}>← Start over with a new brief</Text>
              </Pressable>
            </>
          )}
          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  iconBtnSm: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  scrollContent: { padding: spacing.lg },
  intro: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: spacing.md },
  section: { marginBottom: spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: spacing.md, marginBottom: 6 },
  hint: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: 15 },
  inputRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  influenceInput: { flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text, fontSize: 14 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  influenceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.primary },
  influenceChipText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  tagChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surfaceLight },
  tagChipActive: { backgroundColor: colors.secondary },
  tagChipText: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  tagChipTextActive: { color: colors.text },
  vibeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surfaceLight },
  vibeChipActive: { backgroundColor: colors.warning },
  note: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, fontStyle: 'italic' },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  resultTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  synthesis: { fontSize: 14, color: colors.text, lineHeight: 21, fontStyle: 'italic' },
  nameChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border },
  nameChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  nameChipText: { fontSize: 13, fontWeight: '600', color: colors.text },
  nameChipTextActive: { color: colors.text },
  bodyText: { fontSize: 13, color: colors.text, lineHeight: 19, marginBottom: 4 },
  bodyTextMuted: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 4 },
  infCard: { backgroundColor: colors.surfaceLight, borderRadius: 10, padding: spacing.sm, marginBottom: spacing.sm },
  infName: { fontSize: 14, fontWeight: '700', color: colors.primary, marginBottom: 6 },
  infRow: { marginBottom: 6 },
  infLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginBottom: 2 },
  infText: { fontSize: 12, color: colors.text, lineHeight: 17 },
  moodChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.surfaceLight },
  moodChipText: { fontSize: 11, color: colors.textSecondary },
  themeChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.primary + '30' },
  themeText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  codeBlock: { backgroundColor: colors.surfaceLight, padding: spacing.sm, borderRadius: 8, marginTop: spacing.sm, position: 'relative' },
  codeText: { fontSize: 12, color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 17, paddingRight: 28 },
  codeCopy: { position: 'absolute', top: 6, right: 6, padding: 6 },
  songIdea: { borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: spacing.sm, marginBottom: spacing.sm },
  songTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 2 },
  songSuno: { fontSize: 11, color: colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  startOver: { alignItems: 'center', marginTop: spacing.md },
  startOverText: { fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
});
