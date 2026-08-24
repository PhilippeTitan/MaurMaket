import React from 'react';
import { View, FlatList, RefreshControl, StyleSheet, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme';
import ScreenHeader from './ScreenHeader';
import ScreenContainer from './ScreenContainer';
import EmptyState from './EmptyState';
import LoadingState from './LoadingState';

interface Props<T> {
  /** Screen title displayed in the header */
  title: string;
  /** Data array for the list */
  data: T[];
  /** Key extractor for FlatList */
  keyExtractor: (item: T, index: number) => string;
  /** Render function for each item */
  renderItem: ListRenderItem<T>;
  /** Called when user pulls to refresh */
  onRefresh?: () => void;
  /** Whether a refresh is in progress */
  refreshing?: boolean;
  /** Whether the initial load is still happening */
  loading?: boolean;
  /** Called when user presses back */
  onBack?: () => void;
  /** Optional right-side header action */
  headerRight?: React.ReactNode;
  /** Empty state configuration */
  empty?: {
    icon: string;
    title: string;
    hint?: string;
    actionLabel?: string;
    onAction?: () => void;
  };
  /** Additional FlatList props */
  flatListProps?: Record<string, any>;
}

/**
 * Reusable list screen archetype that handles:
 * - Safe-area aware ScreenContainer + ScreenHeader
 * - FlatList with pull-to-refresh
 * - Loading state (centered spinner)
 * - Empty state (icon + message + optional CTA)
 *
 * Usage:
 * ```tsx
 * <ListScreen
 *   title="Orders"
 *   data={orders}
 *   keyExtractor={item => item.id}
 *   renderItem={({ item }) => <OrderRow order={item} />}
 *   onRefresh={onRefresh}
 *   refreshing={refreshing}
 *   loading={loading}
 *   onBack={() => nav.goBack()}
 *   empty={{ icon: 'package-variant', title: 'No orders yet' }}
 * />
 * ```
 */
export default function ListScreen<T>({
  title,
  data,
  keyExtractor,
  renderItem,
  onRefresh,
  refreshing = false,
  loading = false,
  onBack,
  headerRight,
  empty,
  flatListProps,
}: Props<T>) {
  if (loading) {
    return (
      <ScreenContainer>
        <ScreenHeader title={title} onBack={onBack} right={headerRight} />
        <LoadingState />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenHeader title={title} onBack={onBack} right={headerRight} />
      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          empty ? (
            <EmptyState
              icon={empty.icon}
              title={empty.title}
              hint={empty.hint}
              actionLabel={empty.actionLabel}
              onAction={empty.onAction}
            />
          ) : undefined
        }
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.coral}
            />
          ) : undefined
        }
        {...flatListProps}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
  },
});
