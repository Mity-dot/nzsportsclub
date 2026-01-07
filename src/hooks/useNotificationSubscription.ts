import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type SubscriptionResult = { success: boolean; error?: string };

const formatErr = (err: unknown) => {
  const anyErr = err as { message?: string; code?: string } | null;
  const msg = anyErr?.message ?? (err instanceof Error ? err.message : String(err));
  const code = anyErr?.code ? ` (${anyErr.code})` : '';
  return `${msg}${code}`;
};

// Convert base64 string to Uint8Array for VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

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
          setIsSupported(true);
          
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
          // Web platform (browser or PWA) - use VAPID Web Push
          const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
          
          if (!supported) {
            console.log('Web Push not supported in this browser');
            setIsSupported(false);
            setIsLoading(false);
            return;
          }

          setIsSupported(true);

          // Check if user has an existing Web Push subscription
          if (user) {
            const { data: existingSubscription } = await supabase
              .from('push_subscriptions')
              .select('id')
              .eq('user_id', user.id)
              .not('endpoint', 'like', 'native://%')
              .not('endpoint', 'like', 'fcm://%')
              .maybeSingle();
            
            setIsSubscribed(!!existingSubscription);
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

      let permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        const msg = 'Notification permission denied. Please enable notifications in device settings.';
        setError(msg);
        return { success: false, error: msg };
      }

      return new Promise((resolve) => {
        let resolved = false;
        
        const resolveOnce = (result: SubscriptionResult) => {
          if (!resolved) {
            resolved = true;
            resolve(result);
          }
        };

        PushNotifications.addListener('registration', async (token) => {
          console.log('Native push registration success, token:', token.value.substring(0, 20) + '...');
          
          try {
            await supabase.from('push_subscriptions').delete().eq('user_id', user.id);

            const nativeEndpoint = `native://fcm/${token.value}`;
            const { error: dbError } = await supabase.from('push_subscriptions').insert({
              user_id: user.id,
              endpoint: nativeEndpoint,
              p256dh: 'native',
              auth: 'native',
            });

            if (dbError) {
              const msg = `Failed to save subscription: ${dbError.message}`;
              setError(msg);
              setIsLoading(false);
              resolveOnce({ success: false, error: msg });
              return;
            }

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

        PushNotifications.addListener('registrationError', (err) => {
          const msg = `Push registration failed: ${formatErr(err)}`;
          setError(msg);
          setIsLoading(false);
          resolveOnce({ success: false, error: msg });
        });

        PushNotifications.register().catch((regErr) => {
          const msg = `Failed to register: ${formatErr(regErr)}`;
          setError(msg);
          setIsLoading(false);
          resolveOnce({ success: false, error: msg });
        });

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
      setError(msg);
      setIsLoading(false);
      return { success: false, error: msg };
    }
  }, [user]);

  // Web subscribe using VAPID-based Web Push (works in browser AND installed PWAs)
  const subscribeWeb = useCallback(async (): Promise<SubscriptionResult> => {
    if (!user || !isSupported) {
      const msg = 'Cannot subscribe: unsupported device or not logged in';
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

      // Register our service worker
      let swRegistration = await navigator.serviceWorker.getRegistration('/');
      if (!swRegistration) {
        swRegistration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service worker registered');
      }
      await navigator.serviceWorker.ready;
      console.log('Service worker ready');

      // Get VAPID public key from edge function
      const { data: vapidData, error: vapidError } = await supabase.functions.invoke('get-vapid-public-key');
      
      if (vapidError || !vapidData?.publicKey) {
        const msg = 'Failed to get push configuration';
        console.error('VAPID error:', vapidError);
        setError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }

      const vapidPublicKey = vapidData.publicKey;
      console.log('Got VAPID public key');

      // Subscribe to push with the VAPID key
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      
      // Unsubscribe from any existing subscription first (in case VAPID key changed)
      try {
        const existingSubscription = await swRegistration.pushManager.getSubscription();
        if (existingSubscription) {
          console.log('Unsubscribing from existing push subscription...');
          await existingSubscription.unsubscribe();
        }
      } catch (unsubErr) {
        console.warn('Could not unsubscribe existing subscription:', unsubErr);
      }
      
      let pushSubscription: PushSubscription;
      try {
        pushSubscription = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
        });
        console.log('Push subscription created');
      } catch (pushErr) {
        const msg = `Failed to subscribe to push: ${formatErr(pushErr)}`;
        console.error(msg, pushErr);
        setError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }

      // Extract subscription details
      const subscriptionJson = pushSubscription.toJSON();
      const endpoint = subscriptionJson.endpoint!;
      const p256dh = subscriptionJson.keys?.p256dh || '';
      const auth = subscriptionJson.keys?.auth || '';

      console.log('Subscription endpoint:', endpoint.substring(0, 50) + '...');

      // Delete old subscriptions for this user
      await supabase.from('push_subscriptions').delete().eq('user_id', user.id);

      // Save the Web Push subscription to database
      const { error: dbError } = await supabase.from('push_subscriptions').insert({
        user_id: user.id,
        endpoint: endpoint,
        p256dh: p256dh,
        auth: auth,
      });

      if (dbError) {
        const msg = `Failed to save subscription: ${dbError.message}`;
        console.error('Error saving subscription:', dbError);
        setError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }

      console.log('Web Push subscription saved to database');
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
        // Unsubscribe from Web Push
        try {
          const swRegistration = await navigator.serviceWorker.getRegistration('/');
          if (swRegistration) {
            const pushSubscription = await swRegistration.pushManager.getSubscription();
            if (pushSubscription) {
              await pushSubscription.unsubscribe();
              console.log('Unsubscribed from Web Push');
            }
          }
        } catch (pushErr) {
          console.warn('Could not unsubscribe from push:', pushErr);
        }
      }

      // Remove from database
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      if (dbError) {
        const msg = `Failed to remove subscription: ${dbError.message}`;
        setError(msg);
        setIsLoading(false);
        return { success: false, error: msg };
      }

      setIsSubscribed(false);
      setIsLoading(false);
      return { success: true };
    } catch (err) {
      const msg = `Failed to disable notifications: ${formatErr(err)}`;
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
