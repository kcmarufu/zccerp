/**
 * Rejection insights — what float and purchase requests are sent back for, and
 * hints that warn a requester before they repeat a common mistake.
 *
 * It learns from the system's own history, recomputed from the live database
 * (cached for CACHE_TTL_MS), so the figures follow every new decision:
 *
 *   1. THEMES — every rejection comment a reviewer wrote is read against a set
 *      of known mistakes ("attach the concept note", "add bank charges", ...).
 *      How often each one is cited is the headline figure. Comments are what
 *      reviewers actually said, so this figure carries no guesswork.
 *
 *   2. FACTORS — for checks that can be read off a request (is a concept note
 *      attached? is there a bank-charges line?) the rejection rate of requests
 *      that passed the check is compared with those that did not. Attachments
 *      are judged as they stood BEFORE the first rejection, since documents
 *      added afterwards are the fix, not the original request. Items are read
 *      as they are now (no item history is kept), so a factor's comparison is
 *      only quoted when it is large, well-sampled, and points the same way as
 *      the advice.
 *
 *   3. HINTS — a draft request is checked against the factors; any it fails
 *      comes back as a warning with the evidence, plus the most-cited themes
 *      that apply to that kind of request.
 */

const { query } = require('../config/database');
const { inferProcItemCategory } = require('../config/procItemCategories');

const CACHE_TTL_MS = 30 * 60 * 1000;
const RECENT_DAYS = 90;
const MIN_FACTOR_SAMPLE = 15;
const MIN_FACTOR_GAP = 5; // percentage points

// ── Attachment / item readers shared by history and drafts ──────────────────
const CONCEPT_DOC_RE = /concept|programme|program|agenda|\btors?\b|terms of reference|itinerary|activity plan|work ?plan/i;
const QUOTE_DOC_RE = /quot|qout|qoute|invoice|proforma|pro-forma|\bquote\b/i;
const FUEL_DOC_RE = /fuel/i;
const HIRE_DOC_RE = /agreement|contract|hire|lease/i;
const BANK_ITEM_RE = /bank|transaction|transfer|ecocash|withdrawal|charges?\b/i;
const FUEL_ITEM_RE = /\bfuel\b|diesel|petrol/i;
const HIRE_ITEM_RE = /vehicle hire|car hire|hire of (a )?(vehicle|car)|kombi|combi|shuttle|bus hire/i;
const GOODS_CATEGORIES = new Set(['PROCUREMENT', 'OFFICE_SUPPLIES', 'IT_SYSTEMS']);
const DETAILED_JUSTIFICATION_CHARS = 80;

// ── Themes: the mistakes reviewers cite ─────────────────────────────────────
// `mistake: false` marks reasons that are not the requester's error (the need
// went away, it was handled outside the system); they are reported to analysts
// but never turned into hints. `relevant(draft)` says when a theme is worth
// raising for a given draft.
const FLOAT_THEMES = [
  {
    id: 'concept_note', mistake: true,
    title: 'Concept note, programme or ToRs missing or not aligned',
    advice: 'For an activity, attach the concept note (reviewed by the Programme Lead and MEAL), the programme/agenda and ToRs for any facilitator, and make sure their dates and amounts match the request.',
    pattern: /concept|\bprogramme\b|\bprogram\b|agenda|terms of reference|\btors?\b|activity plan|itinerary|\bmemo\b|activity tool/,
    relevant: (d) => d.isActivity,
  },
  {
    id: 'supporting_docs', mistake: true,
    title: 'Supporting documents or quotations missing',
    advice: 'Attach every supporting document as a PDF: quotations or invoices for what you are buying, claim forms, schedules and signed contracts.',
    pattern: /attach|upload|supporting|quotation|qoutation|quoatation|\bquotes?\b|invoice|proforma|receipt|documents?|schedule|contract|clearance|signed copy/,
    relevant: () => true,
  },
  {
    id: 'bank_charges', mistake: true,
    title: 'Bank or transaction charges not included',
    advice: 'Add a line for bank / EcoCash / transfer charges on the right budget line.',
    pattern: /bank (charges?|fees?)|transaction(al)? (charges|costs|fees)|transfer (charges|fees)|ecocash|withdrawal charges|\bcharges\b/,
    relevant: () => true,
  },
  {
    id: 'claim_form', mistake: true,
    title: 'Travel / per diem claim form errors',
    advice: 'Fill the claim form day by day (no combined days), with the correct departure and arrival dates and times; only claim meals the times allow.',
    pattern: /claim forms?|day[- ]by[- ]day|per ?diem|t ?& ?s\b|t and s|subsistence|departure|arrival|breakfast/,
    relevant: (d) => d.hasPerDiem,
  },
  {
    id: 'budget_line', mistake: true,
    title: 'Wrong budget line, project or partner',
    advice: 'Check every item is charged to the budget line, project and partner the cost belongs to.',
    pattern: /budget line|wrong project|correct project|current project|wrong partner|wrong department|wrong (motor )?vehicle number|wrong requ?estor|cost distribution|request(ed)? (this )?(under|in|from)|must be requested under|not under admin|we can not request from|admin costs?|picked a|wrong reference|correct budget|from this line|funded by another partner|partner is|use [a-z]{2,6} not|route this request|share cost/,
    relevant: () => true,
  },
  {
    id: 'fuel_vehicle', mistake: true,
    title: 'Fuel schedule or vehicle hire agreement missing',
    advice: 'When fuel or a hired vehicle is involved, attach a signed fuel schedule and the vehicle hire agreement / logbook, and include toll fees.',
    pattern: /fuel|vehicle hir|hire agreement|hiring agreement|log ?book|toll|litres|car hire/,
    relevant: (d) => d.hasFuel || d.hasVehicleHire || d.hasTransport,
  },
  {
    id: 'amount_mismatch', mistake: true,
    title: 'Amounts do not match the supporting documents',
    advice: 'Make sure each amount on the request equals the quotation, invoice, claim form or concept note it comes from.',
    pattern: /(does not|doesn'?t|do not|not) match|not matching|different from|mismatch|align the|same as the/,
    relevant: (d) => d.attachmentCount > 0,
  },
  {
    id: 'rates', mistake: true,
    title: 'Rates above policy or budgeted rates',
    advice: 'Use the approved rates (accommodation, meals, allowances, exchange rate) and the cheapest suitable option.',
    pattern: /\brates?\b|per night|accommodation|accomodation|allowances?|too much|too high|cheaper|exchange rate/,
    relevant: (d) => d.hasPerDiem || d.hasAccommodation,
  },
  {
    id: 'dates', mistake: true,
    title: 'Wrong or missing activity dates',
    advice: 'Enter the correct activity dates, and raise the request in good time before the activity.',
    pattern: /\bdates?\b|timing|next week|after the implementation|postpone|implementation date|rescheduled|already been conducted|outside project timeline|project timeline/,
    relevant: (d) => d.isActivity,
  },
  {
    id: 'breakdown', mistake: true,
    title: 'Not enough detail or justification',
    advice: 'Describe exactly what the money is for — a breakdown of each cost, who it is for and why — rather than a one-word description.',
    pattern: /breakdown|break down|justify|explain|details?|detailed|specify|quantify|what exactly|clarif|who (is|are) (this|it)|for who|too broad|more information|not clear|narration|description|activity name|title is incorrect|client'?s? name|who is the client|which /,
    relevant: () => true,
  },
  {
    id: 'procurement_route', mistake: true,
    title: 'Should go through procurement',
    advice: 'Goods and services that need suppliers and quotations go through a purchase request in the Procurement module, not a float.',
    pattern: /procurement|comparative bid|bidding/,
    relevant: (d) => d.hasGoods,
  },
  {
    id: 'funds', mistake: true,
    title: 'Not enough money on the budget line',
    advice: 'Check the budget line balance before requesting; split costs across lines only where that is allowed.',
    pattern: /insufficient|exhausted|available (funds|budget|resources)|above the available|over ?expenditure|exceed/,
    relevant: () => true,
  },
  {
    id: 'duplicate', mistake: true,
    title: 'Duplicate request',
    advice: 'Check you, or a colleague, have not already requested the same thing.',
    pattern: /duplicat|dublicat|same request|already (been )?(done|requested|processed)|similar request/,
    relevant: () => true,
  },
  {
    id: 'outstanding_recon', mistake: true,
    title: 'Outstanding reconciliations',
    advice: 'Clear your outstanding reconciliations before asking for a new float.',
    pattern: /outstanding reconcil|pending reconcil|reconciliations? (pending|outstanding)|pending acquittals?/,
    relevant: () => true,
  },
  {
    id: 'file_format', mistake: true,
    title: 'Attachment unreadable or wrong format',
    advice: 'Attach clear PDF files (not Word documents or photos that cannot be read).',
    pattern: /\bpdf\b|word documents?|re-?upload|not opening|cannot open|legible|blurr/,
    relevant: (d) => d.attachmentCount > 0,
  },
  {
    id: 'calculation', mistake: true,
    title: 'Calculation, quantity or amount errors',
    advice: 'Check every quantity × unit price, the number of people and days, and that the total requested is right.',
    pattern: /recalculate|calculat|\btotals?\b|amount (is|on|to)|actual amount|edit (the )?amount|figure|numbers? (of|on)|by 2 people|quantity|i got \$|is \$?\d|not \$?\d|full amount|half the amount|giving me/,
    relevant: () => true,
  },
  {
    id: 'missing_costs', mistake: true,
    title: 'Costs left out of the request',
    advice: 'Include every cost the activity needs — transport, meals, facilitation fees, charges — so nothing has to be added later.',
    pattern: /\badd (the |on )?(meals|transport|fuel|dinner|lunch|teas|pastor)|include (police|everything|tollgate|facilitation|transport)|incluide everything|input facilitation|not covering all costs|kindly add/,
    relevant: () => true,
  },
  {
    id: 'split_request', mistake: true,
    title: 'Different kinds of cost combined in one request',
    advice: 'Keep unrelated costs apart (e.g. transport reimbursements apart from conferencing) — raise them as separate requests.',
    pattern: /separate|stand alone|split/,
    relevant: (d) => d.itemCount > 1,
  },
  {
    id: 'comments_not_addressed', mistake: true,
    title: 'Earlier comments not addressed',
    advice: 'Before resubmitting, fix every point the reviewer (and your HOD) raised — a request resubmitted unchanged is rejected again.',
    pattern: /address (the |all |my )?(previous|earlier|issues|comments?)|(hod|hop)'?s? comments|issues (we|i) (discussed|raised)|fully address|as mentioned before|still involved/,
    relevant: () => true,
  },
  {
    id: 'no_longer_needed', mistake: false,
    title: 'No longer needed / cancelled / on hold',
    advice: '',
    pattern: /no longer|cancel|not needed|activity no longer|payment was not processed|not processed|on hold|to be processed|will be processed|wait (for|until)|waiting for|new request to be done|we are using the initial request/,
    relevant: () => false,
  },
];

const PROC_THEMES = [
  {
    id: 'duplicate', mistake: true,
    title: 'Duplicate — already requested or already done',
    advice: 'Check the request has not already been raised (by you or a colleague) or already procured.',
    pattern: /same request|similar|already|done before|has been done|been processed|another (one|same)|did this|duplicat|has been done by|request has been done|^this was done/,
    relevant: () => true,
  },
  {
    id: 'split_suppliers', mistake: true,
    title: 'Items from different suppliers combined in one request',
    advice: 'Raise a separate purchase request for each kind of supplier (e.g. groceries apart from stationery, PA system apart from banners) — each request takes quotations from one supplier type.',
    pattern: /separate|on its own|different suppliers|separately|stand alone|remove the .* part/,
    relevant: (d) => d.categoryCount > 1,
  },
  {
    id: 'wrong_route', mistake: true,
    title: 'Raised in the wrong module, department or partner',
    advice: 'Raise it under the department and partner that own the budget (e.g. programmes vs admin), and use a float instead when cash is needed.',
    pattern: /request (in|from|this under)|request from (admin|finance)|in programs|under [a-z]{3,}|need cash|was given cash/,
    relevant: () => true,
  },
  {
    id: 'missing_details', mistake: true,
    title: 'Specifications or details missing',
    advice: 'Give each item its specifications (brand, model, size, quantity) and include everything that is needed in the one request.',
    pattern: /specification|lacks information|name of the|include everything|details?|specify|adjusted|add (dinner|other)|needs to be edited|to edit (the|their) request/,
    relevant: () => true,
  },
  {
    id: 'amount', mistake: true,
    title: 'Amount missing or above the budget',
    advice: 'Enter an estimated price for every item and keep the total within the budget line.',
    pattern: /no amount|input amount|budget|exceed|available resources|price is too high|too high|cheaper/,
    relevant: () => true,
  },
  {
    id: 'timing', mistake: true,
    title: 'Raised too late or at the wrong time',
    advice: 'Raise purchase requests well before the activity or delivery date — an event that has already happened cannot be procured for.',
    pattern: /already (been )?conducted|already taken place|dates? to be announced|harvest period|has taken place/,
    relevant: () => true,
  },
  {
    id: 'supporting_docs', mistake: true,
    title: 'Supporting documents missing',
    advice: 'Attach the supporting documents (specification, proforma quotation, photos) when you raise the request.',
    pattern: /supporting|documents|attach|quotation/,
    relevant: () => true,
  },
  {
    id: 'approval', mistake: true,
    title: 'Missing approval or signature',
    advice: 'Make sure the Head of Department has approved / signed where required.',
    pattern: /signed by|approved by|head of department|\bhod\b|procurement com+it+ee/,
    relevant: () => true,
  },
  {
    id: 'supplier', mistake: true,
    title: 'Supplier issue',
    advice: 'Use the supplier that was selected, and the cheapest compliant quotation.',
    pattern: /supplier/,
    relevant: () => false,
  },
  {
    id: 'outside_system', mistake: false,
    title: 'Handled outside the system',
    advice: '',
    pattern: /manual|old system|in?ternal vehicle|inernal vehicle|tv sales|another service provider was chosen/,
    relevant: () => false,
  },
  {
    id: 'no_longer_needed', mistake: false,
    title: 'No longer needed / changed',
    advice: '',
    pattern: /no longer|cancel+ed|not available|there are changes|something different|not needed/,
    relevant: () => false,
  },
];

/** "amend", "edit request", "." — a rejection that says nothing about what to fix. */
const UNSPECIFIED_RE = /^(please |kindly |to )?(amend|ammend|edit|correct|change|adjust|revise|error entries|put correct breakdown)?( the)?( request| it| this| costs| entries)?[\s.!]*$/;

function classifyComment(comment, themes) {
  const text = String(comment || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text || UNSPECIFIED_RE.test(text) || text.length < 4) return ['unspecified'];
  const hits = themes.filter(t => t.pattern.test(text)).map(t => t.id);
  return hits.length ? hits : ['other'];
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const toMs = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

// ── Factors: checks that can be read off a request ──────────────────────────
const FLOAT_FACTORS = [
  {
    id: 'activity_concept_note', theme: 'concept_note',
    title: 'Attach the concept note for this activity',
    applies: (f) => f.isActivity,
    satisfied: (f) => f.hasConceptDoc,
    passLabel: 'with a concept note / programme attached', failLabel: 'without one',
    hint: 'No concept note, programme or ToRs appears among your attachments. If it is attached under another file name you can ignore this.',
  },
  {
    id: 'bank_charges', theme: 'bank_charges',
    title: 'Include bank / transaction charges',
    applies: (f) => f.itemCount > 0,
    satisfied: (f) => f.hasBankCharges,
    passLabel: 'with a bank-charges line', failLabel: 'without one',
    hint: 'None of your items is for bank, EcoCash or transfer charges.',
  },
  {
    id: 'goods_quotation', theme: 'supporting_docs',
    title: 'Attach quotations for the goods',
    applies: (f) => f.hasGoods,
    satisfied: (f) => f.hasQuoteDoc,
    passLabel: 'with a quotation or invoice', failLabel: 'without one',
    hint: 'You are buying goods but no quotation or invoice is attached.',
  },
  {
    id: 'fuel_schedule', theme: 'fuel_vehicle',
    title: 'Attach the fuel schedule',
    applies: (f) => f.hasFuel,
    satisfied: (f) => f.hasFuelDoc,
    passLabel: 'with a fuel schedule', failLabel: 'without one',
    hint: 'You are requesting fuel but no fuel schedule appears among your attachments.',
  },
  {
    id: 'vehicle_hire_agreement', theme: 'fuel_vehicle',
    title: 'Attach the vehicle hire agreement',
    applies: (f) => f.hasVehicleHire,
    satisfied: (f) => f.hasHireDoc,
    passLabel: 'with a hire agreement', failLabel: 'without one',
    hint: 'You are hiring a vehicle but no hire agreement or contract appears among your attachments.',
  },
  {
    id: 'any_attachment', theme: 'supporting_docs',
    title: 'Attach your supporting documents',
    applies: () => true,
    satisfied: (f) => f.attachmentCount > 0,
    passLabel: 'with supporting documents', failLabel: 'with none',
    hint: 'Nothing is attached yet.',
  },
  {
    id: 'detailed_justification', theme: 'breakdown',
    title: 'Explain the request in more detail',
    applies: () => true,
    satisfied: (f) => f.justificationLength >= DETAILED_JUSTIFICATION_CHARS,
    passLabel: 'with a detailed justification', failLabel: 'with a short one',
    hint: 'Your justification is very short. Say what the activity is, who it is for and what each cost covers.',
  },
  {
    id: 'activity_dates', theme: 'dates',
    title: 'Enter the activity dates',
    applies: (f) => f.isActivity,
    satisfied: (f) => f.hasActivityDates,
    passLabel: 'with activity dates', failLabel: 'without them',
    hint: 'The activity start and end dates are not filled in.',
  },
];

const PROC_FACTORS = [
  {
    id: 'one_supplier_type', theme: 'split_suppliers',
    title: 'Split items for different suppliers into separate requests',
    applies: (f) => f.itemCount > 1,
    satisfied: (f) => f.categoryCount <= 1,
    passLabel: 'with one kind of supplier', failLabel: 'mixing several',
    hint: (f) => `Your items look like ${f.categoryCount} different kinds of supplier (${f.categories.join(', ')}).`,
  },
  {
    id: 'specifications', theme: 'missing_details',
    title: 'Give every item its specifications',
    applies: (f) => f.itemCount > 0,
    satisfied: (f) => f.allItemsHaveSpecs,
    passLabel: 'with specifications on every item', failLabel: 'with some missing',
    hint: 'Some items have no specifications (brand, model, size).',
  },
  {
    id: 'prices', theme: 'amount',
    title: 'Enter an estimated price for every item',
    applies: (f) => f.itemCount > 0,
    satisfied: (f) => f.allItemsPriced,
    passLabel: 'with every item priced', failLabel: 'with unpriced items',
    hint: 'Some items have no estimated price.',
  },
  {
    id: 'supporting_docs', theme: 'supporting_docs',
    title: 'Attach a specification or proforma quotation',
    applies: () => true,
    satisfied: (f) => f.attachmentCount > 0,
    passLabel: 'with attachments', failLabel: 'with none',
    hint: 'Nothing is attached yet.',
  },
  {
    id: 'lead_time', theme: 'timing',
    title: 'Allow enough time before the delivery date',
    applies: (f) => f.leadDays != null,
    satisfied: (f) => f.leadDays >= 7,
    passLabel: 'raised a week or more ahead', failLabel: 'raised with under a week to go',
    hint: (f) => (f.leadDays < 0
      ? 'The expected delivery date is already in the past.'
      : `The expected delivery date is only ${f.leadDays} day${f.leadDays === 1 ? '' : 's'} away.`),
  },
  {
    id: 'detailed_justification', theme: 'missing_details',
    title: 'Explain the request in more detail',
    applies: () => true,
    satisfied: (f) => f.justificationLength >= DETAILED_JUSTIFICATION_CHARS,
    passLabel: 'with a detailed justification', failLabel: 'with a short one',
    hint: 'Your justification is very short.',
  },
];

// ── Feature extraction ──────────────────────────────────────────────────────
function floatFeatures({ isActivity, items, attachments, justification, hasPerDiemClaim, activityStart, activityEnd }) {
  const names = attachments.map(a => String(a.name || ''));
  const types = attachments.map(a => String(a.type || '').toUpperCase());
  const descs = items.map(i => String(i.description || ''));
  const cats = items.map(i => String(i.category || '').toUpperCase());
  return {
    isActivity: Boolean(isActivity),
    itemCount: items.length,
    attachmentCount: attachments.length,
    hasConceptDoc: names.some(n => CONCEPT_DOC_RE.test(n)),
    hasQuoteDoc: types.some(t => t === 'QUOTATION' || t === 'INVOICE') || names.some(n => QUOTE_DOC_RE.test(n)),
    hasFuelDoc: names.some(n => FUEL_DOC_RE.test(n)),
    hasHireDoc: names.some(n => HIRE_DOC_RE.test(n)),
    hasBankCharges: descs.some(d => BANK_ITEM_RE.test(d)),
    hasFuel: descs.some(d => FUEL_ITEM_RE.test(d)),
    hasVehicleHire: descs.some(d => HIRE_ITEM_RE.test(d)),
    hasTransport: cats.includes('TRANSPORT') || cats.includes('VEHICLE_FLEET'),
    hasGoods: cats.some(c => GOODS_CATEGORIES.has(c)),
    hasPerDiem: Boolean(hasPerDiemClaim) || cats.includes('PER_DIEM'),
    hasAccommodation: cats.includes('ACCOMMODATION'),
    justificationLength: String(justification || '').trim().length,
    hasActivityDates: Boolean(activityStart && activityEnd),
  };
}

function procFeatures({ items, attachments, justification, title, deliveryDate, at }) {
  const categories = [...new Set(items.map(i =>
    (i.category && String(i.category).trim()) || inferProcItemCategory(i.description, i.specifications, title)
  ))];
  let leadDays = null;
  if (deliveryDate) {
    const due = new Date(String(deliveryDate).slice(0, 10) + 'T00:00:00Z').getTime();
    const from = new Date(new Date(at || Date.now()).toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    if (Number.isFinite(due) && Number.isFinite(from)) leadDays = Math.round((due - from) / 86400000);
  }
  return {
    itemCount: items.length,
    categories,
    categoryCount: categories.length,
    allItemsHaveSpecs: items.length > 0 && items.every(i => String(i.specifications || '').trim().length > 0),
    allItemsPriced: items.length > 0 && items.every(i => Number(i.price) > 0),
    attachmentCount: attachments.length,
    justificationLength: String(justification || '').trim().length,
    leadDays,
  };
}

/** Group rows into a Map keyed by `key`. */
function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

// ── Model building ──────────────────────────────────────────────────────────
function summariseThemes(rejections, themes, now) {
  const recentCut = now - RECENT_DAYS * 86400000;
  const priorCut = now - 2 * RECENT_DAYS * 86400000;
  const stats = new Map();
  const ensure = (id) => {
    if (!stats.has(id)) stats.set(id, { count: 0, recent: 0, prior: 0, requests: new Set(), examples: [] });
    return stats.get(id);
  };
  for (const r of rejections) {
    const t = toMs(r.created_at);
    for (const id of classifyComment(r.comments, themes)) {
      const s = ensure(id);
      s.count += 1;
      s.requests.add(r.request_id);
      if (t >= recentCut) s.recent += 1;
      else if (t >= priorCut) s.prior += 1;
      s.examples.push({ at: r.created_at, text: String(r.comments || '').replace(/\s+/g, ' ').trim().slice(0, 220) });
    }
  }
  const total = rejections.length;
  const meta = new Map(themes.map(t => [t.id, t]));
  meta.set('unspecified', {
    id: 'unspecified', mistake: false, title: 'Reviewer gave no specific reason',
    advice: 'Comments such as "amend" or "edit" do not tell the requester what to fix. Ask reviewers to say exactly what is wrong.',
  });
  meta.set('other', { id: 'other', mistake: false, title: 'Other reasons', advice: '' });

  return [...stats.entries()].map(([id, s]) => {
    const m = meta.get(id) || { id, title: id, advice: '', mistake: false };
    return {
      id,
      title: m.title,
      advice: m.advice,
      isMistake: Boolean(m.mistake),
      count: s.count,
      requestCount: s.requests.size,
      share: pct(s.count, total),
      recentCount: s.recent,
      priorCount: s.prior,
      examples: s.examples
        .sort((a, b) => toMs(b.at) - toMs(a.at))
        .slice(0, 4),
    };
  }).sort((a, b) => b.count - a.count);
}

function summariseFactors(requests, factors) {
  return factors.map(fac => {
    let pass = 0, passRej = 0, fail = 0, failRej = 0;
    for (const r of requests) {
      if (!fac.applies(r.features)) continue;
      if (fac.satisfied(r.features)) { pass += 1; if (r.rejected) passRej += 1; }
      else { fail += 1; if (r.rejected) failRej += 1; }
    }
    const passRate = pct(passRej, pass);
    const failRate = pct(failRej, fail);
    // Quoted only when it is well-sampled and supports the advice.
    const conclusive = pass >= MIN_FACTOR_SAMPLE && fail >= MIN_FACTOR_SAMPLE && (failRate - passRate) >= MIN_FACTOR_GAP;
    return {
      id: fac.id, theme: fac.theme, title: fac.title,
      passLabel: fac.passLabel, failLabel: fac.failLabel,
      passCount: pass, passRejectionRate: passRate,
      failCount: fail, failRejectionRate: failRate,
      conclusive,
    };
  });
}

async function buildFloatModel() {
  const [requests, items, attachments, rejections] = await Promise.all([
    query(`SELECT id, status, is_activity_request, activity_start_date, activity_end_date,
                  justification, has_per_diem_claim, created_at
             FROM requests WHERE status <> 'DRAFT'`),
    query(`SELECT request_id, category, item_description FROM request_items`),
    query(`SELECT entity_id AS request_id, attachment_type, original_name, uploaded_at
             FROM attachments WHERE UPPER(entity_type) = 'REQUEST'`),
    query(`SELECT request_id, comments, created_at FROM approval_logs
            WHERE action = 'REJECTED' AND new_status = 'REJECTED'`),
  ]);
  const itemsBy = groupBy(items, 'request_id');
  const attBy = groupBy(attachments, 'request_id');
  const firstRejection = new Map();
  for (const r of rejections) {
    const t = toMs(r.created_at);
    if (!firstRejection.has(r.request_id) || t < firstRejection.get(r.request_id)) firstRejection.set(r.request_id, t);
  }

  const history = requests.map(req => {
    const cut = firstRejection.get(req.id);
    const atts = (attBy.get(req.id) || [])
      .filter(a => cut == null || toMs(a.uploaded_at) < cut)
      .map(a => ({ name: a.original_name, type: a.attachment_type }));
    return {
      rejected: firstRejection.has(req.id),
      features: floatFeatures({
        isActivity: Number(req.is_activity_request) === 1,
        items: (itemsBy.get(req.id) || []).map(i => ({ description: i.item_description, category: i.category })),
        attachments: atts,
        justification: req.justification,
        hasPerDiemClaim: Number(req.has_per_diem_claim) === 1,
        activityStart: req.activity_start_date,
        activityEnd: req.activity_end_date,
      }),
    };
  });

  const now = Date.now();
  const rejectedCount = history.filter(h => h.rejected).length;
  return {
    module: 'float',
    generatedAt: new Date(now).toISOString(),
    submittedRequests: history.length,
    rejectedRequests: rejectedCount,
    rejectionRate: pct(rejectedCount, history.length),
    rejectionEvents: rejections.length,
    themes: summariseThemes(rejections, FLOAT_THEMES, now),
    factors: summariseFactors(history, FLOAT_FACTORS),
  };
}

async function buildProcModel() {
  const [requests, items, attachments, rejections] = await Promise.all([
    query(`SELECT id, status, title, justification, expected_delivery_date, submitted_at, created_at
             FROM proc_requests WHERE status <> 'DRAFT'`),
    query(`SELECT request_id, category, item_description, specifications, estimated_unit_price
             FROM proc_request_items`),
    query(`SELECT request_id, attachment_type, original_name, created_at FROM proc_request_attachments`),
    query(`SELECT request_id, comments, created_at FROM proc_approval_logs
            WHERE action IN ('REJECTED', 'HIGH_VALUE_REJECTED')`),
  ]);
  const itemsBy = groupBy(items, 'request_id');
  const attBy = groupBy(attachments, 'request_id');
  const firstRejection = new Map();
  for (const r of rejections) {
    const t = toMs(r.created_at);
    if (!firstRejection.has(r.request_id) || t < firstRejection.get(r.request_id)) firstRejection.set(r.request_id, t);
  }

  const history = requests.map(req => {
    const cut = firstRejection.get(req.id);
    const atts = (attBy.get(req.id) || [])
      .filter(a => cut == null || toMs(a.created_at) < cut)
      .map(a => ({ name: a.original_name, type: a.attachment_type }));
    return {
      rejected: firstRejection.has(req.id) || req.status === 'REJECTED',
      features: procFeatures({
        items: (itemsBy.get(req.id) || []).map(i => ({
          description: i.item_description, specifications: i.specifications,
          category: i.category, price: i.estimated_unit_price,
        })),
        attachments: atts,
        justification: req.justification,
        title: req.title,
        deliveryDate: req.expected_delivery_date,
        at: req.submitted_at || req.created_at,
      }),
    };
  });

  const now = Date.now();
  const rejectedCount = history.filter(h => h.rejected).length;
  return {
    module: 'procurement',
    generatedAt: new Date(now).toISOString(),
    submittedRequests: history.length,
    rejectedRequests: rejectedCount,
    rejectionRate: pct(rejectedCount, history.length),
    rejectionEvents: rejections.length,
    themes: summariseThemes(rejections, PROC_THEMES, now),
    factors: summariseFactors(history, PROC_FACTORS),
  };
}

const cache = new Map();

async function getModel(module, { refresh = false } = {}) {
  const key = module === 'procurement' ? 'procurement' : 'float';
  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.model;
  const model = key === 'procurement' ? await buildProcModel() : await buildFloatModel();
  cache.set(key, { at: Date.now(), model });
  return model;
}

// ── Hints for a draft ───────────────────────────────────────────────────────
function themeEvidence(model, themeId) {
  const t = model.themes.find(x => x.id === themeId);
  if (!t || !t.count) return null;
  return { count: t.count, share: t.share, total: model.rejectionEvents };
}

function evidenceSentence(moduleLabel, ev) {
  if (!ev) return '';
  return `Reviewers raised this in ${ev.share}% of ${moduleLabel} rejections (${ev.count} of ${ev.total}).`;
}

function factorSentence(stat) {
  if (!stat || !stat.conclusive) return '';
  return `Requests ${stat.failLabel} were rejected ${stat.failRejectionRate}% of the time, against ${stat.passRejectionRate}% ${stat.passLabel}.`;
}

/**
 * Hints for a draft. `draft` is what the form holds right now:
 *   float:       { isActivityRequest, justification, hasPerDiemClaim,
 *                  activityStartDate, activityEndDate,
 *                  items: [{ category, description }],
 *                  attachments: [{ name, type }] }
 *   procurement: { title, justification, expectedDeliveryDate,
 *                  items: [{ description, specifications, category, price }],
 *                  attachments: [{ name, type }] }
 */
async function getHintsForDraft(module, draft = {}) {
  const isProc = module === 'procurement';
  const model = await getModel(isProc ? 'procurement' : 'float');
  const items = Array.isArray(draft.items) ? draft.items.slice(0, 200) : [];
  const attachments = Array.isArray(draft.attachments) ? draft.attachments.slice(0, 100) : [];
  const moduleLabel = isProc ? 'purchase request' : 'float request';

  const features = isProc
    ? procFeatures({
      items: items.map(i => ({
        description: i.description, specifications: i.specifications,
        category: i.category, price: i.price,
      })),
      attachments, justification: draft.justification, title: draft.title,
      deliveryDate: draft.expectedDeliveryDate, at: Date.now(),
    })
    : floatFeatures({
      isActivity: Boolean(draft.isActivityRequest),
      items: items.map(i => ({ description: i.description, category: i.category })),
      attachments, justification: draft.justification,
      hasPerDiemClaim: Boolean(draft.hasPerDiemClaim),
      activityStart: draft.activityStartDate, activityEnd: draft.activityEndDate,
    });

  const factors = isProc ? PROC_FACTORS : FLOAT_FACTORS;
  const themes = isProc ? PROC_THEMES : FLOAT_THEMES;
  const hints = [];
  const coveredThemes = new Set();

  // 1. Checks this draft fails right now.
  for (const fac of factors) {
    if (!fac.applies(features) || fac.satisfied(features)) continue;
    const stat = model.factors.find(f => f.id === fac.id);
    const ev = themeEvidence(model, fac.theme);
    const detail = typeof fac.hint === 'function' ? fac.hint(features) : fac.hint;
    const theme = themes.find(t => t.id === fac.theme);
    hints.push({
      id: fac.id,
      severity: 'warning',
      title: fac.title,
      message: [detail, theme?.advice].filter(Boolean).join(' '),
      detail: detail || '',
      evidence: [evidenceSentence(moduleLabel, ev), factorSentence(stat)].filter(Boolean).join(' '),
    });
    coveredThemes.add(fac.theme);
  }

  // A specific "attach the concept note / quotation / schedule" already says
  // something is missing, so the generic "nothing attached" one is dropped.
  const specificAttachmentHint = hints.some(h =>
    ['activity_concept_note', 'goods_quotation', 'fuel_schedule', 'vehicle_hire_agreement'].includes(h.id));
  if (specificAttachmentHint) {
    const i = hints.findIndex(h => h.id === 'any_attachment');
    if (i >= 0) hints.splice(i, 1);
  }

  // 2. The most-cited mistakes that apply to this kind of request.
  const relevantThemes = model.themes
    .filter(t => t.isMistake && !coveredThemes.has(t.id))
    .filter(t => {
      const def = themes.find(d => d.id === t.id);
      return def && def.relevant(features);
    })
    .slice(0, 4);
  for (const t of relevantThemes) {
    hints.push({
      id: `theme_${t.id}`,
      severity: 'info',
      title: t.title,
      message: t.advice,
      evidence: evidenceSentence(moduleLabel, { count: t.count, share: t.share, total: model.rejectionEvents }),
    });
  }

  return {
    module: isProc ? 'procurement' : 'float',
    learnedFrom: {
      rejections: model.rejectionEvents,
      requests: model.submittedRequests,
      rejectionRate: model.rejectionRate,
      generatedAt: model.generatedAt,
    },
    hints,
  };
}

module.exports = {
  getModel,
  getHintsForDraft,
  // exported for tests / scripts
  classifyComment,
  FLOAT_THEMES,
  PROC_THEMES,
};
