import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation dialog.
 * - On native: uses Alert.alert with two buttons
 * - On web: uses window.confirm (reliable, blocking, no animation flicker)
 *
 * Usage:
 *   if (await confirmDestructive('Delete song?')) {
 *     await deleteSong(id);
 *   }
 */
export async function confirmDestructive(
  message: string,
  title: string = 'Are you sure?'
): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      // window.confirm renders the title+message together
      const text = title ? `${title}\n\n${message}` : message;
      // eslint-disable-next-line no-alert
      return typeof window !== 'undefined' && !!window.confirm(text);
    } catch {
      return false;
    }
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

export async function confirmAction(
  message: string,
  title: string = 'Confirm',
  confirmLabel: string = 'OK'
): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      const text = title ? `${title}\n\n${message}` : message;
      // eslint-disable-next-line no-alert
      return typeof window !== 'undefined' && !!window.confirm(text);
    } catch {
      return false;
    }
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
