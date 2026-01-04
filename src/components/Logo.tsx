import nzLogo from '@/assets/nz-logo.png';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Logo({ size = 'md', className = '' }: LogoProps) {
  const sizes = {
    sm: 'h-12',
    md: 'h-20',
    lg: 'h-32',
  };

  return (
    <img 
      src={nzLogo} 
      alt="NZ Sport Club" 
      className={`${sizes[size]} w-auto object-contain ${className}`}
    />
  );
}
