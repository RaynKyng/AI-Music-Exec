import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useDataStore } from '../src/stores/dataStore';
import { colors, spacing } from '../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const SUGGESTED_PROMPTS = [
  { icon: 'sparkles', text: 'Help me brainstorm a new artist concept' },
  { icon: 'create', text: 'Write lyrics in my voice for a song about heartbreak' },
  { icon: 'color-palette', text: 'Suggest visual branding for my latest artist' },
  { icon: 'rocket', text: 'Plan a release strategy for my upcoming EP' },
  { icon: 'musical-notes', text: 'Generate 3 Suno style prompts for a moody pop track' },
  { icon: 'videocam', text: 'Pitch a music video concept I can take to Sora' },
];

export default function AssistantScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ artistId?: string; songId?: string; prefill?: string; sourceLabel?: string }>();
  const { artists, songs, fetchArtists, fetchSongs } = useDataStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [linkedArtistId, setLinkedArtistId] = useState<string | null>(params.artistId || null);
  const [linkedSongId, setLinkedSongId] = useState<string | null>(params.songId || null);
  const [showContext, setShowContext] = useState(false);
  const [sourceLabel, setSourceLabel] = useState<string | null>(params.sourceLabel || null);
  const scrollRef = useRef<ScrollView>(null);
  const prefillApplied = useRef(false);

  useEffect(() => {
    fetchArtists();
    fetchSongs();
  }, []);

  // Apply prefill from route params (e.g. "Discuss with AI" from Idea screen).
  // Only runs once per mount so navigating back doesn't re-overwrite user edits.
  useEffect(() => {
    if (prefillApplied.current) return;
    if (params.prefill && typeof params.prefill === 'string' && params.prefill.length > 0) {
      setInput(params.prefill);
      prefillApplied.current = true;
    }
  }, [params.prefill]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: messageText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/ai/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: messageText,
          artist_id: linkedArtistId,
          song_id: linkedSongId,
          session_id: sessionId,
        }),
      });
      if (!res.ok) {
        // Try to surface a friendlier message for known failure modes
        let detail = '';
        try {
          const errBody = await res.json();
          detail = (errBody?.detail || '').toString();
        } catch {}
        const lower = detail.toLowerCase();
        const isBudget =
          lower.includes('budget') ||
          lower.includes('credit') ||
          lower.includes('quota') ||
          lower.includes('insufficient') ||
          lower.includes('exhausted') ||
          lower.includes('rate limit') ||
          lower.includes('429');
        if (isBudget) {
          Alert.alert(
            'AI Credits Exhausted',
            'Your Emergent LLM key has run out of credits. Top up your key from your Emergent profile (Universal Key) and try again.'
          );
        } else if (res.status === 503) {
          Alert.alert('AI Not Configured', 'The AI service is not set up. Please contact support.');
        } else {
          Alert.alert('AI Unavailable', detail || 'AI is unavailable. Try again in a moment.');
        }
        // Roll back the optimistic user message so they can retry without retyping
        setMessages(prev => prev.filter(m => m.id !== userMsg.id));
        setInput(messageText);
        return;
      }
      const data = await res.json();
      setSessionId(data.session_id);
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e: any) {
      const msg = (e?.message || '').toString().toLowerCase();
      const isBudget = msg.includes('budget') || msg.includes('credit') || msg.includes('quota');
      Alert.alert(
        isBudget ? 'AI Credits Exhausted' : 'Network Error',
        isBudget
          ? 'Your Emergent LLM key has run out of credits. Top it up from your Emergent profile.'
          : 'Could not reach the AI service. Check your connection and try again.'
      );
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
      setInput(messageText);
    } finally {
      setSending(false);
    }
  };

  const copyMessage = async (content: string) => {
    await Clipboard.setStringAsync(content);
    Alert.alert('Copied', 'Message copied to clipboard');
  };

  const saveToSong = async (content: string) => {
    if (!linkedSongId) {
      Alert.alert('No Song Linked', 'Link a song from the context picker above to save prompts.');
      return;
    }
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/songs/${linkedSongId}/saved-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prompt_type: 'assistant_chat',
          label: `Chat ${new Date().toLocaleDateString()}`,
          content,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      Alert.alert('Saved', 'Prompt saved to song profile');
    } catch {
      Alert.alert('Error', 'Could not save');
    }
  };

  const clearChat = () => {
    Alert.alert('Start Over', 'Clear this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { setMessages([]); setSessionId(null); } },
    ]);
  };

  const linkedArtist = linkedArtistId ? artists.find(a => a.id === linkedArtistId) : null;
  const linkedSong = linkedSongId ? songs.find(s => s.id === linkedSongId) : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Creative Assistant</Text>
          <Text style={styles.subtitle}>Your 360° AI music exec</Text>
        </View>
        <Pressable onPress={clearChat} style={styles.iconBtn}>
          <Ionicons name="refresh" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Context picker */}
      <Pressable style={styles.contextBar} onPress={() => setShowContext(!showContext)}>
        <Ionicons name={(linkedArtist || linkedSong) ? 'link' : 'link-outline'} size={16} color={colors.primary} />
        <Text style={styles.contextText} numberOfLines={1}>
          {linkedArtist ? `Artist: ${linkedArtist.name}` : ''}
          {linkedArtist && linkedSong ? ' • ' : ''}
          {linkedSong ? `Song: ${linkedSong.title}` : ''}
          {!linkedArtist && !linkedSong ? 'Tap to link an artist or song for deeper context' : ''}
        </Text>
        <Ionicons name={showContext ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
      </Pressable>

      {showContext && (
        <View style={styles.contextPanel}>
          <Text style={styles.contextLabel}>Link Artist</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <Pressable style={[styles.chip, !linkedArtistId && styles.chipActive]} onPress={() => setLinkedArtistId(null)}>
              <Text style={[styles.chipText, !linkedArtistId && styles.chipTextActive]}>None</Text>
            </Pressable>
            {artists.map(a => (
              <Pressable key={a.id} style={[styles.chip, linkedArtistId === a.id && styles.chipActive]} onPress={() => setLinkedArtistId(a.id)}>
                <Text style={[styles.chipText, linkedArtistId === a.id && styles.chipTextActive]}>{a.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.contextLabel}>Link Song</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            <Pressable style={[styles.chip, !linkedSongId && styles.chipActive]} onPress={() => setLinkedSongId(null)}>
              <Text style={[styles.chipText, !linkedSongId && styles.chipTextActive]}>None</Text>
            </Pressable>
            {songs.slice(0, 30).map(s => (
              <Pressable key={s.id} style={[styles.chip, linkedSongId === s.id && styles.chipActive]} onPress={() => setLinkedSongId(s.id)}>
                <Text style={[styles.chipText, linkedSongId === s.id && styles.chipTextActive]} numberOfLines={1}>{s.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {sourceLabel ? (
        <View style={styles.sourceBanner}>
          <Ionicons name="bulb" size={14} color={colors.primary} />
          <Text style={styles.sourceBannerText} numberOfLines={1}>Loaded from: {sourceLabel}</Text>
          <Pressable hitSlop={8} onPress={() => setSourceLabel(null)}>
            <Ionicons name="close" size={14} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ScrollView ref={scrollRef} style={styles.messagesScroll} contentContainerStyle={styles.messagesContent}>
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="sparkles" size={36} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>What are we working on today?</Text>
              <Text style={styles.emptyDesc}>I’ve learned your roster, songs, and writing style. Brainstorm, expand ideas, or polish anything.</Text>
              <View style={styles.suggestedGrid}>
                {SUGGESTED_PROMPTS.map((p, i) => (
                  <Pressable key={i} style={styles.suggestedCard} onPress={() => sendMessage(p.text)}>
                    <Ionicons name={p.icon as any} size={18} color={colors.primary} />
                    <Text style={styles.suggestedText}>{p.text}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            messages.map(msg => (
              <View key={msg.id} style={[styles.message, msg.role === 'user' ? styles.userMsg : styles.aiMsg]}>
                <Text style={[styles.msgText, msg.role === 'user' ? styles.userText : styles.aiText]}>{msg.content}</Text>
                {msg.role === 'assistant' && (
                  <View style={styles.msgActions}>
                    <Pressable onPress={() => copyMessage(msg.content)} style={styles.msgAction}>
                      <Ionicons name="copy-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.msgActionText}>Copy</Text>
                    </Pressable>
                    {linkedSongId && (
                      <Pressable onPress={() => saveToSong(msg.content)} style={styles.msgAction}>
                        <Ionicons name="bookmark-outline" size={14} color={colors.primary} />
                        <Text style={[styles.msgActionText, { color: colors.primary }]}>Save to Song</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            ))
          )}
          {sending && (
            <View style={[styles.message, styles.aiMsg]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Ask anything… brainstorm, write, plan…"
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
          />
          <Pressable
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || sending}>
            <Ionicons name="send" size={20} color={colors.text} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerCenter: { flex: 1, alignItems: 'center' },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  contextBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  sourceBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.primary + '15', borderBottomWidth: 1, borderBottomColor: colors.primary + '30' },
  sourceBannerText: { flex: 1, fontSize: 12, color: colors.primary, fontWeight: '500' },
  contextText: { flex: 1, fontSize: 12, color: colors.textSecondary },
  contextPanel: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  contextLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginTop: 6, marginBottom: 6, textTransform: 'uppercase' },
  chipScroll: { maxHeight: 40 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.surfaceLight, marginRight: 8, maxWidth: 200 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: colors.text },
  messagesScroll: { flex: 1 },
  messagesContent: { padding: spacing.md, paddingBottom: spacing.lg },
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: spacing.lg },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: spacing.xl },
  suggestedGrid: { width: '100%', gap: spacing.sm },
  suggestedCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  suggestedText: { flex: 1, fontSize: 13, color: colors.text },
  message: { padding: spacing.md, borderRadius: 16, marginBottom: spacing.sm, maxWidth: '92%' },
  userMsg: { backgroundColor: colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiMsg: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  msgText: { fontSize: 14, lineHeight: 20 },
  userText: { color: colors.text },
  aiText: { color: colors.text },
  msgActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  msgAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  msgActionText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: spacing.sm, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 22, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text, fontSize: 14, maxHeight: 120, minHeight: 44 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});
