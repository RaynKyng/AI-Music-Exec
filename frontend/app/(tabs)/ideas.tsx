import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../src/stores/dataStore';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { SearchBar } from '../../src/components/SearchBar';
import { colors, spacing, ideaTypeColors } from '../../src/utils/theme';
import { confirmDestructive } from '../../src/utils/confirm';
import { Idea } from '../../src/types';

const IDEA_TYPES = ['all', 'spark', 'concept', 'lyrics', 'melody', 'style', 'visual'];

export default function IdeasScreen() {
  const router = useRouter();
  const { ideas, fetchIdeas, createIdea, deleteIdea, isLoading } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [newIdea, setNewIdea] = useState({ title: '', content: '', type: 'spark' });
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchIdeas();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchIdeas(typeFilter === 'all' ? undefined : typeFilter, search || undefined);
    setRefreshing(false);
  };

  const filteredIdeas = typeFilter === 'all'
    ? ideas
    : ideas.filter(i => i.type === typeFilter);

  const handleCreateIdea = async () => {
    if (!newIdea.title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    setCreating(true);
    try {
      await createIdea({
        title: newIdea.title,
        content: newIdea.content,
        type: newIdea.type as Idea['type'],
        tags: [],
      });
      setModalVisible(false);
      setNewIdea({ title: '', content: '', type: 'spark' });
    } catch (error) {
      Alert.alert('Error', 'Failed to create idea');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (idea: Idea) => {
    confirmDestructive(`Delete "${idea.title}"?`, 'Delete Idea').then(async (ok) => {
      if (!ok) return;
      try {
        await deleteIdea(idea.id);
      } catch (error) {
        Alert.alert('Error', 'Failed to delete idea');
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ideas</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={(text) => { setSearch(text); fetchIdeas(typeFilter === 'all' ? undefined : typeFilter, text || undefined); }} placeholder="Search ideas..." />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContainer}
      >
        {IDEA_TYPES.map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.filterChip,
              typeFilter === type && styles.filterChipActive,
              typeFilter === type && type !== 'all' && {
                backgroundColor: ideaTypeColors[type as keyof typeof ideaTypeColors],
              },
            ]}
            onPress={() => setTypeFilter(type)}
          >
            <Text
              style={[
                styles.filterText,
                typeFilter === type && styles.filterTextActive,
              ]}
            >
              {type === 'all' ? 'All' : type}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {filteredIdeas.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bulb-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No Ideas Yet</Text>
            <Text style={styles.emptyText}>
              Capture your sparks of inspiration here
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setModalVisible(true)}
            >
              <Ionicons name="add" size={20} color={colors.text} />
              <Text style={styles.emptyButtonText}>Quick Capture</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredIdeas.map((idea) => (
            <Card
              key={idea.id}
              style={styles.ideaCard}
              onPress={() => router.push(`/idea/${idea.id}`)}
            >
              <View style={styles.ideaHeader}>
                <View
                  style={[
                    styles.typeBadge,
                    { backgroundColor: ideaTypeColors[idea.type as keyof typeof ideaTypeColors] + '20' },
                  ]}
                >
                  <Ionicons
                    name={
                      idea.type === 'spark' ? 'flash' :
                      idea.type === 'concept' ? 'bulb' :
                      idea.type === 'lyrics' ? 'text' :
                      idea.type === 'melody' ? 'musical-notes' :
                      idea.type === 'style' ? 'color-palette' : 'image'
                    }
                    size={14}
                    color={ideaTypeColors[idea.type as keyof typeof ideaTypeColors]}
                  />
                  <Text
                    style={[
                      styles.typeText,
                      { color: ideaTypeColors[idea.type as keyof typeof ideaTypeColors] },
                    ]}
                  >
                    {idea.type}
                  </Text>
                </View>
                <View dataSet={{ stopParent: 'true' }}>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={(e: any) => {
                    e?.stopPropagation?.();
                    handleDelete(idea);
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.ideaTitle}>{idea.title}</Text>
              {idea.content && (
                <Text style={styles.ideaContent} numberOfLines={3}>
                  {idea.content}
                </Text>
              )}
              {idea.tags.length > 0 && (
                <View style={styles.tagsRow}>
                  {idea.tags.slice(0, 4).map((tag, i) => (
                    <View key={i} style={styles.tag}>
                      <Text style={styles.tagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quick Capture</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Input
              label="Title"
              placeholder="What's the idea?"
              value={newIdea.title}
              onChangeText={(text) => setNewIdea({ ...newIdea, title: text })}
            />

            <Input
              label="Details"
              placeholder="Capture your thoughts..."
              value={newIdea.content}
              onChangeText={(text) => setNewIdea({ ...newIdea, content: text })}
              multiline
              numberOfLines={4}
            />

            <Text style={styles.typeLabel}>Type</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.typeScroll}
            >
              {IDEA_TYPES.slice(1).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeOption,
                    newIdea.type === type && {
                      backgroundColor: ideaTypeColors[type as keyof typeof ideaTypeColors],
                    },
                  ]}
                  onPress={() => setNewIdea({ ...newIdea, type })}
                >
                  <Text
                    style={[
                      styles.typeOptionText,
                      newIdea.type === type && styles.typeOptionTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Button
              title="Save Idea"
              onPress={handleCreateIdea}
              loading={creating}
              style={styles.saveButton}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  filterScroll: {
    maxHeight: 50,
  },
  filterContainer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  filterTextActive: {
    color: colors.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  emptyButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  ideaCard: {
    marginBottom: spacing.md,
  },
  ideaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  deleteBtn: {
    padding: 4,
  },
  ideaTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  ideaContent: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  tag: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
    color: colors.textMuted,
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
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  typeScroll: {
    marginBottom: spacing.lg,
  },
  typeOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    marginRight: spacing.sm,
  },
  typeOptionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  typeOptionTextActive: {
    color: colors.text,
  },
  saveButton: {
    marginTop: spacing.md,
  },
});
