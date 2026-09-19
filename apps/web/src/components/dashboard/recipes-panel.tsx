import { Link } from 'react-router-dom'
import { ChefHat, ChevronRight } from 'lucide-react'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecipes } from '@/hooks/use-recipes'
import { grams, kcal } from '@/lib/format'

/**
 * The cookbook on the dashboard.
 *
 * Near the bottom on purpose: a recipe is not what most days are made of, and
 * the three rows here are a reminder rather than a destination — the dishes
 * this kitchen actually has, so writing one down pays off the next time it is
 * cooked instead of being forgotten in a screen nobody opens.
 *
 * Each row goes straight to the food, on one portion. The header goes to the
 * cookbook, where they are read and changed.
 */
export function RecipesPanel({ day, meal }: { day: string; meal: string }) {
  const { data, isLoading } = useRecipes()

  if (isLoading && !data) return <Skeleton className="h-[132px] rounded-lg" />

  const items = data?.items ?? []
  const shown = items.slice(0, 3)

  return (
    <Panel>
      <PanelHeader
        icon={<ChefHat />}
        title="Le mie ricette"
        to="/recipes"
        action={
          items.length ? (
            <span className="text-muted-foreground flex items-center gap-1 text-xs font-semibold">
              {items.length}
              <ChevronRight className="size-5" />
            </span>
          ) : undefined
        }
      />

      {shown.length ? (
        <ul className="mt-2 flex flex-col">
          {shown.map((recipe) => (
            <li key={recipe.id}>
              <Link
                to={`/food/${recipe.food.id}?day=${day}&meal=${meal}&q=${recipe.portionG}`}
                className="hover:bg-secondary/50 active:bg-secondary flex items-center gap-3 rounded-md p-2 transition-colors"
              >
                <FoodEmojiTile
                  name={recipe.name}
                  category={recipe.food.category}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {recipe.name}
                  </span>
                  <span className="text-muted-foreground tabular block truncate text-micro">
                    una porzione · {grams(recipe.portionG)} g
                  </span>
                </span>
                <span className="tabular shrink-0 text-sm font-bold">
                  {kcal(recipe.perPortion.kcal)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          Un piatto che cucini spesso, pesato una volta sola: dopo basta dire
          quanti grammi ne hai mangiati.
        </p>
      )}
    </Panel>
  )
}
