import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COLORS,
  RADIUS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  SHADOW,
  TOUCH,
} from '../theme';

type ToastKind = 'success' | 'error' | 'info' | 'warning';
type ToastOptions = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
};

type ToastApi = {
  show: (options: ToastOptions & { kind?: ToastKind }) => void;
  success: (title: string, message?: string) => void;
  error: (
    title: string,
    message?: string,
    retry?: () => void
  ) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<
    (ToastOptions & { kind: ToastKind }) | null
  >(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback(
    (options: ToastOptions & { kind?: ToastKind }) => {
      if (timer.current) clearTimeout(timer.current);
      const next = { ...options, kind: options.kind || 'info' };
      setToast(next);
      timer.current = setTimeout(
        () => setToast(null),
        options.duration ?? (next.kind === 'error' ? 6000 : 3500)
      );
    },
    []
  );

  const api: ToastApi = {
    show,
    success: (title, message) =>
      show({ kind: 'success', title, message }),
    error: (title, message, retry) =>
      show({
        kind: 'error',
        title,
        message,
        actionLabel: retry ? 'Try again' : undefined,
        onAction: retry,
      }),
    info: (title, message) => show({ kind: 'info', title, message }),
    warning: (title, message) =>
      show({ kind: 'warning', title, message }),
  };

  const icon =
    toast?.kind === 'success'
      ? 'check-circle'
      : toast?.kind === 'error'
        ? 'alert-circle'
        : toast?.kind === 'warning'
          ? 'alert'
          : 'information';
  const accent =
    toast?.kind === 'success'
      ? COLORS.green
      : toast?.kind === 'error'
        ? COLORS.coral
        : toast?.kind === 'warning'
          ? COLORS.yellow
          : COLORS.blue;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <View
          pointerEvents="box-none"
          style={[styles.host, { top: insets.top + SPACING.md }]}
        >
          <Pressable
            accessibilityRole="alert"
            onPress={dismiss}
            style={styles.toast}
          >
            <MaterialCommunityIcons name={icon} size={22} color={accent} />
            <View style={styles.copy}>
              <Text style={styles.title}>{toast.title}</Text>
              {!!toast.message && (
                <Text style={styles.message}>{toast.message}</Text>
              )}
            </View>
            {toast.actionLabel && toast.onAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={toast.actionLabel}
                onPress={() => {
                  const action = toast.onAction!;
                  dismiss();
                  action();
                }}
                hitSlop={8}
                style={styles.actionButton}
              >
                <Text style={[styles.action, { color: accent }]}>
                  {toast.actionLabel}
                </Text>
              </Pressable>
            ) : (
              <MaterialCommunityIcons
                name="close"
                size={18}
                color={COLORS.text2}
              />
            )}
          </Pressable>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    minHeight: TOUCH.recommended,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    ...SHADOW.lg,
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  message: {
    color: COLORS.text2,
    fontSize: FONT_SIZES.sm,
    lineHeight: FONT_SIZES.sm * 1.4,
    marginTop: 2,
  },
  actionButton: {
    minHeight: TOUCH.min,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  action: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.extrabold,
  },
});
