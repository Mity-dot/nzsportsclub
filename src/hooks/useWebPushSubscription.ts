import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB77lAHEx-XN7ZPYjwRmikCTYi_BEzS9dk",
  authDomain: "pushnotsnz.firebaseapp.com",
  projectId: "pushnotsnz",
  storageBucket: "pushnotsnz.firebasestorage.app",
  messagingSenderId: "370180691160",
  appId: "1:370180691160:web:3297f6c807f7427c0d73ad",
  measurementId: "G-09XBG6201R"
};

const VAPID_KEY = 'BHZMzMqXcVLRHlvjLYCE-ld3xGWuC9CIlNuMIJ-YxJQJPxVvqnNLb7TqrwWEDZbKDT8WLFZvHZxJBKB_qBJlVQw';

export function useWebPushSubscription() {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  type SubscriptionResult = { success: boolean; error?: string };

  const formatErr = (err: unknown) => {
    const anyErr = err as { message?: string; code?: string } | null;
    const msg = anyErr?.message ?? (err instanceof Error ? err.message : String(err));
    const code = anyErr?.code ? ` (${anyErr.code})` : '';
    return `${msg}${code}`;
  };

  // Check FCM support and current subscription status
  useEffect(() => {
    const init = async () => {
      try {
        // Dynamically import Firebase to avoid build issues
        const { initializeApp, getApps } = await import('firebase/app');
        const { isSupported: checkSupported } = await import('firebase/messaging');
        
        const supported = await checkSupported();
        if (!supported) {
          console.log('FCM not supported in this browser');
          setIsLoading(false);
          return;
        }

        setIsSupported(true);

        // Initialize Firebase if not already
        if (getApps().length === 0) {
          initializeApp(firebaseConfig);
        }

        // Register the FCM service worker
        if ('serviceWorker' in navigator) {
          try {
            await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log('FCM service worker registered');
          } catch (swError) {
            console.error('FCM SW registration failed:', swError);
          }
        }

        // Check if user has an existing FCM subscription in database
        if (user) {
          const { data: existingSubscription } = await supabase
            .from('push_subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .like('endpoint', 'fcm://token/%')
            .maybeSingle();
          
          setIsSubscribed(!!existingSubscription);
        }
      } catch (err) {
        console.error('Error initializing FCM:', err);
        setError('Failed to initialize notifications');
      }

      setIsLoading(false);
    };

    init();
  }, [user]);

  const subscribe = useCallback(async (): Promise<SubscriptionResult> => {
    if (!user || !isSupported) {
      const msg = 'Cannot subscribe: unsupported device or not logged in';
      console.log(msg, { user: !!user, isSupported });
      setError(msg);
      return { success: false, error: msg };
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      console.log('Notification permission:', permission);

      if (permission !== 'granted') {
        const msg = 'Notification permission denied';
        setError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }

      if (!('serviceWorker' in navigator)) {
        const msg = 'Service worker not supported';
        setError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }

      // Dynamically import Firebase
      const { initializeApp, getApps, getApp } = await import('firebase/app');
      const { getMessaging, getToken } = await import('firebase/messaging');

      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      const messaging = getMessaging(app);

      // Ensure the Firebase messaging service worker is registered and ready.
      let swRegistration = await navigator.serviceWorker.getRegistration('/');
      if (!swRegistration) {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      }
      await navigator.serviceWorker.ready;

      console.log('Service worker ready, scope:', swRegistration.scope);

      let fcmToken: string | null = null;
      try {
        fcmToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swRegistration,
        });
      } catch (tokenErr) {
        const msg = `Failed to get notification token: ${formatErr(tokenErr)}`;
        console.error(msg, tokenErr);
        setError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }

      if (!fcmToken) {
        const msg = 'Failed to get notification token (empty token)';
        setError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }

      console.log('FCM token obtained:', fcmToken.substring(0, 20) + '...');

      // Delete old subscriptions for this user
      await supabase.from('push_subscriptions').delete().eq('user_id', user.id);

      // Save the FCM token to database with fcm:// prefix for identification
      const fcmEndpoint = `fcm://token/${fcmToken}`;
      const { error: dbError } = await supabase.from('push_subscriptions').insert({
        user_id: user.id,
        endpoint: fcmEndpoint,
        p256dh: 'fcm',
        auth: 'fcm',
      });

      if (dbError) {
        const msg = `Failed to save subscription: ${dbError.message}`;
        console.error('Error saving FCM token:', dbError);
        setError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }

      console.log('FCM subscription saved to database');
      setIsSubscribed(true);
      setIsLoading(false);
      return { success: true };
    } catch (err) {
      const msg = `Failed to subscribe to notifications: ${formatErr(err)}`;
      console.error(msg, err);
      setError(msg);
      setIsLoading(false);
      return { success: false, error: msg };
    }
  }, [user, isSupported]);

  const unsubscribe = useCallback(async (): Promise<SubscriptionResult> => {
    if (!user) return { success: false, error: 'Not logged in' };

    setIsLoading(true);

    try {
      // Try to delete the FCM token, but don't fail if it doesn't work
      try {
        const { getApps, getApp, initializeApp } = await import('firebase/app');
        const { getMessaging, deleteToken } = await import('firebase/messaging');

        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
        const messaging = getMessaging(app);

        await deleteToken(messaging);
        console.log('FCM token deleted');
      } catch (fcmErr) {
        console.warn('Could not delete FCM token (may already be deleted):', fcmErr);
      }

      // Always remove from database regardless of FCM deletion result
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      if (dbError) {
        const msg = `Failed to remove subscription from database: ${dbError.message}`;
        console.error(msg, dbError);
        setError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }

      setIsSubscribed(false);
      setIsLoading(false);
      return { success: true };
    } catch (err) {
      const msg = `Failed to disable notifications: ${formatErr(err)}`;
      console.error(msg, err);
      setError(msg);
      setIsLoading(false);
      return { success: false, error: msg };
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
