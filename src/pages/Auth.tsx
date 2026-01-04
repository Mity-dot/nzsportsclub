import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { User, CreditCard, Users, Shield, ArrowLeft, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type SignUpType = 'member' | 'card_member' | 'staff' | null;

export default function Auth() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [signUpType, setSignUpType] = useState<SignUpType>(null);
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [cardImage, setCardImage] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const { error } = await signIn(email, password);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } else {
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
