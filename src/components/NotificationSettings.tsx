import { Bell, BellOff, BellRing, Loader2, Calendar, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificationSubscription } from '@/hooks/useNotificationSubscription';
import { useNotifications } from '@/hooks/useNotifications';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { bg, enUS } from 'date-fns/locale';

export function NotificationSettings() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { isSubscribed, isLoading: subLoading, error: subError, subscribe, unsubscribe } = useNotificationSubscription();
  const { notifications, unreadCount, isLoading: notifLoading, clearNotifications } = useNotifications();
  const [isToggling, setIsToggling] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = async () => {
    if (isToggling || subLoading) return;

    setIsToggling(true);
    try {
      if (isSubscribed) {
        const success = await unsubscribe();
        if (success) {
          toast({
            title: t('notifications'),
            description: language === 'bg' ? 'Известията са изключени' : 'Notifications disabled',
          });
        } else {
          toast({
            title: t('notifications'),
            description:
              language === 'bg'
                ? (subError ?? 'Неуспешно изключване на известията')
                : (subError ?? 'Failed to disable notifications'),
          });
        }
      } else {
        const success = await subscribe();
        if (success) {
          toast({
            title: t('notifications'),
            description:
              language === 'bg'
                ? 'Известията са включени! Ще бъдете уведомявани за нови тренировки.'
                : 'Notifications enabled! You will be notified about new workouts.',
          });
        } else {
          toast({
            title: t('notifications'),
            description:
              language === 'bg'
                ? (subError ?? 'Неуспешно включване на известията. Проверете разрешенията на браузъра.')
                : (subError ?? 'Failed to enable notifications. Check browser permissions.'),
          });
        }
      }
    } finally {
      setIsToggling(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && unreadCount > 0) {
      clearNotifications();
    }
  };

  const showLoading = subLoading || isToggling;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_workout':
        return '🏋️';
      case 'workout_updated':
        return '📝';
      case 'workout_deleted':
        return '❌';
      case 'spot_freed':
        return '🎉';
      case 'workout_full':
        return '📋';
      default:
        return '🔔';
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 relative"
          title={isSubscribed ? 'Notifications enabled' : 'Notifications disabled'}
        >
          {showLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : isSubscribed ? (
            <BellRing className="h-4 w-4 text-primary" />
          ) : (
            <BellOff className="h-4 w-4 text-muted-foreground" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          {/* Toggle section */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h4 className="font-medium text-sm">{t('notifications')}</h4>
              <p className="text-xs text-muted-foreground">
                {showLoading 
                  ? (language === 'bg' ? 'Зареждане...' : 'Loading...') 
                  : isSubscribed 
                    ? (language === 'bg' ? 'Включени' : 'Enabled')
                    : (language === 'bg' ? 'Изключени' : 'Disabled')}
              </p>
            </div>
            <Switch
              checked={isSubscribed}
              onCheckedChange={handleToggle}
              disabled={showLoading}
            />
          </div>

          {/* Notifications list */}
          {isSubscribed && notifications.length > 0 && (
            <>
              <div className="border-t pt-3">
                <h5 className="text-xs font-medium text-muted-foreground mb-2">
                  {language === 'bg' ? 'Последни известия' : 'Recent notifications'}
                </h5>
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {notifications.slice(0, 10).map((notification) => (
                      <div
                        key={notification.id}
                        className="p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-base mt-0.5">
                            {getNotificationIcon(notification.notification_type)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">
                              {language === 'bg' && notification.message_bg 
                                ? notification.message_bg 
                                : notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDistanceToNow(new Date(notification.created_at), { 
                                addSuffix: true,
                                locale: language === 'bg' ? bg : enUS
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}

          {isSubscribed && notifications.length === 0 && !notifLoading && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              {language === 'bg' ? 'Няма известия' : 'No notifications yet'}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {language === 'bg' 
              ? 'Получавайте известия за нови тренировки, промени и свободни места.'
              : 'Get notified about new workouts, updates, and available spots.'}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}