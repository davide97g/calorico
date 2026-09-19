import { ChefHat } from 'lucide-react'

/**
 * Marks a food that is one of this user's recipes.
 *
 * A recipe is a `foods` row like any other, which is what makes it searchable
 * and loggable — and also what makes it look, in a list, exactly like a product
 * somebody else measured. This says whose numbers they are, in the width the
 * Tosano mark takes for the same job.
 */
export function RecipeMark({ className = '' }: { className?: string }) {
  return (
    <span
      title="Una tua ricetta"
      className={`bg-primary/20 text-primary-strong inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-micro font-bold ${className}`}
    >
      <ChefHat className="size-3" strokeWidth={2.4} aria-hidden />
      Ricetta
    </span>
  )
}
