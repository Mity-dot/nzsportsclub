import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function LanguageSelect() {
  const navigate = useNavigate();
  const { setLanguage } = useLanguage();

  const selectLanguage = (lang: 'en' | 'bg') => {
    setLanguage(lang);
    navigate('/auth');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/30 px-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center gap-8 max-w-md w-full"
      >
        <Logo size="lg" />
        
        <div className="text-center space-y-2">
          <h1 className="font-display text-3xl font-semibold text-foreground">
            Welcome / Добре дошли
          </h1>
          <p className="text-muted-foreground">
            Choose your language / Изберете език
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full">
          <Button
            onClick={() => selectLanguage('en')}
            className="flex-1 h-14 text-lg font-medium bg-primary hover:bg-peach-dark transition-all"
          >
            🇬🇧 English
          </Button>
          <Button
            onClick={() => selectLanguage('bg')}
            className="flex-1 h-14 text-lg font-medium bg-primary hover:bg-peach-dark transition-all"
          >
            🇧🇬 Български
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
