import { describe, expect, it } from 'vitest'
import { cn } from './utils'

/**
 * The type scale in index.css uses names tailwind-merge does not ship with, and
 * an unknown `text-*` is read as a colour. Combining a size with a colour in one
 * `cn()` therefore dropped the size and left the text at the inherited 16px —
 * which is how the nav labels ended up rendering three times too big.
 */
describe('cn with the custom type scale', () => {
  it('keeps a custom size alongside a colour', () => {
    expect(cn('text-micro', 'text-muted-foreground')).toBe(
      'text-micro text-muted-foreground',
    )
    expect(cn('text-hero', 'text-primary-strong')).toBe(
      'text-hero text-primary-strong',
    )
  })

  it('still lets one size win over another', () => {
    expect(cn('text-sm', 'text-micro')).toBe('text-micro')
    expect(cn('text-micro', 'text-display')).toBe('text-display')
    expect(cn('text-display-sm', 'text-2xl')).toBe('text-2xl')
  })

  it('still collapses two colours', () => {
    expect(cn('text-muted-foreground', 'text-primary-strong')).toBe(
      'text-primary-strong',
    )
  })
})
