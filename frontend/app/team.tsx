import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../src/stores/authStore';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Button';
import { colors, spacing } from '../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function TeamScreen() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuthStore();
  const [members, setMembers] = useState<any[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadMembers(); }, []);

  const authFetch = async (path: string, options: RequestInit = {}) => {
    const token = await AsyncStorage.getItem('token');
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
  };

  const loadMembers = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/team/members');
      if (res.ok) setMembers(await res.json());
    } catch {}
    setLoading(false);
  };

  const generateInvite = async () => {
    setBusy(true);
    try {
      const res = await authFetch('/api/team/invite-code', { method: 'POST' });
      if (res.ok) setGeneratedCode(await res.json());
      else Alert.alert('Error', 'Could not generate invite');
    } finally { setBusy(false); }
  };

  const copyCode = async () => {
    if (!generatedCode) return;
    await Clipboard.setStringAsync(generatedCode.code);
    Alert.alert('Copied', 'Invite code copied');
  };

  const joinTeam = async () => {
    if (!joinCode.trim()) { Alert.alert('Error', 'Enter the invite code'); return; }
    setBusy(true);
    try {
      const res = await authFetch('/api/team/join', {
        method: 'POST',
        body: JSON.stringify({ code: joinCode.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Joined!', `You’ve joined ${data.invited_by}’s team. Refreshing…`);
        setJoinCode('');
        if (refreshUser) await refreshUser();
        await loadMembers();
      } else {
        Alert.alert('Error', data.detail || 'Could not join');
      }
    } catch {
      Alert.alert('Error', 'Network error');
    } finally { setBusy(false); }
  };

  const leaveTeam = () => {
    Alert.alert(
      'Leave Team',
      'You’ll go back to your personal solo workspace. Items already in the shared team workspace will stay there.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: async () => {
          setBusy(true);
          try {
            const res = await authFetch('/api/team/leave', { method: 'POST' });
            if (res.ok) {
              if (refreshUser) await refreshUser();
              await loadMembers();
              Alert.alert('Left team', 'You’re back in your personal workspace.');
            }
          } finally { setBusy(false); }
        }},
      ]
    );
  };

  const isOnSharedTeam = members.length > 1 || (user && user.team_id && user.team_id !== user.id);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Team & Workspace</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Profile */}
          <Card style={styles.section}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || '?'}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{user?.name || ''}</Text>
                <Text style={styles.profileEmail}>{user?.email || ''}</Text>
              </View>
            </View>
            <Pressable onPress={async () => { await logout(); router.replace('/'); }} style={styles.logoutRow}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
              <Text style={styles.logoutText}>Sign out</Text>
            </Pressable>
          </Card>

          {/* Members */}
          <Text style={styles.sectionTitle}>Team Members</Text>
          <Card style={styles.section}>
            {loading ? <ActivityIndicator color={colors.primary} /> : (
              members.length === 0 ? (
                <Text style={styles.empty}>No members yet</Text>
              ) : (
                members.map(m => (
                  <View key={m.id} style={styles.memberRow}>
                    <View style={[styles.avatar, styles.avatarSm]}>
                      <Text style={styles.avatarTextSm}>{m.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{m.name} {m.is_self && <Text style={styles.youTag}>(you)</Text>}</Text>
                      <Text style={styles.memberEmail}>{m.email}</Text>
                    </View>
                    <View style={[styles.roleBadge, m.role === 'owner' && styles.roleBadgeOwner]}>
                      <Text style={[styles.roleText, m.role === 'owner' && styles.roleTextOwner]}>{m.role}</Text>
                    </View>
                  </View>
                ))
              )
            )}
          </Card>

          {/* Invite */}
          <Text style={styles.sectionTitle}>Invite a Collaborator</Text>
          <Card style={styles.section}>
            <Text style={styles.desc}>Generate an invite code, share it with your collaborator, and they’ll get access to your full shared catalog.</Text>
            {!generatedCode ? (
              <Button title="Generate Invite Code" onPress={generateInvite} loading={busy} icon={<Ionicons name="add-circle" size={18} color={colors.text} />} />
            ) : (
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Share this code (valid 7 days):</Text>
                <View style={styles.codeRow}>
                  <Text style={styles.codeText}>{generatedCode.code}</Text>
                  <Pressable onPress={copyCode} style={styles.copyBtn}>
                    <Ionicons name="copy" size={18} color={colors.primary} />
                  </Pressable>
                </View>
                <Pressable onPress={generateInvite} style={styles.regenBtn}>
                  <Text style={styles.regenText}>Generate another</Text>
                </Pressable>
              </View>
            )}
          </Card>

          {/* Join */}
          <Text style={styles.sectionTitle}>Join a Team</Text>
          <Card style={styles.section}>
            <Text style={styles.desc}>Got an invite code from someone? Enter it here to join their workspace.</Text>
            <TextInput
              style={styles.codeInput}
              placeholder="6-character code"
              placeholderTextColor={colors.textMuted}
              value={joinCode}
              onChangeText={t => setJoinCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
            />
            <Button title="Join Team" variant="secondary" onPress={joinTeam} loading={busy} disabled={joinCode.length !== 6} />
          </Card>

          {isOnSharedTeam && (
            <Card style={[styles.section, styles.dangerSection]}>
              <Text style={styles.dangerTitle}>Leave Team</Text>
              <Text style={styles.desc}>Return to your private personal workspace. Your existing items stay where they are.</Text>
              <Pressable style={styles.leaveBtn} onPress={leaveTeam}>
                <Ionicons name="exit-outline" size={18} color={colors.error} />
                <Text style={styles.leaveText}>Leave Current Team</Text>
              </Pressable>
            </Card>
          )}

          {/* Trash */}
          <Pressable onPress={() => router.push('/trash')} style={styles.trashRow}>
            <Ionicons name="trash-outline" size={20} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.trashTitle}>Recently Deleted</Text>
              <Text style={styles.trashDesc}>Restore artists, songs, releases, or ideas deleted in the last 30 days.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  scrollContent: { padding: spacing.lg },
  section: { marginBottom: spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.sm },
  desc: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 19 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarSm: { width: 36, height: 36, borderRadius: 18 },
  avatarText: { fontSize: 22, fontWeight: '700', color: colors.text },
  avatarTextSm: { fontSize: 14, fontWeight: '700', color: colors.text },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '600', color: colors.text },
  profileEmail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  logoutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  logoutText: { fontSize: 14, fontWeight: '500', color: colors.error },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '600', color: colors.text },
  youTag: { color: colors.primary, fontSize: 12, fontWeight: '500' },
  memberEmail: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.surfaceLight },
  roleBadgeOwner: { backgroundColor: colors.primary + '30' },
  roleText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' },
  roleTextOwner: { color: colors.primary },
  codeBox: { backgroundColor: colors.surfaceLight, padding: spacing.md, borderRadius: 12 },
  codeLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codeText: { fontSize: 28, fontWeight: '700', color: colors.primary, letterSpacing: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  copyBtn: { padding: spacing.sm },
  regenBtn: { marginTop: spacing.md, alignSelf: 'flex-end' },
  regenText: { fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },
  codeInput: { backgroundColor: colors.surfaceLight, padding: spacing.md, borderRadius: 12, color: colors.text, fontSize: 18, textAlign: 'center', letterSpacing: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: spacing.md },
  dangerSection: { borderWidth: 1, borderColor: colors.error + '40' },
  dangerTitle: { fontSize: 14, fontWeight: '700', color: colors.error, marginBottom: spacing.sm },
  leaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: 12, backgroundColor: colors.error + '15' },
  leaveText: { fontSize: 14, fontWeight: '600', color: colors.error },
  trashRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, marginTop: spacing.sm, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  trashTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 },
  trashDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },
});
