import { useEffect, useRef, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** Mirrors the OS reduce-motion switch, so JS animation can opt out like CSS does. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * Animates a figure towards `target`, starting from whatever is on screen so a
 * mid-flight change re-aims instead of snapping back to zero.
 */
export function useCountUp(target: number, duration = 750) {
  const reduced = usePrefersReducedMotion()
  const [value, setValue] = useState(() => (reduced ? target : 0))
  const shown = useRef(value)

  useEffect(() => {
    if (reduced) {
      shown.current = target
      setValue(target)
      return
    }

    const origin = shown.current
    const start = performance.now()
    let raf = 0

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // ease-out cubic: moves fast, then settles on the final digits.
      const next = origin + (target - origin) * (1 - (1 - t) ** 3)
      shown.current = next
      setValue(next)
      if (t < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduced])

  return value
}
