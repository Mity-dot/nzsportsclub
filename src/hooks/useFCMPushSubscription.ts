import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseMessaging, getToken, onMessage, VAPID_KEY } from '@/lib/firebase';

export function useFCMPushSubscription() {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  // Check support and existing subscription
  useEffect(() => {
    const init = async () => {
      // Check browser support
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        console.log('Push notifications not supported');
        setIsLoading(false);
        return;
      }

      setIsSupported(true);

      try {
        // Register Firebase service worker
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('[FCM] Service worker registered:', registration.scope);

        // Check if already subscribed by looking at database
        if (user) {
          const { data: existingSub } = await supabase
            .from('push_subscriptions')
            .select('endpoint')
            .eq('user_id', user.id)
            .maybeSingle();

          if (existingSub?.endpoint?.includes('fcm.googleapis.com')) {
            setIsSubscribed(true);
            console.log('[FCM] Already subscribed');
          }
        }
      } catch (err) {
        console.error('[FCM] Error initializing:', err);
        setError('Failed to initialize push notifications');
      }

      setIsLoading(false);
    };

    init();
  }, [user]);

  // Handle foreground messages
  useEffect(() => {
    const messaging = getFirebaseMessaging();
    if (!messaging) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[FCM] Foreground message received:', payload);
      
      // Show notification in foreground using browser API
      if (Notification.permission === 'granted') {
        const notification = new Notification(payload.notification?.title || 'NZ Sport Club', {
          body: payload.notification?.body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: payload.data?.type || 'default',
          data: payload.data,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    });

    return () => unsubscribe();
  }, []);

  const subscribe = useCallback(async () => {
    if (!user || !isSupported) {
      console.log('[FCM] Cannot subscribe:', { user: !!user, isSupported });
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      console.log('[FCM] Notification permission:', permission);
      
      if (permission !== 'granted') {
        setError('Notification permission denied');
        setIsLoading(false);
        return false;
      }

      const messaging = getFirebaseMessaging();
      if (!messaging) {
        setError('Firebase messaging not available');
        setIsLoading(false);
        return false;
      }

      // Get FCM token
      const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        setError('Failed to get FCM token');
        setIsLoading(false);
        return false;
      }

      console.log('[FCM] Token obtained:', token.substring(0, 20) + '...');
      setFcmToken(token);

      // Delete old subscriptions for this user
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      // Store FCM token in database
      // We use the endpoint field to store the FCM token with a prefix
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .insert({
          user_id: user.id,
          endpoint: `fcm://token/${token}`,
          p256dh: 'fcm', // Placeholder since FCM handles encryption
          auth: 'fcm',   // Placeholder since FCM handles encryption
        });

      if (dbError) {
        console.error('[FCM] Error saving subscription:', dbError);
        setError('Failed to save subscription');
        setIsLoading(false);
        return false;
      }

      console.log('[FCM] Subscription saved to database');
      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('[FCM] Error subscribing:', err);
      setError('Failed to subscribe to notifications');
      setIsLoading(false);
      return false;
    }
  }, [user, isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!user) return false;

    setIsLoading(true);

    try {
      // Remove from database
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      setIsSubscribed(false);
      setFcmToken(null);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('[FCM] Error unsubscribing:', err);
      setIsLoading(false);
      return false;
    }
  }, [user]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    fcmToken,
    subscribe,
    unsubscribe,
  };
}
