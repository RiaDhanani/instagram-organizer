// categorizer.js — OpenAI Vision API client with batching, rate limiting, and fallback
window.IG = window.IG || {};

window.IG.Categorizer = (() => {
  const SYSTEM_PROMPT = `You are a categorization assistant for Instagram saved posts.
Output ONLY valid JSON — no markdown, no explanation, no extra text.
- For a single post: output one JSON object.
- For multiple posts (sent as "--- Post 1 ---", "--- Post 2 ---", etc.): output a JSON array with one object per post in the same order.

Each object must have exactly this structure:
{
  "category": "string",
  "subcategory": "string",
  "tertiary": "string or null",
  "quaternary": "string or null",
  "quinary": "string or null",
  "tags": ["string"],
  "confidence": "high" | "medium" | "low"
}

Field mapping:
  category    = "Food"
  subcategory = "Recipes" OR [City Name]
  tertiary    = [Cuisine] (for Recipes) OR "Restaurants" | "Bars" | "Cafes" | "Date Night" (for city posts)
  quaternary  = null (for Recipes) OR [Cuisine] (for city posts)
  quinary     = null (always, reserved for future use)

---

## TWO-PASS REASONING (apply silently before outputting)

### PASS 1 — Extract signals only (do not classify yet)
- Caption keywords, ingredients, dish names
- Account handle (e.g. @chicagoeats, @nycdining)
- Hashtags (e.g. #chicagofood, #tokyoramen)
- Location tags, city mentions, neighborhood names
- Visual cues from alt text
- Vibe signals: romantic lighting, date night setting, bar menu, cocktails, etc.

### PASS 2 — Classify using those signals
- Determine first: is this home cooking/recipe content OR a real place to visit?
  - Home cooking, how-to, ingredients, meal prep → subcategory: "Recipes"
  - Restaurant, bar, cafe, date night spot → subcategory: [City Name]
- Write tags first — they are your evidence. Tertiary and quaternary are conclusions drawn from them.
- If tags contradict your tertiary or quaternary, fix those fields — never the tags.
- Run the pre-output checklist before writing any JSON.

### PRE-OUTPUT CHECKLIST
Before writing any output, verify every field:
□ Is this home cooking or a real place? subcategory "Recipes" vs [City Name] must be correct.
□ For Recipes: is tertiary word-for-word one of the 11 allowed cuisine strings?
□ For city posts: is subcategory a real city name in Title Case?
□ For city posts: is tertiary exactly one of — Restaurants, Bars, Cafes, Date Night?
□ For city posts: is quaternary a valid cuisine string or null?
□ For Travel: is subcategory a real destination and tertiary a valid activity?
□ Do tags support the classification chosen?
□ Is confidence correctly set per the confidence rules?
□ For batches: is the same reasoning depth applied to every post, including the last?
If any box fails → fix before outputting.

---

## GLOBAL RULES

### Labels
- NEVER use: "General", "Uncategorized", "Unknown", "Mixed", "Other" as any field value
- NEVER use restaurant names, account handles, hashtags, dish names, or sentence fragments in any field
- NEVER write phrases like "has food", "has restaurant", "looks like" anywhere
- All labels must be Title Case noun phrases
- Merge overlapping concepts — do not invent narrow one-off labels

### Tags
- Always 4–6 specific, searchable lowercase strings, no hashtags, no punctuation
- Include: account handle (without @), food or item type, city if known, style or vibe, relevant descriptors
- Tags are evidence — classification fields are conclusions drawn from them

### Confidence
- "high"   — city confirmed via explicit location tag or caption mention
- "medium" — city inferred from account handle alone (e.g. @chicagoeats → Chicago)
- "low"    — city unknown or only guessable from indirect signals; a web search will be triggered automatically

### Batch processing
Apply identical reasoning depth to every post regardless of position in the array.
Never abbreviate or simplify later posts.

---

## TAXONOMY

---

### FOOD — Recipes

For any home cooking, how-to, ingredient-focused, or meal prep content.

category:    "Food"
subcategory: "Recipes"
tertiary:    EXACTLY one of the 11 allowed cuisine strings below — no other value is valid
quaternary:  null
quinary:     null

Allowed tertiary values — copy letter-for-letter:

"Italian"       — pasta, pizza, risotto, gnocchi, focaccia
"Mexican"       — tacos, burritos, enchiladas, guacamole, quesadillas
"Indian"        — curry, biryani, dal, tikka, naan, masala
"Japanese"      — sushi, ramen, udon, tempura, miso, onigiri
"Korean"        — kimchi, bibimbap, Korean BBQ, tteokbokki, japchae
"Chinese"       — dumplings, dim sum, fried rice, mapo tofu, noodles
"Thai"          — pad thai, green curry, som tum, mango sticky rice
"Vietnamese"    — pho, banh mi, spring rolls, bun bo hue
"Mediterranean" — Greek, Lebanese, Turkish, Moroccan, Middle Eastern, North African
"American"      — burgers, BBQ, mac and cheese, fried chicken, sandwiches, comfort food
"Healthy"       — salads, grain bowls, smoothies, acai bowls, savory wraps (NOT baked goods)
"Baking"        — ALL baked goods and ALL desserts including healthy versions: bread, muffins,
                  banana bread, cakes, cookies, brownies, pies, cheesecake, ice cream, energy
                  balls, protein bars, protein cookies, date balls, granola bars
"Drinks"        — cocktails, mocktails, juices, coffee, tea, any beverage recipe
"Breakfast"     — pancakes, waffles, eggs, oatmeal, granola, morning meals
"Cafe & Brunch" — cafe-style recipes, brunch spreads, mimosas, avocado toast, eggs benedict

Baking vs Healthy — mutually exclusive:
If the post contains ANY of: baked, oven, flour, butter, sugar, dough, batter, chocolate,
protein bar, energy ball, granola bar → tertiary is ALWAYS "Baking" regardless of any
health claims in the caption.

Diet labels never appear in tertiary — tags only:
- Vegan tacos → "Mexican"
- Vegan curry → "Indian"
- Healthy muffin → "Baking"
- Keto pasta → "Italian"
- Vegan with no cuisine signal → "Healthy" (only if not baked)

Correction table — apply before outputting:
"Desserts"              → "Baking"
"Sweets"                → "Baking"
"Snacks" (sweet/baked)  → "Baking"
"Snacks" (savory)       → "Healthy"
"Asian"                 → pick specific (Japanese/Korean/Chinese/Thai/Vietnamese)
                          use "Asian" ONLY if genuinely mixed across multiple cuisines
"Asian Fusion"          → "Japanese" or closest specific cuisine
"[Cuisine] Vegetarian"  → "[That cuisine]"
"Vegan [Cuisine]"       → "[That cuisine]"
"Brunch"                → "Cafe & Brunch"
"Cafe"                  → "Cafe & Brunch"
Anything else           → pick the closest match from the 15 allowed strings

---

### FOOD — City-based places

For any real place to visit: restaurant, bar, cafe, date night spot.

Hierarchy: Food → [City] → [Place Type] → [Cuisine]

category:    "Food"
subcategory: [City Name] — real city name, Title Case (e.g. "Chicago", "New York", "Tokyo")
             OR "Unknown City" if city cannot be identified
tertiary:    EXACTLY one of: "Restaurants" | "Bars" | "Cafes" | "Date Night"
quaternary:  [Cuisine] from the allowed list below, or null if genuinely unclear
quinary:     null

Extracting the city — check in this order:
1. Explicit caption mention
2. Location tag
3. Hashtag (e.g. #chicagofood → Chicago, #nycfood → New York)
4. Account handle (e.g. @chicagoeats → Chicago, @nycdining → New York, @londonfoodie → London)

Confidence rules:
- "high"   — city confirmed via location tag or explicit caption mention
- "medium" — city inferred from account handle alone
- "low"    — city unknown; set subcategory to "Unknown City", do NOT guess

Choosing the place type (tertiary):
- "Restaurants"    — sit-down dining, casual eateries, food trucks, tasting menus
- "Bars"           — cocktail bars, wine bars, dip bars, rooftop bars, speakeasies, pubs
- "Cafes & Brunch" — coffee shops, bakery-cafes, brunch spots, brunch restaurants, tea houses,
                     breakfast cafes — use this for ANY brunch or cafe place
- "Date Night"     — any place explicitly framed as romantic, date night, anniversary, couples
                     outing, or intimate dining — use this OVER the other three when the
                     romantic signal is clear in the caption or visual context

Allowed quaternary (cuisine) values:
"Italian"       — pizza, pasta, risotto, trattoria
"Japanese"      — sushi, ramen, omakase, izakaya
"Korean"        — Korean BBQ, Korean fried chicken
"Chinese"       — dim sum, Sichuan, Cantonese, hot pot
"Mexican"       — tacos, cantina, street food, taqueria
"Indian"        — curry house, tandoori, dosa, chaat
"American"      — burgers, BBQ, diner, steakhouse
"Mediterranean" — Greek, Turkish, Lebanese, Middle Eastern
"French"        — bistro, brasserie, patisserie
"Thai"          — Thai restaurant, street Thai
"Vietnamese"    — pho spot, banh mi shop
"Dessert"       — dessert bars, ice cream shops, sweet-focused patisseries
null            — if cuisine is genuinely unclear

Known account → city mappings (use exactly as written):
@gus_sipanddip → subcategory: "Chicago", tertiary: "Bars", quaternary: null

---

### NIGHTLIFE (clubs and dancing venues only)

category:    "Nightlife"
subcategory: "Clubs"
tertiary:    [City] or null
quaternary:  null
quinary:     null

Note: cocktail bars, wine bars, rooftop bars, pubs → Food > [City] > Bars, NOT Nightlife.
Only use Nightlife for venues where the primary purpose is dancing or clubbing.

---

### TRAVEL

Hierarchy: Travel → Destination → Activity

category:    "Travel"
subcategory: [Destination] — city, region, or country in Title Case
             e.g. "Bali", "Japan", "Chicago", "Amalfi Coast", "Patagonia"
             OR "Unknown" if destination cannot be identified
tertiary:    EXACTLY one activity from the allowed list below
quaternary:  null
quinary:     null

Allowed tertiary (activity) values:
"Hiking"             — trails, trekking, national parks, mountain hikes
"Nature & Outdoors"  — scenic drives, road trips, forests, waterfalls, countryside
"Beach"              — coastal trips, ocean, islands, snorkeling, sunsets
"City Exploration"   — urban sightseeing, neighborhoods, street photography, city guides
"Food & Drink"       — travel posts centered on eating, food markets, culinary tourism
"Architecture"       — landmarks, buildings, historical sites, ruins
"Culture"            — museums, art, festivals, local traditions, spiritual sites
"Adventure"          — extreme sports, surfing, skiing, diving, bungee jumping
"Day Trip"           — short excursions, weekend trips, nearby escapes
"Nightlife"          — bars, clubs, night scenes in travel context

Rules:
- Pick the activity that best describes WHY someone saved the post
- A mountain view saved for the hike → "Hiking" not "Nature & Outdoors"
- A city post with clear food focus → "Food & Drink" not "City Exploration"
- A restaurant or bar post while traveling → Food category with foreign city, NOT Travel

---

### WEDDING

category:    "Wedding"
subcategory: Outfits | Decor | Food | Makeup | Venues | Poses | Jewelry | Invitations | Planning
tertiary:    null
---

### HOME DECOR

category:    "Home Decor"
subcategory: Living Room | Bedroom | Kitchen | Bathroom | Outdoor | Entryway | Home Office | Overall
tertiary:    Minimalist | Boho | Modern | Vintage | Cozy | Dark Academia | Industrial | Maximalist | Coastal | Japandi
quaternary:  null
quinary:     null

---

### FASHION

category:    "Fashion"
subcategory: Outfits | Streetwear | Formal | Casual | Accessories | Shoes | Bags | Jewelry | Activewear
tertiary:    Summer | Winter | Date Night | Work | Travel | Festival 
quaternary:  null
quinary:     null

---

### FITNESS

category:    "Fitness"
subcategory: Yoga | Gym | Running | Pilates | HIIT | Nutrition | Wellness | Dance | Cycling | Swimming
tertiary:    Strength | Flexibility | Cardio | Meal Prep | Recovery
quaternary:  null
quinary:     null

---

### BEAUTY

category:    "Beauty"
subcategory: Skincare | Makeup | Haircare | Nails | Fragrance
tertiary:    Routine | Tutorial | Product Review | Natural | Bold
quaternary:  null
quinary:     null

---

### ART & DESIGN

category:    "Art & Design"
subcategory: Painting | Photography | Illustration | Architecture | Graphic Design | Sculpture | Interior Design | Digital Art
tertiary:    style or medium if distinguishable
quaternary:  null
quinary:     null

---

### ENTERTAINMENT

category:    "Entertainment"
subcategory: Movies | TV Shows | Music | Books | Comedy | Podcasts | Games

tertiary for Movies:   Rom-Com | Action | Drama | Horror | Thriller | Animation | Documentary | Comedy | Sci-Fi
tertiary for TV Shows: Rom-Com | Drama | Reality | Crime | Sci-Fi | Animation | Comedy | K-Drama
tertiary for Music:    Pop | Hip-Hop | R&B | Indie | Classical | Electronic | Country | Jazz
quaternary:            null
quinary:               null

---

### EDUCATION

category:    "Education"
subcategory: Career | Finance | Self-Help | Productivity | Tech | Science | History | Language | Parenting | Psychology
tertiary:    null
quaternary:  null
quinary:     null

---

### OTHER

Use only when absolutely no other taxonomy category fits.
subcategory must be specific and descriptive — never vague.
tertiary required if subcategory alone is insufficient.
quaternary: null
quinary:    null

---

## EDGE CASES

- Ambiguous food photo with no caption — use alt text visual cues; confidence "medium" or "low"
- Recipe vs place ambiguous — any indication of a real venue (address, reservation, "go here") → city-based Food; instructional or ingredient-focused → Recipes
- Multi-topic posts (e.g. travel + food) — pick the dominant theme; secondary topic in tags only
- Reels or video posts with minimal alt text — infer from handle and caption; confidence "low" if unclear
- Sponsored or ad posts — categorize by product type, not the fact that it is an ad
- Memes or text-only posts — Entertainment > Comedy or Education depending on content
- Alt text is only "Photo by @username" — infer from handle, confidence "low", note uncertainty in tags
- Date Night signal present — always use tertiary "Date Night" over Restaurants, Bars, or Cafes when romantic framing is explicit
- Restaurant post from a trip abroad — Food category with the foreign city as subcategory, NOT Travel`;


  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Shared rate-limit pause: if one request hits 429, all subsequent ones wait
  let rateLimitUntil = 0;

  async function waitForRateLimit() {
    const wait = rateLimitUntil - Date.now();
    if (wait > 0) await sleep(wait);
  }

  // ── Core proxy chat completions call ─────────────────────────────────────────
  async function callCompletions(content, { model, userApiKey } = {}) {
    await waitForRateLimit();
    const body = {
      max_tokens: 250,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    };
    if (model) body.model = model;
    if (userApiKey) body.userApiKey = userApiKey;
    const response = await fetch(window.IG_CONFIG.categorizeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status === 429) {
      const errBody429 = await response.json().catch(() => ({}));
      const msg429 = errBody429.error?.message || 'Rate limited';
      const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
      rateLimitUntil = Date.now() + retryAfter * 1000 + 1000;
      const err = new Error(`429: ${msg429}`);
      err.retryAfter = retryAfter;
      throw err;
    }

    if (response.status === 402) {
      const errBody402 = await response.json().catch(() => ({}));
      const msg402 = errBody402.error?.message || 'Insufficient credits';
      const err = new Error(`402: ${msg402}`);
      err.status = 402;
      err.outOfCredits = true;
      err.fatal = true;
      throw err;
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const msg = errBody.error?.message || response.statusText;
      const err = new Error(`${response.status}: ${msg}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return parseResult(text);
  }

  // ── Extract @handle from alt text ─────────────────────────────────────────
  function extractAccountName(altText) {
    if (!altText) return null;
    const match = altText.match(/@([\w.]+)/);
    return match ? match[1] : null;
  }

  // ── Web search via proxy ───────────────────────────────────────────────────
  async function searchForContext(accountName) {
    try {
      const response = await fetch(window.IG_CONFIG.webSearchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: `What is the Instagram account @${accountName}? What type of content do they post — food, fashion, travel, fitness, home decor, entertainment, etc.? If it's a food place, what city is it in and what cuisine? Answer in 2 sentences max.`,
        }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch {
      return null;
    }
  }

  // ── Decide whether a web search is needed ─────────────────────────────────
  function needsSearch(result) {
    return result.confidence !== 'high';
  }

  // ── Normalize a raw categorization object ─────────────────────────────────
  // Accepts either a string (from single-post response) or an already-parsed object
  // (from batch response array). Both paths go through the same validation.
  function parseResult(input) {
    let obj;
    if (typeof input === 'string') {
      const match = input.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON in response');
      obj = JSON.parse(match[0]);
    } else if (input && typeof input === 'object') {
      obj = input;
    } else {
      throw new Error('Unexpected categorization input type');
    }
    const sub = String(obj.subcategory || 'Other');
    return {
      category: String(obj.category || 'Other'),
      subcategory: sub === 'General' ? 'Other' : sub,
      tertiary: (obj.tertiary && String(obj.tertiary).toLowerCase() !== 'null') ? String(obj.tertiary) : null,
      quaternary: (obj.quaternary && String(obj.quaternary).toLowerCase() !== 'null') ? String(obj.quaternary) : null,
      tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [],
      confidence: ['high', 'medium', 'low'].includes(obj.confidence) ? obj.confidence : 'low',
    };
  }

  // ── Build user-message content for a single post ───────────────────────────
  function buildPostContent(post) {
    const content = [];
    if (post.thumbnail_src) {
      content.push({ type: 'image_url', image_url: { url: post.thumbnail_src, detail: 'low' } });
    }
    const lines = [];
    if (post.alt_text) lines.push(`Alt text: ${post.alt_text}`);
    if (post.post_type) lines.push(`Post type: ${post.post_type}`);
    lines.push('Categorize this saved Instagram post.');
    content.push({ type: 'text', text: lines.join('\n') });
    return content;
  }

  // ── Batch completions call: multiple posts in one API call ─────────────────
  async function callCompletionsBatch(posts, { model, userApiKey } = {}) {
    await waitForRateLimit();

    const content = [];
    posts.forEach((post, i) => {
      content.push({ type: 'text', text: `\n--- Post ${i + 1} ---` });
      if (post.thumbnail_src) {
        content.push({ type: 'image_url', image_url: { url: post.thumbnail_src, detail: 'low' } });
      }
      const lines = [];
      if (post.alt_text) lines.push(`Alt text: ${post.alt_text}`);
      if (post.post_type) lines.push(`Post type: ${post.post_type}`);
      if (lines.length) content.push({ type: 'text', text: lines.join('\n') });
    });
    content.push({
      type: 'text',
      text: `\nReturn a JSON array of exactly ${posts.length} categorization objects in the same order as the posts above. No other text.`,
    });

    const reqBody = {
      max_tokens: 300 * posts.length,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    };
    if (model) reqBody.model = model;
    if (userApiKey) reqBody.userApiKey = userApiKey;
    const response = await fetch(window.IG_CONFIG.categorizeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      const msg = body.error?.message || 'Rate limited';
      const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
      rateLimitUntil = Date.now() + retryAfter * 1000 + 1000;
      const err = new Error(`429: ${msg}`); err.retryAfter = retryAfter; throw err;
    }
    if (response.status === 402) {
      const body = await response.json().catch(() => ({}));
      const msg = body.error?.message || 'Insufficient credits';
      const err = new Error(`402: ${msg}`);
      err.status = 402;
      err.outOfCredits = true;
      err.fatal = true;
      throw err;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const msg = body.error?.message || response.statusText;
      const err = new Error(`${response.status}: ${msg}`); err.status = response.status; throw err;
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || '';
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Response was not a JSON array');
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr) || arr.length !== posts.length) {
      throw new Error(`Expected ${posts.length} results, got ${Array.isArray(arr) ? arr.length : 'non-array'}`);
    }
    // arr elements are already-parsed objects — parseResult handles both strings and objects
    return arr.map(parseResult);
  }

  async function categorizeAll(posts, onProgress, skipImages = false, controller = {}, enableWebSearch = false, { model, userApiKey } = {}) {
    const BATCH_SIZE = 10;
    const CONCURRENCY = 3;
    const results = new Array(posts.length);
    const errorLog = [];
    let nextBatchStart = 0;
    let completed = 0;
    let errorCount = 0;
    let lastError = null;
    let cancelled = false;

    // Categorize a single post individually (used as batch fallback)
    async function categorizeSingle(post) {
      const p = skipImages ? { ...post, thumbnail_src: null } : post;
      try {
        return await callCompletions(buildPostContent(p), { model, userApiKey });
      } catch (err) {
        if (err.fatal) throw err;
        // Expired CDN image → retry text-only
        if (p.thumbnail_src && [400, 403, 422].includes(err.status)) {
          try { return await callCompletions(buildPostContent({ ...p, thumbnail_src: null }), { model, userApiKey }); }
          catch (e2) {
            if (e2.fatal) throw e2;
            errorLog.push(e2.message);
          }
        } else {
          errorLog.push(err.message);
        }
        return null; // non-fatal failure — caller marks post as error
      }
    }

    async function processBatch(batchStart) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, posts.length);
      const batchPosts = posts.slice(batchStart, batchEnd);
      const postsForApi = skipImages
        ? batchPosts.map((p) => ({ ...p, thumbnail_src: null }))
        : batchPosts;

      // ── Pass 1: batch call (1 API call for up to 10 posts) ────────────────
      let batchCats = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          batchCats = await callCompletionsBatch(postsForApi, { model, userApiKey });
          break;
        } catch (err) {
          if (err.fatal) throw err;
          // CDN image errors → retry text-only once
          if ([400, 403, 422].includes(err.status) && !skipImages) {
            try {
              batchCats = await callCompletionsBatch(batchPosts.map((p) => ({ ...p, thumbnail_src: null })), { model, userApiKey });
              break;
            } catch (e2) { if (e2.fatal) throw e2; }
          }
          if (attempt < 2) {
            const waitMs = err.message.startsWith('429')
              ? Math.max((err.retryAfter || 30) * 1000 + 2000, (attempt + 1) * 10000)
              : 2000 * (attempt + 1);
            await sleep(waitMs);
          }
        }
      }

      // ── Batch failed → if free model, throw immediately (rate limited); else fall back ──
      if (!batchCats) {
        if (model) {
          const e = new Error(`Free model rate-limited: ${model}`);
          e.modelRateLimited = true;
          e.model = model;
          e.fatal = true;
          throw e;
        }
        batchCats = await Promise.all(postsForApi.map((post) => categorizeSingle(post)));
      }

      // ── Pass 2: web search + re-categorize uncertain posts (optional) ──────
      const finalCats = await Promise.all(
        batchCats.map(async (cat, i) => {
          if (!cat) return null;
          if (!enableWebSearch || !needsSearch(cat)) return cat;
          const post = postsForApi[i];
          const accountName = extractAccountName(post.alt_text);
          if (!accountName) return cat;
          const searchCtx = await searchForContext(accountName);
          if (!searchCtx) return cat;
          const enriched = [...buildPostContent(post), {
            type: 'text',
            text: `Additional context from web search about @${accountName}: ${searchCtx}\nUsing this information, provide the final categorization.`,
          }];
          return callCompletions(enriched, { model, userApiKey }).catch(() => cat);
        })
      );

      return finalCats;
    }

    async function worker() {
      while (true) {
        while (controller.paused) await sleep(200);
        if (cancelled) return;

        const batchStart = nextBatchStart;
        nextBatchStart += BATCH_SIZE;
        if (batchStart >= posts.length) return;

        let finalCats;
        try {
          finalCats = await processBatch(batchStart);
        } catch (err) {
          // Only fatal errors (401, quota) reach here
          cancelled = true;
          throw err;
        }

        if (cancelled) return;

        const batchEnd = Math.min(batchStart + BATCH_SIZE, posts.length);
        for (let i = 0; i < batchEnd - batchStart; i++) {
          const globalIdx = batchStart + i;
          const categorization = finalCats[i] || {
            category: 'Uncategorized', subcategory: 'Error',
            tertiary: null, quaternary: null, tags: [], confidence: 'low',
          };
          if (!finalCats[i]) { errorCount++; lastError = errorLog[errorLog.length - 1] || 'Failed to categorize'; }
          results[globalIdx] = { ...posts[globalIdx], categorization };
          completed++;
          onProgress(completed, posts.length, errorCount, lastError, results[globalIdx]);
        }
      }
    }

    const workerCount = Math.min(CONCURRENCY, Math.ceil(posts.length / BATCH_SIZE));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return { results, errorCount, errorLog };
  }

  return { categorizeAll };
})();
