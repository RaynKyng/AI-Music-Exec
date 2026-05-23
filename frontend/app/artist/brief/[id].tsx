import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '../../../src/components/Card';
import { colors, spacing } from '../../../src/utils/theme';

const API_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || "https://artist-catalog-pro.emergent.host");

export default function ArtistBriefScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id) loadBrief(); }, [id]);

  const loadBrief = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/artists/${id}/identity-package`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setData(json);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}><Text style={styles.errorText}>Artist not found</Text></View>
      </SafeAreaView>
    );
  }

  const identity = data.identity;
  const catalog = data.catalog_summary;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Artist Brief</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Hero Section */}
        <View style={styles.hero}>
          {identity.profile_image ? (
            <Image source={{ uri: identity.profile_image }} style={styles.profileImg} />
          ) : (
            <View style={[styles.profileImg, styles.profilePlaceholder]}>
              <Text style={styles.profileInitial}>{identity.name?.charAt(0)?.toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.artistName}>{identity.name}</Text>
          {identity.genres?.length > 0 && (
            <Text style={styles.genreText}>{identity.genres.join(' \u2022 ')}</Text>
          )}
        </View>

        {/* Sound Identity */}
        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="musical-notes" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>Sound Identity</Text>
          </View>
          {identity.unique_sound ? (
            <Text style={styles.briefText}>{identity.unique_sound}</Text>
          ) : null}
          <View style={styles.pillRow}>
            {identity.tone ? <View style={styles.pill}><Text style={styles.pillText}>Tone: {identity.tone}</Text></View> : null}
            {identity.themes?.map((t: string, i: number) => (
              <View key={i} style={styles.pill}><Text style={styles.pillText}>{t}</Text></View>
            ))}
          </View>
        </Card>

        {/* Visual Direction */}
        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="color-palette" size={20} color={colors.secondary} />
            <Text style={styles.sectionTitle}>Visual Direction</Text>
          </View>
          {identity.visual_brief ? (
            <Text style={styles.briefText}>{identity.visual_brief}</Text>
          ) : (
            <Text style={styles.emptyNote}>No visual brief yet - add one to guide visual collaborators</Text>
          )}
          <View style={styles.visualGrid}>
            {identity.visual_style ? (
              <View style={styles.visualItem}>
                <Text style={styles.visualLabel}>Style</Text>
                <Text style={styles.visualValue}>{identity.visual_style}</Text>
              </View>
            ) : null}
            {identity.aesthetic ? (
              <View style={styles.visualItem}>
                <Text style={styles.visualLabel}>Aesthetic</Text>
                <Text style={styles.visualValue}>{identity.aesthetic}</Text>
              </View>
            ) : null}
          </View>
          {identity.mood_keywords?.length > 0 && (
            <View style={styles.moodSection}>
              <Text style={styles.moodLabel}>Mood Keywords</Text>
              <View style={styles.pillRow}>
                {identity.mood_keywords.map((m: string, i: number) => (
                  <View key={i} style={[styles.pill, { backgroundColor: colors.secondary + '20' }]}>
                    <Text style={[styles.pillText, { color: colors.secondary }]}>{m}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {identity.color_palette?.length > 0 && (
            <View style={styles.paletteSection}>
              <Text style={styles.moodLabel}>Color Palette</Text>
              <View style={styles.paletteRow}>
                {identity.color_palette.map((c: string, i: number) => (
                  <View key={i} style={[styles.colorSwatch, { backgroundColor: c }]}>
                    <Text style={styles.colorText}>{c}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Card>

        {/* Catalog Summary */}
        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="albums" size={20} color={colors.warning} />
            <Text style={styles.sectionTitle}>Catalog</Text>
          </View>
          <View style={styles.catalogStats}>
            <View style={styles.catalogStat}>
              <Text style={styles.catalogNum}>{catalog.total_songs}</Text>
              <Text style={styles.catalogLabel}>Songs</Text>
            </View>
            <View style={styles.catalogStat}>
              <Text style={styles.catalogNum}>{catalog.collections?.length || 0}</Text>
              <Text style={styles.catalogLabel}>Releases</Text>
            </View>
          </View>
          {catalog.genres?.length > 0 && (
            <View style={styles.pillRow}>
              {catalog.genres.map((g: string, i: number) => (
                <View key={i} style={styles.pill}><Text style={styles.pillText}>{g}</Text></View>
              ))}
            </View>
          )}
          {catalog.collections?.length > 0 && (
            <View style={styles.collectionsList}>
              {catalog.collections.map((c: any) => (
                <View key={c.id} style={styles.collectionItem}>
                  {c.cover ? (
                    <Image source={{ uri: c.cover }} style={styles.collCover} />
                  ) : (
                    <View style={[styles.collCover, styles.collCoverPlaceholder]}>
                      <Ionicons name="albums" size={16} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.collInfo}>
                    <Text style={styles.collTitle}>{c.title}</Text>
                    <Text style={styles.collType}>{c.type}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        <View style={styles.footer}>
          <Ionicons name="musical-notes" size={16} color={colors.textMuted} />
          <Text style={styles.footerText}>Artist Brief - {identity.name}</Text>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  backBtn: { padding: spacing.sm },
  headerTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  placeholder: { width: 40 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: colors.textSecondary, fontSize: 16 },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  // Hero
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  profileImg: { width: 120, height: 120, borderRadius: 60 },
  profilePlaceholder: { backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  profileInitial: { fontSize: 48, fontWeight: '700', color: colors.text },
  artistName: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: spacing.md },
  genreText: { fontSize: 14, color: colors.primary, marginTop: spacing.xs },
  // Sections
  section: { marginBottom: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  briefText: { fontSize: 15, color: colors.text, lineHeight: 22, marginBottom: spacing.md },
  emptyNote: { fontSize: 14, color: colors.textMuted, fontStyle: 'italic', marginBottom: spacing.md },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: { backgroundColor: colors.surfaceLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  pillText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  // Visual
  visualGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  visualItem: { flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 8, padding: spacing.sm },
  visualLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  visualValue: { fontSize: 15, color: colors.text, marginTop: 4 },
  moodSection: { marginTop: spacing.md },
  moodLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  paletteSection: { marginTop: spacing.md },
  paletteRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  colorSwatch: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  colorText: { fontSize: 8, color: '#fff', fontWeight: '600' },
  // Catalog
  catalogStats: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  catalogStat: { alignItems: 'center' },
  catalogNum: { fontSize: 24, fontWeight: '700', color: colors.text },
  catalogLabel: { fontSize: 12, color: colors.textSecondary },
  collectionsList: { marginTop: spacing.md },
  collectionItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  collCover: { width: 40, height: 40, borderRadius: 6 },
  collCoverPlaceholder: { backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  collInfo: { flex: 1 },
  collTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  collType: { fontSize: 12, color: colors.textMuted },
  // Footer
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  footerText: { fontSize: 12, color: colors.textMuted },
  bottomPadding: { height: 40 },
});
