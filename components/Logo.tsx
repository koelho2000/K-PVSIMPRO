import React from 'react';

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width="100%" height="100%" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-auto h-full" style={{ maxHeight: '100%' }}>
        {/* Sun */}
        <circle cx="20" cy="14" r="6" fill="#F59E0B" />
        <path d="M20 4V6M20 22V24M10 14H12M28 14H30M13 7L14.5 8.5M25.5 19.5L27 21M13 21L14.5 19.5M25.5 8.5L27 7" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
        {/* Panel */}
        <path d="M8 24L12 34H28L32 24H8Z" fill="#3B82F6" stroke="#1E40AF" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M18 24L16 34M22 24L24 34M8 29H32" stroke="#1E40AF" strokeWidth="1" />
      </svg>
      <span className="font-bold tracking-wider leading-none">K-PVPROSIM</span>
    </div>
  );
};