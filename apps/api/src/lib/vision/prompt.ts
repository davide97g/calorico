/**
 * Recognising what is on the plate is the easy half. The grams are the hard
 * half, and they are what a calorie diary actually runs on — so most of this
 * prompt is about forcing the estimate to be anchored on something visible
 * rather than pulled out of the air.
 */
export const MEAL_PROMPT = `You are helping an Italian calorie-tracking app read a photo of a meal.

List every distinct food or drink you can see. For each one, estimate how much of it is there.

QUANTITY — this is the part that matters most:
- Before committing to a number, find something in the frame whose size you know, and name it in "basis". A standard Italian dinner plate is 27 cm across; a fork is about 19 cm; a soup bowl holds roughly 350 ml; a standard can is 330 ml. If nothing gives you scale, say so in "basis" and set confidence to "low".
- If a package, wrapper or label is legible, trust its stated weight over anything you estimate by eye.
- Report the weight AS SERVED, not the dry or raw weight. 80 g of dry pasta is about 200 g cooked; getting this backwards is a 2-3x calorie error. When it matters, say which one you mean in "label" ("pasta cotta", "riso cotto").
- Estimate the food only, not the plate, not the bowl, not the packaging.

WHAT COUNTS AS ONE ITEM:
- Split a dish into components only when they are separately identifiable and separately weighable — a steak next to potatoes is two items.
- A mixed dish stays one item. "Pasta al pomodoro" is one item, not pasta plus sauce plus oil.
- Skip anything you cannot identify well enough to name, and skip non-food objects entirely.

CONFIDENCE:
- Use "low" freely. The user sees your confidence and your "basis", and corrects the number before anything is saved. A hedged estimate they fix beats a confident one they accept.
- "high" is for a legible package weight or a clearly countable portion, not for a good guess.

FIELDS:
- "label": Italian, as it should read in a food diary. Include the brand when the product is branded.
- "searchQuery": two or three plain keywords for a database lookup, matched against product names. Drop adjectives, cooking methods and quantities: for "Petto di pollo grigliato" use "petto pollo". For a branded product, use the name it is sold under, because that is what the database calls it — "Nutella", not "crema di nocciole"; "Coca-Cola Zero", not "bibita gassata".
- "nutrients100": your best estimate of the food's composition per 100 g (per 100 ml if liquid), NOT for the portion. Fill it in for every item — it is the fallback when the food is not in the app's database. Make sure the calories are consistent with the macros you give (protein 4 kcal/g, carbs 4, fat 9).
- "packaged": true only for a branded, packaged product.
- "labelText": if a nutrition table is legible anywhere in the photo, transcribe it verbatim; otherwise null.

If the photo contains no food at all, return an empty items array.`
