import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { statusColors, colors } from '../utils/theme';

interface StatusBadgeProps {
  status: 'draft' | 'in_progress' | 'final' | 'released';
}

const statusLabels = {
  draft: 'Draft',
  in_progress: 'In Progress',
  final: 'Final',
  released: 'Released',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => (
  <View style={[styles.badge, { backgroundColor: statusColors[status] + '20' }]}>
    <View style={[styles.dot, { backgroundColor: statusColors[status] }]} />
    <Text style={[styles.text, { color: statusColors[status] }]}>
      {statusLabels[status]}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
