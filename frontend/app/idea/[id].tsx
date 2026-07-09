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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useDataStore } from '../../src/stores/dataStore';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { colors, spacing, ideaTypeColors } from '../../src/utils/theme';
import { safeGoBack } from '../../src/utils/nav';
import { Idea } from '../../src/types';
import { api, formatApiError } from '../../src/utils/api';

const IDEA_TYPES = ['spark', 'concept', 'lyrics', 'melody', 'style', 'visual'];

export default function IdeaDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { ideas, artists, songs, createIdea, updateIdea, fetchIdeas, fetchArtists, fetchSongs } = useDataStore();
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);
  const [form, setForm] = useState({
    title: '',
    content: '',
    type: 'spark' as Idea['type'],
    tags: [] as string[],
    linked_artist_id: null as string | null,
    linked_song_id: null as string | null,
  });
  
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    fetchArtists();
    fetchSongs();
    if (!isNew && id) {
      loadIdea();
    }
  }, [id]);

  const loadIdea = async () => {
  setLoading(true);
  try {
    const res = await api.get(`/api/ideas/${id}`);
    const idea = res.data;

    setForm({
      title: idea.title || '',
      content: idea.content || '',
      type: idea.type || 'spark',
      tags: idea.tags || [],
      linked_artist_id: idea.linked_artist_id || null,
      linked_song_id: idea.linked_song_id || null,
    });
  } catch (error: any) {
    Alert.alert('Network error', formatApiError(error, `/api/ideas/${id}`));
  } finally {
    setLoading(false);
  }
};

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        await createIdea(form);
      } else {
        await updateIdea(id!, form);
      }
      safeGoBack('/ideas');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save idea');
    } finally {
      setSaving(false);
    }
  };

  const addTag = () => {
    if (!tagInput.trim()) return;
    setForm({ ...form, tags: [...form.tags, tagInput.trim()] });
    setTagInput('');
  };

  const removeTag = (index: number) => {
    const updated = [...form.tags];
    updated.splice(index, 1);
    setForm({ ...form, tags: updated });
  };

  const buildAIPrompt = () => {
    // Compose a clean, well-structured pre-filled message for the AI Assistant.
    const lines: string[] = [];
    lines.push(`I want to develop this ${form.type} idea further:\n`);
    if (form.title) lines.push(`Title: ${form.title}`);
    if (form.content) lines.push(`\n${form.content}`);
    if (form.tags.length > 0) lines.push(`\nTags: ${form.tags.map(t => `#${t}`).join(' ')}`);
    const linkedArtist = form.linked_artist_id ? artists.find(a => a.id === form.linked_artist_id) : null;
    const linkedSong = form.linked_song_id ? songs.find(s => s.id === form.linked_song_id) : null;
    if (linkedArtist) lines.push(`\nLinked artist: ${linkedArtist.name}`);
    if (linkedSong) lines.push(`Linked song: ${linkedSong.title}`);
    lines.push('\nWhat are some directions I could take this? Suggest concrete next steps.');
    return lines.join('\n');
  };

  const discussWithAI = () => {
    if (!form.title.trim() && !form.content.trim()) {
      Alert.alert('Add some content', 'Add a title or some content before discussing with AI.');
      return;
    }
    const prefill = buildAIPrompt();
    router.push({
      pathname: '/assistant',
      params: {
        prefill,
        sourceLabel: form.title || 'Untitled idea',
        artistId: form.linked_artist_id || undefined,
        songId: form.linked_song_id || undefined,
      } as any,
    });
  };

  const copyContent = async () => {
    if (!form.content.trim()) {
      Alert.alert('Nothing to copy', 'There is no content in this idea yet.');
      return;
    }
    await Clipboard.setStringAsync(form.content);
    Alert.alert('Copied', 'Idea content copied to clipboard.');
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack('/ideas')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{isNew ? 'New Idea' : 'Edit Idea'}</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Idea Type</Text>
            <View style={styles.typeGrid}>
              {IDEA_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[
                    styles.typeChip,
                    form.type === type && {
                      backgroundColor: ideaTypeColors[type as keyof typeof ideaTypeColors],
                    },
                  ]}
                  onPress={() => setForm({ ...form, type: type as Idea['type'] })}
                >
                  <Ionicons
                    name={
                      type === 'spark' ? 'flash' :
                      type === 'concept' ? 'bulb' :
                      type === 'lyrics' ? 'text' :
                      type === 'melody' ? 'musical-notes' :
                      type === 'style' ? 'color-palette' : 'image'
                    }
                    size={20}
                    color={form.type === type ? colors.text : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeText,
                      form.type === type && styles.typeTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>

          <Card style={styles.section}>
            <View style={styles.detailsHeader}>
              <Text style={styles.sectionTitle}>Details</Text>
              <View style={styles.detailsHeaderActions}>
                {form.content ? (
                  <Pressable onPress={copyContent} style={styles.iconAction} hitSlop={6} accessibilityLabel="Copy idea content">
                    <Ionicons name="copy-outline" size={16} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setContentExpanded(!contentExpanded)}
                  style={styles.iconAction}
                  hitSlop={6}
                  accessibilityLabel={contentExpanded ? 'Collapse content' : 'Expand content'}
                >
                  <Ionicons
                    name={contentExpanded ? 'contract-outline' : 'expand-outline'}
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.iconActionText}>{contentExpanded ? 'Collapse' : 'Expand'}</Text>
                </Pressable>
              </View>
            </View>
            <Input
              label="Title *"
              placeholder="What's the idea?"
              value={form.title}
              onChangeText={(text) => setForm({ ...form, title: text })}
            />
            <Input
              label="Content"
              placeholder="Capture your thoughts, lyrics, melodies..."
              value={form.content}
              onChangeText={(text) => setForm({ ...form, content: text })}
              multiline
              numberOfLines={contentExpanded ? 20 : 8}
              style={contentExpanded ? styles.contentInputExpanded : styles.contentInput}
            />
            <Pressable onPress={discussWithAI} style={styles.aiBtn} accessibilityLabel="Discuss this idea with AI">
              <Ionicons name="sparkles" size={16} color={colors.text} />
              <Text style={styles.aiBtnText}>Discuss with AI</Text>
            </Pressable>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Tags</Text>
            <View style={styles.tagInputRow}>
              <Input
                placeholder="Add tag"
                value={tagInput}
                onChangeText={setTagInput}
                containerStyle={styles.tagInput}
                onSubmitEditing={addTag}
              />
              <Pressable style={styles.addTagBtn} onPress={addTag}>
                <Ionicons name="add" size={20} color={colors.text} />
              </Pressable>
            </View>
            <View style={styles.tagList}>
              {form.tags.map((tag, i) => (
                <Pressable key={i} style={styles.tag} onPress={() => removeTag(i)}>
                  <Text style={styles.tagText}>#{tag}</Text>
                  <Ionicons name="close" size={14} color={colors.textSecondary} />
                </Pressable>
              ))}
            </View>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Link to Artist (Optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Pressable
                style={[
                  styles.linkChip,
                  !form.linked_artist_id && styles.linkChipActive,
                ]}
                onPress={() => setForm({ ...form, linked_artist_id: null })}
              >
                <Text style={[styles.linkText, !form.linked_artist_id && styles.linkTextActive]}>
                  None
                </Text>
              </Pressable>
              {artists.map((artist) => (
                <Pressable
                  key={artist.id}
                  style={[
                    styles.linkChip,
                    form.linked_artist_id === artist.id && styles.linkChipActive,
                  ]}
                  onPress={() => setForm({ ...form, linked_artist_id: artist.id })}
                >
                  <Text
                    style={[
                      styles.linkText,
                      form.linked_artist_id === artist.id && styles.linkTextActive,
                    ]}
                  >
                    {artist.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Link to Song (Optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Pressable
                style={[
                  styles.linkChip,
                  !form.linked_song_id && styles.linkChipActive,
                ]}
                onPress={() => setForm({ ...form, linked_song_id: null })}
              >
                <Text style={[styles.linkText, !form.linked_song_id && styles.linkTextActive]}>
                  None
                </Text>
              </Pressable>
              {songs.map((song) => (
                <Pressable
                  key={song.id}
                  style={[
                    styles.linkChip,
                    form.linked_song_id === song.id && styles.linkChipActive,
                  ]}
                  onPress={() => setForm({ ...form, linked_song_id: song.id })}
                >
                  <Text
                    style={[
                      styles.linkText,
                      form.linked_song_id === song.id && styles.linkTextActive,
                    ]}
                  >
                    {song.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Card>

          <Button
            title={isNew ? 'Save Idea' : 'Update Idea'}
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.surfaceLight,
    gap: spacing.xs,
  },
  typeText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  typeTextActive: {
    color: colors.text,
  },
  contentInput: {
    minHeight: 150,
  },
  contentInputExpanded: {
    minHeight: 400,
    textAlignVertical: 'top',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  detailsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
  },
  iconActionText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.sm,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  aiBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
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
  linkChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    marginRight: spacing.sm,
  },
  linkChipActive: {
    backgroundColor: colors.primary,
  },
  linkText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  linkTextActive: {
    color: colors.text,
  },
  saveBtn: {
    marginTop: spacing.md,
  },
  bottomPadding: {
    height: 40,
  },
});
