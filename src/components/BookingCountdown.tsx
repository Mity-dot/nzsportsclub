import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Clock } from 'lucide-react';

interface BookingCountdownProps {
  targetDate: Date;
  label?: string;
}

export function BookingCountdown({ targetDate, label }: BookingCountdownProps) {
  const { language } = useLanguage();
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(targetDate));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(targetDate));
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (timeLeft.total <= 0) return null;

  const parts: string[] = [];
  if (timeLeft.days > 0) parts.push(`${timeLeft.days}${language === 'bg' ? 'д' : 'd'}`);
  if (timeLeft.hours > 0 || timeLeft.days > 0) parts.push(`${timeLeft.hours}${language === 'bg' ? 'ч' : 'h'}`);
  parts.push(`${timeLeft.minutes}${language === 'bg' ? 'м' : 'm'}`);
  parts.push(`${timeLeft.seconds}${language === 'bg' ? 'с' : 's'}`);

  return (
    <div className="flex items-center gap-1.5 text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded-md">
      <Clock className="h-3 w-3" />
      <span>
        {label || (language === 'bg' ? 'Отваря след' : 'Opens in')}{' '}
        {parts.join(' ')}
      </span>
    </div>
  );
}

function getTimeLeft(target: Date) {
  const total = target.getTime() - Date.now();
  if (total <= 0) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    total,
    days: Math.floor(total / (1000 * 60 * 60 * 24)),
    hours: Math.floor((total / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((total / (1000 * 60)) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}
