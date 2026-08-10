import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../../../theme';

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
}

export default function AuthInput({
  icon, value, onChangeText, placeholder, keyboardType, autoCapitalize,
  secureTextEntry, error, rightIcon, rightColor, onRightPress, autoFocus, loading,
}: AuthInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputWrap}>
      <View style={[
        styles.inputRow,
        focused && styles.inputRowFocused,
        error && styles.inputRowError,
      ]}>
        <MaterialCommunityIcons
          name={icon as any}
          size={18}
          color={focused ? COLORS.coral : COLORS.text2}
        />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.text2}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          autoFocus={autoFocus}
          editable={!loading}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {loading ? (
          <MaterialCommunityIcons name="loading" size={18} color={COLORS.text2} />
        ) : rightIcon ? (
          <TouchableOpacity onPress={onRightPress} style={styles.inputRight}>
            <MaterialCommunityIcons name={rightIcon as any} size={18} color={rightColor || COLORS.text2} />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color={COLORS.coral} />
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
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: RADIUS.card, paddingHorizontal: 16, paddingVertical: 14,
  },
  inputRowFocused: { borderColor: COLORS.coral },
  inputRowError: { borderColor: COLORS.coral },
  input: {
    flex: 1, backgroundColor: 'transparent', borderWidth: 0,
    color: COLORS.text, fontSize: 16, fontWeight: '500', padding: 0,
  },
  inputRight: { padding: 4 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  errorText: { color: COLORS.coral, fontSize: 13, fontWeight: '500' },
});
