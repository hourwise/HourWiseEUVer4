import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Listens for sign-ins and ensures a public profile exists.
 * Safe against races: we attempt an insert and ignore unique violations.
 */
export const useCreateProfile = () => {
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return;

      const { error } = await supabase.from('profiles').insert({
        user_id: session.user.id,
        full_name: session.user.email, // default name to email
        email: session.user.email,
        role: 'driver', // app sign-ups are always drivers by default
        account_type: 'solo', // app sign-ups are solo drivers by default
      });

      if (error) {
        // 23505 = unique_violation (profile already exists)
        if (error.code !== '23505') {
          console.error('Error creating profile:', error);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
};
