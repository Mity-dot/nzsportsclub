import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { User, CreditCard, Users, ArrowLeft, Camera, CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';

type SignUpType = 'member' | 'card_member' | 'staff' | null;

const emailSchema = z.string().trim().email({ message: "Invalid email" }).max(255);

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [signUpType, setSignUpType] = useState<SignUpType>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showPasswordUpdate, setShowPasswordUpdate] = useState(false);
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [cardImage, setCardImage] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotEmailValid, setForgotEmailValid] = useState<boolean | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Check for password recovery token in URL
  useEffect(() => {
    // Check hash fragment for recovery type
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    if (type === 'recovery') {
      setShowPasswordUpdate(true);
    }

    // Listen for auth state changes for recovery
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordUpdate(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const validateForgotEmail = (value: string) => {
    setForgotEmail(value);
    if (value.length === 0) {
      setForgotEmailValid(null);
      return;
    }
    const result = emailSchema.safeParse(value);
    setForgotEmailValid(result.success);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // If remember me is checked, we'll rely on Supabase's persistent session
    // The session is already persistent by default in our client config
    const { error } = await signIn(email, password);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } else {
      // Store remember me preference
      if (rememberMe) {
        localStorage.setItem('nz-remember-me', 'true');
      } else {
        localStorage.removeItem('nz-remember-me');
      }
      navigate('/');
    }
    
    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Check if email exists in our accounts
    const { data: emailExists } = await supabase
      .rpc('check_email_exists', { p_email: forgotEmail.trim() });
    
    if (!emailExists) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: t('emailNotFound'),
      });
      setIsLoading(false);
      return;
    }
    
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth`,
    });
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } else {
      toast({
        title: t('resetPasswordSent'),
      });
      setShowForgotPassword(false);
      setForgotEmail('');
    }
    
    setIsLoading(false);
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwordRegex.test(newPassword)) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: t('passwordTooWeak'),
      });
      return;
    }
    
    if (newPassword !== confirmNewPassword) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: t('passwordsDoNotMatch'),
      });
      return;
    }
    
    setIsLoading(true);
    
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } else {
      toast({
        title: t('passwordUpdated'),
      });
      setShowPasswordUpdate(false);
      setNewPassword('');
      setConfirmNewPassword('');
      // Clear the hash from URL
      window.history.replaceState(null, '', window.location.pathname);
      navigate('/');
    }
    
    setIsLoading(false);
  };

  // Password validation regex: at least 8 chars, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwordRegex.test(password)) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: t('passwordTooWeak'),
      });
      return;
    }
    
    if (password !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: t('passwordsDoNotMatch'),
      });
      return;
    }

    if (signUpType === 'card_member' && !cardImage) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: t('takeCardPhoto'),
      });
      return;
    }
    
    setIsLoading(true);
    
    const memberType = signUpType === 'card_member' ? 'card' : 'regular';
    const requestedRole = signUpType === 'staff' ? 'staff' : 
                          signUpType === 'card_member' ? 'card_member' : 'member';
    
    const { error } = await signUp(email, password, fullName, memberType, requestedRole);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } else {
      // Store remember me preference on signup too
      if (rememberMe) {
        localStorage.setItem('nz-remember-me', 'true');
      }
      toast({
        title: t('signUpSuccess'),
        description: signUpType === 'staff' ? t('staffPending') : undefined,
      });
      navigate('/');
    }
    
    setIsLoading(false);
  };

  const handleCardCapture = () => {
    // Create file input for camera
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setCardImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    };
    
    input.click();
  };

  const signUpOptions = [
    {
      type: 'member' as SignUpType,
      icon: User,
      title: t('signUpAsMember'),
      description: t('memberDescription'),
    },
    {
      type: 'card_member' as SignUpType,
      icon: CreditCard,
      title: t('signUpAsCardMember'),
      description: t('cardMemberDescription'),
    },
    {
      type: 'staff' as SignUpType,
      icon: Users,
      title: t('signUpAsStaff'),
      description: t('staffDescription'),
    },
  ];

  // Password Update Form (after clicking reset link)
  if (showPasswordUpdate) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/30 px-4 py-8">
        <div className="absolute top-4 right-4">
          <LanguageSelector variant="minimal" />
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="flex justify-center mb-6">
            <Logo size="md" />
          </div>
          
          <Card className="border-border/50 shadow-elegant">
            <CardHeader className="text-center">
              <CardTitle className="font-display text-2xl">{t('updatePassword')}</CardTitle>
              <CardDescription>{t('enterNewPassword')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t('newPassword')}</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="bg-background"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('passwordRequirements')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmNewPassword">{t('confirmPassword')}</Label>
                  <Input
                    id="confirmNewPassword"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                    className="bg-background"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t('loading') : t('updatePassword')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Forgot Password Form
  if (showForgotPassword) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/30 px-4 py-8">
        <div className="absolute top-4 right-4">
          <LanguageSelector variant="minimal" />
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="flex justify-center mb-6">
            <Logo size="md" />
          </div>
          
          <Card className="border-border/50 shadow-elegant">
            <CardHeader className="text-center">
              <CardTitle className="font-display text-2xl">{t('resetPassword')}</CardTitle>
              <CardDescription>{t('enterEmailForReset')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgotEmail">{t('email')}</Label>
                  <div className="relative">
                    <Input
                      id="forgotEmail"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => validateForgotEmail(e.target.value)}
                      required
                      className={`bg-background pr-10 ${
                        forgotEmailValid === true ? 'border-green-500' : 
                        forgotEmailValid === false ? 'border-destructive' : ''
                      }`}
                    />
                    {forgotEmailValid !== null && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {forgotEmailValid ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                    )}
                  </div>
                  {forgotEmailValid === false && (
                    <p className="text-xs text-destructive">{t('invalidEmail')}</p>
                  )}
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading || forgotEmailValid !== true}
                >
                  {isLoading ? t('loading') : t('sendResetLink')}
                </Button>
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setForgotEmail('');
                    setForgotEmailValid(null);
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('backToLogin')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/30 px-4 py-8">
      <div className="absolute top-4 right-4">
        <LanguageSelector variant="minimal" />
      </div>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex justify-center mb-6">
          <Logo size="md" />
        </div>
        
        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="signin" className="font-body">{t('signIn')}</TabsTrigger>
            <TabsTrigger value="signup" className="font-body">{t('signUp')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="signin">
            <Card className="border-border/50 shadow-elegant">
              <CardHeader className="text-center">
                <CardTitle className="font-display text-2xl">{t('welcome')}</CardTitle>
                <CardDescription>{t('signIn')}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">{t('password')}</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-background"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="rememberMe" 
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                      />
                      <Label htmlFor="rememberMe" className="text-sm cursor-pointer">
                        {t('rememberMe')}
                      </Label>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      {t('forgotPassword')}
                    </button>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? t('loading') : t('signIn')}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="signup">
            <Card className="border-border/50 shadow-elegant">
              <CardHeader className="text-center">
                <CardTitle className="font-display text-2xl">
                  {signUpType ? t('signUp') : t('chooseAccountType')}
                </CardTitle>
                {signUpType && (
                  <button 
                    onClick={() => setSignUpType(null)}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mx-auto mt-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t('back')}
                  </button>
                )}
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait">
                  {!signUpType ? (
                    <motion.div
                      key="options"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3"
                    >
                      {signUpOptions.map((option) => (
                        <button
                          key={option.type}
                          onClick={() => setSignUpType(option.type)}
                          className="w-full p-4 rounded-lg border border-border hover:border-primary hover:bg-accent/50 transition-all text-left flex items-start gap-4"
                        >
                          <div className="p-2 rounded-full bg-primary/10">
                            <option.icon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-medium text-foreground">{option.title}</h3>
                            <p className="text-sm text-muted-foreground">{option.description}</p>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.form
                      key="form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onSubmit={handleSignUp}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="fullName">{t('fullName')}</Label>
                        <Input
                          id="fullName"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          required
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signupEmail">{t('email')}</Label>
                        <Input
                          id="signupEmail"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">{t('phone')}</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signupPassword">{t('password')}</Label>
                        <Input
                          id="signupPassword"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={8}
                          className="bg-background"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t('passwordRequirements')}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          className="bg-background"
                        />
                      </div>
                      
                      {signUpType === 'card_member' && (
                        <div className="space-y-2">
                          <Label>{t('takeCardPhoto')}</Label>
                          <div 
                            onClick={handleCardCapture}
                            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
                          >
                            {cardImage ? (
                              <img src={cardImage} alt="Card" className="max-h-32 mx-auto rounded" />
                            ) : (
                              <>
                                <Camera className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground">{t('cardPhotoHint')}</p>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="rememberMeSignup" 
                          checked={rememberMe}
                          onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                        />
                        <Label htmlFor="rememberMeSignup" className="text-sm cursor-pointer">
                          {t('rememberMe')}
                        </Label>
                      </div>
                      
                      <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? t('loading') : t('signUp')}
                      </Button>
                      
                      {signUpType === 'staff' && (
                        <p className="text-xs text-center text-muted-foreground">
                          {t('staffPending')}
                        </p>
                      )}
                    </motion.form>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
