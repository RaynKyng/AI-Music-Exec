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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../src/stores/dataStore';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { colors, spacing, statusColors } from '../../src/utils/theme';
import { Song } from '../../src/types';

const STATUS_OPTIONS = ['draft', 'in_progress', 'final', 'released'];
const VERSION_TYPES = ['primary', 'secondary', 'alternate'];

export default function SongDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { songs, artists, createSong, updateSong, addSongVersion, fetchSongs, fetchArtists } = useDataStore();
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [form, setForm] = useState({
    title: '',
    artist_id: null as string | null,
    lyrics: '',
    style_prompt: '',
    genre: '',
    mood: '',
    tempo: '',
    themes: [] as string[],
    status: 'draft' as Song['status'],
    notes: '',
    todo: [] as string[],
    versions: [] as Song['versions'],
  });
  
  const [themeInput, setThemeInput] = useState('');
  const [todoInput, setTodoInput] = useState('');
  const [newVersion, setNewVersion] = useState({
    version_type: 'primary' as 'primary' | 'secondary' | 'alternate',
    audio_url: '',
    suno_link: '',
    notes: '',
  });

  useEffect(() => {
    fetchArtists();
    if (!isNew && id) {
      loadSong();
    }
  }, [id]);

  const loadSong = async () => {
    await fetchSongs();
    const song = songs.find(s => s.id === id);
    if (song) {
      setForm({
        title: song.title,
        artist_id: song.artist_id,
        lyrics: song.lyrics,
        style_prompt: song.style_prompt,
        genre: song.genre,
        mood: song.mood,
        tempo: song.tempo,
        themes: song.themes,
        status: song.status,
        notes: song.notes,
        todo: song.todo,
        versions: song.versions,
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      Alert.alert('Error', 'Please enter a song title');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        await createSong(form);
      } else {
        await updateSong(id!, form);
      }
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save song');
    } finally {
      setSaving(false);
    }
  };

  const handleAddVersion = async () => {
    if (!id || isNew) return;
    try {
      await addSongVersion(id, newVersion);
      await loadSong();
      setShowVersionModal(false);
      setNewVersion({ version_type: 'primary', audio_url: '', suno_link: '', notes: '' });
    } catch (error) {
      Alert.alert('Error', 'Failed to add version');
    }
  };

  const addTheme = () => {
    if (!themeInput.trim()) return;
    setForm({ ...form, themes: [...form.themes, themeInput.trim()] });
    setThemeInput('');
  };

  const addTodo = () => {
    if (!todoInput.trim()) return;
    setForm({ ...form, todo: [...form.todo, todoInput.trim()] });
    setTodoInput('');
  };

  const removeTheme = (index: number) => {
    const updated = [...form.themes];
    updated.splice(index, 1);
    setForm({ ...form, themes: updated });
  };

  const removeTodo = (index: number) => {
    const updated = [...form.todo];
    updated.splice(index, 1);
    setForm({ ...form, todo: updated });
  };

  const getArtistName = (artistId: string | null) => {
    if (!artistId) return 'Select Artist';
    const artist = artists.find(a => a.id === artistId);
    return artist?.name || 'Unknown';
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
        <Text style={styles.title}>{isNew ? 'New Song' : 'Edit Song'}</Text>
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
              label="Song Title *"
              placeholder="Enter song title"
              value={form.title}
              onChangeText={(text) => setForm({ ...form, title: text })}
            />

            <Text style={styles.label}>Artist</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.artistScroll}
            >
              <TouchableOpacity
                style={[
                  styles.artistChip,
                  !form.artist_id && styles.artistChipActive,
                ]}
                onPress={() => setForm({ ...form, artist_id: null })}
              >
                <Text style={[styles.artistChipText, !form.artist_id && styles.artistChipTextActive]}>
                  Unassigned
                </Text>
              </TouchableOpacity>
              {artists.map((artist) => (
                <TouchableOpacity
                  key={artist.id}
                  style={[
                    styles.artistChip,
                    form.artist_id === artist.id && styles.artistChipActive,
                  ]}
                  onPress={() => setForm({ ...form, artist_id: artist.id })}
                >
                  <Text
                    style={[
                      styles.artistChipText,
                      form.artist_id === artist.id && styles.artistChipTextActive,
                    ]}
                  >
                    {artist.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Status</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusChip,
                    form.status === status && {
                      backgroundColor: statusColors[status as keyof typeof statusColors],
                    },
                  ]}
                  onPress={() => setForm({ ...form, status: status as Song['status'] })}
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      form.status === status && styles.statusChipTextActive,
                    ]}
                  >
                    {status.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Lyrics</Text>
            <Input
              placeholder="Enter song lyrics..."
              value={form.lyrics}
              onChangeText={(text) => setForm({ ...form, lyrics: text })}
              multiline
              numberOfLines={10}
              style={styles.lyricsInput}
            />
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Style & Metadata</Text>
            <Input
              label="Style Prompt (Suno Format)"
              placeholder="Genre, mood, instrumentation..."
              value={form.style_prompt}
              onChangeText={(text) => setForm({ ...form, style_prompt: text })}
              multiline
              numberOfLines={3}
            />
            <View style={styles.row}>
              <Input
                label="Genre"
                placeholder="e.g., Lo-fi"
                value={form.genre}
                onChangeText={(text) => setForm({ ...form, genre: text })}
                containerStyle={styles.halfInput}
              />
              <Input
                label="Mood"
                placeholder="e.g., Chill"
                value={form.mood}
                onChangeText={(text) => setForm({ ...form, mood: text })}
                containerStyle={styles.halfInput}
              />
            </View>
            <Input
              label="Tempo"
              placeholder="e.g., Medium, 120 BPM"
              value={form.tempo}
              onChangeText={(text) => setForm({ ...form, tempo: text })}
            />

            <View style={styles.tagSection}>
              <Text style={styles.tagLabel}>Themes</Text>
              <View style={styles.tagInputRow}>
                <Input
                  placeholder="Add theme"
                  value={themeInput}
                  onChangeText={setThemeInput}
                  containerStyle={styles.tagInput}
                  onSubmitEditing={addTheme}
                />
                <TouchableOpacity style={styles.addTagBtn} onPress={addTheme}>
                  <Ionicons name="add" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.tagList}>
                {form.themes.map((theme, i) => (
                  <TouchableOpacity key={i} style={styles.tag} onPress={() => removeTheme(i)}>
                    <Text style={styles.tagText}>{theme}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Card>

          {!isNew && (
            <Card style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Versions ({form.versions.length})</Text>
                <TouchableOpacity
                  style={styles.addVersionBtn}
                  onPress={() => setShowVersionModal(true)}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              {form.versions.map((version, i) => (
                <View key={i} style={styles.versionItem}>
                  <View style={[
                    styles.versionBadge,
                    { backgroundColor: version.version_type === 'primary' ? colors.primary :
                      version.version_type === 'secondary' ? colors.secondary : colors.warning }
                  ]}>
                    <Text style={styles.versionBadgeText}>{version.version_type}</Text>
                  </View>
                  {version.suno_link && (
                    <Text style={styles.versionLink} numberOfLines={1}>{version.suno_link}</Text>
                  )}
                  {version.notes && (
                    <Text style={styles.versionNotes} numberOfLines={2}>{version.notes}</Text>
                  )}
                </View>
              ))}
              {form.versions.length === 0 && (
                <Text style={styles.noVersions}>No versions yet</Text>
              )}
            </Card>
          )}

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>To-Do List</Text>
            <View style={styles.tagInputRow}>
              <Input
                placeholder="Add task"
                value={todoInput}
                onChangeText={setTodoInput}
                containerStyle={styles.tagInput}
                onSubmitEditing={addTodo}
              />
              <TouchableOpacity style={styles.addTagBtn} onPress={addTodo}>
                <Ionicons name="add" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            {form.todo.map((item, i) => (
              <TouchableOpacity key={i} style={styles.todoItem} onPress={() => removeTodo(i)}>
                <Ionicons name="checkbox-outline" size={20} color={colors.warning} />
                <Text style={styles.todoText}>{item}</Text>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Input
              placeholder="Additional notes..."
              value={form.notes}
              onChangeText={(text) => setForm({ ...form, notes: text })}
              multiline
              numberOfLines={4}
            />
          </Card>

          <Button
            title={isNew ? 'Create Song' : 'Save Changes'}
            onPress={handleSave}
            loading={saving}
            style={styles.saveBtn}
          />

          <View style={styles.bottomPadding} />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showVersionModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowVersionModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Version</Text>
              <TouchableOpacity onPress={() => setShowVersionModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Version Type</Text>
            <View style={styles.versionTypeRow}>
              {VERSION_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.versionTypeChip,
                    newVersion.version_type === type && styles.versionTypeChipActive,
                  ]}
                  onPress={() => setNewVersion({ ...newVersion, version_type: type as any })}
                >
                  <Text
                    style={[
                      styles.versionTypeText,
                      newVersion.version_type === type && styles.versionTypeTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              label="Suno Link"
              placeholder="https://suno.com/..."
              value={newVersion.suno_link}
              onChangeText={(text) => setNewVersion({ ...newVersion, suno_link: text })}
            />
            <Input
              label="Audio URL (optional)"
              placeholder="Direct audio link"
              value={newVersion.audio_url}
              onChangeText={(text) => setNewVersion({ ...newVersion, audio_url: text })}
            />
            <Input
              label="Notes"
              placeholder="Version notes..."
              value={newVersion.notes}
              onChangeText={(text) => setNewVersion({ ...newVersion, notes: text })}
              multiline
            />

            <Button title="Add Version" onPress={handleAddVersion} style={styles.modalBtn} />
          </View>
        </View>
      </Modal>
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
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
    fontSize: 14,
    fontWeight: '500',
  },
  artistChipTextActive: {
    color: colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
  },
  statusChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  statusChipTextActive: {
    color: colors.text,
  },
  lyricsInput: {
    minHeight: 200,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfInput: {
    flex: 1,
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
  addVersionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  versionItem: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  versionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: spacing.xs,
  },
  versionBadgeText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  versionLink: {
    fontSize: 12,
    color: colors.primary,
  },
  versionNotes: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  noVersions: {
    fontSize: 14,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    padding: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  todoText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  saveBtn: {
    marginTop: spacing.md,
  },
  bottomPadding: {
    height: 40,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  versionTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  versionTypeChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
  },
  versionTypeChipActive: {
    backgroundColor: colors.primary,
  },
  versionTypeText: {
    color: colors.textSecondary,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  versionTypeTextActive: {
    color: colors.text,
  },
  modalBtn: {
    marginTop: spacing.md,
  },
});
