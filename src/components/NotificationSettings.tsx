import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useWebPushSubscription } from '@/hooks/useWebPushSubscription';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

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
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isLoading}
          className="gap-2"
          title={isSubscribed ? 'Notifications enabled' : 'Notifications disabled'}
        >
          {isSubscribed ? (
            <BellRing className="h-4 w-4 text-primary" />
          ) : (
            <BellOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h4 className="font-medium text-sm">{t('notifications')}</h4>
              <p className="text-xs text-muted-foreground">
                {isSubscribed ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <Switch
              checked={isSubscribed}
              onCheckedChange={handleToggle}
              disabled={isLoading}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Get notified about new workouts, updates, and available spots.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
