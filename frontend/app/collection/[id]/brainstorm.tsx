import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { colors, spacing } from '../../../src/utils/theme';
import { safeGoBack } from '../../../src/utils/nav';

const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || "https://artist-catalog-pro.emergent.host");

type Message = {
  role: 'user' | 'assistant';
  content: string;
  mode?: string;
  timestamp?: string;
  user_name?: string;
  parsed_song_starters?: any[];
  parsed_roster_matches?: any[];
  parsed_youtube_visual?: any;
  parsed_song_full?: any;
};

const MODES: { id: string; label: string; icon: any; tip: string }[] = [
  { id: 'song_starters', label: '20 starters', icon: 'sparkles', tip: 'Generate 15-25 song concept starters' },
  { id: 'expand_song', label: 'Full song', icon: 'document-text', tip: 'Full lyrics + style (1-2 max per call)' },
  { id: 'match_roster', label: 'Roster match', icon: 'people', tip: 'Which roster artists fit this playlist?' },
  { id: 'youtube_visual', label: 'YT visual', icon: 'videocam', tip: 'Canva-ready looping visual brief' },
];

export default function BrainstormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [coll, setColl] = useState<any>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [savedStarters, setSavedStarters] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<string>('freeform');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const authFetch = async (path: string, options: RequestInit = {}) => {
    const token = await AsyncStorage.getItem('token');
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [collRes, chatRes] = await Promise.all([
        authFetch(`/api/collections/${id}`),
        authFetch(`/api/collections/${id}/brainstorm`),
      ]);
      if (collRes.ok) setColl(await collRes.json());
      if (chatRes.ok) {
        const data = await chatRes.json();
        setHistory(data.chat || []);
        setSavedStarters(data.song_starters || []);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [history.length]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    // Optimistic user message
    setHistory(prev => [...prev, { role: 'user', content: text, mode }]);

    try {
      const res = await authFetch(`/api/collections/${id}/brainstorm`, {
        method: 'POST',
        body: JSON.stringify({ message: text, mode }),
      });
      if (!res.ok) throw new Error('Failed');
      // Reload full history to get parsed structures
      await load();
    } catch (e) {
      Alert.alert('Error', 'Brainstorm send failed');
      setHistory(prev => prev.slice(0, -1));
    } finally {
      setSending(false);
      setMode('freeform'); // Reset mode after each send so user has to opt in again
    }
  };

  const saveStarter = async (starter: any) => {
    try {
      const res = await authFetch(`/api/collections/${id}/brainstorm/save-song`, {
        method: 'POST',
        body: JSON.stringify({
          title: starter.title || 'Untitled Idea',
          concept: starter.concept || '',
          suno_style: starter.suno_style || '',
          suggested_artist: starter.suggested_artist || '',
          lyrics: starter.lyrics || '',
        }),
      });
      if (res.ok) {
        Alert.alert('Saved', `"${starter.title}" added as a draft song in this playlist.`);
        await load();
      }
    } catch {
      Alert.alert('Error', 'Could not save song');
    }
  };

  const saveFullSong = async (full: any) => {
    if (!full?.title) return;
    await saveStarter({
      title: full.title,
      concept: 'Full song from brainstorm',
      suno_style: full.suno_style,
      lyrics: full.lyrics,
    });
  };

  const copyMessage = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Message copied to clipboard');
  };

  const clearChat = () => {
    Alert.alert('Clear brainstorm?', 'This deletes all messages for this playlist.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        await authFetch(`/api/collections/${id}/brainstorm`, { method: 'DELETE' });
        setHistory([]);
        setSavedStarters([]);
      }},
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => safeGoBack(`/collection/${id}`)} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>Brainstorm</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{coll?.title || ''}</Text>
        </View>
        <Pressable onPress={clearChat} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="trash-outline" size={20} color={colors.error} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
        >
          {history.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="bulb-outline" size={42} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Persistent playlist workspace</Text>
              <Text style={styles.emptyText}>
                Brainstorm song ideas, lyrics, roster matches, and visuals for{' '}
                <Text style={{ color: colors.primary }}>{coll?.title || 'this playlist'}</Text>.
                Everything you and the AI generate stays saved here — never lose work again.
              </Text>
              <View style={styles.exampleList}>
                <Text style={styles.exampleTitle}>Try:</Text>
                <Text style={styles.exampleItem}>• "Brown Sugar movie soundtrack — give me 20 song starters"</Text>
                <Text style={styles.exampleItem}>• "Which roster artists could fit this vibe?"</Text>
                <Text style={styles.exampleItem}>• "Write full lyrics for the first 2 songs"</Text>
              </View>
            </View>
          )}

          {history.map((msg, idx) => (
            <View key={idx} style={[styles.msgRow, msg.role === 'user' ? styles.msgRight : styles.msgLeft]}>
              <View style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
                {msg.role === 'assistant' && msg.mode && msg.mode !== 'freeform' && (
                  <View style={styles.modeBadge}>
                    <Text style={styles.modeBadgeText}>{MODES.find(m => m.id === msg.mode)?.label || msg.mode}</Text>
                  </View>
                )}
                <Text style={[styles.msgText, msg.role === 'user' && styles.msgTextUser]}>{msg.content}</Text>

                {/* Song starters */}
                {msg.parsed_song_starters && msg.parsed_song_starters.length > 0 && (
                  <View style={styles.parsedBlock}>
                    <Text style={styles.parsedTitle}>🎵 Song Starters ({msg.parsed_song_starters.length})</Text>
                    {msg.parsed_song_starters.map((s, i) => (
                      <View key={i} style={styles.starterCard}>
                        <Text style={styles.starterTitle}>{s.title || 'Untitled'}</Text>
                        {s.concept ? <Text style={styles.starterConcept}>{s.concept}</Text> : null}
                        {s.suggested_artist && s.suggested_artist !== 'open' ? (
                          <Text style={styles.starterMeta}>→ Suggested: {s.suggested_artist}</Text>
                        ) : null}
                        {s.suno_style ? (
                          <Text style={styles.starterStyle} numberOfLines={2}>Suno: {s.suno_style}</Text>
                        ) : null}
                        <Pressable style={styles.saveBtn} onPress={() => saveStarter(s)}>
                          <Ionicons name="add-circle" size={16} color={colors.primary} />
                          <Text style={styles.saveBtnText}>Save as draft song</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                {/* Roster matches */}
                {msg.parsed_roster_matches && msg.parsed_roster_matches.length > 0 && (
                  <View style={styles.parsedBlock}>
                    <Text style={styles.parsedTitle}>🎤 Roster Matches</Text>
                    {msg.parsed_roster_matches.map((r, i) => (
                      <View key={i} style={styles.starterCard}>
                        <View style={styles.rosterHeader}>
                          <Text style={styles.starterTitle}>{r.artist}</Text>
                          <View style={[styles.fitBadge, r.fit_score === 'high' && styles.fitHigh, r.fit_score === 'medium' && styles.fitMed]}>
                            <Text style={styles.fitText}>{r.fit_score || 'fit'}</Text>
                          </View>
                        </View>
                        {r.why ? <Text style={styles.starterConcept}>{r.why}</Text> : null}
                        {r.song_ideas?.map((song: any, si: number) => (
                          <View key={si} style={styles.subSong}>
                            <Text style={styles.subSongTitle}>· {song.title}</Text>
                            <Pressable
                              style={styles.miniSaveBtn}
                              onPress={() => saveStarter({ ...song, suggested_artist: r.artist })}
                            >
                              <Ionicons name="add" size={14} color={colors.primary} />
                              <Text style={styles.miniSaveText}>Save</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}

                {/* YouTube visual */}
                {msg.parsed_youtube_visual && Object.keys(msg.parsed_youtube_visual).length > 0 && (
                  <View style={styles.parsedBlock}>
                    <Text style={styles.parsedTitle}>🎬 YouTube Visual Brief</Text>
                    <View style={styles.starterCard}>
                      {msg.parsed_youtube_visual.scene_description ? (
                        <Text style={styles.starterConcept}>{msg.parsed_youtube_visual.scene_description}</Text>
                      ) : null}
                      {msg.parsed_youtube_visual.motion_elements?.length > 0 && (
                        <Text style={styles.starterMeta}>Motion: {msg.parsed_youtube_visual.motion_elements.join(' • ')}</Text>
                      )}
                      {msg.parsed_youtube_visual.canva_search_terms?.length > 0 && (
                        <Text style={styles.starterStyle}>Canva search: {msg.parsed_youtube_visual.canva_search_terms.join(', ')}</Text>
                      )}
                      <Pressable
                        style={styles.saveBtn}
                        onPress={() => copyMessage(JSON.stringify(msg.parsed_youtube_visual, null, 2))}
                      >
                        <Ionicons name="copy-outline" size={16} color={colors.primary} />
                        <Text style={styles.saveBtnText}>Copy full brief</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Full song from expand_song mode */}
                {msg.parsed_song_full && msg.parsed_song_full.title && (
                  <View style={styles.parsedBlock}>
                    <Text style={styles.parsedTitle}>📝 Full Song</Text>
                    <View style={styles.starterCard}>
                      <Text style={styles.starterTitle}>{msg.parsed_song_full.title}</Text>
                      {msg.parsed_song_full.suno_style ? (
                        <Text style={styles.starterStyle}>Style: {msg.parsed_song_full.suno_style}</Text>
                      ) : null}
                      <Pressable style={styles.saveBtn} onPress={() => saveFullSong(msg.parsed_song_full)}>
                        <Ionicons name="add-circle" size={16} color={colors.primary} />
                        <Text style={styles.saveBtnText}>Save full song to playlist</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {msg.role === 'assistant' && (
                  <Pressable style={styles.copyBtn} onPress={() => copyMessage(msg.content)} hitSlop={8}>
                    <Ionicons name="copy-outline" size={14} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            </View>
          ))}

          {sending && (
            <View style={[styles.msgRow, styles.msgLeft]}>
              <View style={[styles.bubble, styles.bubbleAI, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.msgText}>Thinking…</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Mode chips */}
        <View style={styles.modeChips}>
          {MODES.map(m => (
            <Pressable
              key={m.id}
              style={[styles.modeChip, mode === m.id && styles.modeChipActive]}
              onPress={() => setMode(mode === m.id ? 'freeform' : m.id)}
            >
              <Ionicons name={m.icon} size={13} color={mode === m.id ? colors.text : colors.primary} />
              <Text style={[styles.modeChipText, mode === m.id && styles.modeChipTextActive]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
        {mode !== 'freeform' && (
          <Text style={styles.modeHint}>{MODES.find(m => m.id === mode)?.tip}</Text>
        )}

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Brainstorm with the AI…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
            onSubmitEditing={send}
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!input.trim() || sending}
          >
            <Ionicons name="send" size={18} color={colors.text} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted },
  chatContent: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  emptyState: { paddingVertical: spacing.xl, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 12 },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.md, lineHeight: 19 },
  exampleList: { marginTop: spacing.md, alignSelf: 'stretch', backgroundColor: colors.surface, padding: spacing.md, borderRadius: 12 },
  exampleTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 6 },
  exampleItem: { fontSize: 12, color: colors.textSecondary, lineHeight: 19 },
  msgRow: { flexDirection: 'row', marginBottom: 8 },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '90%', padding: 12, borderRadius: 16, gap: 8, position: 'relative' },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  msgText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  msgTextUser: { color: colors.text },
  modeBadge: { alignSelf: 'flex-start', backgroundColor: colors.primary + '30', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  modeBadgeText: { fontSize: 10, color: colors.primary, fontWeight: '700', textTransform: 'uppercase' },
  parsedBlock: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border + '60', paddingTop: 10, gap: 6 },
  parsedTitle: { fontSize: 13, fontWeight: '700', color: colors.primary },
  starterCard: { backgroundColor: colors.background, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, gap: 4 },
  starterTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  starterConcept: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  starterMeta: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  starterStyle: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.primary + '20', alignSelf: 'flex-start' },
  saveBtnText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  rosterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fitBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.surfaceLight },
  fitHigh: { backgroundColor: colors.success + '40' },
  fitMed: { backgroundColor: colors.warning + '40' },
  fitText: { fontSize: 10, fontWeight: '700', color: colors.text, textTransform: 'uppercase' },
  subSong: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  subSongTitle: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  miniSaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.primary + '20' },
  miniSaveText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  copyBtn: { position: 'absolute', top: 6, right: 6, padding: 4 },
  modeChips: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 6, flexWrap: 'wrap' },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface },
  modeChipActive: { backgroundColor: colors.primary },
  modeChipText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  modeChipTextActive: { color: colors.text },
  modeHint: { fontSize: 10, color: colors.textMuted, paddingHorizontal: spacing.md, paddingBottom: 4, fontStyle: 'italic' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: spacing.md, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  input: { flex: 1, backgroundColor: colors.surface, color: colors.text, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100, borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});
