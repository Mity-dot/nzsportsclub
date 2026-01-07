import { useFCMPushSubscription } from './useFCMPushSubscription';

// Re-export the FCM hook as the default notification subscription hook
export function useNotificationSubscription() {
  return useFCMPushSubscription();
}
