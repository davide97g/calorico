import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChefHat, Plus, Search, Zap } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import { TopBar } from '@/components/layout/top-bar'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecipes } from '@/hooks/use-recipes'
import { todayISO } from '@/lib/date'
import { currentMeal, grams, kcal } from '@/lib/format'
import type { Recipe } from '@/lib/types'

const NO_RECIPES: Recipe[] = []

/**
 * The cookbook.
 *
 * Every row is two things at once and the screen says so with two targets: the
 * row itself opens the recipe to read or change, and the lime button logs a
 * portion of it. The second is the daily job and it must not be buried behind
 * an edit screen; the first is why anybody came here.
 */
export default function RecipesPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Carried in from the search screen, so logging a portion lands on the meal
  // the person was already filling in.
  const day = params.get('day') ?? todayISO()
  const meal = params.get('meal') ?? currentMeal()

  const recipes = useRecipes()
  const [term, setTerm] = useState('')

  // The fallback is a module constant so an empty cookbook is the same array on
  // every render — a fresh `[]` here re-runs the filter below for nothing.
  const items = recipes.data?.items ?? NO_RECIPES
  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase()
    if (!needle) return items
    return items.filter((recipe) =>
      [recipe.name, ...recipe.items.map((i) => i.name)]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [items, term])

  const newRecipeLink = `/recipes/new?day=${day}&meal=${meal}`

  return (
    <AppShell>
      <TopBar
        eyebrow="Cucina"
        title="Le mie ricette"
        back
        action={
          <Button
            size="icon"
            className="shadow-soft size-11 shrink-0 rounded-full"
            onClick={() => navigate(newRecipeLink)}
            aria-label="Nuova ricetta"
          >
            <Plus className="size-5" />
          </Button>
        }
      />

      {items.length > 4 ? (
        <div className="relative mt-4">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Cerca fra le tue ricette…"
            aria-label="Cerca fra le tue ricette"
            className="bg-card shadow-soft h-13 rounded-full border-transparent pl-11 text-sm"
          />
        </div>
      ) : null}

      <section className="mt-4">
        {recipes.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-[76px] rounded-lg" />
            ))}
          </div>
        ) : filtered.length ? (
          <Panel className="overflow-hidden p-1.5">
            <ul>
              {filtered.map((recipe) => (
                <li key={recipe.id}>
                  <RecipeRow recipe={recipe} day={day} meal={meal} />
                </li>
              ))}
            </ul>
          </Panel>
        ) : items.length ? (
          <Panel className="p-6">
            <p className="text-muted-foreground text-center text-sm">
              Nessuna ricetta per “{term.trim()}”.
            </p>
          </Panel>
        ) : (
          <Panel className="flex flex-col items-center px-6 py-12 text-center">
            <span className="bg-primary/55 flex size-16 items-center justify-center rounded-lg">
              <ChefHat className="text-primary-foreground size-7" />
            </span>
            <h2 className="mt-4 text-base font-bold">Nessuna ricetta</h2>
            <p className="text-muted-foreground mt-1 max-w-72 text-sm">
              Pesa gli ingredienti una volta sola. Poi registri quanti grammi ne
              mangi e i conti li fa l’app.
            </p>
            <Button asChild className="mt-5 h-12 rounded-full px-5 font-semibold">
              <Link to={newRecipeLink}>
                <Plus className="size-4" />
                Crea una ricetta
              </Link>
            </Button>
          </Panel>
        )}
      </section>
    </AppShell>
  )
}

function RecipeRow({
  recipe,
  day,
  meal,
}: {
  recipe: Recipe
  day: string
  meal: string
}) {
  const portions =
    recipe.servings === 1
      ? 'porzione unica'
      : `${grams(recipe.servings)} porzioni`

  return (
    <div className="flex items-center gap-1">
      <Link
        to={`/recipes/${recipe.id}`}
        className="hover:bg-secondary/50 active:bg-secondary flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left transition-colors"
      >
        <FoodEmojiTile name={recipe.name} category={recipe.food.category} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {recipe.name}
          </span>
          <span className="text-muted-foreground tabular block truncate text-micro">
            {portions} · {grams(recipe.portionG)} g · {recipe.items.length}{' '}
            {recipe.items.length === 1 ? 'ingrediente' : 'ingredienti'}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="tabular block text-sm leading-none font-bold">
            {kcal(recipe.perPortion.kcal)}
          </span>
          <span className="text-muted-foreground block text-micro leading-none">
            kcal/porzione
          </span>
        </span>
      </Link>

      {/* Straight to the food screen, on one portion: a recipe is a food, and
          that screen is where every gram in this app gets weighed. */}
      <Link
        to={`/food/${recipe.food.id}?day=${day}&meal=${meal}&q=${recipe.portionG}`}
        className="bg-primary text-primary-foreground shadow-soft flex size-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
        aria-label={`Registra una porzione di ${recipe.name}`}
      >
        <Zap className="size-4" strokeWidth={2.4} />
      </Link>
    </div>
  )
}
