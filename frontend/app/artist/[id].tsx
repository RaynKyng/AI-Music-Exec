import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useDataStore } from '../../src/stores/dataStore';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { CollabComments } from '../../src/components/CollabComments';
import { colors, spacing } from '../../src/utils/theme';
import { safeGoBack } from '../../src/utils/nav';

export default function ArtistDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { artists, songs, createArtist, updateArtist, fetchArtists, fetchSongs } = useDataStore();
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    bio: '',
    unique_sound: '',
    genres: [] as string[],
    themes: [] as string[],
    tone: '',
    patterns: [] as string[],
    branding: {
      color_palette: [] as string[],
      visual_style: '',
      aesthetic: '',
      mood_keywords: [] as string[],
    },
    image_url: '',
    profile_image: '',
    character_images: [] as string[],
    visual_brief: '',
    visual_references: [] as string[],
    suno_voice: '',
    suno_exclusions: '',
    notes: '',
  });
  
  const [genreInput, setGenreInput] = useState('');
  const [themeInput, setThemeInput] = useState('');
  const [patternInput, setPatternInput] = useState('');
  const [moodInput, setMoodInput] = useState('');

  useEffect(() => {
    if (!isNew && id) {
      loadArtist();
    }
    fetchSongs();
  }, [id]);

  const [savedPrompts, setSavedPrompts] = useState<any[]>([]);

  const loadArtist = async () => {
    try {
      const token = await (await import('@react-native-async-storage/async-storage')).default.getItem('token');
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/artists/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setLoading(false); return; }
      const artist = await res.json();
      setForm({
        name: artist.name || '',
        bio: artist.bio || '',
        unique_sound: artist.unique_sound || '',
        genres: artist.genres || [],
        themes: artist.themes || [],
        tone: artist.tone || '',
        patterns: artist.patterns || [],
        branding: artist.branding || { color_palette: [], visual_style: '', aesthetic: '', mood_keywords: [] },
        image_url: artist.image_url || '',
        profile_image: artist.profile_image || '',
        character_images: artist.character_images || [],
        visual_brief: artist.visual_brief || '',
        visual_references: artist.visual_references || [],
        suno_voice: artist.suno_voice || '',
        suno_exclusions: artist.suno_exclusions || '',
        notes: artist.notes || '',
      });
      setSavedPrompts(artist.saved_prompts || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Error', 'Please enter an artist name');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        await createArtist(form);
      } else {
        await updateArtist(id!, form);
      }
      safeGoBack('/artists');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save artist');
    } finally {
      setSaving(false);
    }
  };

  const addTag = (type: 'genres' | 'themes' | 'patterns' | 'mood_keywords', value: string) => {
    if (!value.trim()) return;
    if (type === 'mood_keywords') {
      setForm({
        ...form,
        branding: {
          ...form.branding,
          mood_keywords: [...form.branding.mood_keywords, value.trim()],
        },
      });
      setMoodInput('');
    } else {
      setForm({ ...form, [type]: [...form[type], value.trim()] });
      if (type === 'genres') setGenreInput('');
      if (type === 'themes') setThemeInput('');
      if (type === 'patterns') setPatternInput('');
    }
  };

  const removeTag = (type: 'genres' | 'themes' | 'patterns' | 'mood_keywords', index: number) => {
    if (type === 'mood_keywords') {
      const updated = [...form.branding.mood_keywords];
      updated.splice(index, 1);
      setForm({ ...form, branding: { ...form.branding, mood_keywords: updated } });
    } else {
      const updated = [...form[type]];
      updated.splice(index, 1);
      setForm({ ...form, [type]: updated });
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack('/artists')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{isNew ? 'New Artist' : 'Edit Artist'}</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Profile Image</Text>
            <View style={styles.imageSection}>
              {(form.profile_image || form.image_url) ? (
                <Image 
                  source={{ uri: form.profile_image || form.image_url }} 
                  style={styles.profileImg} 
                />
              ) : (
                <View style={[styles.profileImg, styles.profilePlaceholder]}>
                  <Ionicons name="person" size={40} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.imageButtons}>
                <Pressable style={styles.imgBtn} onPress={async () => {
                  try {
                    const result = await ImagePicker.launchImageLibraryAsync({
                      mediaTypes: ['images'],
                      allowsEditing: true,
                      aspect: [1, 1],
                      quality: 0.5,
                      base64: true,
                    });
                    if (!result.canceled && result.assets[0].base64) {
                      setForm({ ...form, profile_image: `data:image/jpeg;base64,${result.assets[0].base64}` });
                    }
                  } catch { Alert.alert('Error', 'Could not pick image'); }
                }}>
                  <Ionicons name="image" size={18} color={colors.text} />
                  <Text style={styles.imgBtnText}>Upload</Text>
                </Pressable>
                <Pressable style={styles.imgBtn} onPress={() => {
                  Alert.prompt ? Alert.prompt('Image URL', 'Paste image URL:', (url) => {
                    if (url) setForm({ ...form, image_url: url, profile_image: '' });
                  }) : setForm({ ...form });
                }}>
                  <Ionicons name="link" size={18} color={colors.text} />
                  <Text style={styles.imgBtnText}>URL</Text>
                </Pressable>
              </View>
            </View>
            <Input
              label="Image URL (alternative)"
              placeholder="https://..."
              value={form.image_url}
              onChangeText={(text) => setForm({ ...form, image_url: text })}
              autoCapitalize="none"
            />
          </Card>

          {/* Character Gallery */}
          <Card style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Character Gallery ({form.character_images.length})</Text>
                <Text style={styles.galleryDesc}>Reference shots beyond the profile pic — different angles, outfits, moods, locations.</Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
              {form.character_images.map((img, i) => (
                <View key={i} style={styles.galleryItem}>
                  <Image source={{ uri: img }} style={styles.galleryImg} />
                  <Pressable style={styles.galleryRemove} onPress={() => {
                    const updated = [...form.character_images];
                    updated.splice(i, 1);
                    setForm({ ...form, character_images: updated });
                  }}>
                    <Ionicons name="close" size={14} color={colors.text} />
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.galleryAdd} onPress={async () => {
                try {
                  const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    quality: 0.4,
                    base64: true,
                  });
                  if (!result.canceled && result.assets[0].base64) {
                    setForm({ ...form, character_images: [...form.character_images, `data:image/jpeg;base64,${result.assets[0].base64}`] });
                  }
                } catch { Alert.alert('Error', 'Could not add image'); }
              }}>
                <Ionicons name="add" size={28} color={colors.primary} />
                <Text style={styles.galleryAddText}>Upload</Text>
              </Pressable>
              <Pressable style={styles.galleryAdd} onPress={() => {
                if (Alert.prompt) {
                  Alert.prompt('Add Image URL', 'Paste an image URL', (url) => {
                    if (url?.trim()) setForm({ ...form, character_images: [...form.character_images, url.trim()] });
                  });
                }
              }}>
                <Ionicons name="link" size={26} color={colors.secondary} />
                <Text style={styles.galleryAddText}>URL</Text>
              </Pressable>
            </ScrollView>
          </Card>

          {/* AI Prompts Gallery */}
          {!isNew && (
            <Card style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Songs by this artist ({songs.filter(s => s.artist_id === id || s.featured_artist_ids?.includes(id!)).length})</Text>
                  <Text style={styles.galleryDesc}>Tap any song to open. Tap "View All" to filter the catalog.</Text>
                </View>
                <Pressable style={[styles.assistantBtn, { backgroundColor: colors.secondary }]} onPress={() => router.push({ pathname: '/(tabs)/songs', params: { artist: id } })}>
                  <Ionicons name="list" size={14} color={colors.text} />
                  <Text style={styles.assistantBtnText}>View All</Text>
                </Pressable>
              </View>
              {songs.filter(s => s.artist_id === id || s.featured_artist_ids?.includes(id!)).slice(0, 8).map((song: any) => (
                <Pressable key={song.id} style={styles.songRow} onPress={() => router.push(`/song/${song.id}`)}>
                  <View style={[styles.statusDot, song.status === 'released' && { backgroundColor: colors.success }, song.status === 'final' && { backgroundColor: colors.primary }, song.status === 'in_progress' && { backgroundColor: colors.warning }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.songRowTitle} numberOfLines={1}>{song.title}</Text>
                    <Text style={styles.songRowMeta} numberOfLines={1}>{song.genre || ''}{song.mood ? ` \u2022 ${song.mood}` : ''}{song.featured_artist_ids?.includes(id!) ? '  (featured)' : ''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </Pressable>
              ))}
              {songs.filter(s => s.artist_id === id || s.featured_artist_ids?.includes(id!)).length === 0 && (
                <Text style={styles.emptyPromptsText}>No songs assigned to this artist yet. Create a song and pick this artist.</Text>
              )}
            </Card>
          )}

          {/* AI Prompts Gallery */}
          {!isNew && (
            <Card style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>AI Prompts Gallery ({savedPrompts.length})</Text>
                  <Text style={styles.galleryDesc}>AI generation logs, branding briefs, and chat outputs for this artist.</Text>
                </View>
                <Pressable style={styles.assistantBtn} onPress={() => router.push(`/assistant?artistId=${id}`)}>
                  <Ionicons name="sparkles" size={14} color={colors.text} />
                  <Text style={styles.assistantBtnText}>Assistant</Text>
                </Pressable>
              </View>
              {savedPrompts.length === 0 ? (
                <View style={styles.emptyPrompts}>
                  <Ionicons name="bookmark-outline" size={28} color={colors.textMuted} />
                  <Text style={styles.emptyPromptsText}>No prompts saved yet. Open the Assistant or generate ideas in the AI tab and tap &ldquo;Save to Artist&rdquo;.</Text>
                </View>
              ) : (
                savedPrompts.map((p: any, i: number) => (
                  <View key={p.id || i} style={styles.promptItem}>
                    <View style={styles.promptHeader}>
                      <View style={[styles.promptTypeBadge, p.prompt_type === 'ai_artist_generation' && { backgroundColor: colors.secondary }]}>
                        <Ionicons name={p.prompt_type === 'ai_artist_generation' ? 'flash' : 'sparkles'} size={12} color={colors.text} />
                        <Text style={styles.promptTypeText}>{(p.prompt_type || '').replace(/_/g, ' ')}</Text>
                      </View>
                      <Text style={styles.promptLabel} numberOfLines={1}>{p.label}</Text>
                      <Pressable onPress={async () => {
                        const Clipboard = await import('expo-clipboard');
                        await Clipboard.setStringAsync(p.content);
                        Alert.alert('Copied');
                      }} style={styles.promptIcon}>
                        <Ionicons name="copy-outline" size={16} color={colors.primary} />
                      </Pressable>
                      <Pressable onPress={() => {
                        Alert.alert('Delete prompt?', '', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: async () => {
                            try {
                              const token = await (await import('@react-native-async-storage/async-storage')).default.getItem('token');
                              await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/artists/${id}/saved-prompts/${p.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                              setSavedPrompts(savedPrompts.filter((x: any) => x.id !== p.id));
                            } catch {}
                          }}
                        ]);
                      }} style={styles.promptIcon}>
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </Pressable>
                    </View>
                    <Text style={styles.promptContent}>{p.content}</Text>
                    {p.saved_by_name ? <Text style={styles.promptMeta}>Saved by {p.saved_by_name}</Text> : null}
                  </View>
                ))
              )}
            </Card>
          )}

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Info</Text>
            <Input
              label="Artist Name *"
              placeholder="Enter artist name"
              value={form.name}
              onChangeText={(text) => setForm({ ...form, name: text })}
            />
            <Input
              label="Bio"
              placeholder="Artist biography and background"
              value={form.bio}
              onChangeText={(text) => setForm({ ...form, bio: text })}
              multiline
              numberOfLines={3}
            />
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Sound & Identity</Text>
            <Input
              label="Unique Sound"
              placeholder="Describe the artist's signature sound"
              value={form.unique_sound}
              onChangeText={(text) => setForm({ ...form, unique_sound: text })}
              multiline
              numberOfLines={3}
            />
            <Input
              label="Tone"
              placeholder="e.g., Dark, uplifting, introspective"
              value={form.tone}
              onChangeText={(text) => setForm({ ...form, tone: text })}
            />

            <Input
              label="Suno Voice"
              placeholder="Saved voice ID or name for this artist"
              value={form.suno_voice}
              onChangeText={(text) => setForm({ ...form, suno_voice: text })}
            />
            <Input
              label="Default Exclusions Prompt"
              placeholder="What to exclude from generations (e.g., no autotune, no trap beats...)"
              value={form.suno_exclusions}
              onChangeText={(text) => setForm({ ...form, suno_exclusions: text })}
              multiline
              numberOfLines={2}
            />

            <View style={styles.tagSection}>
              <Text style={styles.tagLabel}>Genres</Text>
              <View style={styles.tagInputRow}>
                <Input
                  placeholder="Add genre"
                  value={genreInput}
                  onChangeText={setGenreInput}
                  containerStyle={styles.tagInput}
                  onSubmitEditing={() => addTag('genres', genreInput)}
                />
                <Pressable
                  style={styles.addTagBtn}
                  onPress={() => addTag('genres', genreInput)}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.tagList}>
                {form.genres.map((genre, i) => (
                  <Pressable
                    key={i}
                    style={styles.tag}
                    onPress={() => removeTag('genres', i)}
                  >
                    <Text style={styles.tagText}>{genre}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.tagSection}>
              <Text style={styles.tagLabel}>Themes</Text>
              <View style={styles.tagInputRow}>
                <Input
                  placeholder="Add theme"
                  value={themeInput}
                  onChangeText={setThemeInput}
                  containerStyle={styles.tagInput}
                  onSubmitEditing={() => addTag('themes', themeInput)}
                />
                <Pressable
                  style={styles.addTagBtn}
                  onPress={() => addTag('themes', themeInput)}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.tagList}>
                {form.themes.map((theme, i) => (
                  <Pressable
                    key={i}
                    style={styles.tag}
                    onPress={() => removeTag('themes', i)}
                  >
                    <Text style={styles.tagText}>{theme}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.tagSection}>
              <Text style={styles.tagLabel}>Patterns</Text>
              <View style={styles.tagInputRow}>
                <Input
                  placeholder="Add pattern"
                  value={patternInput}
                  onChangeText={setPatternInput}
                  containerStyle={styles.tagInput}
                  onSubmitEditing={() => addTag('patterns', patternInput)}
                />
                <Pressable
                  style={styles.addTagBtn}
                  onPress={() => addTag('patterns', patternInput)}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.tagList}>
                {form.patterns.map((pattern, i) => (
                  <Pressable
                    key={i}
                    style={styles.tag}
                    onPress={() => removeTag('patterns', i)}
                  >
                    <Text style={styles.tagText}>{pattern}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            </View>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Branding & Visuals</Text>
            <Input
              label="Visual Style"
              placeholder="e.g., Minimalist, cyberpunk, vintage"
              value={form.branding.visual_style}
              onChangeText={(text) => setForm({ ...form, branding: { ...form.branding, visual_style: text } })}
            />
            <Input
              label="Aesthetic"
              placeholder="Overall aesthetic direction"
              value={form.branding.aesthetic}
              onChangeText={(text) => setForm({ ...form, branding: { ...form.branding, aesthetic: text } })}
            />

            <View style={styles.tagSection}>
              <Text style={styles.tagLabel}>Mood Keywords</Text>
              <View style={styles.tagInputRow}>
                <Input
                  placeholder="Add mood keyword"
                  value={moodInput}
                  onChangeText={setMoodInput}
                  containerStyle={styles.tagInput}
                  onSubmitEditing={() => addTag('mood_keywords', moodInput)}
                />
                <Pressable
                  style={styles.addTagBtn}
                  onPress={() => addTag('mood_keywords', moodInput)}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.tagList}>
                {form.branding.mood_keywords.map((mood, i) => (
                  <Pressable
                    key={i}
                    style={styles.tag}
                    onPress={() => removeTag('mood_keywords', i)}
                  >
                    <Text style={styles.tagText}>{mood}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            </View>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Visual Identity Brief</Text>
            <Text style={styles.briefDesc}>
              This brief helps collaborators understand the artist's visual direction
            </Text>
            <Input
              label="Visual Brief"
              placeholder="Describe the overall visual direction, character model look, color themes, video aesthetics..."
              value={form.visual_brief}
              onChangeText={(text) => setForm({ ...form, visual_brief: text })}
              multiline
              numberOfLines={5}
            />
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Input
              placeholder="Additional notes about this artist"
              value={form.notes}
              onChangeText={(text) => setForm({ ...form, notes: text })}
              multiline
              numberOfLines={4}
            />
          </Card>

          {!isNew && (
            <Pressable style={styles.briefBtn} onPress={() => router.push(`/artist/brief/${id}`)}>
              <Ionicons name="document-text" size={20} color={colors.text} />
              <Text style={styles.briefBtnText}>View Artist Brief</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          )}

          {!isNew && (
            <Card style={styles.section}>
              <CollabComments targetType="artist" targetId={id!} />
            </Card>
          )}

          <Button
            title={isNew ? 'Create Artist' : 'Save Changes'}
            onPress={handleSave}
            loading={saving}
            style={styles.saveBtn}
          />

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backBtn: {
    padding: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start' },
  galleryDesc: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 17 },
  galleryScroll: { marginTop: spacing.sm },
  galleryItem: { marginRight: spacing.sm, position: 'relative' },
  galleryImg: { width: 100, height: 130, borderRadius: 12, backgroundColor: colors.surfaceLight },
  galleryRemove: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  galleryAdd: { width: 100, height: 130, borderRadius: 12, backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, marginRight: spacing.sm, gap: 4 },
  galleryAddText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  assistantBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.primary },
  assistantBtnText: { fontSize: 11, fontWeight: '600', color: colors.text },
  emptyPrompts: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  emptyPromptsText: { fontSize: 12, color: colors.textMuted, textAlign: 'center', maxWidth: 260, lineHeight: 17 },
  promptItem: { backgroundColor: colors.surfaceLight, borderRadius: 10, padding: spacing.sm, marginBottom: spacing.sm },
  promptHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  promptTypeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.primary, gap: 3 },
  promptTypeText: { fontSize: 9, fontWeight: '700', color: colors.text, textTransform: 'uppercase' },
  promptLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.text },
  promptIcon: { padding: 4 },
  promptContent: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  promptMeta: { fontSize: 10, color: colors.textMuted, marginTop: 4, fontStyle: 'italic' },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  songRowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  songRowMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },
  tagSection: {
    marginTop: spacing.sm,
  },
  tagLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  tagInput: {
    flex: 1,
    marginBottom: 0,
  },
  addTagBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  tagText: {
    fontSize: 13,
    color: colors.text,
  },
  saveBtn: {
    marginTop: spacing.md,
  },
  bottomPadding: {
    height: 40,
  },
  imageSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  profileImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  profilePlaceholder: {
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageButtons: {
    flex: 1,
    gap: spacing.sm,
  },
  imgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    gap: spacing.sm,
  },
  imgBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  briefDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  briefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.sm,
  },
  briefBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
});
