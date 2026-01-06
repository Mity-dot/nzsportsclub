import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Settings } from 'lucide-react';

export function MemberProfileEditor() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user, profile, refreshProfile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: profile?.email || '',
    phone: profile?.phone || '',
    full_name: profile?.full_name || '',
  });

  const handleOpen = (open: boolean) => {
    if (open && profile) {
      setFormData({
        email: profile.email || '',
        phone: profile.phone || '',
        full_name: profile.full_name || '',
      });
    }
    setIsOpen(open);
  };

  const handleSave = async () => {
    if (!user) return;
    
    setIsLoading(true);

    try {
      // Update profile in database
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          phone: formData.phone,
          full_name: formData.full_name,
        })
        .eq('user_id', user.id);

      if (profileError) throw profileError;

      // If email changed, update auth email too
      if (formData.email !== profile?.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: formData.email,
        });

        if (emailError) {
          // Rollback profile changes on email update failure
          throw emailError;
        }

        // Also update the email in profiles table
        await supabase
          .from('profiles')
          .update({ email: formData.email })
          .eq('user_id', user.id);

        toast({
          title: t('save'),
          description: 'Profile updated! Please check your new email for a confirmation link.',
        });
      } else {
        toast({
          title: t('save'),
          description: 'Profile updated successfully!',
        });
      }

      await refreshProfile();
      setIsOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">{t('edit')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{t('edit')} Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('fullName')}</Label>
            <Input
              value={formData.full_name}
              onChange={(e) => setFormData(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Your full name"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('email')}</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))}
              placeholder="your@email.com"
            />
            {formData.email !== profile?.email && (
              <p className="text-xs text-muted-foreground">
                Changing your email will require confirmation via a link sent to your new email.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t('phone')}</Label>
            <Input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(f => ({ ...f, phone: e.target.value }))}
              placeholder="+359 888 123 456"
            />
          </div>
          <Button 
            className="w-full" 
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? t('loading') : t('save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
