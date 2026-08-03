'use client';

/**
 * Session Supabase côté client, synchronisée en temps réel.
 *
 * À réserver aux composants qui ont besoin de réagir à un changement de session
 * (connexion/déconnexion dans un autre onglet). Pour un simple rendu, préférer
 * `getCurrentUser()` dans un Server Component : c'est plus rapide et sans
 * clignotement.
 */
import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

export interface UseUserResult {
  user: User | null;
  isLoading: boolean;
}

export function useUser(initialUser: User | null = null): UseUserResult {
  const [user, setUser] = useState<User | null>(initialUser);
  const [isLoading, setIsLoading] = useState(initialUser === null);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) return;
      setUser(data.user);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}
