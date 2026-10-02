import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS, FONT_SIZES, FONT_WEIGHTS, TOUCH } from '../theme';
import { getBlockedUsers, unblockUser } from '../api';
import type { BlockedUser } from '../types';
import UserAvatar from '../components/UserAvatar';
import ScreenHeader from '../components/ScreenHeader';
import EmptyState from '../components/EmptyState';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../components/Toast';

export default function BlockedUsersScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const toast = useToast();

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<BlockedUser | null>(null);

  const fetchBlocked = useCallback(async () => {
    try {
      const res = await getBlockedUsers();
      setBlockedUsers(res.blockedUsers || []);
    } catch (err: any) {
      toast.error('Error', err?.message || 'Could not load blocked users');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchBlocked();
  }, [fetchBlocked]);

  const handleUnblock = async (user: BlockedUser) => {
    setUnblockingId(user.id);
    try {
      await unblockUser(user.id);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success('Unblocked', `${user.full_name || 'User'} has been unblocked.`);
      setConfirmUser(null);
    } catch (err: any) {
      toast.error('Unblock failed', err?.message || 'Please try again');
    } finally {
      setUnblockingId(null);
    }
  };

  const renderItem = ({ item }: { item: BlockedUser }) => {
    const isPending = unblockingId === item.id;
    return (
      <View style={styles.userRow}>
        <UserAvatar
          seller={{
            avatar_url: item.avatar_url,
            store_logo_url: item.store_logo_url,
            use_store_identity: item.use_store_identity,
            full_name: item.full_name,
            username: item.username,
            seller_tier: item.seller_tier as any,
          } as any}
          size={44}
          animated={false}
        />
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {item.use_store_identity && item.store_name ? item.store_name : item.full_name}
          </Text>
          {!!item.username && (
            <Text style={styles.userHandle} numberOfLines={1}>
              @{item.username}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.unblockBtn}
          onPress={() => setConfirmUser(item)}
          disabled={isPending}
          accessibilityRole="button"
          accessibilityLabel={`Unblock ${item.full_name}`}
        >
          {isPending ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Text style={styles.unblockBtnText}>Unblock</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Blocked Accounts" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.coral} />
        </View>
      ) : blockedUsers.length === 0 ? (
        <EmptyState
          title="No blocked accounts"
          hint="Accounts you block will not be able to follow you or send you new messages."
          icon="shield-check-outline"
        />
      ) : (
        <FlatList
          data={blockedUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + SPACING.xl }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchBlocked();
              }}
              tintColor={COLORS.coral}
            />
          }
        />
      )}

      {confirmUser && (
        <ConfirmModal
          visible={!!confirmUser}
          title="Unblock User?"
          message={`Are you sure you want to unblock ${confirmUser.full_name}? They will be able to view your profile and interact with you again.`}
          confirmLabel="Unblock"
          cancelLabel="Cancel"
          kind="warning"
          onConfirm={() => handleUnblock(confirmUser)}
          onCancel={() => setConfirmUser(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.card,
    marginBottom: SPACING.xs,
    minHeight: TOUCH.min,
  },
  userInfo: {
    flex: 1,
    marginLeft: SPACING.sm,
    marginRight: SPACING.sm,
  },
  userName: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.text,
  },
  userHandle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text3,
    marginTop: 2,
  },
  unblockBtn: {
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unblockBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.text,
  },
});
