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
import { CollabComments } from '../../src/components/CollabComments';
import { colors, spacing, statusColors } from '../../src/utils/theme';
import { Song } from '../../src/types';

const STATUS_OPTIONS = ['draft', 'in_progress', 'final', 'released'];
const VERSION_TYPES = ['primary', 'secondary', 'alternate'];

export default function SongDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { songs, artists, createSong, updateSong, addSongVersion, addSunoGeneration, deleteSunoGeneration, deleteSongVersion, fetchSongs, fetchArtists } = useDataStore();
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showSunoModal, setShowSunoModal] = useState(false);
  const [form, setForm] = useState({
    title: '',
    artist_id: null as string | null,
    featured_artist_ids: [] as string[],
    collection_id: null as string | null,
    lyrics: '',
    authorship: 'original' as string,
    style_prompt: '',
    style_secondary: '',
    style_alternate: '',
    exclusions: '',
    genre: '',
    mood: '',
    tempo: '',
    themes: [] as string[],
    status: 'draft' as Song['status'],
    notes: '',
    todo: [] as string[],
    versions: [] as Song['versions'],
    suno_generations: [] as any[],
    saved_prompts: [] as any[],
    track_number: 0,
  });
  
  const [collections, setCollections] = useState<any[]>([]);
  const [themeInput, setThemeInput] = useState('');
  const [todoInput, setTodoInput] = useState('');
  const [newVersion, setNewVersion] = useState({
    version_type: 'primary' as 'primary' | 'secondary' | 'alternate',
    version_label: '',
    is_assigned: false,
    assigned_artist_id: null as string | null,
    audio_url: '',
    suno_link: '',
    suno_voice: '',
    exclusions_prompt: '',
    style_prompt_used: '',
    notes: '',
  });

  useEffect(() => {
    fetchArtists();
    loadCollections();
    if (!isNew && id) {
      loadSong();
    }
  }, [id]);

  const loadCollections = async () => {
    try {
      const token = await (await import('@react-native-async-storage/async-storage')).default.getItem('token');
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/collections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCollections(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  };

  const loadSong = async () => {
    try {
      const token = await (await import('@react-native-async-storage/async-storage')).default.getItem('token');
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/songs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setLoading(false);
        Alert.alert('Song unavailable', 'This song could not be loaded. It may have been deleted or you don\u2019t have access to it.', [
          { text: 'Go back', onPress: () => router.back() },
        ]);
        return;
      }
      const song = await res.json();
      setForm({
        title: song.title || '',
        artist_id: song.artist_id || null,
        featured_artist_ids: song.featured_artist_ids || [],
        collection_id: song.collection_id || null,
        lyrics: song.lyrics || '',
        authorship: song.authorship || 'original',
        style_prompt: song.style_prompt || '',
        style_secondary: song.style_secondary || '',
        style_alternate: song.style_alternate || '',
        exclusions: song.exclusions || '',
        genre: song.genre || '',
        mood: song.mood || '',
        tempo: song.tempo || '',
        themes: song.themes || [],
        status: song.status || 'draft',
        notes: song.notes || '',
        todo: song.todo || [],
        versions: song.versions || [],
        suno_generations: song.suno_generations || [],
        saved_prompts: song.saved_prompts || [],
        track_number: song.track_number || 0,
      });
    } catch (e) {
      console.error('Failed to load song:', e);
      Alert.alert('Network error', 'Could not load song. Please check your connection.');
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
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
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
              <Pressable
                style={[
                  styles.artistChip,
                  !form.artist_id && styles.artistChipActive,
                ]}
                onPress={() => setForm({ ...form, artist_id: null })}
              >
                <Text style={[styles.artistChipText, !form.artist_id && styles.artistChipTextActive]}>
                  Unassigned
                </Text>
              </Pressable>
              {artists.map((artist) => (
                <Pressable
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
                </Pressable>
              ))}
            </ScrollView>

            {/* Featured Artists */}
            <Text style={styles.label}>Featured Artists</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.artistScroll}>
              {artists.filter(a => a.id !== form.artist_id).map((artist) => {
                const isFeatured = form.featured_artist_ids.includes(artist.id);
                return (
                  <Pressable key={artist.id}
                    style={[styles.artistChip, isFeatured && { backgroundColor: colors.warning }]}
                    onPress={() => {
                      if (isFeatured) {
                        setForm({ ...form, featured_artist_ids: form.featured_artist_ids.filter(id => id !== artist.id) });
                      } else {
                        setForm({ ...form, featured_artist_ids: [...form.featured_artist_ids, artist.id] });
                      }
                    }}>
                    <Text style={[styles.artistChipText, isFeatured && styles.artistChipTextActive]}>{artist.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {form.featured_artist_ids.length > 0 && (
              <Text style={styles.featLabel}>
                ft. {form.featured_artist_ids.map(id => artists.find(a => a.id === id)?.name).filter(Boolean).join(', ')}
              </Text>
            )}

            {/* Collection picker */}
            <Text style={styles.label}>Release / Project</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.artistScroll}>
              <Pressable style={[styles.artistChip, !form.collection_id && styles.artistChipActive]}
                onPress={() => setForm({ ...form, collection_id: null })}>
                <Text style={[styles.artistChipText, !form.collection_id && styles.artistChipTextActive]}>None</Text>
              </Pressable>
              {collections.map((c) => (
                <Pressable key={c.id} style={[styles.artistChip, form.collection_id === c.id && styles.artistChipActive]}
                  onPress={() => setForm({ ...form, collection_id: c.id })}>
                  <Text style={[styles.artistChipText, form.collection_id === c.id && styles.artistChipTextActive]}>
                    {c.title} ({c.collection_type})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {form.collection_id && (
              <Input label="Track Number" placeholder="e.g., 1, 2, 3..." value={String(form.track_number || '')}
                onChangeText={(t) => setForm({ ...form, track_number: parseInt(t) || 0 })} keyboardType="numeric" />
            )}

            <Text style={styles.label}>Status</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((status) => (
                <Pressable
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
                </Pressable>
              ))}
            </View>
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Lyrics</Text>
            <View style={styles.authorshipRow}>
              <Text style={styles.authorshipLabel}>Authorship:</Text>
              {[
                { key: 'original', label: 'I wrote it', icon: 'person' },
                { key: 'collab', label: 'AI co-write', icon: 'people' },
                { key: 'ai_generated', label: 'AI-generated', icon: 'sparkles' },
              ].map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => setForm({ ...form, authorship: opt.key })}
                  style={[styles.authorshipChip, form.authorship === opt.key && styles.authorshipChipActive]}>
                  <Ionicons name={opt.icon as any} size={12} color={form.authorship === opt.key ? colors.text : colors.textSecondary} />
                  <Text style={[styles.authorshipChipText, form.authorship === opt.key && styles.authorshipChipTextActive]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
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
            <Text style={styles.sectionTitle}>Song Styles</Text>
            <View style={styles.styleCard}>
              <View style={styles.styleHeader}>
                <View style={[styles.styleBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.styleBadgeText}>PRIMARY</Text>
                </View>
              </View>
              <Input
                placeholder="Primary style prompt for Suno..."
                value={form.style_prompt}
                onChangeText={(text) => setForm({ ...form, style_prompt: text })}
                multiline
                numberOfLines={3}
              />
            </View>
            <View style={styles.styleCard}>
              <View style={styles.styleHeader}>
                <View style={[styles.styleBadge, { backgroundColor: colors.secondary }]}>
                  <Text style={styles.styleBadgeText}>SECONDARY</Text>
                </View>
              </View>
              <Input
                placeholder="Secondary style direction..."
                value={form.style_secondary}
                onChangeText={(text) => setForm({ ...form, style_secondary: text })}
                multiline
                numberOfLines={3}
              />
            </View>
            <View style={styles.styleCard}>
              <View style={styles.styleHeader}>
                <View style={[styles.styleBadge, { backgroundColor: colors.warning }]}>
                  <Text style={styles.styleBadgeText}>ALTERNATIVE</Text>
                </View>
              </View>
              <Input
                placeholder="Alternative style option..."
                value={form.style_alternate}
                onChangeText={(text) => setForm({ ...form, style_alternate: text })}
                multiline
                numberOfLines={3}
              />
            </View>
            <Input
              label="Exclusions Prompt"
              placeholder="What to exclude (e.g., no autotune, no trap beats...)"
              value={form.exclusions}
              onChangeText={(text) => setForm({ ...form, exclusions: text })}
              multiline
              numberOfLines={2}
            />
          </Card>

          <Card style={styles.section}>
            <Text style={styles.sectionTitle}>Metadata</Text>
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
                <Pressable style={styles.addTagBtn} onPress={addTheme}>
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.tagList}>
                {form.themes.map((theme, i) => (
                  <Pressable key={i} style={styles.tag} onPress={() => removeTheme(i)}>
                    <Text style={styles.tagText}>{theme}</Text>
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            </View>
          </Card>

          {!isNew && (
            <Card style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Versions ({form.versions.length})</Text>
                <Pressable
                  style={styles.addVersionBtn}
                  onPress={() => setShowVersionModal(true)}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
              </View>

              {/* Assigned Version */}
              {form.versions.filter(v => v.is_assigned || v.version_type === 'primary').length > 0 && (
                <View style={styles.versionGroup}>
                  <View style={styles.versionGroupHeader}>
                    <Ionicons name="star" size={14} color={colors.success} />
                    <Text style={styles.versionGroupTitle}>Assigned</Text>
                  </View>
                  {form.versions.filter(v => v.is_assigned || v.version_type === 'primary').map((version, i) => (
                    <View key={version.id || i} style={[styles.versionItem, styles.assignedVersion]}>
                      <View style={styles.versionRow}>
                        <View style={[styles.versionBadge, { backgroundColor: colors.success }]}>
                          <Text style={styles.versionBadgeText}>{version.version_label || version.version_type}</Text>
                        </View>
                        {version.suno_link ? <Text style={styles.versionLink} numberOfLines={1}>{version.suno_link}</Text> : null}
                        <Pressable onPress={() => {
                          Alert.alert('Delete', 'Remove this version?', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteSongVersion(id!, version.id).then(loadSong) },
                          ]);
                        }}>
                          <Ionicons name="trash-outline" size={16} color={colors.error} />
                        </Pressable>
                      </View>
                      {(version as any).suno_voice ? <Text style={styles.versionMeta}>Voice: {(version as any).suno_voice}</Text> : null}
                      {(version as any).style_prompt_used ? <Text style={styles.versionMeta}>Style: {(version as any).style_prompt_used}</Text> : null}
                      {version.notes ? <Text style={styles.versionNotes}>{version.notes}</Text> : null}
                    </View>
                  ))}
                </View>
              )}

              {/* Alternate Versions */}
              {form.versions.filter(v => !v.is_assigned && v.version_type !== 'primary').length > 0 && (
                <View style={styles.versionGroup}>
                  <View style={styles.versionGroupHeader}>
                    <Ionicons name="git-branch" size={14} color={colors.warning} />
                    <Text style={styles.versionGroupTitle}>Alternates / Renditions</Text>
                  </View>
                  {form.versions.filter(v => !v.is_assigned && v.version_type !== 'primary').map((version, i) => (
                    <View key={version.id || i} style={[styles.versionItem, styles.alternateVersion]}>
                      <View style={styles.versionRow}>
                        <View style={[styles.versionBadge, { backgroundColor: version.version_type === 'secondary' ? colors.secondary : colors.warning }]}>
                          <Text style={styles.versionBadgeText}>{version.version_label || version.version_type}</Text>
                        </View>
                        {version.assigned_artist_id && version.assigned_artist_id !== form.artist_id && (
                          <View style={styles.altArtistBadge}>
                            <Ionicons name="person" size={10} color={colors.primary} />
                            <Text style={styles.altArtistText}>
                              {artists.find(a => a.id === version.assigned_artist_id)?.name || 'Other'}
                            </Text>
                          </View>
                        )}
                        <Pressable onPress={() => {
                          Alert.alert('Delete', 'Remove this version?', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => deleteSongVersion(id!, version.id).then(loadSong) },
                          ]);
                        }}>
                          <Ionicons name="trash-outline" size={16} color={colors.error} />
                        </Pressable>
                      </View>
                      {version.suno_link ? <Text style={styles.versionLink} numberOfLines={1}>{version.suno_link}</Text> : null}
                      {version.notes ? <Text style={styles.versionNotes}>{version.notes}</Text> : null}
                    </View>
                  ))}
                </View>
              )}

              {form.versions.length === 0 && (
                <Text style={styles.noVersions}>No versions yet. Add primary and alternate renditions.</Text>
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
              <Pressable style={styles.addTagBtn} onPress={addTodo}>
                <Ionicons name="add" size={20} color={colors.text} />
              </Pressable>
            </View>
            {form.todo.map((item, i) => (
              <Pressable key={i} style={styles.todoItem} onPress={() => removeTodo(i)}>
                <Ionicons name="checkbox-outline" size={20} color={colors.warning} />
                <Text style={styles.todoText}>{item}</Text>
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </Pressable>
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

          {!isNew && (
            <>
              {/* Suno Generations Section */}
              <Card style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Suno Generations ({form.suno_generations?.length || 0})</Text>
                  <Pressable style={styles.addVersionBtn} onPress={() => setShowSunoModal(true)}>
                    <Ionicons name="add" size={20} color={colors.text} />
                  </Pressable>
                </View>
                {(form.suno_generations || []).map((gen: any, i: number) => (
                  <View key={gen.id || i} style={styles.sunoItem}>
                    <View style={styles.sunoHeader}>
                      <Ionicons name="link" size={16} color={colors.primary} />
                      <Text style={styles.sunoUrl} numberOfLines={1}>{gen.suno_url || 'No URL'}</Text>
                      {gen.is_favorite && <Ionicons name="star" size={16} color={colors.warning} />}
                      <Pressable onPress={() => {
                        Alert.alert('Delete', 'Remove this generation?', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deleteSunoGeneration(id!, gen.id).then(loadSong) },
                        ]);
                      }}>
                        <Ionicons name="trash-outline" size={16} color={colors.error} />
                      </Pressable>
                    </View>
                    {gen.prompt_used ? <Text style={styles.sunoPrompt} numberOfLines={2}>Prompt: {gen.prompt_used}</Text> : null}
                    {gen.notes ? <Text style={styles.sunoNotes} numberOfLines={1}>{gen.notes}</Text> : null}
                    {gen.rating > 0 && (
                      <View style={styles.ratingRow}>
                        {[1,2,3,4,5].map(s => (
                          <Ionicons key={s} name={s <= gen.rating ? 'star' : 'star-outline'} size={14} color={colors.warning} />
                        ))}
                      </View>
                    )}
                  </View>
                ))}
                {(!form.suno_generations || form.suno_generations.length === 0) && (
                  <Text style={styles.noVersions}>No Suno generations tracked yet</Text>
                )}
              </Card>

              {/* Collaboration Notes */}
              <Card style={styles.section}>
                <CollabComments targetType="song" targetId={id!} />
              </Card>

              {/* AI Prompts Gallery */}
              <Card style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>AI Prompts Gallery ({form.saved_prompts?.length || 0})</Text>
                    <Text style={styles.sectionSub}>Suno styles, video storyboards, and chat outputs saved here.</Text>
                  </View>
                  <Pressable style={styles.assistantBtn} onPress={() => router.push(`/assistant?songId=${id}`)}>
                    <Ionicons name="sparkles" size={14} color={colors.text} />
                    <Text style={styles.assistantBtnText}>Assistant</Text>
                  </Pressable>
                </View>

                {form.saved_prompts?.length === 0 ? (
                  <View style={styles.emptyPrompts}>
                    <Ionicons name="bookmark-outline" size={28} color={colors.textMuted} />
                    <Text style={styles.emptyPromptsText}>No saved prompts yet. Generate one in the AI tab or chat with the Assistant and tap "Save to Song".</Text>
                  </View>
                ) : (
                  form.saved_prompts.map((p: any, i: number) => (
                    <View key={p.id || i} style={styles.promptItem}>
                      <View style={styles.promptHeader}>
                        <View style={[styles.promptTypeBadge, p.prompt_type === 'video_storyboard' && { backgroundColor: '#EF4444' }, p.prompt_type === 'suno_style' && { backgroundColor: colors.secondary }]}>
                          <Ionicons name={p.prompt_type === 'video_storyboard' ? 'videocam' : p.prompt_type === 'suno_style' ? 'musical-note' : 'sparkles'} size={12} color={colors.text} />
                          <Text style={styles.promptTypeText}>{p.prompt_type?.replace(/_/g, ' ') || 'prompt'}</Text>
                        </View>
                        <Text style={styles.promptLabel}>{p.label}</Text>
                        <Pressable onPress={async () => {
                          const Clipboard = await import('expo-clipboard');
                          await Clipboard.setStringAsync(p.content);
                          Alert.alert('Copied', 'Prompt copied');
                        }} style={styles.promptIcon}>
                          <Ionicons name="copy-outline" size={16} color={colors.primary} />
                        </Pressable>
                        <Pressable onPress={() => {
                          Alert.alert('Delete prompt?', '', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: async () => {
                              try {
                                const token = await (await import('@react-native-async-storage/async-storage')).default.getItem('token');
                                await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/songs/${id}/saved-prompts/${p.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                                setForm({ ...form, saved_prompts: form.saved_prompts.filter((x: any) => x.id !== p.id) });
                              } catch {}
                            }}
                          ]);
                        }} style={styles.promptIcon}>
                          <Ionicons name="trash-outline" size={16} color={colors.error} />
                        </Pressable>
                      </View>
                      <Text style={styles.promptContent} numberOfLines={6}>{p.content}</Text>
                      {p.saved_by_name ? <Text style={styles.promptMeta}>Saved by {p.saved_by_name}</Text> : null}
                    </View>
                  ))
                )}
              </Card>

              {/* Quick Actions */}
              <View style={styles.actionRow}>
                <Pressable style={styles.actionBtn} onPress={() => router.push(`/song/share/${id}`)}>
                  <Ionicons name="share-social" size={22} color={colors.text} />
                  <Text style={styles.actionText}>Share</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: colors.secondary }]} onPress={() => router.push(`/song/distribution/${id}`)}>
                  <Ionicons name="globe" size={22} color={colors.text} />
                  <Text style={styles.actionText}>Distribution</Text>
                </Pressable>
              </View>
            </>
          )}

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
              <Pressable onPress={() => setShowVersionModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <Text style={styles.label}>Version Type</Text>
            <View style={styles.versionTypeRow}>
              {VERSION_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[
                    styles.versionTypeChip,
                    newVersion.version_type === type && styles.versionTypeChipActive,
                  ]}
                  onPress={() => setNewVersion({ ...newVersion, version_type: type as any, is_assigned: type === 'primary' })}
                >
                  <Text
                    style={[
                      styles.versionTypeText,
                      newVersion.version_type === type && styles.versionTypeTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Input
              label="Version Label"
              placeholder="e.g., Original, Acoustic, TikTok Cut, Extended..."
              value={newVersion.version_label}
              onChangeText={(text) => setNewVersion({ ...newVersion, version_label: text })}
            />

            <Pressable
              style={[styles.assignToggle, newVersion.is_assigned && styles.assignToggleActive]}
              onPress={() => setNewVersion({ ...newVersion, is_assigned: !newVersion.is_assigned })}
            >
              <Ionicons name={newVersion.is_assigned ? 'star' : 'star-outline'} size={18} color={newVersion.is_assigned ? colors.text : colors.textSecondary} />
              <Text style={[styles.assignToggleText, newVersion.is_assigned && { color: colors.text }]}>
                {newVersion.is_assigned ? 'Assigned (Primary)' : 'Alternate / Rendition'}
              </Text>
            </Pressable>

            {!newVersion.is_assigned && artists.length > 0 && (
              <>
                <Text style={styles.label}>Link to Different Artist (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <Pressable style={[styles.versionTypeChip, !newVersion.assigned_artist_id && styles.versionTypeChipActive]}
                    onPress={() => setNewVersion({ ...newVersion, assigned_artist_id: null })}>
                    <Text style={[styles.versionTypeText, !newVersion.assigned_artist_id && styles.versionTypeTextActive]}>Same Artist</Text>
                  </Pressable>
                  {artists.map(a => (
                    <Pressable key={a.id} style={[styles.versionTypeChip, newVersion.assigned_artist_id === a.id && styles.versionTypeChipActive, { marginLeft: 8 }]}
                      onPress={() => setNewVersion({ ...newVersion, assigned_artist_id: a.id })}>
                      <Text style={[styles.versionTypeText, newVersion.assigned_artist_id === a.id && styles.versionTypeTextActive]}>{a.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <Input
              label="Suno Link"
              placeholder="https://suno.com/..."
              value={newVersion.suno_link}
              onChangeText={(text) => setNewVersion({ ...newVersion, suno_link: text })}
            />
            <Input
              label="Suno Voice Used"
              placeholder="e.g., Voice ID or name saved in Suno"
              value={newVersion.suno_voice}
              onChangeText={(text) => setNewVersion({ ...newVersion, suno_voice: text })}
            />
            <Input
              label="Style Prompt Used"
              placeholder="Which style was used? (primary, secondary, alt)"
              value={newVersion.style_prompt_used}
              onChangeText={(text) => setNewVersion({ ...newVersion, style_prompt_used: text })}
            />
            <Input
              label="Exclusions Prompt"
              placeholder="What was excluded from generation?"
              value={newVersion.exclusions_prompt}
              onChangeText={(text) => setNewVersion({ ...newVersion, exclusions_prompt: text })}
              multiline
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

      {/* Suno Generation Modal */}
      <Modal visible={showSunoModal} animationType="slide" transparent onRequestClose={() => setShowSunoModal(false)}>
        <SunoGenModal
          visible={showSunoModal}
          onClose={() => setShowSunoModal(false)}
          onSave={async (gen: any) => {
            if (!id || isNew) return;
            try {
              await addSunoGeneration(id, gen);
              await loadSong();
              setShowSunoModal(false);
            } catch (error) {
              Alert.alert('Error', 'Failed to add generation');
            }
          }}
        />
      </Modal>
    </SafeAreaView>
  );
}

function SunoGenModal({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (gen: any) => void }) {
  const [sunoUrl, setSunoUrl] = useState('');
  const [promptUsed, setPromptUsed] = useState('');
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({ suno_url: sunoUrl, prompt_used: promptUsed, rating, notes, style_tags: '', is_favorite: false });
    setSunoUrl(''); setPromptUsed(''); setRating(0); setNotes('');
    setSaving(false);
  };

  return (
    <View style={sunoStyles.modalContainer}>
      <View style={sunoStyles.modalContent}>
        <View style={sunoStyles.modalHeader}>
          <Text style={sunoStyles.modalTitle}>Add Suno Generation</Text>
          <Pressable onPress={onClose}><Ionicons name="close" size={24} color={colors.text} /></Pressable>
        </View>
        <Input label="Suno URL" placeholder="https://suno.com/song/..." value={sunoUrl} onChangeText={setSunoUrl} autoCapitalize="none" />
        <Input label="Prompt Used" placeholder="The style prompt used for generation" value={promptUsed} onChangeText={setPromptUsed} multiline />
        <Text style={sunoStyles.label}>Rating</Text>
        <View style={sunoStyles.ratingRow}>
          {[1,2,3,4,5].map(s => (
            <Pressable key={s} onPress={() => setRating(s === rating ? 0 : s)}>
              <Ionicons name={s <= rating ? 'star' : 'star-outline'} size={28} color={colors.warning} />
            </Pressable>
          ))}
        </View>
        <Input label="Notes" placeholder="Notes about this generation..." value={notes} onChangeText={setNotes} multiline />
        <Button title="Add Generation" onPress={handleSave} loading={saving} style={sunoStyles.btn} />
      </View>
    </View>
  );
}

const sunoStyles = StyleSheet.create({
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xxl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: '600', color: colors.text },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  ratingRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  btn: { marginTop: spacing.md },
});

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
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.md, gap: spacing.sm },
  sectionSub: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
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
  promptContent: { fontSize: 12, color: colors.textSecondary, lineHeight: 17, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  promptMeta: { fontSize: 10, color: colors.textMuted, marginTop: 4, fontStyle: 'italic' },
  authorshipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  authorshipLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  authorshipChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border },
  authorshipChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  authorshipChipText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  authorshipChipTextActive: { color: colors.text },
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
  featLabel: {
    fontSize: 13,
    color: colors.warning,
    fontWeight: '500',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
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
  styleCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  styleHeader: {
    marginBottom: spacing.xs,
  },
  styleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  styleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
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
  assignedVersion: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  alternateVersion: {
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    opacity: 0.9,
  },
  versionGroup: {
    marginTop: spacing.sm,
  },
  versionGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  versionGroupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  versionMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
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
  altArtistBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
    flex: 1,
  },
  altArtistText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '500',
  },
  assignToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  assignToggleActive: {
    backgroundColor: colors.success,
  },
  assignToggleText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
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
  sunoItem: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sunoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sunoUrl: {
    flex: 1,
    fontSize: 13,
    color: colors.primary,
  },
  sunoPrompt: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  sunoNotes: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  actionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
