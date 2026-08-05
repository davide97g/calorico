/**
 * One emoji per food, guessed from its name and — when we have it — its
 * category. Products from Open Food Facts usually carry a photo; this is what
 * fills the tile for generic foods, custom foods and anything unphotographed.
 *
 * Rules are checked in order, so the specific term goes before the broader one
 * that contains it: "burro di arachidi" before "burro", "fette biscottate"
 * before "biscotti", cheese before milk ("mozzarella di latte di vacca"),
 * "gelato al pistacchio" before the nuts.
 */
const NAME_RULES: [RegExp, string][] = [
  // Specifics that a broader rule further down would otherwise swallow.
  [/wurstel|hot dog/, '🌭'],
  [/hamburger|cheeseburger/, '🍔'],
  [/salsa di soia|soy sauce/, '🥫'],
  [/\bolio\b|oliv/, '🫒'],
  [/arachid|burro di noc/, '🥜'],
  [/semi di|girasole|sesamo|\blino\b|chia\b/, '🥜'],
  [/bevanda (di|a base di) (soia|mandorl|riso|avena|cocco)|latte di (soia|mandorl|riso|avena|cocco)/, '🥛'],
  [/fette biscottate/, '🍞'],
  [/patatine|chips|patat(e|ine) fritt|french fries/, '🍟'],
  [/peperoncino|piccante/, '🌶️'],
  [/melanzan/, '🍆'],

  // Eggs before poultry, so "uovo di gallina" is not a chicken.
  [/uovo|uova|albume|frittata|omelette/, '🥚'],

  // Coffee and tea before milk, so a cappuccino stays a coffee.
  [/caffe|espresso|cappuccino|macchiato|moka|ginseng/, '☕'],
  [/\bte\b|\bthe\b|tisana|camomilla|infuso|matcha/, '🍵'],

  // Dairy: cheese, then butter, then everything milky.
  [/mozzarella|parmigiano|grana|pecorino|gorgonzola|stracchino|crescenza|ricotta|formaggio|scamorza|provolone|asiago|caciotta|cheddar|feta\b|mascarpone|philadelphia|brie\b|emmental|fontina|taleggio/, '🧀'],
  [/burro(?! di)|margarina/, '🧈'],
  [/yogurt|yoghurt|skyr|kefir/, '🥣'],
  [/latte|panna|besciamella|proteine|whey/, '🥛'],

  // Meat and cured meats.
  [/pollo|tacchino|fesa|anatra/, '🍗'],
  [/prosciutto|speck|bresaola|salame|salamin|mortadella|pancetta|guanciale|coppa\b|salsicc|salumi|lardo|culatello|porchetta/, '🥓'],
  [/manzo|vitello|bistecca|macinato|girello|filetto|roast beef|maiale|lombo|braciola|costine|arista|agnello|coniglio|carne/, '🥩'],

  // Fish and seafood.
  [/gamber|scampi|mazzancoll|granchio|astice|aragosta/, '🦐'],
  [/cozze|vongole|frutti di mare|ostrich|capesante/, '🦪'],
  [/calamar|polpo|seppi|totan|moscardin/, '🦑'],
  [/sushi|sashimi|poke\b/, '🍣'],
  [/salmone|tonno|merluzzo|nasello|orata|branzino|alici|acciugh|sgombro|sardin|platessa|spigola|trota|baccala|pesce|pesci|surimi|persico/, '🐟'],

  // Dishes.
  [/zuppa|minestr|vellutata|brodo|passato di verdur/, '🍲'],
  [/pizza/, '🍕'],
  [/kebab|burrito|\bwrap\b|tortilla|piadina/, '🌯'],

  // Grains, bread, baked goods.
  [/pasta|spaghetti|penne|fusilli|rigatoni|maccheron|lasagn|tortellin|ravioli|gnocchi|orecchiette|linguine|farfalle|tagliatelle|tagliolini|paccheri|noodle|ramen/, '🍝'],
  [/riso\b|risotto|basmati/, '🍚'],
  [/tramezzino|sandwich|toast/, '🥪'],
  [/cornetto|croissant|brioche|maritozzo/, '🥐'],
  [/pancake|crepe|waffle/, '🥞'],
  [/pane|panino|baguette|focaccia|grissini|crostini|bruschetta|pangrattato/, '🍞'],
  [/cracker|gallette|taralli|schiacciatine/, '🍘'],
  [/avena|fiocchi|muesli|granola|cereali|corn flakes|porridge/, '🥣'],
  [/farina|semola|polenta|couscous|orzo|farro|quinoa|bulgur|amido|crusca|germe di grano/, '🌾'],

  // Sweets, before the nuts and fruit they are often flavoured with.
  [/gelato|ghiacciolo|sorbetto/, '🍨'],
  [/cioccolat|nutella|cacao|barretta/, '🍫'],
  [/miele/, '🍯'],
  [/marmellata|confettura/, '🍓'],
  [/biscott|frollini|pavesini|wafer/, '🍪'],
  [/torta|crostata|tiramisu|budino|muffin|brownie|dolce|cheesecake|pasticc/, '🍰'],
  [/zucchero|caramell|chewing/, '🍬'],

  [/lenticchie|ceci\b|fagioli|borlotti|cannellini|pisell|edamame|soia|lupini|fave\b|legumi|hummus|tofu|tempeh|seitan/, '🫘'],

  // Vegetables.
  [/pomodor|passata|pelati|ketchup/, '🍅'],
  [/zucchin|cetriol/, '🥒'],
  [/broccol|cavolfior/, '🥦'],
  [/carot/, '🥕'],
  [/peperon/, '🫑'],
  [/cipoll|scalogno|porro/, '🧅'],
  [/aglio/, '🧄'],
  [/fungh|champignon|porcini|shiitake|chiodini/, '🍄'],
  [/mais\b/, '🌽'],
  [/zucca/, '🎃'],
  [/patat/, '🥔'],
  [/insalata|lattuga|rucola|spinaci|misticanza|bietol|cavolo|verza|cime di rapa|catalogna|scarola|radicchio|valeriana|verdur/, '🥬'],
  [/asparag|sedano|finocchi|carciof|germogli|\berbe\b|basilico|prezzemolo|origano/, '🌿'],

  [/mandorl|\bnoci\b|\bnoce\b|nocciol|pistacch|anacard|frutta secca|pinoli|castagne/, '🥜'],

  // Drinks. Juices come before fruit, so "succo di mela" reads as a drink.
  [/birra/, '🍺'],
  [/vino|prosecco|spumante|champagne/, '🍷'],
  [/spritz|cocktail|aperol|mojito/, '🍹'],
  [/liquore|grappa|whisky|vodka|\bgin\b|\brum\b|amaro/, '🥃'],
  [/\bcola\b|coca|pepsi|aranciata|bibita|soda\b|energy|gassata|tonica|chinotto|gazzosa/, '🥤'],
  [/succo|nettare|smoothie|frullato/, '🧃'],
  [/acqua/, '💧'],

  // Fruit.
  [/\bmela\b|\bmele\b|melinda/, '🍎'],
  [/banana|banane/, '🍌'],
  [/arancia|arance|spremuta|mandarin|clementin/, '🍊'],
  [/fragol/, '🍓'],
  [/kiwi/, '🥝'],
  [/\buva\b|uvetta/, '🍇'],
  [/pesca|\bpesche\b|albicocc|prugn|datteri|fichi|\bfico\b/, '🍑'],
  [/anguria|cocomero/, '🍉'],
  [/melone/, '🍈'],
  [/avocado/, '🥑'],
  [/mirtill|lampon|\bmore\b|ribes|frutti di bosco/, '🫐'],
  [/ananas/, '🍍'],
  [/\bpera\b|\bpere\b/, '🍐'],
  [/limone|\blime\b/, '🍋'],
  [/ciliegi|amaren/, '🍒'],
  [/cocco/, '🥥'],
  [/mango/, '🥭'],

  // Condiments.
  [/pesto|sugo|ragu\b|maionese|salsa|senape/, '🥫'],
  [/\bsale\b|spezie|aceto|pepe\b/, '🧂'],

  [/frutta/, '🍎'],
]

/** Coarse net for anything the name rules miss; OFF paths are multilingual. */
const CATEGORY_RULES: [RegExp, string][] = [
  [/frutta secca|nuts|noix/, '🥜'],
  [/latticin|dairy|laitier|cheese|fromage/, '🧀'],
  [/verdur|vegetable|legumes|gemuse/, '🥬'],
  [/frutta|fruit|obst/, '🍎'],
  [/pane|bread|pain|bakery/, '🍞'],
  [/cereali|cereal|grain|pasta|rice/, '🌾'],
  [/pesce|fish|poisson|seafood|meeresfr/, '🐟'],
  [/salumi|charcuterie|cured/, '🥓'],
  [/carne|meat|viande|poultry|fleisch/, '🥩'],
  [/uova|egg|oeuf/, '🥚'],
  [/legumi|bean|pulse|legumin/, '🫘'],
  [/bevande|beverage|boisson|drink|getranke/, '🥤'],
  [/grassi|oil|fat|huile|butter/, '🫒'],
  [/dolci|sweet|sucre|dessert|chocolate|snack|candy/, '🍫'],
  [/piatti pronti|meal|plat|ready/, '🍲'],
]

const FALLBACK = '🍽️'

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

export function foodEmoji(name: string, category?: string | null): string {
  const haystack = normalize(name)
  for (const [pattern, emoji] of NAME_RULES) {
    if (pattern.test(haystack)) return emoji
  }

  if (category) {
    const path = normalize(category)
    for (const [pattern, emoji] of CATEGORY_RULES) {
      if (pattern.test(path)) return emoji
    }
  }

  return FALLBACK
}
