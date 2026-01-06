import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWebPushSubscription } from '@/hooks/useWebPushSubscription';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';

export function NotificationSettings() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { isSupported, isSubscribed, isLoading, error, subscribe, unsubscribe } = useWebPushSubscription();

  if (!isSupported) {
    return null;
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      const success = await unsubscribe();
      if (success) {
        toast({
          title: t('notifications'),
          description: 'Push notifications disabled',
        });
      }
    } else {
      const success = await subscribe();
      if (success) {
        toast({
          title: t('notifications'),
          description: 'Push notifications enabled! You will be notified about new workouts and available spots.',
        });
      } else if (error) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error,
        });
      }
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      disabled={isLoading}
      className="gap-2"
      title={isSubscribed ? 'Disable notifications' : 'Enable notifications'}
    >
      {isSubscribed ? (
        <Bell className="h-4 w-4 text-primary" />
      ) : (
        <BellOff className="h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  );
}
