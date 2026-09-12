import type { Variants } from 'framer-motion'

/** Shared entrance easing — one motion feel across the site (expo ease-out). */
export const EASE_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1]

/* Cockpit reveal: bands stagger in DOM order (Leaderboard's variant pattern). */
export const cockpitContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
}
export const cockpitBand: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 28 } },
}
