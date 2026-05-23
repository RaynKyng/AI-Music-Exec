import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing } from '../utils/theme';

const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || "https://artist-catalog-pro.emergent.host");
const COMMENT_TYPES = [
  { id: 'note', label: 'Note', icon: 'document-text', color: colors.textSecondary },
  { id: 'visual_suggestion', label: 'Visual', icon: 'color-palette', color: '#EC4899' },
  { id: 'remix_idea', label: 'Remix', icon: 'git-branch', color: '#F59E0B' },
  { id: 'feedback', label: 'Feedback', icon: 'chatbubble', color: '#3B82F6' },
];

interface Props {
  targetType: 'artist' | 'song';
  targetId: string;
}

export const CollabComments: React.FC<Props> = ({ targetType, targetId }) => {
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState('note');
  const [posting, setPosting] = useState(false);

  useEffect(() => { if (targetId) loadComments(); }, [targetId]);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = await AsyncStorage.getItem('token');
    return fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  };

  const loadComments = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/comments?target_type=${targetType}&target_id=${targetId}`);
      const data = await res.json();
      setComments(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  };

  const handlePost = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await authFetch(`${API_URL}/api/comments`, {
        method: 'POST',
        body: JSON.stringify({ target_type: targetType, target_id: targetId, content: newComment, comment_type: commentType }),
      });
      setNewComment('');
      loadComments();
    } catch { Alert.alert('Error', 'Failed to post'); }
    finally { setPosting(false); }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete', 'Delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await authFetch(`${API_URL}/api/comments/${id}`, { method: 'DELETE' });
        loadComments();
      }},
    ]);
  };

  const getTypeInfo = (type: string) => COMMENT_TYPES.find(t => t.id === type) || COMMENT_TYPES[0];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Collaboration Notes</Text>
      <Text style={styles.subtitle}>Leave notes, visual ideas, and remix suggestions</Text>

      {/* Type selector */}
      <View style={styles.typeRow}>
        {COMMENT_TYPES.map(t => (
          <TouchableOpacity key={t.id} style={[styles.typeChip, commentType === t.id && { backgroundColor: t.color }]} onPress={() => setCommentType(t.id)}>
            <Ionicons name={t.icon as any} size={14} color={commentType === t.id ? '#fff' : t.color} />
            <Text style={[styles.typeText, commentType === t.id && { color: '#fff' }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Add a note or suggestion..."
          placeholderTextColor={colors.textMuted}
          value={newComment}
          onChangeText={setNewComment}
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handlePost} disabled={posting || !newComment.trim()}>
          <Ionicons name="send" size={18} color={posting ? colors.textMuted : colors.text} />
        </TouchableOpacity>
      </View>

      {/* Comments list */}
      {comments.map((c) => {
        const typeInfo = getTypeInfo(c.comment_type);
        return (
          <View key={c.id} style={[styles.comment, !c.is_own && styles.collabComment]}>
            <View style={styles.commentHeader}>
              <View style={[styles.commentBadge, { backgroundColor: typeInfo.color + '20' }]}>
                <Ionicons name={typeInfo.icon as any} size={12} color={typeInfo.color} />
                <Text style={[styles.commentBadgeText, { color: typeInfo.color }]}>{typeInfo.label}</Text>
              </View>
              <Text style={styles.commentAuthor}>{c.author_name}</Text>
              {!c.is_own && (
                <View style={styles.collabTag}>
                  <Text style={styles.collabTagText}>Collaborator</Text>
                </View>
              )}
              {c.is_own && (
                <TouchableOpacity onPress={() => handleDelete(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.commentText}>{c.content}</Text>
          </View>
        );
      })}

      {comments.length === 0 && (
        <Text style={styles.emptyText}>No notes yet. Start the conversation!</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: spacing.md },
  title: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.md },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  typeChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surfaceLight, gap: 4 },
  typeText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  inputRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  input: { flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 12, padding: spacing.sm, color: colors.text, fontSize: 14, minHeight: 44, maxHeight: 100, borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  comment: { backgroundColor: colors.surfaceLight, borderRadius: 12, padding: spacing.sm, marginBottom: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.primary },
  collabComment: { borderLeftColor: '#EC4899', backgroundColor: '#EC489910' },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 },
  commentBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, gap: 3 },
  commentBadgeText: { fontSize: 10, fontWeight: '600' },
  commentAuthor: { fontSize: 12, fontWeight: '600', color: colors.text, flex: 1 },
  collabTag: { backgroundColor: '#EC489920', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  collabTagText: { fontSize: 10, fontWeight: '600', color: '#EC4899' },
  commentText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  emptyText: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center', marginTop: spacing.md },
});
