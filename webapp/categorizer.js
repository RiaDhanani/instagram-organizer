// categorizer.js — categorization client using server-side proxy (OpenRouter)
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
  "tags": ["string"],
  "confidence": "high"
}
Note: confidence must be exactly one of the strings: "high", "medium", or "low".

## General principles
- Read the full post context before assigning — do not rely on a single keyword
- Merge overlapping concepts into one consistent label; do not invent narrow one-off subcategories
- "Road Trip" and "Nature" are the same — always use subcategory "Nature & Road Trip" for both
- All bars, cocktail bars, dip bars, and drink-focused venues use cuisine "Bar" or a city prefix (e.g. "Chicago Bar"); never use "Unknown Bar" or "Chicago Drinks" as a label
- Prefer the broader, more consistent label when two options seem equally valid
- Tags and category/tertiary must be mutually consistent — if you assign a tag like "pasta", tertiary MUST be "Italian"; if you assign "salad" or "grain bowl", tertiary MUST be "Healthy"

## Taxonomy — follow this exactly:

### Food
- If it looks like a recipe, how-to, or home cooking → subcategory: "Recipes"
- tertiary: EXACTLY ONE of these 10 strings, copied letter-for-letter — NO other value is valid:
    "Italian"       — pasta, pizza, risotto, gnocchi, any Italian dish
    "Mexican"       — tacos, burritos, enchiladas, guacamole, any Mexican dish
    "Indian"        — curry, biryani, dal, tikka, naan, any Indian dish
    "Asian"         — covers ALL of: Japanese, Korean, Chinese, Thai, Vietnamese, Filipino and any fusion of those
    "Mediterranean" — covers ALL of: Greek, Lebanese, Turkish, Moroccan, Middle Eastern, North African
    "American"      — burgers, BBQ, mac & cheese, fried chicken, sandwiches, comfort food
    "Healthy"       — salads, grain bowls, smoothies, acai bowls, wraps — NO baked goods, NO desserts, NO sweet treats ever
    "Baking"        — ALL baked goods AND ALL desserts, including so-called "healthy" versions: bread, muffins, banana bread, cakes, cookies, brownies, pies, cheesecake, ice cream, energy balls, protein bars, protein cookies, date balls, granola bars
    "Drinks"        — cocktails, mocktails, juices, coffee, tea, any beverage recipe
    "Breakfast"     — pancakes, waffles, eggs, oatmeal, granola, morning meals

SELF-CHECK before writing each tertiary: is it word-for-word one of the 10 strings above? If not, apply this correction table:
  "Desserts"              → "Baking"
  "Sweets"                → "Baking"
  "Snacks"                → "Baking" (if sweet/baked) or "Healthy" (if savory)
  "Comfort Food"          → "American"
  "Asian Fusion"          → "Asian"
  "Indian Chinese"        → "Asian"
  "Asian Vegetarian"      → "Asian"
  "Indian Vegetarian"     → "Indian"
  "Mexican Vegetarian"    → "Mexican"
  "Vegan Mexican"         → "Mexican"
  "Vegan Indian"          → "Indian"
  "Vegan Asian"           → "Asian"
  "[Any cuisine] Vegetarian" → "[That cuisine]"
  "Vegan [Any cuisine]"   → "[That cuisine]"
  Anything else not in the 10 → pick the closest match from the list

- "Healthy" and "Baking" are MUTUALLY EXCLUSIVE — a healthy muffin is "Baking", a vegan cookie is "Baking", a protein bar is "Baking", always
- Diet labels (Vegan, Vegetarian, Keto, Gluten-free) NEVER appear in tertiary — tags only
- Vegan tacos → "Mexican"; vegan curry → "Indian"; vegan with no cuisine → "Healthy" (if not baked)
- If it looks like a restaurant, cafe, bar, or food place → subcategory: "Restaurants", tertiary: "[City] [Cuisine]"
  - tertiary MUST be a real city name + cuisine type. Examples: "Chicago Italian", "New York Brunch", "Chicago Bar"
  - NEVER use a restaurant name, account handle, hashtag, or description phrase as the tertiary
  - NEVER write "has restaurant", "has food", or any sentence fragment as the tertiary
  - Extract the city from the account name in alt text (e.g. "@chicagoeats" → Chicago, "@nyceats" → New York) or any location text
  - Cuisine examples: Italian, Mexican, Indian, Japanese, Korean, Chinese, Mediterranean, American, Middle Eastern, Thai, Cafe, Brunch, Dessert, Bakery, Bar, Cocktails
  - Always use the parent cuisine, never a dish name: sushi/ramen/hibachi → Japanese; pizza/pasta → Italian; tacos/burritos → Mexican; burgers/BBQ → American; pho → Vietnamese; dim sum/dumplings → Chinese
  - Cocktail bars, dip bars, speakeasies, and drink-focused venues → cuisine: "Bar" or "Cocktails"
  - Known account → city mappings (use these exactly):
    @gus_sipanddip → "Chicago Bar"
  - If you cannot identify the city with confidence → set confidence to "low" (do NOT guess a city; a web search will be used to find it)
  - If city is confirmed unknown after searching → tertiary = just the cuisine type (e.g. "Italian", "Bar")

### Wedding
- If ANY wedding-related content (real wedding, inspo, planning) → category: "Wedding"
- subcategory must be one of: Outfits, Decor, Food, Poses, Makeup, Venues, Florals, Planning, Jewelry, Invitations
- tertiary: optional extra detail (e.g. "Bridal Gown", "Table Setting", "Ceremony", "Reception")

### Home Decor
- category: "Home Decor", subcategory: room or style
- subcategory examples: Living Room, Bedroom, Kitchen, Bathroom, Outdoor, Entryway, Home Office, Overall
- tertiary: aesthetic style (e.g. "Minimalist", "Boho", "Modern", "Vintage", "Cozy", "Dark Academia")

### Fashion
- subcategory: Outfits, Streetwear, Formal, Casual, Accessories, Shoes, Bags, Jewelry, Activewear
- tertiary: style detail (e.g. "Summer", "Winter", "Date Night", "Work")

### Travel
- subcategory: destination city/country OR travel type (e.g. "Chicago", "Italy", "Bali", "Beach", "Mountains", "City Guide", "Nature & Road Trip")
- tertiary: activity or vibe (e.g. "Architecture", "Street Food", "Nightlife", "Hiking")
- Nature trips, outdoor adventures, hikes, and road trips all use subcategory "Nature & Road Trip"

### Fitness
- subcategory: Yoga, Gym, Running, Pilates, HIIT, Nutrition, Wellness, Dance

### Beauty
- subcategory: Skincare, Makeup, Haircare, Nails, Fragrance

### Art & Design
- subcategory: Painting, Photography, Illustration, Architecture, Graphic Design, Sculpture, Interior Design

### Entertainment
- subcategory: exactly one of: Movies, TV Shows, Music, Books, Comedy, Podcasts, Games
- For Movies: tertiary must be exactly one of: Rom-Com, Action, Drama, Horror, Thriller, Animation, Documentary, Comedy, Sci-Fi
- For TV Shows: tertiary must be exactly one of: Rom-Com, Drama, Reality, Crime, Sci-Fi, Animation, Comedy, K-Drama

### Education
- subcategory: Career, Finance, Self-help, Productivity, Tech, Science, History, Language

### Other
- Use only if no other category fits; subcategory must still be specific

## Rules:
- NEVER use "General", "Uncategorized", or vague labels as subcategory
- For restaurant posts, ALWAYS try to identify the city — look at the account handle in "Photo by @accountname" and any location words
- tags: 4-6 specific, searchable keywords (include account name, food type, city, style, etc.)
- confidence: "high" if obviously clear, "medium" if inferred, "low" if guessing
- If alt text is just "Photo by @username" with zero description, guess based on account name and set confidence "low"`;


  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Shared rate-limit pause: if one request hits 429, all subsequent ones wait
  let rateLimitUntil = 0;

  async function waitForRateLimit() {
    const wait = rateLimitUntil - Date.now();
    if (wait > 0) await sleep(wait);
  }

  // ── Core proxy chat completions call ─────────────────────────────────────────
  async function callCompletions(content) {
    await waitForRateLimit();
    const response = await fetch(window.IG_CONFIG.categorizeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 250,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
      }),
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
  async function callCompletionsBatch(posts) {
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

    const response = await fetch(window.IG_CONFIG.categorizeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 300 * posts.length,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
      }),
    });

    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      const msg = body.error?.message || 'Rate limited';
      const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
      rateLimitUntil = Date.now() + retryAfter * 1000 + 1000;
      const err = new Error(`429: ${msg}`); err.retryAfter = retryAfter; throw err;
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
    return arr.map(parseResult);
  }

  async function categorizeAll(posts, onProgress, skipImages = false, controller = {}, enableWebSearch = false) {
    const BATCH_SIZE = 10;
    const CONCURRENCY = 3;
    const results = new Array(posts.length);
    let nextBatchStart = 0;
    let completed = 0;
    let errorCount = 0;
    let lastError = null;
    let cancelled = false;

    // Categorize a single post individually (used as batch fallback)
    async function categorizeSingle(post) {
      const p = skipImages ? { ...post, thumbnail_src: null } : post;
      try {
        return await callCompletions(buildPostContent(p));
      } catch (err) {
        if (err.fatal) throw err;
        // Expired CDN image → retry text-only
        if (p.thumbnail_src && [400, 403, 422].includes(err.status)) {
          try { return await callCompletions(buildPostContent({ ...p, thumbnail_src: null })); }
          catch (e2) { if (e2.fatal) throw e2; }
        }
        return null;
      }
    }

    async function processBatch(batchStart) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, posts.length);
      const batchPosts = posts.slice(batchStart, batchEnd);
      const postsForApi = skipImages
        ? batchPosts.map((p) => ({ ...p, thumbnail_src: null }))
        : batchPosts;

      // ── Pass 1: batch call ────────────────────────────────────────────────
      let batchCats = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          batchCats = await callCompletionsBatch(postsForApi);
          break;
        } catch (err) {
          if (err.fatal) throw err;
          if ([400, 403, 422].includes(err.status) && !skipImages) {
            try {
              batchCats = await callCompletionsBatch(batchPosts.map((p) => ({ ...p, thumbnail_src: null })));
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

      // ── Batch failed → fall back to individual calls ──────────────────────
      if (!batchCats) {
        batchCats = await Promise.all(postsForApi.map((post) => categorizeSingle(post)));
      }

      // ── Pass 2: web search + re-categorize uncertain posts ────────────────
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
          return callCompletions(enriched).catch(() => cat);
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
          cancelled = true;
          throw err;
        }

        if (cancelled) return;

        const batchEnd = Math.min(batchStart + BATCH_SIZE, posts.length);
        for (let i = 0; i < batchEnd - batchStart; i++) {
          const globalIdx = batchStart + i;
          const categorization = finalCats[i] || {
            category: 'Uncategorized', subcategory: 'Error',
            tertiary: null, tags: [], confidence: 'low',
          };
          if (!finalCats[i]) { errorCount++; lastError = 'Failed to categorize'; }
          results[globalIdx] = { ...posts[globalIdx], categorization };
          completed++;
          onProgress(completed, posts.length, errorCount, lastError, results[globalIdx]);
        }
      }
    }

    const workerCount = Math.min(CONCURRENCY, Math.ceil(posts.length / BATCH_SIZE));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return { results, errorCount };
  }

  return { categorizeAll };
})();
