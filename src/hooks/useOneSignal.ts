import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    OneSignal?: any;
  }
}

export const useOneSignal = () => {
  const { user } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [appId, setAppId] = useState<string | null>(null);

  // Fetch OneSignal App ID from edge function
  useEffect(() => {
    const fetchAppId = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-onesignal-app-id');
        if (error) {
          console.error('Error fetching OneSignal App ID:', error);
          return;
        }
        if (data?.appId) {
          setAppId(data.appId);
        }
      } catch (error) {
        console.error('Error fetching OneSignal App ID:', error);
      }
    };

    fetchAppId();
  }, []);

  useEffect(() => {
    if (!appId) {
      return;
    }

    // Initialize OneSignal
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    
    window.OneSignalDeferred.push(async function(OneSignal: any) {
      try {
        await OneSignal.init({
          appId,
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerParam: { scope: '/' },
          serviceWorkerPath: '/OneSignalSDKWorker.js',
        });
        
        console.log('OneSignal initialized');
        setIsInitialized(true);
        
        // Check subscription status
        const permission = await OneSignal.Notifications.permission;
        setIsSubscribed(permission);
        
        // Listen for subscription changes
        OneSignal.Notifications.addEventListener('permissionChange', (permission: boolean) => {
          console.log('Notification permission changed:', permission);
          setIsSubscribed(permission);
        });
        
      } catch (error) {
        console.error('OneSignal initialization error:', error);
      }
    });

    // Load OneSignal SDK if not already loaded
    if (!document.getElementById('onesignal-sdk')) {
      const script = document.createElement('script');
      script.id = 'onesignal-sdk';
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      document.head.appendChild(script);
    }
  }, [appId]);

  // Set external user ID when user logs in
  useEffect(() => {
    if (!isInitialized || !user) return;
    
    window.OneSignalDeferred?.push(async function(OneSignal: any) {
      try {
        await OneSignal.login(user.id);
        console.log('OneSignal: Set external user ID:', user.id);
      } catch (error) {
        console.error('OneSignal: Error setting external user ID:', error);
      }
    });
    
    return () => {
      // Logout when user signs out
      window.OneSignalDeferred?.push(async function(OneSignal: any) {
        try {
          await OneSignal.logout();
          console.log('OneSignal: User logged out');
        } catch (error) {
          console.error('OneSignal: Error logging out:', error);
        }
      });
    };
  }, [isInitialized, user]);

  const requestPermission = async () => {
    window.OneSignalDeferred?.push(async function(OneSignal: any) {
      try {
        await OneSignal.Notifications.requestPermission();
        const permission = await OneSignal.Notifications.permission;
        setIsSubscribed(permission);
      } catch (error) {
        console.error('Error requesting notification permission:', error);
      }
    });
  };

  return {
    isInitialized,
    isSubscribed,
    requestPermission,
  };
};
