import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../src/stores/dataStore';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { colors, spacing } from '../../src/utils/theme';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const ANALYSIS_TYPES = [
  { id: 'lyrics', label: 'Analyze Lyrics', icon: 'text' },
  { id: 'style', label: 'Style Analysis', icon: 'color-palette' },
  { id: 'suno_prompt', label: 'Generate Suno Prompt', icon: 'sparkles' },
  { id: 'enhance_lyrics', label: 'Enhance Lyrics', icon: 'brush' },
  { id: 'artist_match', label: 'Artist Match', icon: 'people' },
];

export default function AIToolsScreen() {
  const router = useRouter();
  const { artists, songs, analyzeContent, generateSunoPrompt, fetchArtists, fetchSongs } = useDataStore();
  const [content, setContent] = useState('');
  const [selectedType, setSelectedType] = useState('lyrics');
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saveSongId, setSaveSongId] = useState<string | null>(null);
  
  // Suno quick generator
  const [genre, setGenre] = useState('');
  const [mood, setMood] = useState('');
  const [tempo, setTempo] = useState('medium');
  const [sunoPrompt, setSunoPrompt] = useState('');
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  // Video prompts
  const [videoLyrics, setVideoLyrics] = useState('');
  const [videoStyle, setVideoStyle] = useState('');
  const [videoArtist, setVideoArtist] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState('');
  const [generatingVideo, setGeneratingVideo] = useState(false);

  React.useEffect(() => {
    fetchArtists();
    fetchSongs();
  }, []);

  const saveToSong = async (promptType: string, label: string, content: string) => {
    if (!saveSongId) {
      Alert.alert('Pick a Song', 'Use the "Save to" picker below to choose which song to attach this prompt to.');
      return;
    }
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${(process.env.EXPO_PUBLIC_BACKEND_URL || "https://artist-catalog-pro.emergent.host")}/api/songs/${saveSongId}/saved-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt_type: promptType, label, content }),
      });
      if (!res.ok) throw new Error('Failed');
      const songTitle = songs.find(s => s.id === saveSongId)?.title || '';
      Alert.alert('Saved!', `Prompt saved to "${songTitle}"\u2019s gallery.`, [
        { text: 'View song', onPress: () => router.push(`/song/${saveSongId}`) },
        { text: 'OK' },
      ]);
    } catch {
      Alert.alert('Error', 'Could not save');
    }
  };

  const handleAnalyze = async () => {
    if (!content.trim()) {
      Alert.alert('Error', 'Please enter content to analyze');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const response = await analyzeContent(content, selectedType, selectedArtist || undefined);
      setResult(response);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSuno = async () => {
    if (!genre.trim() || !mood.trim()) {
      Alert.alert('Error', 'Please enter genre and mood');
      return;
    }

    setGeneratingPrompt(true);
    setSunoPrompt('');
    try {
      const prompt = await generateSunoPrompt(genre, mood, tempo);
      setSunoPrompt(prompt);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate prompt');
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Text copied to clipboard');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>AI Tools</Text>
          <Text style={styles.subtitle}>
            Analyze lyrics, generate Suno prompts, and enhance your music
          </Text>

          {/* Assistant CTA */}
          <Pressable style={styles.assistantCta} onPress={() => router.push('/assistant')}>
            <Ionicons name="chatbubbles" size={22} color={colors.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Open Creative Assistant</Text>
              <Text style={styles.ctaSub}>Multi-turn chat that knows your roster, songs, and writing voice</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.text} />
          </Pressable>

          {/* Save to Song Picker */}
          {songs.length > 0 && (
            <View style={styles.saveToBox}>
              <View style={styles.saveToHeader}>
                <Ionicons name="bookmark" size={14} color={colors.primary} />
                <Text style={styles.saveToLabel}>Save outputs below to:</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Pressable style={[styles.saveToChip, !saveSongId && styles.saveToChipActive]} onPress={() => setSaveSongId(null)}>
                  <Text style={[styles.saveToChipText, !saveSongId && styles.saveToChipTextActive]}>None</Text>
                </Pressable>
                {songs.slice(0, 30).map(s => (
                  <Pressable key={s.id} style={[styles.saveToChip, saveSongId === s.id && styles.saveToChipActive]} onPress={() => setSaveSongId(s.id)}>
                    <Text style={[styles.saveToChipText, saveSongId === s.id && styles.saveToChipTextActive]} numberOfLines={1}>{s.title}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Quick Suno Prompt Generator */}
          <Card style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="sparkles" size={24} color={colors.primary} />
              <Text style={styles.sectionTitle}>Quick Suno Prompt</Text>
            </View>
            <Text style={styles.sectionDesc}>
              Generate copyright-free style prompts for Suno
            </Text>

            <View style={styles.row}>
              <Input
                label="Genre"
                placeholder="e.g., Lo-fi, Hip Hop, Pop"
                value={genre}
                onChangeText={setGenre}
                containerStyle={styles.halfInput}
              />
              <Input
                label="Mood"
                placeholder="e.g., Chill, Energetic"
                value={mood}
                onChangeText={setMood}
                containerStyle={styles.halfInput}
              />
            </View>

            <Text style={styles.label}>Tempo</Text>
            <View style={styles.tempoRow}>
              {['slow', 'medium', 'fast'].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.tempoChip,
                    tempo === t && styles.tempoChipActive,
                  ]}
                  onPress={() => setTempo(t)}
                >
                  <Text
                    style={[
                      styles.tempoText,
                      tempo === t && styles.tempoTextActive,
                    ]}
                  >
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button
              title="Generate Prompt"
              onPress={handleGenerateSuno}
              loading={generatingPrompt}
              style={styles.generateBtn}
            />

            {sunoPrompt && (
              <View style={styles.resultBox}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultLabel}>Suno Prompt:</Text>
                  <View style={styles.resultActions}>
                    <Pressable onPress={() => saveToSong('suno_style', `${genre} ${mood}`.trim() || 'Suno style', sunoPrompt)} style={styles.saveBtn}>
                      <Ionicons name="bookmark-outline" size={16} color={colors.primary} />
                      <Text style={styles.saveBtnText}>Save to Song</Text>
                    </Pressable>
                    <TouchableOpacity onPress={() => copyToClipboard(sunoPrompt)}>
                      <Ionicons name="copy-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.resultText}>{sunoPrompt}</Text>
              </View>
            )}
          </Card>

          {/* Content Analyzer */}
          <Card style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="analytics" size={24} color={colors.secondary} />
              <Text style={styles.sectionTitle}>Content Analyzer</Text>
            </View>
            <Text style={styles.sectionDesc}>
              Analyze lyrics, match artist styles, and get AI suggestions
            </Text>

            <Text style={styles.label}>Analysis Type</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.typeScroll}
            >
              {ANALYSIS_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeChip,
                    selectedType === type.id && styles.typeChipActive,
                  ]}
                  onPress={() => setSelectedType(type.id)}
                >
                  <Ionicons
                    name={type.icon as any}
                    size={16}
                    color={selectedType === type.id ? colors.text : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeChipText,
                      selectedType === type.id && styles.typeChipTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {(selectedType === 'artist_match' || selectedType === 'enhance_lyrics') && (
              <>
                <Text style={styles.label}>Select Artist (Optional)</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.artistScroll}
                >
                  <TouchableOpacity
                    style={[
                      styles.artistChip,
                      !selectedArtist && styles.artistChipActive,
                    ]}
                    onPress={() => setSelectedArtist(null)}
                  >
                    <Text
                      style={[
                        styles.artistChipText,
                        !selectedArtist && styles.artistChipTextActive,
                      ]}
                    >
                      None
                    </Text>
                  </TouchableOpacity>
                  {artists.map((artist) => (
                    <TouchableOpacity
                      key={artist.id}
                      style={[
                        styles.artistChip,
                        selectedArtist === artist.id && styles.artistChipActive,
                      ]}
                      onPress={() => setSelectedArtist(artist.id)}
                    >
                      <Text
                        style={[
                          styles.artistChipText,
                          selectedArtist === artist.id && styles.artistChipTextActive,
                        ]}
                      >
                        {artist.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <Input
              label="Content to Analyze"
              placeholder="Paste lyrics, style description, or content here..."
              value={content}
              onChangeText={setContent}
              multiline
              numberOfLines={6}
              style={styles.contentInput}
            />

            <Button
              title="Analyze"
              onPress={handleAnalyze}
              loading={loading}
              variant="secondary"
            />

            {result && (
              <View style={styles.resultBox}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultLabel}>Analysis Result:</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(result.analysis)}>
                    <Ionicons name="copy-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.resultText}>{result.analysis}</Text>

                {result.suggestions?.length > 0 && (
                  <View style={styles.suggestionsBox}>
                    <Text style={styles.suggestionsTitle}>Suggestions:</Text>
                    {result.suggestions.map((s: string, i: number) => (
                      <Text key={i} style={styles.suggestionItem}>
                        • {s}
                      </Text>
                    ))}
                  </View>
                )}

                {result.suno_prompt && (
                  <View style={styles.sunoBox}>
                    <View style={styles.resultHeader}>
                      <Text style={styles.suggestionsTitle}>Suno Prompt:</Text>
                      <TouchableOpacity onPress={() => copyToClipboard(result.suno_prompt)}>
                        <Ionicons name="copy-outline" size={18} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.resultText}>{result.suno_prompt}</Text>
                  </View>
                )}
              </View>
            )}
          </Card>

          {/* Video Prompt Generator */}
          <Card style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="videocam" size={24} color={'#EF4444'} />
              <Text style={styles.sectionTitle}>Video Storyboard</Text>
            </View>
            <Text style={styles.sectionDesc}>
              Generate scene-by-scene video prompts adapted for YouTube, TikTok, and Instagram
            </Text>

            <Input
              label="Lyrics / Song Content"
              placeholder="Paste lyrics to generate video scenes..."
              value={videoLyrics}
              onChangeText={setVideoLyrics}
              multiline
              numberOfLines={4}
            />

            <Input
              label="Visual Style Direction (optional)"
              placeholder="e.g., Neon cityscape, vintage film grain..."
              value={videoStyle}
              onChangeText={setVideoStyle}
            />

            {artists.length > 0 && (
              <>
                <Text style={styles.label}>Link to Artist (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.artistScroll}>
                  <TouchableOpacity
                    style={[styles.artistChip, !videoArtist && styles.artistChipActive]}
                    onPress={() => setVideoArtist(null)}
                  >
                    <Text style={[styles.artistChipText, !videoArtist && styles.artistChipTextActive]}>None</Text>
                  </TouchableOpacity>
                  {artists.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.artistChip, videoArtist === a.id && styles.artistChipActive]}
                      onPress={() => setVideoArtist(a.id)}
                    >
                      <Text style={[styles.artistChipText, videoArtist === a.id && styles.artistChipTextActive]}>{a.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <Button
              title="Generate Video Storyboard"
              onPress={async () => {
                if (!videoLyrics.trim()) { Alert.alert('Error', 'Enter lyrics'); return; }
                setGeneratingVideo(true);
                setVideoResult('');
                try {
                  const token = await (await import('@react-native-async-storage/async-storage')).default.getItem('token');
                  const res = await fetch(`${(process.env.EXPO_PUBLIC_BACKEND_URL || "https://artist-catalog-pro.emergent.host")}/api/ai/video-prompts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ lyrics: videoLyrics, style: videoStyle, artist_id: videoArtist, platforms: ['youtube', 'tiktok', 'instagram'] }),
                  });
                  if (!res.ok) throw new Error('Failed');
                  const data = await res.json();
                  setVideoResult(data.video_prompts);
                } catch (e: any) { Alert.alert('Error', e.message); }
                finally { setGeneratingVideo(false); }
              }}
              loading={generatingVideo}
              variant="secondary"
              style={{ backgroundColor: '#EF4444' }}
            />

            {videoResult ? (
              <View style={styles.resultBox}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultLabel}>Video Storyboard:</Text>
                  <View style={styles.resultActions}>
                    <Pressable onPress={() => saveToSong('video_storyboard', `Video storyboard ${new Date().toLocaleDateString()}`, videoResult)} style={styles.saveBtn}>
                      <Ionicons name="bookmark-outline" size={16} color={colors.primary} />
                      <Text style={styles.saveBtnText}>Save to Song</Text>
                    </Pressable>
                    <TouchableOpacity onPress={() => copyToClipboard(videoResult)}>
                      <Ionicons name="copy-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.resultText}>{videoResult}</Text>
              </View>
            ) : null}
          </Card>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  assistantCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 14, backgroundColor: colors.primary, marginBottom: spacing.md },
  ctaTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  ctaSub: { fontSize: 12, color: colors.text + 'cc', marginTop: 2 },
  saveToBox: { backgroundColor: colors.surfaceLight, borderRadius: 10, padding: spacing.sm, marginBottom: spacing.md },
  saveToHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  saveToLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  saveToChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.surface, marginRight: 6, maxWidth: 160 },
  saveToChipActive: { backgroundColor: colors.primary },
  saveToChipText: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  saveToChipTextActive: { color: colors.text },
  resultActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.primary + '20' },
  saveBtnText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  sectionDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfInput: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  tempoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tempoChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
  },
  tempoChipActive: {
    backgroundColor: colors.primary,
  },
  tempoText: {
    color: colors.textSecondary,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  tempoTextActive: {
    color: colors.text,
  },
  generateBtn: {
    marginTop: spacing.sm,
  },
  typeScroll: {
    marginBottom: spacing.md,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    marginRight: spacing.sm,
    gap: 6,
  },
  typeChipActive: {
    backgroundColor: colors.secondary,
  },
  typeChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  typeChipTextActive: {
    color: colors.text,
  },
  artistScroll: {
    marginBottom: spacing.md,
  },
  artistChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    marginRight: spacing.sm,
  },
  artistChipActive: {
    backgroundColor: colors.primary,
  },
  artistChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  artistChipTextActive: {
    color: colors.text,
  },
  contentInput: {
    minHeight: 120,
  },
  resultBox: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  resultText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
  suggestionsBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning,
    marginBottom: spacing.sm,
  },
  suggestionItem: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  sunoBox: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomPadding: {
    height: 40,
  },
});
