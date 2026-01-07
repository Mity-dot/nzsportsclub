import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export function useWebPushSubscription() {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  // Fetch VAPID public key and check support
  useEffect(() => {
    const init = async () => {
      // Check browser support
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push notifications not supported');
        setIsLoading(false);
        return;
      }

      setIsSupported(true);

      try {
        // Fetch VAPID public key from edge function
        const { data, error: fetchError } = await supabase.functions.invoke('get-vapid-public-key');
        
        if (fetchError) {
          console.error('Error fetching VAPID key:', fetchError);
          setError('Push notifications not configured');
          setIsLoading(false);
          return;
        }

        if (data?.publicKey) {
          setVapidPublicKey(data.publicKey);
          console.log('VAPID public key fetched successfully');
        } else {
          setError('Push notifications not configured');
        }

        // Register service worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service worker registered:', registration.scope);

        // Check if already subscribed
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
        
        if (subscription) {
          console.log('Already subscribed to push notifications');
        }
      } catch (err) {
        console.error('Error initializing push:', err);
        setError('Failed to initialize push notifications');
      }

      setIsLoading(false);
    };

    init();
  }, []);

  const subscribe = useCallback(async () => {
    if (!user || !isSupported || !vapidPublicKey) {
      console.log('Cannot subscribe:', { user: !!user, isSupported, vapidPublicKey: !!vapidPublicKey });
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      console.log('Notification permission:', permission);
      
      if (permission !== 'granted') {
        setError('Notification permission denied');
        setIsLoading(false);
        return false;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      console.log('Push subscription created:', subscription.endpoint);

      // Extract subscription details
      const subscriptionJson = subscription.toJSON();
      const endpoint = subscription.endpoint;
      const p256dh = subscriptionJson.keys?.p256dh || '';
      const auth = subscriptionJson.keys?.auth || '';

      // Use upsert to handle existing subscriptions - update if exists, insert if not
      // First try to delete old subscriptions with different endpoints
      const { error: deleteError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .neq('endpoint', endpoint);
      
      if (deleteError) {
        console.log('Could not delete old subscriptions:', deleteError);
      }

      // Now upsert the current subscription
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          updated_at: new Date().toISOString(),
        }, { 
          onConflict: 'user_id,endpoint',
          ignoreDuplicates: false 
        });

      if (dbError) {
        console.error('Error saving subscription:', dbError);
        setError('Failed to save subscription');
        setIsLoading(false);
        return false;
      }

      console.log('Subscription saved to database');
      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('Error subscribing to push:', err);
      setError('Failed to subscribe to notifications');
      setIsLoading(false);
      return false;
    }
  }, [user, isSupported, vapidPublicKey]);

  const unsubscribe = useCallback(async () => {
    if (!user) return false;

    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        console.log('Unsubscribed from push notifications');

        // Remove from database
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id);
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
    isSupported,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  };
}
