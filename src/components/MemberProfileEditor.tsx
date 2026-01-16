import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Settings, Camera, Loader2, Crown } from 'lucide-react';

export function MemberProfileEditor() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { user, profile, isCardMember, refreshProfile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    email: profile?.email || '',
    phone: profile?.phone || '',
    full_name: profile?.full_name || '',
  });
  
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);
  const [autoReserveEnabled, setAutoReserveEnabled] = useState(true);
  const [preferredWorkoutType, setPreferredWorkoutType] = useState<'early' | 'late' | null>(null);

  const handleOpen = async (open: boolean) => {
    if (open && profile) {
      setFormData({
        email: profile.email || '',
        phone: profile.phone || '',
        full_name: profile.full_name || '',
      });
      
      // Fetch current card member preferences
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('card_image_url, auto_reserve_enabled, preferred_workout_type')
          .eq('user_id', user.id)
          .single();
        
        if (data) {
          setCardImageUrl(data.card_image_url);
          setAutoReserveEnabled(data.auto_reserve_enabled ?? true);
          setPreferredWorkoutType(data.preferred_workout_type as 'early' | 'late' | null);
        }
      }
    }
    setIsOpen(open);
  };

  const handleCardImageUpload = async (file: File) => {
    if (!user || !file) return;
    
    setUploadingImage(true);
    
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/card-image.${fileExt}`;
      
      // Upload the file
      const { error: uploadError } = await supabase.storage
        .from('card-images')
        .upload(filePath, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Get signed URL (private bucket)
      const { data: signedData, error: signedError } = await supabase.storage
        .from('card-images')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year
      
      if (signedError) throw signedError;
      
      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ card_image_url: signedData.signedUrl })
        .eq('user_id', user.id);
      
      if (updateError) throw updateError;
      
      setCardImageUrl(signedData.signedUrl);
      
      toast({
        title: language === 'bg' ? 'Снимката е качена' : 'Card image uploaded',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    
    setIsLoading(true);

    try {
      // Build update object
      const updateData: any = {
        phone: formData.phone,
        full_name: formData.full_name,
      };
      
      // Add card member preferences if applicable
      if (isCardMember) {
        updateData.auto_reserve_enabled = autoReserveEnabled;
        updateData.preferred_workout_type = preferredWorkoutType;
      }
      
      // Update profile in database
      const { error: profileError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('user_id', user.id);

      if (profileError) throw profileError;

      // If email changed, update auth email too
      if (formData.email !== profile?.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: formData.email,
        });

        if (emailError) {
          throw emailError;
        }

        // Also update the email in profiles table
        await supabase
          .from('profiles')
          .update({ email: formData.email })
          .eq('user_id', user.id);

        toast({
          title: t('save'),
          description: language === 'bg' 
            ? 'Профилът е актуализиран! Проверете новия си имейл за потвърждение.'
            : 'Profile updated! Please check your new email for a confirmation link.',
        });
      } else {
        toast({
          title: t('save'),
          description: language === 'bg' ? 'Профилът е актуализиран успешно!' : 'Profile updated successfully!',
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {language === 'bg' ? 'Редактирай профил' : 'Edit Profile'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Card Image Upload - Only for card members */}
          {isCardMember && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-primary" />
                {language === 'bg' ? 'Снимка на карта' : 'Card Photo'}
              </Label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  {cardImageUrl ? (
                    <img
                      src={cardImageUrl}
                      alt="Card"
                      className="h-20 w-20 rounded-lg object-cover ring-2 ring-primary/30"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center ring-2 ring-dashed ring-muted-foreground/30">
                      <Camera className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  {uploadingImage && (
                    <div className="absolute inset-0 bg-background/80 flex items-center justify-center rounded-lg">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCardImageUpload(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="w-full"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {cardImageUrl 
                      ? (language === 'bg' ? 'Смени снимка' : 'Change Photo')
                      : (language === 'bg' ? 'Качи снимка' : 'Upload Photo')
                    }
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    {language === 'bg' ? 'Снимка на членската ви карта' : 'Photo of your membership card'}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Auto-reserve preferences - Only for card members */}
          {isCardMember && (
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  <Label className="font-medium">
                    {language === 'bg' ? 'Автоматична резервация' : 'Auto-reserve'}
                  </Label>
                </div>
                <Switch
                  checked={autoReserveEnabled}
                  onCheckedChange={setAutoReserveEnabled}
                />
              </div>
              
              {autoReserveEnabled && (
                <div className="pl-6 border-l-2 border-primary/20 space-y-2">
                  <Label className="text-sm">
                    {language === 'bg' ? 'Авто-резервация за' : 'Auto-reserve for'}
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={preferredWorkoutType === 'early' ? 'default' : 'outline'}
                      onClick={() => setPreferredWorkoutType(preferredWorkoutType === 'early' ? null : 'early')}
                    >
                      {t('early')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={preferredWorkoutType === 'late' ? 'default' : 'outline'}
                      onClick={() => setPreferredWorkoutType(preferredWorkoutType === 'late' ? null : 'late')}
                    >
                      {t('late')}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {preferredWorkoutType 
                      ? (language === 'bg' 
                          ? `Авто-резервация само за ${preferredWorkoutType === 'early' ? 'ранни' : 'късни'} тренировки` 
                          : `Auto-reserve only for ${preferredWorkoutType} workouts`)
                      : (language === 'bg' 
                          ? 'Изберете тип тренировка за авто-резервация' 
                          : 'Select a workout type for auto-reserve')
                    }
                  </p>
                </div>
              )}
            </div>
          )}
          
          <div className="space-y-2">
            <Label>{t('fullName')}</Label>
            <Input
              value={formData.full_name}
              onChange={(e) => setFormData(f => ({ ...f, full_name: e.target.value }))}
              placeholder={language === 'bg' ? 'Вашето пълно име' : 'Your full name'}
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
                {language === 'bg' 
                  ? 'Смяната на имейл изисква потвърждение чрез линк, изпратен на новия имейл.'
                  : 'Changing your email will require confirmation via a link sent to your new email.'}
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
