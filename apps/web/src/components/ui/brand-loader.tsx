/**
 * Brand-level loading state. The orbit reads like a measured daily cycle,
 * while the food flame stays unmistakably Calorico rather than a stock spinner.
 */
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
        <span className="brand-loader__pulse" />
        <img
          src="/favicon.svg"
          width="64"
          height="64"
          alt=""
          className="brand-loader__logo"
        />
        <span className="brand-loader__dot brand-loader__dot--one" />
        <span className="brand-loader__dot brand-loader__dot--two" />
        <span className="brand-loader__dot brand-loader__dot--three" />
      </div>
      <p className="brand-loader__name">Calorico</p>
      <p className="brand-loader__label">{label}</p>
    </div>
  )
}
