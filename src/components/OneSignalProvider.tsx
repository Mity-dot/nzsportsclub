import { useEffect, useState, createContext, useContext, useRef, ReactNode, useCallback } from 'react';
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

// Production domain where OneSignal is configured
const PRODUCTION_DOMAIN = 'nzsportsclub.lovable.app';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OneSignal?: any;
  }
}

export const OneSignalProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [appId, setAppId] = useState<string | null>(null);
  const initRef = useRef(false);
  const userSetRef = useRef<string | null>(null);

  // Check if we're on the production domain
  const isProductionDomain = typeof window !== 'undefined' && 
    window.location.hostname === PRODUCTION_DOMAIN;

  // Fetch OneSignal App ID from edge function (only on production)
  useEffect(() => {
    // Only initialize OneSignal on production domain
    if (!isProductionDomain) {
      console.log('OneSignal: Skipping initialization (not on production domain)');
      return;
    }

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
  }, [isProductionDomain]);

  // Initialize OneSignal when appId is available (production only)
  useEffect(() => {
    if (!appId || initRef.current || !isProductionDomain) return;
    initRef.current = true;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.OneSignalDeferred.push(async function(OneSignal: any) {
      try {
        await OneSignal.init({
          appId,
          serviceWorkerParam: { scope: '/' },
          serviceWorkerPath: '/OneSignalSDKWorker.js',
        });
        
        console.log('OneSignal initialized successfully');
        setIsInitialized(true);
        
        const permission = OneSignal.Notifications.permission;
        setIsSubscribed(permission);
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  }, [appId, isProductionDomain]);

  // Set external user ID when user logs in (production only)
  useEffect(() => {
    if (!isInitialized || !user || userSetRef.current === user.id || !isProductionDomain) return;
    userSetRef.current = user.id;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.OneSignalDeferred?.push(async function(OneSignal: any) {
      try {
        await OneSignal.login(user.id);
        console.log('OneSignal: Set external user ID:', user.id);
      } catch (error) {
        console.error('OneSignal: Error setting external user ID:', error);
      }
    });
  }, [isInitialized, user, isProductionDomain]);

  const requestPermission = useCallback(async () => {
    // On non-production domains, just resolve immediately
    if (!isProductionDomain) {
      console.log('OneSignal: Permission request skipped (not on production domain)');
      return;
    }

    return new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.OneSignalDeferred?.push(async function(OneSignal: any) {
        try {
          await OneSignal.Notifications.requestPermission();
          const permission = OneSignal.Notifications.permission;
          setIsSubscribed(permission);
          resolve();
        } catch (error) {
          console.error('Error requesting notification permission:', error);
          resolve();
        }
      });
    });
  }, [isProductionDomain]);

  return (
    <OneSignalContext.Provider value={{ isInitialized, isSubscribed, requestPermission }}>
      {children}
    </OneSignalContext.Provider>
  );
};
