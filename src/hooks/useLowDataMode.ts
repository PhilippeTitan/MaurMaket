import { useEffect, useState } from 'react';
import { store } from '../store';

/** Device-local preference; subscriber updates keep open screens in sync. */
export function useLowDataMode() {
  const [enabled, setEnabled] = useState(store.lowDataMode);

  useEffect(() => store.onChange(() => setEnabled(store.lowDataMode)), []);

  return enabled;
}
