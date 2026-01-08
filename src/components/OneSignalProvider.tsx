import { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface OneSignalContextType {
  isInitialized: boolean;
  isSubscribed: boolean;
  requestPermission: () => Promise<void>;
}

const OneSignalContext = createContext<OneSignalContextType>({
  isInitialized: false,
  isSubscribed: false,
  requestPermission: async () => {},
});

export const useOneSignal = () => useContext(OneSignalContext);

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    OneSignal?: any;
  }
}

export const OneSignalProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [appId, setAppId] = useState<string | null>(null);

  // Fetch OneSignal App ID from edge function
  useEffect(() => {
    let mounted = true;
    
    const fetchAppId = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-onesignal-app-id');
        if (error) {
          console.error('Error fetching OneSignal App ID:', error);
          return;
        }
        if (mounted && data?.appId) {
          setAppId(data.appId);
        }
      } catch (error) {
        console.error('Error fetching OneSignal App ID:', error);
      }
    };

    fetchAppId();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize OneSignal when appId is available
  useEffect(() => {
    if (!appId) return;

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
        
        const permission = await OneSignal.Notifications.permission;
        setIsSubscribed(permission);
        
        OneSignal.Notifications.addEventListener('permissionChange', (perm: boolean) => {
          console.log('Notification permission changed:', perm);
          setIsSubscribed(perm);
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
  }, [isInitialized, user]);

  const requestPermission = async () => {
    return new Promise<void>((resolve) => {
      window.OneSignalDeferred?.push(async function(OneSignal: any) {
        try {
          await OneSignal.Notifications.requestPermission();
          const permission = await OneSignal.Notifications.permission;
          setIsSubscribed(permission);
          resolve();
        } catch (error) {
          console.error('Error requesting notification permission:', error);
          resolve();
        }
      });
    });
  };

  return (
    <OneSignalContext.Provider value={{ isInitialized, isSubscribed, requestPermission }}>
      {children}
    </OneSignalContext.Provider>
  );
};
