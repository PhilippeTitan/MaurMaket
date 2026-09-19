import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ONBOARDING_COLORS } from '../screens/onboarding/theme';
import { RADIUS } from '../theme';

interface AuthInputProps {
  icon: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: any;
  autoCapitalize?: any;
  secureTextEntry?: boolean;
  error?: string;
  rightIcon?: string;
  rightColor?: string;
  onRightPress?: () => void;
  autoFocus?: boolean;
  loading?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  /** Static prefix text rendered before the input (e.g. "+509") */
  prefix?: string;
  returnKeyType?: any;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

/**
 * The onboarding text field — 1.5px bordered row with a leading icon,
 * coral border on focus/error, and a coral error line beneath.
 * Shared across onboarding and all settings screens.
 */
export default function AuthInput({
  icon, value, onChangeText, placeholder, keyboardType, autoCapitalize,
  secureTextEntry, error, rightIcon, rightColor, onRightPress, autoFocus, loading,
  multiline, numberOfLines, prefix, returnKeyType, accessibilityLabel, style,
}: AuthInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.inputWrap, style]}>
      <View style={[
        styles.inputRow,
        focused && styles.inputRowFocused,
        error && styles.inputRowError,
      ]}>
        <MaterialCommunityIcons
          name={icon as any}
          size={18}
          color={focused ? ONBOARDING_COLORS.coral : ONBOARDING_COLORS.sub}
        />
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={ONBOARDING_COLORS.faint}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          autoFocus={autoFocus}
          editable={!loading}
          multiline={multiline}
          numberOfLines={numberOfLines}
          returnKeyType={returnKeyType}
          textAlignVertical={multiline ? 'top' : 'center'}
          accessibilityLabel={accessibilityLabel}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {loading ? (
          <MaterialCommunityIcons name="loading" size={18} color={ONBOARDING_COLORS.sub} />
        ) : rightIcon ? (
          <TouchableOpacity onPress={onRightPress} hitSlop={{ top: 20, bottom: 20, left: 50, right: 0 }} style={styles.rightBtn}>
            <MaterialCommunityIcons name={rightIcon as any} size={28} color={rightColor || ONBOARDING_COLORS.sub} />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={ONBOARDING_COLORS.coral} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: { marginBottom: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: ONBOARDING_COLORS.surface, borderWidth: 1.5, borderColor: ONBOARDING_COLORS.border,
    borderRadius: RADIUS.card, paddingHorizontal: 16, paddingVertical: 14,
  },
  inputRowFocused: { borderColor: ONBOARDING_COLORS.coral },
  inputRowError: { borderColor: ONBOARDING_COLORS.coral },
  input: {
    flex: 1, backgroundColor: 'transparent', borderWidth: 0,
    color: ONBOARDING_COLORS.text, fontSize: 16, fontWeight: '500', padding: 0,
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: 0,
  },
  rightBtn: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 50, justifyContent: 'center', alignItems: 'center' },
  prefix: { fontSize: 16, fontWeight: '600', color: ONBOARDING_COLORS.sub },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  errorText: { color: ONBOARDING_COLORS.coral, fontSize: 13, fontWeight: '500' },
});
