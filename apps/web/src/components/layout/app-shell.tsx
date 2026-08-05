import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { BottomNav } from './bottom-nav'

/**
 * Mobile-first shell. On a phone it fills the viewport; on a desktop it stays a
 * 430 px column centred on the soft green backdrop, so the app looks like the
 * design instead of a stretched form.
 */
export function AppShell({
  children,
  nav = true,
  className,
}: {
  children: ReactNode
  nav?: boolean
  className?: string
}) {
  return (
    <div className="bg-[oklch(0.93_0.06_125)] dark:bg-[oklch(0.19_0.02_145)] flex h-dvh w-full justify-center overflow-hidden">
      <div
        className={cn(
          // Fixed height with an internal scroll area, so the bottom bar stays
          // pinned to the viewport instead of drifting below the content.
          'bg-background shadow-float relative flex h-dvh w-full max-w-[440px] flex-col overflow-hidden sm:my-6 sm:h-[calc(100dvh-3rem)] sm:rounded-[40px]',
          className,
        )}
      >
        <main
          className={cn(
            'no-scrollbar flex-1 overflow-y-auto overflow-x-hidden px-4 pt-[max(1rem,env(safe-area-inset-top))]',
            // Clears the bar itself, its safe-area padding, and the scan button
            // that overhangs it — derived from --nav-h instead of a guess.
            nav
              ? 'pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+2.5rem)]'
              : 'pb-8',
          )}
        >
          {children}
        </main>
        {nav ? <BottomNav /> : null}
      </div>
    </div>
  )
}
