import type { NewFood } from '../db/schema.js'

type Generic = {
  name: string
  category: string
  kcal: number
  p: number
  c: number
  f: number
  fiber?: number
  serving?: number
  servingLabel?: string
  liquid?: boolean
}

/**
 * Unpackaged / generic foods — the half of a food diary Open Food Facts cannot
 * cover (raw meat, produce, cooked pasta). Values are per 100 g edible portion,
 * rounded from the Italian food composition tables (CREA / BDA-IEO) and USDA
 * FoodData Central for the few items missing there.
 *
 * Italian names first: this is what an Italian user types into the search box.
 */
const GENERIC: Generic[] = [
  // --- Carne e pesce ---
  { name: 'Petto di pollo crudo', category: 'Carne', kcal: 110, p: 23.3, c: 0, f: 1.6, serving: 150 },
  { name: 'Petto di pollo cotto (griglia)', category: 'Carne', kcal: 158, p: 32, c: 0, f: 3.2, serving: 130 },
  { name: 'Coscia di pollo con pelle', category: 'Carne', kcal: 197, p: 18.4, c: 0, f: 13.4, serving: 150 },
  { name: 'Fesa di tacchino cruda', category: 'Carne', kcal: 107, p: 24.4, c: 0, f: 1.2, serving: 150 },
  { name: 'Manzo magro (girello) crudo', category: 'Carne', kcal: 122, p: 21.8, c: 0, f: 3.6, serving: 150 },
  { name: 'Macinato di manzo 20% grassi', category: 'Carne', kcal: 254, p: 17.2, c: 0, f: 20, serving: 150 },
  { name: 'Lombo di maiale crudo', category: 'Carne', kcal: 146, p: 21.3, c: 0, f: 6.8, serving: 150 },
  { name: 'Prosciutto crudo', category: 'Salumi', kcal: 268, p: 26, c: 0.4, f: 18, serving: 40 },
  { name: 'Prosciutto cotto', category: 'Salumi', kcal: 215, p: 19.8, c: 0.8, f: 14.7, serving: 50 },
  { name: 'Bresaola', category: 'Salumi', kcal: 151, p: 32, c: 0.4, f: 2.6, serving: 50 },
  { name: 'Salame Milano', category: 'Salumi', kcal: 384, p: 25.8, c: 1.5, f: 31, serving: 30 },
  { name: 'Uovo di gallina intero', category: 'Uova', kcal: 143, p: 12.6, c: 0.7, f: 9.5, serving: 55, servingLabel: '1 uovo medio (55 g)' },
  { name: 'Albume di uovo', category: 'Uova', kcal: 52, p: 10.9, c: 0.7, f: 0.2, serving: 33 },
  { name: 'Tonno al naturale sgocciolato', category: 'Pesce', kcal: 103, p: 23.5, c: 0, f: 0.8, serving: 80 },
  { name: 'Salmone fresco crudo', category: 'Pesce', kcal: 185, p: 20.4, c: 0, f: 11, serving: 150 },
  { name: 'Salmone affumicato', category: 'Pesce', kcal: 147, p: 25.4, c: 0, f: 4.5, serving: 50 },
  { name: 'Merluzzo (nasello) crudo', category: 'Pesce', kcal: 71, p: 17, c: 0, f: 0.3, serving: 150 },
  { name: 'Orata allevata cruda', category: 'Pesce', kcal: 121, p: 20, c: 0, f: 4.4, serving: 200 },
  { name: 'Gamberi crudi', category: 'Pesce', kcal: 71, p: 13.6, c: 0, f: 0.6, serving: 120 },
  { name: 'Alici (acciughe) fresche', category: 'Pesce', kcal: 96, p: 16.8, c: 1.5, f: 2.6, serving: 100 },

  // --- Cereali, pane, pasta ---
  { name: 'Pasta di semola cruda', category: 'Cereali', kcal: 353, p: 10.9, c: 71.2, f: 1.4, fiber: 2.7, serving: 80 },
  { name: 'Pasta di semola cotta', category: 'Cereali', kcal: 158, p: 5.1, c: 31.4, f: 0.9, fiber: 1.3, serving: 200 },
  { name: 'Pasta integrale cruda', category: 'Cereali', kcal: 324, p: 13, c: 62, f: 2.5, fiber: 8, serving: 80 },
  { name: 'Riso bianco crudo', category: 'Cereali', kcal: 332, p: 6.7, c: 80.4, f: 0.4, fiber: 1, serving: 80 },
  { name: 'Riso bianco cotto', category: 'Cereali', kcal: 130, p: 2.7, c: 28.7, f: 0.3, fiber: 0.4, serving: 200 },
  { name: 'Riso basmati crudo', category: 'Cereali', kcal: 349, p: 7.5, c: 78, f: 0.6, fiber: 1.3, serving: 80 },
  { name: 'Pane bianco (tipo 0)', category: 'Pane', kcal: 275, p: 8.6, c: 55, f: 0.9, fiber: 3.2, serving: 50 },
  { name: 'Pane integrale', category: 'Pane', kcal: 224, p: 7.5, c: 43, f: 1.3, fiber: 6.5, serving: 50 },
  { name: 'Fette biscottate', category: 'Pane', kcal: 410, p: 11.3, c: 79, f: 6, fiber: 3.5, serving: 20, servingLabel: '2 fette (20 g)' },
  { name: 'Pizza margherita', category: 'Piatti pronti', kcal: 271, p: 11, c: 34, f: 10, fiber: 2, serving: 300, servingLabel: '1 pizza (300 g)' },
  { name: 'Focaccia', category: 'Pane', kcal: 320, p: 7.5, c: 45, f: 12, fiber: 2, serving: 100 },
  { name: 'Farina 00', category: 'Cereali', kcal: 340, p: 11, c: 72, f: 1, fiber: 2.2, serving: 100 },
  { name: 'Avena in fiocchi', category: 'Cereali', kcal: 373, p: 13, c: 61, f: 7, fiber: 10, serving: 50 },
  { name: 'Couscous crudo', category: 'Cereali', kcal: 376, p: 12.8, c: 72.4, f: 0.6, fiber: 5, serving: 70 },
  { name: 'Polenta (farina di mais) cruda', category: 'Cereali', kcal: 362, p: 8.7, c: 76, f: 2.7, fiber: 4, serving: 80 },

  // --- Legumi ---
  { name: 'Lenticchie secche', category: 'Legumi', kcal: 291, p: 22.7, c: 51.1, f: 1, fiber: 13.8, serving: 80 },
  { name: 'Lenticchie cotte', category: 'Legumi', kcal: 92, p: 6.9, c: 16.3, f: 0.4, fiber: 8, serving: 200 },
  { name: 'Ceci in scatola sgocciolati', category: 'Legumi', kcal: 130, p: 6.9, c: 18.9, f: 2.9, fiber: 6, serving: 150 },
  { name: 'Fagioli borlotti cotti', category: 'Legumi', kcal: 128, p: 8.4, c: 18.6, f: 0.7, fiber: 7.6, serving: 150 },
  { name: 'Piselli surgelati', category: 'Legumi', kcal: 76, p: 5.5, c: 10.5, f: 0.5, fiber: 5, serving: 150 },
  { name: 'Edamame', category: 'Legumi', kcal: 121, p: 12, c: 8.9, f: 5.2, fiber: 5.2, serving: 100 },

  // --- Latticini ---
  { name: 'Latte intero', category: 'Latticini', kcal: 64, p: 3.3, c: 4.9, f: 3.6, serving: 200, liquid: true },
  { name: 'Latte parzialmente scremato', category: 'Latticini', kcal: 46, p: 3.3, c: 5, f: 1.6, serving: 200, liquid: true },
  { name: 'Yogurt greco 0%', category: 'Latticini', kcal: 57, p: 10, c: 4, f: 0.4, serving: 170 },
  { name: 'Yogurt greco 2%', category: 'Latticini', kcal: 73, p: 9, c: 3.6, f: 2, serving: 170 },
  { name: 'Yogurt bianco intero', category: 'Latticini', kcal: 66, p: 3.8, c: 4.3, f: 3.9, serving: 125 },
  { name: 'Skyr', category: 'Latticini', kcal: 63, p: 11, c: 4, f: 0.2, serving: 150 },
  { name: 'Mozzarella di latte di vacca', category: 'Latticini', kcal: 253, p: 18.7, c: 0.7, f: 19.5, serving: 125 },
  { name: 'Mozzarella di bufala', category: 'Latticini', kcal: 288, p: 16.7, c: 0.4, f: 24.4, serving: 125 },
  { name: 'Parmigiano Reggiano', category: 'Latticini', kcal: 392, p: 33, c: 0, f: 28.5, serving: 10, servingLabel: '1 cucchiaio (10 g)' },
  { name: 'Grana Padano', category: 'Latticini', kcal: 384, p: 33, c: 0, f: 28, serving: 10 },
  { name: 'Ricotta di vacca', category: 'Latticini', kcal: 146, p: 8.8, c: 3.5, f: 10.9, serving: 100 },
  { name: 'Stracchino / crescenza', category: 'Latticini', kcal: 281, p: 16, c: 1, f: 23, serving: 60 },
  { name: 'Gorgonzola', category: 'Latticini', kcal: 324, p: 19, c: 1, f: 27, serving: 40 },
  { name: 'Burro', category: 'Grassi', kcal: 758, p: 0.8, c: 1.1, f: 83.4, serving: 10 },

  // --- Frutta ---
  { name: 'Mela con buccia', category: 'Frutta', kcal: 52, p: 0.3, c: 13.8, f: 0.2, fiber: 2.4, serving: 180, servingLabel: '1 mela media (180 g)' },
  { name: 'Banana', category: 'Frutta', kcal: 89, p: 1.1, c: 22.8, f: 0.3, fiber: 2.6, serving: 120, servingLabel: '1 banana media (120 g)' },
  { name: 'Arancia', category: 'Frutta', kcal: 47, p: 0.9, c: 11.8, f: 0.1, fiber: 2.4, serving: 200 },
  { name: 'Fragole', category: 'Frutta', kcal: 32, p: 0.7, c: 7.7, f: 0.3, fiber: 2, serving: 150 },
  { name: 'Kiwi', category: 'Frutta', kcal: 61, p: 1.1, c: 14.7, f: 0.5, fiber: 3, serving: 80 },
  { name: 'Uva', category: 'Frutta', kcal: 69, p: 0.7, c: 18.1, f: 0.2, fiber: 0.9, serving: 150 },
  { name: 'Pesca', category: 'Frutta', kcal: 39, p: 0.9, c: 9.5, f: 0.3, fiber: 1.5, serving: 150 },
  { name: 'Anguria', category: 'Frutta', kcal: 30, p: 0.6, c: 7.6, f: 0.2, fiber: 0.4, serving: 300 },
  { name: 'Avocado', category: 'Frutta', kcal: 160, p: 2, c: 8.5, f: 14.7, fiber: 6.7, serving: 100 },
  { name: 'Mirtilli', category: 'Frutta', kcal: 57, p: 0.7, c: 14.5, f: 0.3, fiber: 2.4, serving: 100 },

  // --- Verdura ---
  { name: 'Pomodori', category: 'Verdura', kcal: 18, p: 0.9, c: 3.9, f: 0.2, fiber: 1.2, serving: 200 },
  { name: 'Zucchine', category: 'Verdura', kcal: 17, p: 1.2, c: 3.1, f: 0.3, fiber: 1, serving: 200 },
  { name: 'Insalata mista', category: 'Verdura', kcal: 17, p: 1.4, c: 2.2, f: 0.3, fiber: 1.5, serving: 80 },
  { name: 'Spinaci crudi', category: 'Verdura', kcal: 23, p: 2.9, c: 3.6, f: 0.4, fiber: 2.2, serving: 150 },
  { name: 'Broccoli', category: 'Verdura', kcal: 34, p: 2.8, c: 6.6, f: 0.4, fiber: 2.6, serving: 200 },
  { name: 'Carote', category: 'Verdura', kcal: 41, p: 0.9, c: 9.6, f: 0.2, fiber: 2.8, serving: 100 },
  { name: 'Patate', category: 'Verdura', kcal: 77, p: 2, c: 17.5, f: 0.1, fiber: 2.2, serving: 200 },
  { name: 'Patate al forno', category: 'Verdura', kcal: 109, p: 2.5, c: 22, f: 1.5, fiber: 2.5, serving: 200 },
  { name: 'Melanzane', category: 'Verdura', kcal: 25, p: 1, c: 5.9, f: 0.2, fiber: 3, serving: 200 },
  { name: 'Peperoni', category: 'Verdura', kcal: 26, p: 1, c: 6, f: 0.3, fiber: 2.1, serving: 150 },
  { name: 'Cipolla', category: 'Verdura', kcal: 40, p: 1.1, c: 9.3, f: 0.1, fiber: 1.7, serving: 60 },
  { name: 'Funghi champignon', category: 'Verdura', kcal: 22, p: 3.1, c: 3.3, f: 0.3, fiber: 1, serving: 150 },

  // --- Grassi, frutta secca, dolci ---
  { name: 'Olio extravergine di oliva', category: 'Grassi', kcal: 899, p: 0, c: 0, f: 99.9, serving: 10, servingLabel: '1 cucchiaio (10 g)' },
  { name: 'Mandorle', category: 'Frutta secca', kcal: 603, p: 22, c: 4.6, f: 55.3, fiber: 12.7, serving: 30 },
  { name: 'Noci', category: 'Frutta secca', kcal: 654, p: 15.2, c: 13.7, f: 65.2, fiber: 6.7, serving: 30 },
  { name: 'Pistacchi', category: 'Frutta secca', kcal: 562, p: 20.2, c: 27.5, f: 45.4, fiber: 10.6, serving: 30 },
  { name: 'Burro di arachidi', category: 'Frutta secca', kcal: 588, p: 25, c: 20, f: 50, fiber: 6, serving: 20 },
  { name: 'Cioccolato fondente 70%', category: 'Dolci', kcal: 598, p: 7.8, c: 45.9, f: 42.6, fiber: 10.9, serving: 20 },
  { name: 'Miele', category: 'Dolci', kcal: 304, p: 0.3, c: 82.4, f: 0, serving: 15 },
  { name: 'Zucchero bianco', category: 'Dolci', kcal: 392, p: 0, c: 100, f: 0, serving: 5, servingLabel: '1 cucchiaino (5 g)' },
  { name: 'Gelato artigianale (crema)', category: 'Dolci', kcal: 207, p: 3.5, c: 24, f: 11, serving: 100 },

  // --- Bevande ---
  { name: 'Caffè espresso non zuccherato', category: 'Bevande', kcal: 2, p: 0.1, c: 0.3, f: 0, serving: 30, liquid: true },
  { name: 'Cappuccino con latte intero', category: 'Bevande', kcal: 55, p: 3, c: 4.3, f: 3, serving: 150, liquid: true },
  { name: 'Birra bionda', category: 'Bevande', kcal: 43, p: 0.5, c: 3.5, f: 0, serving: 330, liquid: true },
  { name: 'Vino rosso', category: 'Bevande', kcal: 85, p: 0.1, c: 2.6, f: 0, serving: 125, liquid: true },
  { name: 'Coca-Cola', category: 'Bevande', kcal: 42, p: 0, c: 10.6, f: 0, serving: 330, liquid: true },
  { name: 'Spremuta di arancia', category: 'Bevande', kcal: 45, p: 0.7, c: 10.4, f: 0.2, serving: 200, liquid: true },
  { name: 'Bevanda di soia non zuccherata', category: 'Bevande', kcal: 33, p: 3.3, c: 0.4, f: 1.8, serving: 200, liquid: true },
]

export const genericFoods: NewFood[] = GENERIC.map((g) => ({
  source: 'generic' as const,
  barcode: null,
  name: g.name,
  brand: null,
  category: g.category,
  kcal100: g.kcal,
  protein100: g.p,
  carbs100: g.c,
  fat100: g.f,
  fiber100: g.fiber ?? null,
  servingSizeG: g.serving ?? null,
  servingLabel: g.servingLabel ?? null,
  unit: g.liquid ? 'ml' : 'g',
  isLiquid: Boolean(g.liquid),
  countries: ['en:italy'],
  verified: true,
}))
