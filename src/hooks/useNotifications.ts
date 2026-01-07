import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Notification {
  id: string;
  workout_id: string | null;
  notification_type: string;
  message: string;
  message_bg: string | null;
  is_sent: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notification_queue')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching notifications:', error);
        setIsLoading(false);
        return;
      }

      setNotifications(data || []);
      // Count notifications from the last 24 hours as "unread"
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = (data || []).filter(n => new Date(n.created_at) > oneDayAgo);
      setUnreadCount(recent.length);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }

    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_queue',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('New notification received:', payload);
          setNotifications(prev => [payload.new as Notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const clearNotifications = useCallback(async () => {
    if (!user) return;

    // We don't actually delete, just clear the local state
    setUnreadCount(0);
  }, [user]);

  return {
    notifications,
    unreadCount,
    isLoading,
    refresh: fetchNotifications,
    clearNotifications,
  };
}