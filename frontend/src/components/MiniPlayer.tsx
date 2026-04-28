import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePlayerStore } from '../stores/playerStore';
import { colors, spacing } from '../utils/theme';

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const MiniPlayer: React.FC = () => {
  const router = useRouter();
  const { current, isPlaying, isLoading, position, duration, togglePlayPause, stop, error } = usePlayerStore();

  if (!current) return null;

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  const openSong = () => {
    if (current.source_id) {
      router.push(`/song/${current.source_id}`);
    }
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.container}>
        <Pressable style={styles.info} onPress={openSong}>
          <View style={styles.artwork}>
            <Ionicons name="musical-note" size={20} color={colors.primary} />
          </View>
          <View style={styles.textArea}>
            <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {error ? <Text style={styles.errorText}>{error}</Text> : (current.artist || formatTime(position) + ' / ' + formatTime(duration))}
            </Text>
          </View>
        </Pressable>

        <View style={styles.actions}>
          <Pressable onPress={togglePlayPause} style={styles.playBtn} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color={colors.text} />
            )}
          </Pressable>
          <Pressable onPress={stop} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'ios' ? 80 : 60,
    paddingHorizontal: spacing.sm,
    zIndex: 100,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textArea: { flex: 1 },
  title: { fontSize: 13, fontWeight: '600', color: colors.text },
  subtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  errorText: { color: colors.error, fontSize: 11 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressTrack: {
    height: 2,
    backgroundColor: colors.border,
    marginTop: 4,
    marginHorizontal: spacing.md,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
});
