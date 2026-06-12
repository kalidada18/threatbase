import React from 'react';
import { cn } from '@/lib/utils';

interface LiquidAuroraProps {
  children?: React.ReactNode;
  className?: string;
  color1?: string;
  color2?: string;
  color3?: string;
}

export const LiquidAurora = ({ 
  children, 
  className,
  color1 = "bg-emerald-500",
  color2 = "bg-cyan-500",
  color3 = "bg-blue-600"
}: LiquidAuroraProps) => {
  return (
    <div className={cn("relative w-full overflow-hidden bg-black", className)}>
      {/* The background shapes that form the aurora */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-40">
        <div className={cn("absolute w-[40vw] h-[40vw] min-w-[400px] min-h-[400px] rounded-full blur-[120px] mix-blend-screen animate-morph", color1)} style={{ top: '-10%', left: '-10%', animationDuration: '15s' }} />
        <div className={cn("absolute w-[50vw] h-[50vw] min-w-[500px] min-h-[500px] rounded-full blur-[120px] mix-blend-screen animate-morph", color2)} style={{ top: '20%', right: '-10%', animationDuration: '20s', animationDelay: '-5s' }} />
        <div className={cn("absolute w-[35vw] h-[35vw] min-w-[350px] min-h-[350px] rounded-full blur-[120px] mix-blend-screen animate-morph", color3)} style={{ bottom: '-10%', left: '20%', animationDuration: '18s', animationDelay: '-10s' }} />
      </div>

      {/* Content Container */}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
};

export { LiquidAurora as Component };
