import type { FastifyPluginAsync } from 'fastify'
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm'
import { idParam, recipeInput, recipePatch } from '@calorico/contracts'
import { db } from '../db/index.js'
import {
  foods,
  recipeIngredients,
  recipes,
  type Food,
  type Recipe,
} from '../db/schema.js'
import { env } from '../env.js'
import { recordFoodTouch } from '../lib/food-touch.js'
import { foodVisibleTo } from '../lib/food-visibility.js'
import { scaleNutriments } from '../lib/nutrition.js'
import {
  composeRecipe,
  ingredientsWeight,
  type RecipeLine,
} from '../lib/recipe.js'

/**
 * Recipes: a dish somebody cooks, kept as a food.
 *
 * The whole design is in that sentence. Every recipe owns a `foods` row with
 * `source: 'recipe'` whose per-100 g figures are recomputed here from the
 * ingredients, which means search finds it, the diary logs it by the gram, the
 * stats count it and the portion chips offer it — none of them knowing that
 * recipes exist. The alternative, a composite the diary had to understand,
 * would have touched every screen that reads a food.
 *
 * Two consequences worth keeping in mind:
 *
 *   - The numbers are a **snapshot**, taken on save. An ingredient whose
 *     catalogue row is corrected later does not silently move a dish somebody
 *     has been logging for a month; saving the recipe again is what re-measures
 *     it. That is also why a recipe may be an ingredient of another recipe
 *     without any risk of a loop: nothing recomputes through a reference.
 *   - Deleting a recipe deletes its food. Diary entries carry their own
 *     snapshots, so history survives; what goes is the row nobody can log any
 *     more.
 */

type RecipeRow = Recipe
type IngredientRow = { id: string; foodId: string; quantityG: number; sort: number }

/** The recipe's food, as the row is written and rewritten. */
function foodValues(
  name: string,
  lines: readonly RecipeLine[],
  yieldG: number,
  servings: number,
) {
  const { per100 } = composeRecipe(lines, yieldG)
  return {
    name,
    ...per100,
    /**
     * A portion is the unit somebody thinks in — "one of the four I cut it
     * into" — so it goes on the food as its serving. The food screen opens on
     * it and offers it as a chip, which is the whole of "log one portion".
     */
    servingSizeG: Math.round((yieldG / servings) * 10) / 10,
    servingLabel: 'porzione',
    /**
     * The whole dish, in the field the food screen already draws a percentage
     * against: "180 g su 640 g · 28% ricetta" needed no new UI.
     */
    packageSizeG: yieldG,
    packageSizeLabel: `ricetta intera · ${Math.round(yieldG)} g`,
  }
}

async function loadLines(
  userId: string,
  items: readonly { foodId: string; quantityG: number }[],
): Promise<{ lines: RecipeLine[]; missing: boolean }> {
  const ids = [...new Set(items.map((i) => i.foodId))]
  const rows = await db
    .select()
    .from(foods)
    .where(and(inArray(foods.id, ids), foodVisibleTo(userId)))
  const byId = new Map(rows.map((f) => [f.id, f]))
  if (items.some((i) => !byId.has(i.foodId))) return { lines: [], missing: true }
  return {
    lines: items.map((i) => ({ quantityG: i.quantityG, food: byId.get(i.foodId)! })),
    missing: false,
  }
}

function serialize(
  recipe: RecipeRow,
  food: Food,
  items: Array<{ item: IngredientRow; food: Food }>,
) {
  const lines: RecipeLine[] = items.map(({ item, food: f }) => ({
    quantityG: item.quantityG,
    food: f,
  }))
  const { totals } = composeRecipe(lines, recipe.yieldG)
  const portionG = Math.round((recipe.yieldG / recipe.servings) * 10) / 10

  return {
    id: recipe.id,
    name: food.name,
    note: recipe.note,
    food,
    servings: recipe.servings,
    yieldG: recipe.yieldG,
    ingredientsG: ingredientsWeight(lines),
    portionG,
    totals,
    // Scaled from the finished food rather than from the totals, so a portion
    // of a dish is the same number the diary writes when that portion is logged.
    perPortion: scaleNutriments(food, portionG),
    items: items.map(({ item, food: f }) => ({
      id: item.id,
      foodId: item.foodId,
      quantityG: item.quantityG,
      sort: item.sort,
      name: f.name,
      brand: f.brand,
      unit: f.unit,
      category: f.category,
      imageUrl: f.imageUrl,
      kcal100: f.kcal100,
      protein100: f.protein100,
      carbs100: f.carbs100,
      fat100: f.fat100,
      kcal: Math.round((f.kcal100 * item.quantityG) / 100),
    })),
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  }
}

/** One recipe, joined to its food and its lines. Null when it is not this user's. */
async function readRecipe(userId: string, id: string) {
  const [row] = await db
    .select({ recipe: recipes, food: foods })
    .from(recipes)
    .innerJoin(foods, eq(foods.id, recipes.foodId))
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
    .limit(1)
  if (!row) return null

  const items = await db
    .select({ item: recipeIngredients, food: foods })
    .from(recipeIngredients)
    .innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(asc(recipeIngredients.sort))

  return serialize(row.recipe, row.food, items)
}

export const recipeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  /** This user's cookbook, most recently touched first. */
  app.get('/', async (request) => {
    const userId = request.user.sub
    const rows = await db
      .select({ recipe: recipes, food: foods })
      .from(recipes)
      .innerJoin(foods, eq(foods.id, recipes.foodId))
      .where(eq(recipes.userId, userId))
      .orderBy(desc(recipes.updatedAt))

    if (rows.length === 0) return { items: [] }

    const lines = await db
      .select({ item: recipeIngredients, food: foods })
      .from(recipeIngredients)
      .innerJoin(foods, eq(foods.id, recipeIngredients.foodId))
      .where(
        inArray(
          recipeIngredients.recipeId,
          rows.map((r) => r.recipe.id),
        ),
      )
      .orderBy(asc(recipeIngredients.sort))

    // One query for every recipe's lines, grouped here: a cookbook is read far
    // more often than it is written, and a query per row is how a list of
    // twenty becomes twenty-one round trips.
    const byRecipe = new Map<string, typeof lines>()
    for (const line of lines) {
      const group = byRecipe.get(line.item.recipeId)
      if (group) group.push(line)
      else byRecipe.set(line.item.recipeId, [line])
    }

    return {
      items: rows.map((row) =>
        serialize(row.recipe, row.food, byRecipe.get(row.recipe.id) ?? []),
      ),
    }
  })

  app.get('/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const recipe = await readRecipe(request.user.sub, id)
    if (!recipe) return reply.code(404).send({ error: 'recipe_not_found' })
    return recipe
  })

  app.post('/', async (request, reply) => {
    const body = recipeInput.parse(request.body)
    const userId = request.user.sub

    const [existing] = await db
      .select({ value: count() })
      .from(recipes)
      .where(eq(recipes.userId, userId))
    if ((existing?.value ?? 0) >= env.MAX_RECIPES_PER_USER) {
      return reply.code(409).send({ error: 'too_many_recipes' })
    }

    const { lines, missing } = await loadLines(userId, body.items)
    if (missing) return reply.code(404).send({ error: 'food_not_found' })

    const yieldG = body.yieldG ?? ingredientsWeight(lines)

    const created = await db.transaction(async (tx) => {
      const [food] = await tx
        .insert(foods)
        .values({
          ...foodValues(body.name, lines, yieldG, body.servings),
          source: 'recipe',
          category: 'Ricetta',
          unit: 'g',
          createdBy: userId,
        })
        .returning()
      if (!food) throw new Error('failed to create the recipe food')

      const [recipe] = await tx
        .insert(recipes)
        .values({
          userId,
          foodId: food.id,
          servings: body.servings,
          yieldG,
          note: body.note ?? null,
        })
        .returning()
      if (!recipe) throw new Error('failed to create the recipe')

      await tx.insert(recipeIngredients).values(
        body.items.map((item, sort) => ({
          recipeId: recipe.id,
          foodId: item.foodId,
          quantityG: item.quantityG,
          sort,
        })),
      )
      return recipe
    })

    // Writing a recipe down is the strongest possible "I mean to eat this", so
    // it lands in Recenti before it is ever logged — same as a food typed in.
    await recordFoodTouch(userId, created.foodId, request.log)

    const recipe = await readRecipe(userId, created.id)
    return reply.code(201).send(recipe)
  })

  app.patch('/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = recipePatch.parse(request.body)
    const userId = request.user.sub

    const [existing] = await db
      .select({ recipe: recipes, food: foods })
      .from(recipes)
      .innerJoin(foods, eq(foods.id, recipes.foodId))
      .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
      .limit(1)
    if (!existing) return reply.code(404).send({ error: 'recipe_not_found' })

    // Whatever the patch leaves out, the dish keeps — including its ingredients,
    // which have to be reloaded anyway: every field here changes the food's
    // numbers, so there is no such thing as a partial recompute.
    const currentItems = await db
      .select({ item: recipeIngredients })
      .from(recipeIngredients)
      .where(eq(recipeIngredients.recipeId, id))
      .orderBy(asc(recipeIngredients.sort))

    const items =
      body.items ??
      currentItems.map((r) => ({
        foodId: r.item.foodId,
        quantityG: r.item.quantityG,
      }))

    const { lines, missing } = await loadLines(userId, items)
    if (missing) return reply.code(404).send({ error: 'food_not_found' })

    const servings = body.servings ?? existing.recipe.servings
    /**
     * A yield the caller did not send follows the ingredients when they change
     * and stands still when they do not. Anything else means editing one
     * ingredient of an uncooked dish silently leaves the dish weighing what it
     * used to.
     */
    const yieldG =
      body.yieldG ?? (body.items ? ingredientsWeight(lines) : existing.recipe.yieldG)
    const name = body.name ?? existing.food.name

    await db.transaction(async (tx) => {
      await tx
        .update(foods)
        .set({
          ...foodValues(name, lines, yieldG, servings),
          updatedAt: new Date(),
        })
        .where(eq(foods.id, existing.recipe.foodId))

      await tx
        .update(recipes)
        .set({
          servings,
          yieldG,
          ...(body.note === undefined ? {} : { note: body.note || null }),
          updatedAt: new Date(),
        })
        .where(eq(recipes.id, id))

      if (body.items) {
        await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id))
        await tx.insert(recipeIngredients).values(
          body.items.map((item, sort) => ({
            recipeId: id,
            foodId: item.foodId,
            quantityG: item.quantityG,
            sort,
          })),
        )
      }
    })

    return readRecipe(userId, id)
  })

  /**
   * Deletes the food with it. The two are one thing, and a food nothing can
   * recompute would be a recipe that had lost its recipe. Diary entries keep
   * their snapshots, so what was already eaten stays eaten.
   */
  app.delete('/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const [existing] = await db
      .select({ foodId: recipes.foodId })
      .from(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.userId, request.user.sub)))
      .limit(1)
    if (!existing) return reply.code(404).send({ error: 'recipe_not_found' })

    await db.delete(foods).where(eq(foods.id, existing.foodId))
    return reply.code(204).send()
  })
}
