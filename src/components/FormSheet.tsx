import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, SHADOW, TOUCH } from '../theme';
import { Icon } from './icons/Icon';

interface Props {
  /** Whether the sheet is visible */
  visible: boolean;
  /** Called when the user requests closing (X button or backdrop) */
  onClose: () => void;
  /** Sheet title */
  title: string;
  /** Sheet content */
  children: React.ReactNode;
  /** Optional footer with action buttons */
  footer?: React.ReactNode;
  /** Whether the sheet is scrollable (default: true) */
  scrollable?: boolean;
  /** Maximum height as percentage of screen (default: 85) */
  maxPercentage?: number;
  /** Additional style for the sheet container */
  sheetStyle?: StyleProp<ViewStyle>;
}

/**
 * Reusable bottom sheet for forms, settings, and modal content.
 *
 * Features:
 * - Slide-up animation
 * - Handle bar at top
 * - Title + close button header
 * - Keyboard-avoiding behavior on iOS
 * - Scrollable content area
 * - Optional footer with action buttons
 * - Dismiss on backdrop tap
 *
 * Usage:
 * ```tsx
 * <FormSheet visible={show} onClose={() => setShow(false)} title="Add Address">
 *   <TextInput ... />
 *   <TextInput ... />
 * </FormSheet>
 *
 * <FormSheet visible={show} onClose={close} title="Edit" footer={
 *   <TouchableOpacity onPress={save}><Text>Save</Text></TouchableOpacity>
 * }>
 *   ...form fields
 * </FormSheet>
 * ```
 */
export default function FormSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  scrollable = true,
  maxPercentage = 85,
  sheetStyle,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        <TouchableOpacity
          style={styles.dismissArea}
          activeOpacity={1}
          onPress={onClose}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
        >
          <View
            style={[
              styles.sheet,
              { maxHeight: `${maxPercentage}%` },
              sheetStyle,
            ]}
          >
            {/* Handle bar */}
            <View style={styles.handleBar} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerSpacer} />
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                accessibilityLabel="Close"
                accessibilityRole="button"
              >
                <Icon name="close" size={20} color={COLORS.text2} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            {scrollable ? (
              <ScrollView
                style={styles.contentScroll}
                contentContainerStyle={styles.contentContainer}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={styles.contentContainer}>{children}</View>
            )}

            {/* Footer */}
            {footer && <View style={styles.footer}>{footer}</View>}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dismissArea: {
    flex: 1,
  },
  keyboardAvoid: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.media,
    borderTopRightRadius: RADIUS.media,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
    ...SHADOW.xl,
  },
  handleBar: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerSpacer: { width: 40 },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.text,
  },
  closeButton: {
    width: TOUCH.min,
    height: TOUCH.min,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  contentScroll: {
    flexGrow: 0,
  },
  contentContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});
