import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Firebase configuration for web
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

type SubscriptionResult = { success: boolean; error?: string };

const formatErr = (err: unknown) => {
  const anyErr = err as { message?: string; code?: string } | null;
  const msg = anyErr?.message ?? (err instanceof Error ? err.message : String(err));
  const code = anyErr?.code ? ` (${anyErr.code})` : '';
  return `${msg}${code}`;
};

export function useNotificationSubscription() {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNative, setIsNative] = useState(false);

  // Initialize and check subscription status
  useEffect(() => {
    const init = async () => {
      try {
        const native = Capacitor.isNativePlatform();
        setIsNative(native);

        if (native) {
          // Native platform - use Capacitor push
          const { PushNotifications } = await import('@capacitor/push-notifications');
          
          const permStatus = await PushNotifications.checkPermissions();
          setIsSupported(true); // Native always supports push
          
          // Check if we have a subscription in DB
          if (user) {
            const { data: existingSubscription } = await supabase
              .from('push_subscriptions')
              .select('id')
              .eq('user_id', user.id)
              .like('endpoint', 'native://%')
              .maybeSingle();
            
            setIsSubscribed(!!existingSubscription && permStatus.receive === 'granted');
          }
        } else {
          // Web platform - check FCM support
          try {
            const { initializeApp, getApps } = await import('firebase/app');
            const { isSupported: checkSupported } = await import('firebase/messaging');
            
            const supported = await checkSupported();
            if (!supported) {
              console.log('FCM not supported in this browser/environment');
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
          } catch (webErr) {
            console.log('Web push not available:', webErr);
            setIsSupported(false);
          }
        }
      } catch (err) {
        console.error('Error initializing push notifications:', err);
        setError('Failed to initialize notifications');
      }

      setIsLoading(false);
    };

    init();
  }, [user]);

  // Native subscribe using Capacitor
  const subscribeNative = useCallback(async (): Promise<SubscriptionResult> => {
    if (!user) {
      return { success: false, error: 'Not logged in' };
    }

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Request permission
      let permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        const msg = 'Notification permission denied. Please enable notifications in device settings.';
        setError(msg);
        return { success: false, error: msg };
      }

      // Set up listeners before registering
      return new Promise((resolve) => {
        let resolved = false;
        
        const resolveOnce = (result: SubscriptionResult) => {
          if (!resolved) {
            resolved = true;
            resolve(result);
          }
        };

        // Listen for registration success
        PushNotifications.addListener('registration', async (token) => {
          console.log('Native push registration success, token:', token.value.substring(0, 20) + '...');
          
          try {
            // Delete old subscriptions for this user
            await supabase.from('push_subscriptions').delete().eq('user_id', user.id);

            // Save the native FCM token to database with native:// prefix
            const nativeEndpoint = `native://fcm/${token.value}`;
            const { error: dbError } = await supabase.from('push_subscriptions').insert({
              user_id: user.id,
              endpoint: nativeEndpoint,
              p256dh: 'native',
              auth: 'native',
            });

            if (dbError) {
              const msg = `Failed to save subscription: ${dbError.message}`;
              console.error(msg, dbError);
              setError(msg);
              setIsLoading(false);
              resolveOnce({ success: false, error: msg });
              return;
            }

            console.log('Native push subscription saved to database');
            setIsSubscribed(true);
            setIsLoading(false);
            resolveOnce({ success: true });
          } catch (saveErr) {
            const msg = `Failed to save token: ${formatErr(saveErr)}`;
            setError(msg);
            setIsLoading(false);
            resolveOnce({ success: false, error: msg });
          }
        });

        // Listen for registration errors
        PushNotifications.addListener('registrationError', (err) => {
          const msg = `Push registration failed: ${formatErr(err)}`;
          console.error(msg, err);
          setError(msg);
          setIsLoading(false);
          resolveOnce({ success: false, error: msg });
        });

        // Register with Apple / Google
        PushNotifications.register().catch((regErr) => {
          const msg = `Failed to register: ${formatErr(regErr)}`;
          setError(msg);
          setIsLoading(false);
          resolveOnce({ success: false, error: msg });
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          if (!resolved) {
            const msg = 'Registration timed out';
            setError(msg);
            setIsLoading(false);
            resolveOnce({ success: false, error: msg });
          }
        }, 30000);
      });
    } catch (err) {
      const msg = `Failed to subscribe: ${formatErr(err)}`;
      console.error(msg, err);
      setError(msg);
      setIsLoading(false);
      return { success: false, error: msg };
    }
  }, [user]);

  // Web subscribe using Firebase Cloud Messaging
  const subscribeWeb = useCallback(async (): Promise<SubscriptionResult> => {
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

  // Main subscribe function - routes to native or web
  const subscribe = useCallback(async (): Promise<SubscriptionResult> => {
    setIsLoading(true);
    setError(null);
    
    if (isNative) {
      return subscribeNative();
    } else {
      return subscribeWeb();
    }
  }, [isNative, subscribeNative, subscribeWeb]);

  // Unsubscribe
  const unsubscribe = useCallback(async (): Promise<SubscriptionResult> => {
    if (!user) return { success: false, error: 'Not logged in' };

    setIsLoading(true);

    try {
      if (!isNative) {
        // Try to delete the FCM token for web
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
      }

      // Always remove from database
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
  }, [user, isNative]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    isNative,
    subscribe,
    unsubscribe,
  };
}
