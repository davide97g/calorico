/**
 * Brand-level loading state. The orbit reads like a measured daily cycle, the
 * sweeping arc says work is under way, and the food flame stays unmistakably
 * Calorico rather than a stock spinner. Everything eases in on a stagger, so a
 * slow network looks like the app arriving rather than a spinner switching on.
 *
 * Motion lives in `.brand-loader` in index.css, next to the keyframes.
 */

/** Three foods spaced round the ring; the emoji are the same voice as the diary. */
const SATELLITES = [
  { emoji: '🥑', angle: '0deg', delay: '180ms' },
  { emoji: '🍓', angle: '120deg', delay: '280ms' },
  { emoji: '🥖', angle: '240deg', delay: '380ms' },
] as const

export function BrandLoader({ label = 'Prepariamo la tua giornata' }: { label?: string }) {
  return (
    <div
      className="brand-loader"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="brand-loader__mark" aria-hidden>
        <span className="brand-loader__orbit brand-loader__orbit--outer" />
        <span className="brand-loader__orbit brand-loader__orbit--inner" />
        <span className="brand-loader__sweep" />
        <span className="brand-loader__pulse" />
        <img
          src="/favicon.svg"
          width="64"
          height="64"
          alt=""
          className="brand-loader__logo"
        />
        {SATELLITES.map(({ emoji, angle, delay }) => (
          <span
            key={emoji}
            className="brand-loader__sat"
            style={{ '--a': angle, '--sat-in': delay } as React.CSSProperties}
          >
            <span>{emoji}</span>
          </span>
        ))}
      </div>
      <p className="brand-loader__name">Calorico</p>
      <p className="brand-loader__label">{label}</p>
    </div>
  )
}
