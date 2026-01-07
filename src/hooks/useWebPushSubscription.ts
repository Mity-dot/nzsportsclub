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

  const subscribe = useCallback(async () => {
    if (!user || !isSupported) {
      console.log('Cannot subscribe:', { user: !!user, isSupported });
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

      // Dynamically import Firebase
      const { initializeApp, getApps, getApp } = await import('firebase/app');
      const { getMessaging, getToken } = await import('firebase/messaging');
      
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      const messaging = getMessaging(app);
      
      if (!('serviceWorker' in navigator)) {
        setError('Service worker not supported');
        setIsLoading(false);
        return false;
      }

      // Ensure the Firebase messaging service worker is registered and ready.
      let swRegistration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (!swRegistration) {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      }
      // Wait for the service worker to be active
      await navigator.serviceWorker.ready;

      console.log('Service worker ready, getting FCM token...');

      const fcmToken = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      });

      if (!fcmToken) {
        setError('Failed to get notification token');
        setIsLoading(false);
        return false;
      }

      console.log('FCM token obtained:', fcmToken.substring(0, 20) + '...');

      // Delete old subscriptions for this user
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      // Save the FCM token to database with fcm:// prefix for identification
      const fcmEndpoint = `fcm://token/${fcmToken}`;
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .insert({
          user_id: user.id,
          endpoint: fcmEndpoint,
          p256dh: 'fcm',
          auth: 'fcm',
        });

      if (dbError) {
        console.error('Error saving FCM token:', dbError);
        setError('Failed to save subscription');
        setIsLoading(false);
        return false;
      }

      console.log('FCM subscription saved to database');
      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('Error subscribing to FCM:', err);
      setError('Failed to subscribe to notifications');
      setIsLoading(false);
      return false;
    }
  }, [user, isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!user) return false;

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
        // FCM token deletion can fail if SW isn't registered, that's OK
        console.warn('Could not delete FCM token (may already be deleted):', fcmErr);
      }

      // Always remove from database regardless of FCM deletion result
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      if (dbError) {
        console.error('Error removing subscription from database:', dbError);
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
