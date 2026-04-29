import React from 'react';
import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { colors, spacing } from '../utils/theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * Smart Card. When a child element is wrapped with `<View dataSet={{ stopParent: 'true' }}>`
 * (or anything with the data attribute `data-stop-parent`), tapping inside that subtree
 * will NOT trigger the Card's onPress. This solves the RN-Web nested-Pressable issue
 * where `e.stopPropagation()` doesn't reliably stop the parent Pressable from firing.
 */
export const Card: React.FC<CardProps> = ({ children, onPress, style }) => {
  if (onPress) {
    return (
      <Pressable
        style={[styles.card, style]}
        onPress={(e: any) => {
          // Web safety: if the click target (or any ancestor up to this Pressable) has
          // data-stop-parent, swallow the parent press.
          try {
            const tgt = e?.nativeEvent?.target as HTMLElement | undefined;
            if (tgt && typeof tgt.closest === 'function') {
              const blocker = tgt.closest('[data-stop-parent="true"]');
              if (blocker) return;
            }
          } catch {}
          onPress();
        }}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[styles.card, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
