import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

interface LanguageSelectorProps {
  variant?: 'default' | 'minimal';
}

export function LanguageSelector({ variant = 'default' }: LanguageSelectorProps) {
  const { language, setLanguage, t } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'bg' : 'en');
  };

  if (variant === 'minimal') {
    return (
      <button
        onClick={toggleLanguage}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Globe className="h-4 w-4" />
        <span>{language === 'en' ? 'BG' : 'EN'}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Globe className="h-5 w-5 text-muted-foreground" />
      <div className="flex rounded-full border border-border overflow-hidden">
        <button
          onClick={() => setLanguage('en')}
          className={`px-4 py-2 text-sm font-medium transition-all ${
            language === 'en' 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          English
        </button>
        <button
          onClick={() => setLanguage('bg')}
          className={`px-4 py-2 text-sm font-medium transition-all ${
            language === 'bg' 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          Български
        </button>
      </div>
    </div>
  );
}
