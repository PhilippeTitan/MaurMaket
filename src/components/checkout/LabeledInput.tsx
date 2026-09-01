import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../../theme';

interface Props extends TextInputProps {
  label: string;
  /** Helper text under the field */
  helper?: string;
  /** Error text; when set, the field border and helper turn red */
  error?: string;
  /** Optional element on the right inside the field (e.g. a clear button) */
  right?: React.ReactNode;
  /** Optional link-style action shown next to the helper/error */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Labeled text field with a visible label, 48px-high input, focus ring, and
 * inline helper/error. Replaces the placeholder-only inputs of the old flow.
 */
export default function LabeledInput({ label, helper, error, right, actionLabel, onAction, style, multiline, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const message = error || helper;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, multiline && styles.fieldMultiline, focused && styles.fieldFocused, !!error && styles.fieldError]}>
        <TextInput
          {...rest}
          multiline={multiline}
          placeholderTextColor={COLORS.text3}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          accessibilityLabel={rest.accessibilityLabel ?? label}
        />
        {right}
      </View>
      {message || actionLabel ? (
        <View style={styles.footRow}>
          {message ? <Text style={[styles.helper, !!error && styles.helperError]}>{message}</Text> : <View style={{ flex: 1 }} />}
          {actionLabel && onAction ? (
            <TouchableOpacity onPress={onAction} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.action}>{actionLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.xs + 2 },
  label: { fontSize: FONT_SIZES.base, color: COLORS.text2, fontWeight: FONT_WEIGHTS.medium },
  field: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: TOUCH.recommended,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.row, paddingHorizontal: SPACING.md,
  },
  fieldMultiline: { alignItems: 'flex-start', minHeight: 88, paddingVertical: SPACING.sm },
  fieldFocused: { borderColor: COLORS.borderFocus },
  fieldError: { borderColor: COLORS.error },
  input: { flex: 1, color: COLORS.text, fontSize: FONT_SIZES.md, paddingVertical: 0 },
  inputMultiline: { textAlignVertical: 'top', minHeight: 72 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm },
  helper: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text3 },
  helperError: { color: COLORS.error },
  action: { fontSize: FONT_SIZES.sm, color: COLORS.coral, fontWeight: FONT_WEIGHTS.semibold },
});
