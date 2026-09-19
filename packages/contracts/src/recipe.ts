import { z } from 'zod'
import { food } from './food.js'
import { quantityG, timestamp } from './primitives.js'

/**
 * A dish somebody cooks, and the one thing about it that is not already a food.
 *
 * The nutrition lives on the `foods` row this carries — `source: 'recipe'`,
 * recomputed from the ingredients on every save — so a recipe is logged,
 * searched and counted exactly like anything else in the catalogue. What is
 * here is the composition: what went in, what the dish weighs, and how many
 * portions it was meant to be.
 */

/**
 * What a dish, or one portion of it, contains.
 *
 * Deliberately not the diary's `totals`, which floors its optional macros at
 * zero: a day with one unlabelled entry still has a fibre figure worth showing,
 * while a dish whose ingredients never declared one has no honest number at
 * all. Null here means "nobody said", exactly as it does on a food.
 */
export const dishNutrients = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number().nullable(),
  sugarsG: z.number().nullable(),
  satFatG: z.number().nullable(),
  saltG: z.number().nullable(),
})
export type DishNutrients = z.infer<typeof dishNutrients>

/** One line of a recipe, with enough of its food to draw the row. */
export const recipeIngredient = z.object({
  id: z.string(),
  foodId: z.string(),
  quantityG: z.number(),
  sort: z.number(),
  name: z.string(),
  brand: z.string().nullable(),
  unit: z.string(),
  category: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /**
   * The ingredient's own per-100 g figures, so the editor can re-measure the
   * dish while somebody is still typing into it — the panel that makes a
   * recipe worth building is the one that answers before it is saved.
   */
  kcal100: z.number(),
  protein100: z.number(),
  carbs100: z.number(),
  fat100: z.number(),
  /** What this line contributes to the dish. Saves the client the arithmetic. */
  kcal: z.number(),
})
export type RecipeIngredient = z.infer<typeof recipeIngredient>

export const recipe = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().nullable(),
  /** The food this recipe measures: what search finds and the diary logs. */
  food,
  servings: z.number(),
  /** What the finished dish weighs — asked for, because cooking changes it. */
  yieldG: z.number(),
  /** What went in, added up. Differs from `yieldG` whenever cooking did. */
  ingredientsG: z.number(),
  /** `yieldG / servings`, which is also the food's serving size. */
  portionG: z.number(),
  /** The whole dish. */
  totals: dishNutrients,
  /** One portion of it. */
  perPortion: dishNutrients,
  items: z.array(recipeIngredient),
  createdAt: timestamp,
  updatedAt: timestamp,
})
export type Recipe = z.infer<typeof recipe>

/** One line of a recipe as it is sent in. */
export const recipeItemInput = z.object({
  foodId: z.string().uuid(),
  quantityG,
})

/**
 * A recipe being created or replaced.
 *
 * `yieldG` is optional and defaults to the sum of the ingredients on the
 * server, which is the right answer for anything that was not cooked — and the
 * only answer a client can give without asking someone to weigh a pot.
 */
const servings = z.number().min(0.5).max(99)

export const recipeInput = z.object({
  name: z.string().trim().min(2).max(80),
  note: z.string().trim().max(500).optional(),
  servings: servings.default(1),
  yieldG: z.number().min(1).max(50_000).optional(),
  items: z.array(recipeItemInput).min(1).max(30),
})
export type RecipeInput = z.infer<typeof recipeInput>

/**
 * Every field of a recipe is replaceable; a PATCH sends only what changed.
 *
 * `servings` is respelled rather than taken from the input above: `.partial()`
 * leaves the `.default(1)` in place, so a patch that says nothing about the
 * servings would silently cut the dish back into one.
 */
export const recipePatch = recipeInput.omit({ servings: true }).partial().extend({
  servings: servings.optional(),
})
export type RecipePatch = z.infer<typeof recipePatch>
