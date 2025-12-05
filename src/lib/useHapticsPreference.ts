'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'hapticsEnabled';

export function useHapticsPreference() {
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (storedValue !== null) {
      setHapticsEnabled(storedValue === 'true');
    }
  }, []);

  const updatePreference = useCallback((enabled: boolean) => {
    setHapticsEnabled(enabled);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, String(enabled));
    }
  }, []);

  return { hapticsEnabled, setHapticsEnabled: updatePreference };
}
