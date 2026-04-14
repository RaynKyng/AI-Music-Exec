import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../src/stores/dataStore';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { colors, spacing } from '../../src/utils/theme';
import { Artist } from '../../src/types';

export default function ArtistDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { artists, createArtist, updateArtist, fetchArtists } = useDataStore();
  
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
  }, [id]);

  const loadArtist = async () => {
    await fetchArtists();
    const artist = artists.find(a => a.id === id);
    if (artist) {
      setForm({
        name: artist.name,
        bio: artist.bio,
        unique_sound: artist.unique_sound,
        genres: artist.genres,
        themes: artist.themes,
        tone: artist.tone,
        patterns: artist.patterns,
        branding: artist.branding,
        image_url: artist.image_url,
        notes: artist.notes,
      });
    }
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
      router.back();
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{isNew ? 'New Artist' : 'Edit Artist'}</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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
                <TouchableOpacity
                  style={styles.addTagBtn}
                  onPress={() => addTag('genres', genreInput)}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.tagList}>
                {form.genres.map((genre, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.tag}
                    onPress={() => removeTag('genres', i)}
                  >
                    <Text style={styles.tagText}>{genre}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
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
                <TouchableOpacity
                  style={styles.addTagBtn}
                  onPress={() => addTag('themes', themeInput)}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.tagList}>
                {form.themes.map((theme, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.tag}
                    onPress={() => removeTag('themes', i)}
                  >
                    <Text style={styles.tagText}>{theme}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
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
                <TouchableOpacity
                  style={styles.addTagBtn}
                  onPress={() => addTag('patterns', patternInput)}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.tagList}>
                {form.patterns.map((pattern, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.tag}
                    onPress={() => removeTag('patterns', i)}
                  >
                    <Text style={styles.tagText}>{pattern}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
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
                <TouchableOpacity
                  style={styles.addTagBtn}
                  onPress={() => addTag('mood_keywords', moodInput)}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.tagList}>
                {form.branding.mood_keywords.map((mood, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.tag}
                    onPress={() => removeTag('mood_keywords', i)}
                  >
                    <Text style={styles.tagText}>{mood}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
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
});
