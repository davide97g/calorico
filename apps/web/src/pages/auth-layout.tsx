import type { ReactNode } from 'react'
import { Flame } from 'lucide-react'

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="bg-[oklch(0.93_0.06_125)] dark:bg-[oklch(0.19_0.02_145)] flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <span className="bg-primary text-primary-foreground shadow-soft mx-auto flex size-14 items-center justify-center rounded-lg">
            <Flame className="size-7" strokeWidth={2.4} />
          </span>
          <h1 className="mt-4 text-display-sm leading-none font-extrabold tracking-tight">
            Calorico
          </h1>
          <p className="text-foreground/70 mt-3 text-lg font-semibold">
            {title}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
