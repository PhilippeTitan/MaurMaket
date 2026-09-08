import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  secureTextEntry,
  error,
  rightIcon,
  rightColor,
  onRightPress,
  autoFocus,
  loading,
}: AuthInputProps) {
  const [focused, setFocused] = useState(false);
  const focusProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(focusProgress, {
      toValue: focused ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [focused, focusProgress]);

  const borderColor = focusProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? COLORS.coral : COLORS.border, error ? COLORS.coral : COLORS.coral],
  });

  const iconColor = focusProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? COLORS.coral : COLORS.text2, COLORS.coral],
  });

  return (
    <View style={styles.inputWrap}>
      <Animated.View
        style={[
          styles.inputRow,
          { borderColor },
          error && styles.inputRowError,
        ]}
      >
        <Animated.View>
          <Animated.Text style={[styles.iconHolder, { color: iconColor }]}>
            <MaterialCommunityIcons name={icon as any} size={19} />
          </Animated.Text>
        </Animated.View>
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
          selectionColor={COLORS.coral}
          accessibilityLabel={placeholder}
        />
        {loading ? (
          <MaterialCommunityIcons name="loading" size={19} color={COLORS.text2} />
        ) : rightIcon ? (
          <TouchableOpacity
            onPress={onRightPress}
            style={styles.inputRight}
            hitSlop={10}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              name={rightIcon as any}
              size={19}
              color={rightColor || COLORS.text2}
            />
          </TouchableOpacity>
        ) : value ? (
          <View style={styles.valueDot} />
        ) : null}
      </Animated.View>

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
  inputWrap: { marginBottom: 13 },
  inputRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderRadius: RADIUS.card,
    paddingHorizontal: 15,
    shadowOpacity: 0,
  },
  inputRowError: { borderColor: COLORS.coral },
  iconHolder: { lineHeight: 20 },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '500',
    padding: 0,
    minHeight: 42,
  },
  inputRight: { padding: 5 },
  valueDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.green,
    opacity: 0.65,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 7,
    paddingHorizontal: 2,
  },
  errorText: { color: COLORS.coral, fontSize: 12.5, lineHeight: 17, fontWeight: '500', flex: 1 },
});