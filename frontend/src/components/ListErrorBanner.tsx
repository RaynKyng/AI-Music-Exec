import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../utils/theme';
import type { ListFetchError } from '../stores/dataStore';

/**
 * Inline banner shown above a list when the most recent refresh failed.
 *
 * Why this exists:
 *   The artist/release/playlist regression masked itself as "0 records"
 *   because the data store silently replaced the list with `[]` on a 500.
 *   This banner makes a failed refresh visually distinct from an empty
 *   catalog and offers a one-tap retry — so future 500s never look
 *   like silent data deletion.
 */
interface Props {
  error: ListFetchError | null;
  onRetry?: () => void;
  // Whether the list still has previously-loaded items behind the banner.
  // If true, copy emphasizes "showing your last loaded list"; otherwise
  // "we couldn't load your records".
  hasStaleList?: boolean;
}

export const ListErrorBanner: React.FC<Props> = ({ error, onRetry, hasStaleList }) => {
  if (!error) return null;
  const statusLabel = error.status ? `HTTP ${error.status}` : 'Network';

  return (
    <View style={styles.banner}>
      <View style={styles.row}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <Text style={styles.title}>
          {hasStaleList ? 'Could not refresh' : 'Could not load records'}
        </Text>
        <Text style={styles.status}>{statusLabel}</Text>
      </View>
      <Text style={styles.message} numberOfLines={3}>
        {error.message}
      </Text>
      {hasStaleList && (
        <Text style={styles.subtle}>Showing the last list that loaded successfully.</Text>
      )}
      {onRetry && (
        <Pressable style={styles.retry} onPress={onRetry} hitSlop={8}>
          <Ionicons name="refresh" size={14} color={colors.background} />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontWeight: '600', flex: 1 },
  status: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  message: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  subtle: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  retry: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.warning,
    borderRadius: 6,
    marginTop: 4,
  },
  retryText: { color: colors.background, fontWeight: '700', fontSize: 13 },
});
