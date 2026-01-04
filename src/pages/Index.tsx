import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function Index() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user, isLoading } = useAuth();
  
  // Check if language is selected
  const hasSelectedLanguage = localStorage.getItem('nz-language');

  useEffect(() => {
    if (!isLoading) {
      if (!hasSelectedLanguage) {
        navigate('/language');
      } else if (user) {
        navigate('/dashboard');
      } else {
        navigate('/auth');
      }
    }
  }, [user, isLoading, hasSelectedLanguage, navigate]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/30 px-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-6"
      >
        <Logo size="lg" />
        <h1 className="font-display text-3xl font-semibold text-foreground">
          NZ Sport Club
        </h1>
        <div className="animate-pulse text-muted-foreground">
          {t('loading')}
        </div>
      </motion.div>
    </div>
  );
}
