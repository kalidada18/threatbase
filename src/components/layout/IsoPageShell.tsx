import IsoLevelWarp from '@/components/ui/isometric-wave-grid-background'
import { cn } from '@/lib/utils'

interface IsoPageShellProps {
  children: React.ReactNode
  /** rgb triple passed to the isometric background. */
  color?: string
  density?: number
  speed?: number
  /** Classes for the centered content layer (defaults to vertical page padding). */
  contentClassName?: string
}

/**
 * Full-bleed page scaffold with the animated isometric grid backdrop and a
 * centered content layer. Used by the legal/policy/about pages so they share
 * one consistent backdrop and top/bottom rhythm.
 */
export default function IsoPageShell({
  children,
  color = '207, 23, 51',
  density = 50,
  speed = 1.2,
  contentClassName,
}: IsoPageShellProps) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden font-sans bg-app">
      <IsoLevelWarp color={color} density={density} speed={speed} />
      <div className={cn('relative z-10 flex flex-col items-center px-6 pt-28 pb-24', contentClassName)}>
        {children}
      </div>
    </div>
  )
}
