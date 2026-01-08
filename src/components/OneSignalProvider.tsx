import { useEffect } from 'react';
import { useOneSignal } from '@/hooks/useOneSignal';

export const OneSignalProvider = ({ children }: { children: React.ReactNode }) => {
  // Initialize OneSignal
  useOneSignal();
  
  return <>{children}</>;
};
