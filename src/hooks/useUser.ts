import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { store } from '../store';
import { getMe } from '../api';
import { queryClient } from './queryClient';
import type { User } from '../types';

const USER_QUERY_KEY = ['user'];

async function fetchUser(): Promise<User> {
  const res = (await getMe()) as { user: User };
  if (res.user) {
    store.setUser(res.user, store.token);
  }
  return res.user;
}

export function useUser() {
  const qc = useQueryClient();
  const [storeUser, setStoreUser] = useState(store.user);

  const query = useQuery<User>({
    queryKey: USER_QUERY_KEY,
    queryFn: fetchUser,
    enabled: !!store.token,
    staleTime: 30_000,
    refetchInterval: false,
  });

  useEffect(() => {
    if (query.data) {
      store.setUser(query.data, store.token);
    }
  }, [query.data]);

  useEffect(() => {
    const unsub = store.onChange(() => {
      setStoreUser(store.user);
      if (!store.token) {
        qc.clear();
      }
    });
    return unsub;
  }, [qc]);

  return {
    user: storeUser ?? query.data ?? store.user,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => qc.invalidateQueries({ queryKey: USER_QUERY_KEY }),
  };
}

export function invalidateUser() {
  queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY });
}
