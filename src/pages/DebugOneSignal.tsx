import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOneSignal } from '@/components/OneSignalProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, Bell, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function DebugOneSignal() {
  const { user } = useAuth();
  const { isInitialized, isSubscribed, requestPermission } = useOneSignal();
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const sendTestNotification = async () => {
    if (!user) {
      toast.error('You must be logged in to send a test notification');
      return;
    }

    setSending(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('unified-notification', {
        body: {
          type: 'new_workout',
          workoutId: 'test-' + Date.now(),
          workoutTitle: 'Test Notification',
          workoutTitleBg: 'Тестово известие',
          workoutDate: new Date().toISOString().split('T')[0],
          workoutTime: '12:00',
          targetUserIds: [user.id],
        },
      });

      if (error) {
        setLastResult(`Error: ${error.message}`);
        toast.error('Failed to send notification');
      } else {
        setLastResult(JSON.stringify(data, null, 2));
        toast.success('Test notification sent!');
      }
    } catch (err) {
      setLastResult(`Exception: ${err}`);
      toast.error('Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle className="h-5 w-5 text-green-500" />
      ) : (
        <XCircle className="h-5 w-5 text-red-500" />
      )}
      <span>{label}</span>
      <Badge variant={ok ? 'default' : 'destructive'}>{ok ? 'Yes' : 'No'}</Badge>
    </div>
  );

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-6 w-6" />
            OneSignal Debug Panel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Checks */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Status Checks</h3>
            <StatusBadge ok={!!user} label="User Logged In" />
            <StatusBadge ok={isInitialized} label="OneSignal Initialized" />
            <StatusBadge ok={isSubscribed} label="Push Permission Granted" />
            {user && (
              <div className="text-sm text-muted-foreground">
                User ID: <code className="bg-muted px-1 rounded">{user.id}</code>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg">Actions</h3>
            
            {!isSubscribed && (
              <Button onClick={requestPermission} variant="outline" className="w-full">
                <Bell className="h-4 w-4 mr-2" />
                Request Notification Permission
              </Button>
            )}

            <Button 
              onClick={sendTestNotification} 
              disabled={sending || !user}
              className="w-full"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Test Notification
            </Button>
          </div>

          {/* Result */}
          {lastResult && (
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Last Result</h3>
              <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-60">
                {lastResult}
              </pre>
            </div>
          )}

          {/* Help */}
          <div className="text-sm text-muted-foreground border-t pt-4">
            <p><strong>How to test:</strong></p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>Ensure you're logged in</li>
              <li>Grant notification permission if not already done</li>
              <li>Click "Send Test Notification"</li>
              <li>Check the result for success/failure details</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
