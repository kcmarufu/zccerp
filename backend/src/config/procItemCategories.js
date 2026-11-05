/**
 * What a procurement item IS — the classification the procurement spending
 * analysis groups by.
 *
 * The analysis used to group by budget_lines.category, a field almost nobody
 * fills in, so most of the money landed in "Uncategorised". Each item now
 * carries its own category (proc_request_items.category): the requester picks
 * one from this list, and when they do not, inferProcItemCategory() reads it
 * from the item's description. The list is the supplier register's category
 * list, so a purchase and the suppliers who can fill it are described in the
 * same words.
 */

const PROC_ITEM_CATEGORIES = [
  'Accommodation & Hotels',
  'Agricultural Inputs & Livestock',
  'Audit & Accounting Services',
  'Banking & Financial Services',
  'Branding, Printing & Stationery',
  'Catering & Food Supplies',
  'Cleaning & Hygiene Supplies',
  'Communications & Airtime',
  'Conference & Event Venues',
  'Construction & Building Materials',
  'Consultancy & Professional Services',
  'Courier & Postal Services',
  'Electrical & Solar Equipment',
  'Food & Beverage',
  'Fuel & Lubricants',
  'Furniture & Fittings',
  'Hardware & Tools',
  'Humanitarian Relief Items',
  'Insurance',
  'Internet & Connectivity',
  'IT Equipment',
  'IT Services & Software',
  'Legal Services',
  'Media & Advertising',
  'Medical',
  'Motor Vehicle Repairs & Spares',
  'Office Equipment',
  'Office Supplies',
  'Protective Clothing & Uniforms',
  'Publishing & Translation',
  'Rentals & Property',
  'Security Services',
  'Training',
  'Transport',
  'Travel Agents & Air Tickets',
  'Tyres & Batteries',
  'Utilities (Water, Electricity)',
  'Vehicle Hire',
  'Vehicles',
  'Water & Sanitation Equipment',
  'Other',
];

const FALLBACK_CATEGORY = 'Other';

/**
 * Keyword rules, tried IN ORDER — the first match wins, so the more specific
 * rules come first ("bed and breakfast" is accommodation before "breakfast"
 * can make it catering; "seed" makes sugar beans a farm input before "beans"
 * can make them food). Built from the descriptions actually entered on this
 * system's purchase requests.
 */
const RULES = [
  ['Office Supplies',                   /\bfolders?\b/],
  ['Consultancy & Professional Services', /consultan/],
  ['Training',                          /\btraining\b|\blessons?\b|\bclasses\b|driving school|workshop facilitation/],
  ['Conference & Event Venues',         /confer|converence|\bvenue|tent\b|gazebo|d[ée]cor|exhibition|(table|chair)s?\b.*\bhir(e|ing)|\bhir(e|ing)\b.*\b(table|chair)|pa system|sound system|led screen|space rental/],
  ['Accommodation & Hotels',            /bed (and|&) brea|b ?& ?b\b/],
  ['Insurance',                         /insurance/],
  ['Travel Agents & Air Tickets',       /plane tickets?|air ?tickets?|flight|return tickets?|airfare/],
  ['Water & Sanitation Equipment',      /borehole|\bpump\b|water (scheme|reticulation|tank|pipe)|reticulation|garden tap|honey sucker|plumbing|sanitation|latrine|sewer|drainage|\d+ ?lit(er|re)s? tank|jojo/],
  ['Tyres & Batteries',                 /\btyres?\b|\btires?\b/],
  ['Electrical & Solar Equipment',      /solar|inverter|invertor|generator|electrical|extension cable|flex cable|adaptor|flood ?light|infrared light|torch|bulbs?\b|wiring/],
  // After solar, so a solar battery stays with its system.
  ['Tyres & Batteries',                 /\bbatter(y|ies)\b/],
  ['Internet & Connectivity',           /starlink|star link|wi-?fi|internet|router|data bundle/],
  ['Communications & Airtime',          /airtime|sim cards?|phone credit/],
  ['Motor Vehicle Repairs & Spares',    /servic(e|ing) (for|of)|car servi[cs]e|vehicle service|gear ?box|brake|steering|carburet|windscreen|control arms?|\bdpf\b|car wash|carpet for|spares?\b|engine|clutch|shock absorber|exhaust|vehicle repairs?|\bservice\b.*\b[a-z]{3}-?\s?\d{4}\b/],
  ['Vehicles',                          /motor ?bike|registration for|vehicle licen[cs]e|zinara/],
  ['Vehicle Hire',                      /vehicle hire|car hire|kombi|combi|shuttle|bus hire|\bsuv\b|\bvehicle\b|\bcar\b|nissan|toyota|\bhilux\b/],
  ['Transport',                         /transport|mobili[sz]ation|delivery|haulage|logistics|running costs/],
  ['Fuel & Lubricants',                 /\bfuel\b|diesel|petrol|\boil change\b|lubricant/],
  ['Branding, Printing & Stationery',   /banner|pull ?-?up|roll ?-?up|billboard|posters?|pamphlets?|flyers?|brochures?|leaflets?|\bprint(ing|ed)?\b|copies|t-?shirts?|\bhats?\b|branded|stickers?|buttons?|placards?|name tags?|lanyards?|booklets?|notebooks?|diary|conversation cards|visibility materials|caps\b/],
  ['Publishing & Translation',          /translation|annual report|toolkits?|reflections|strategy (document|paper)|publication|editing|layout and design/],
  ['IT Equipment',                      /laptop|printer|\bton+er\b|cart?ridge|catridge|computer|desktop|\bdell\b|\bhp\b|\btv\b|smart tv|camera|hdmi|monitor|projector|tablet|phone\b|hard drive|flash ?drive|ups\b/],
  ['IT Services & Software',            /software|licen[cs]e|website|hosting|domain|system development/],
  ['Office Supplies',                   /bond paper|\bpens?\b|\bfiles?\b|folders?|envelopes?|stap+le|highlighters?|markers?|note ?pads|stick(y)? notes|flip ?charts?|file dividers|claro|paper clips|scissors|glue|stationery|a4\b|ream/],
  ['Cleaning & Hygiene Supplies',       /soap|sunlight|tissue|tooth ?paste|tooth ?brush|sanitary|diapers?|toilet spray|buckets?|va(c|cc)u+m|pressure washer|cleaning|detergent|bleach|mop|fumigation|sanitiser|sanitizer/],
  ['Humanitarian Relief Items',         /blankets?|bedding|children'?s (pants|underwear|clothes)|underwear|start[ -]?up (kits?|packs?)|\bige\b|relief|dignity kits?|care package|returnees?/],
  ['Agricultural Inputs & Livestock',   /seed|sedd|seedlings?|goats?|\bchicks\b|broiler|\bfeeds?\b|concentrate|hay bales|fertili[sz]er|pesticide|mancozeb|lambda|cartap|compound [cd]\b|vet kit|hermetic|feeders?|drinkers|livestock|pepper|garden\b|ploughing|irrigation|ammonium|nitrate|\burea\b|green ?house/],
  ['Construction & Building Materials', /cement|bricks?|brick force|\bsand\b|timber|\bibr\b|roof|nails|screws|poles?\b|weld mesh|tying wire|droppers|fenc|\bgates?\b|windows?|ceiling|flooring|pvc|building materials|construction|toilet seat|doors?\b|contractor|labour|aggregate|quarry|paint/],
  ['Furniture & Fittings',              /\bchairs?\b|\btables?\b|benches|tressle|trestle|swivel|furniture|umbrellas?|shelv|cabinet|desk\b/],
  ['Hardware & Tools',                  /tools?\b|hardware|spatula|rolling pin|measuring cup|mixing bowl|strainer|cake|whisk|mixer|kitchen scale|gas stove|deep freezer|gas tank|heat press|wheelbarrow|shovel|hoe\b|baking tray|siffer|sifter|fridge|freezit machine|oven/],
  ['Security Services',                 /cctv|security|alarm|guard/],
  ['Protective Clothing & Uniforms',    /\bppe\b|safety shoes|riders? suits|jackets?|uniforms?|overalls|trousers|work suits|gumboots/],
  ['Utilities (Water, Electricity)',    /zesa|electricity|office power|water bill|utilities/],
  ['Rentals & Property',                /\brent(al)?\b|lease/],
  ['Consultancy & Professional Services', /consultan|research|\breview\b|analys|assessment|evaluation|baseline|facilitator|professional fees?/],
  ['Audit & Accounting Services',       /audit/],
  ['Legal Services',                    /legal|lawyer|attorney/],
  ['Medical',                           /medical|first aid|medicine|drugs?\b|clinic|vet\b/],
  ['Courier & Postal Services',         /courier|postage|postal|dhl/],
  ['Media & Advertising',               /advert|radio|media|newspaper|video|photograph/],
  ['Banking & Financial Services',      /bank charges?|transaction charges?|ecocash/],
  // Groceries and meals last: their words ("rice", "tea", "oil") appear inside
  // many other descriptions, so they only decide when nothing more specific did.
  ['Catering & Food Supplies',          /dinners?|lunch|\bteas?\b|meals?|catering|breakfast|refreshments|cooking oil|soya|peanut butter|sugar|\brice\b|maize|mealie|beans|chicken|\bbeef\b|\bmilk\b|grocer|ingr[ei]dients|relish|vegetables|tomatoes|cabbage|onions|bread|flour|salt\b|kapenta|food/],
  ['Accommodation & Hotels',            /accom|lodg|hotel|holiday inn|nights?\b|guest ?house/],
];

/** The category a piece of text reads as, or null when no rule recognises it. */
function matchCategory(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (const [category, pattern] of RULES) {
    if (pattern.test(t)) return category;
  }
  return null;
}

/**
 * Best category for one item: its own description first, then its
 * specifications, then the request's title — and 'Other' when none of them
 * says what is being bought. Never returns null, so nothing reaches the
 * report uncategorised.
 */
function inferProcItemCategory(description, specifications = '', requestTitle = '') {
  return matchCategory(description)
    || matchCategory(specifications)
    || matchCategory(requestTitle)
    || FALLBACK_CATEGORY;
}

/**
 * The category to store for an item: the one the requester picked when it is
 * on the list, otherwise the inferred one.
 */
function resolveProcItemCategory(item, requestTitle = '') {
  const picked = String(item?.category || '').trim();
  if (picked && PROC_ITEM_CATEGORIES.includes(picked)) return picked;
  return inferProcItemCategory(item?.item_description, item?.specifications, requestTitle);
}

module.exports = {
  PROC_ITEM_CATEGORIES,
  FALLBACK_CATEGORY,
  inferProcItemCategory,
  resolveProcItemCategory,
};
