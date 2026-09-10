/**
 * Says where a food's numbers came from, for the one source that has to be
 * named: Tosano publishes the label table itself, and Calorico reads it only
 * where Open Food Facts is silent. Its own mark says it in less room than any
 * wording would — see lib/tosano.ts on the API side.
 */
export function TosanoMark({ className = '' }: { className?: string }) {
  return (
    <img
      src="/tosano.svg"
      alt="Dati da Tosano"
      title="Valori nutrizionali dall'etichetta pubblicata da Tosano"
      width={42}
      height={14}
      loading="lazy"
      // The wordmark is dark blue on transparent, so on a dark surface it needs
      // its own light backing to stay readable — the mark cannot be recoloured.
      className={`h-3.5 w-auto shrink-0 dark:rounded-xs dark:bg-white/90 dark:p-px ${className}`}
    />
  )
}
