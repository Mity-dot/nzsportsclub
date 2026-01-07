import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useNotificationSubscription() {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is subscribed
  useEffect(() => {
    const checkSubscription = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('push_subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (fetchError) {
          console.error('Error checking subscription:', fetchError);
        }

        setIsSubscribed(!!data);
      } catch (err) {
        console.error('Error checking subscription:', err);
      }

      setIsLoading(false);
    };

    checkSubscription();
  }, [user]);

  const subscribe = useCallback(async () => {
    if (!user) {
      setError('Must be logged in to subscribe');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check if already subscribed
      const { data: existing } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        setIsSubscribed(true);
        setIsLoading(false);
        return true;
      }

      // Create a subscription entry (simplified - just marks user as wanting notifications)
      const { error: insertError } = await supabase
        .from('push_subscriptions')
        .insert({
          user_id: user.id,
          endpoint: `user:${user.id}`, // Pseudo-endpoint for in-app notifications
          p256dh: 'in-app',
          auth: 'in-app',
        });

      if (insertError) {
        console.error('Error creating subscription:', insertError);
        setError('Failed to enable notifications');
        setIsLoading(false);
        return false;
      }

      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('Error subscribing:', err);
      setError('Failed to enable notifications');
      setIsLoading(false);
      return false;
    }
  }, [user]);

  const unsubscribe = useCallback(async () => {
    if (!user) return false;

    setIsLoading(true);

    try {
      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('Error unsubscribing:', deleteError);
        setIsLoading(false);
        return false;
      }

      setIsSubscribed(false);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('Error unsubscribing:', err);
      setIsLoading(false);
      return false;
    }
  }, [user]);

  return {
    isSupported: true, // Always supported since it's in-app
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  };
}