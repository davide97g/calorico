/**
 * The portion to offer for a food in a list, best guess first: the one this user
 * last ate it in, then the pack's serving, then 100.
 *
 * `fromHistory` is the interesting half. A recents list now holds two kinds of
 * food — ones eaten before, and ones merely scanned or created — and only the
 * first kind comes with a portion the app has any right to call the usual one.
 * Everything that shows a suggested quantity says which it is, so a number the
 * app made up is never mistaken for one the user chose.
 */
export function rememberedPortion(food: {
  lastQuantityG?: number | null
  servingSizeG?: number | null
}): { grams: number; fromHistory: boolean } {
  if (food.lastQuantityG != null && food.lastQuantityG > 0) {
    return { grams: food.lastQuantityG, fromHistory: true }
  }
  return { grams: food.servingSizeG ?? 100, fromHistory: false }
}
