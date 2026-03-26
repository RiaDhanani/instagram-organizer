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
  "tags": ["string"],
  "confidence": "high" | "medium" | "low"
}

---

## STEP-BY-STEP REASONING (apply silently before outputting)
1. Read the full post — caption, alt text, account handle, hashtags, location tags
2. Identify 4-6 specific descriptive tags — food item, cuisine type, location hints, style, ingredients. These tags are your evidence and must be written first mentally.
3. Use those tags to determine category and tertiary — tags drive the category, not the other way around:
   - tags contain pasta / pizza / risotto → tertiary: "Italian"
   - tags contain curry / biryani / naan / tikka → tertiary: "Indian"
   - tags contain taco / burrito / enchilada → tertiary: "Mexican"
   - tags contain sushi / ramen / kimchi / pho / dumplings → tertiary: "Asian"
   - tags contain salad / grain bowl / smoothie / acai → tertiary: "Healthy"
   - tags contain cake / cookie / muffin / brownie / bread / protein bar → tertiary: "Baking"
   - tags contain pancake / waffle / eggs / oatmeal → tertiary: "Breakfast"
   - tags contain cocktail / juice / coffee / tea → tertiary: "Drinks"
   If your tags contradict your tertiary, fix the tertiary — never the tags.
4. Extract city signals: account handle, hashtags, location tags, caption keywords
5. If two categories compete, pick the one with more signal from the tags
6. Set confidence: high = obvious, medium = inferred from context, low = guessing from handle only
7. VERIFY: if Food > Recipes, confirm tertiary is word-for-word one of: Italian, Mexican, Indian, Asian, Mediterranean, American, Healthy, Baking, Drinks, Breakfast — if not, apply the correction table in the Recipes section before outputting

---

## GLOBAL RULES (apply to every category)

### Labels
- NEVER use: "General", "Uncategorized", "Unknown", "Mixed", "Other" as subcategory unless truly no taxonomy match exists
- NEVER use restaurant names, account handles, hashtags, dish names, or sentence fragments as tertiary
- NEVER write phrases like "has food", "has restaurant", "looks like" in any field
- All labels must be Title Case noun phrases (e.g. "Chicago Italian", not "chicago italian" or "CHICAGO ITALIAN")
- Merge overlapping concepts into one consistent label — do not invent narrow one-off subcategories

### Tags
- Always include 4–6 specific, searchable keywords
- Include: account handle (without @), food/item type, city (if known), style/aesthetic, relevant descriptors
- Tags must be lowercase strings, no hashtags, no punctuation
- Tags are the evidence — tertiary is the conclusion drawn from them. If tags say "pasta" → tertiary MUST be "Italian". If tags say "salad" or "grain bowl" → tertiary MUST be "Healthy". Never contradict your own tags.

### Confidence
- "high" — explicit visual or textual confirmation
- "medium" — strongly inferred from account name, hashtags, or partial caption
- "low" — guessing; only handle or vague description available. A web search will be triggered automatically for low-confidence posts to verify city or category

---

## TAXONOMY

### Food
Determine first: is this a **recipe/home cooking** or a **place (restaurant/cafe/bar)**?

#### Recipes (home cooking, how-to, ingredient-focused)
- subcategory: "Recipes"
- tertiary: EXACTLY ONE of these 10 strings, copied letter-for-letter — NO other value is valid:
    "Italian"       — pasta, pizza, risotto, gnocchi, any Italian dish
    "Mexican"       — tacos, burritos, enchiladas, guacamole, any Mexican dish
    "Indian"        — curry, biryani, dal, tikka, naan, any Indian dish
    "Asian"         — covers ALL of: Japanese, Korean, Chinese, Thai, Vietnamese, Filipino and any fusion of those
    "Mediterranean" — covers ALL of: Greek, Lebanese, Turkish, Moroccan, Middle Eastern, North African
    "American"      — burgers, BBQ, mac & cheese, fried chicken, sandwiches, comfort food
    "Healthy"       — salads, grain bowls, smoothies, acai bowls, wraps — NO baked goods, NO desserts, NO sweet treats ever
    "Baking"        — ALL baked goods AND ALL desserts, including "healthy" versions: bread, muffins, banana bread, cakes, cookies, brownies, pies, cheesecake, ice cream, energy balls, protein bars, protein cookies, date balls, granola bars
    "Drinks"        — cocktails, mocktails, juices, coffee, tea, any beverage recipe
    "Breakfast"     — pancakes, waffles, eggs, oatmeal, granola, morning meals

SELF-CHECK before writing each tertiary: is it word-for-word one of the 10 strings above? If not, apply this correction table:
  "Desserts"                 → "Baking"
  "Sweets"                   → "Baking"
  "Snacks"                   → "Baking" (if sweet/baked) or "Healthy" (if savory)
  "Comfort Food"             → "American"
  "Asian Fusion"             → "Asian"
  "Indian Chinese"           → "Asian"
  "Asian Vegetarian"         → "Asian"
  "Indian Vegetarian"        → "Indian"
  "Mexican Vegetarian"       → "Mexican"
  "Vegan Mexican"            → "Mexican"
  "Vegan Indian"             → "Indian"
  "Vegan Asian"              → "Asian"
  "[Any cuisine] Vegetarian" → "[That cuisine]"
  "Vegan [Any cuisine]"      → "[That cuisine]"
  Anything else not in the 10 → pick the closest match from the list

- "Healthy" and "Baking" are MUTUALLY EXCLUSIVE — a healthy muffin is "Baking", a vegan cookie is "Baking", a protein bar is "Baking", always
- Diet labels (Vegan, Vegetarian, Keto, Gluten-free) NEVER appear in tertiary — tags only
- Vegan tacos → "Mexican"; vegan curry → "Indian"; vegan with no cuisine → "Healthy" (if not baked)

#### Restaurants (place-based: restaurant, cafe, bar, food truck, market)
- subcategory: "Restaurants"
- tertiary: "[City] [Cuisine]" — ALWAYS a real city name + cuisine type
  - Extract city from: caption location tags, hashtags (e.g. #chicagofood), account handle (e.g. @chicagoeats → Chicago), or explicit mention
  - If city cannot be confirmed with reasonable confidence → set confidence: "low" (do NOT guess; leave tertiary as just the cuisine type, e.g. "Italian", "Bar")
  - Cuisine must be the parent category, never a dish name:
    - sushi / ramen / hibachi / izakaya → Japanese
    - pizza / pasta / risotto → Italian
    - tacos / burritos / quesadillas → Mexican
    - burgers / BBQ / wings → American
    - pho / banh mi → Vietnamese
    - dim sum / dumplings / noodles → Chinese
    - cocktail bar / speakeasy / dip bar / drink-focused venue → Bar
  - Known account → city mappings (use these exactly, update as new ones are confirmed):
    - @gus_sipanddip → "Chicago Bar"

### Wedding
Trigger on ANY wedding-related content: real weddings, inspiration, planning, bridal content.
- subcategory: exactly one of — Outfits, Decor, Florals, Food, Makeup, Venues, Poses, Jewelry, Invitations, Planning
- tertiary: optional detail — e.g. "Bridal Gown", "Table Setting", "Ceremony Arch", "Reception", "Engagement"
- When both Outfits and Florals apply, choose based on the dominant visual element

### Home Decor
- subcategory: Living Room, Bedroom, Kitchen, Bathroom, Outdoor, Entryway, Home Office, Overall
- tertiary: aesthetic style — Minimalist, Boho, Modern, Vintage, Cozy, Dark Academia, Industrial, Maximalist, Coastal, Japandi

### Fashion
- subcategory: Outfits, Streetwear, Formal, Casual, Accessories, Shoes, Bags, Jewelry, Activewear
- tertiary: context — Summer, Winter, Date Night, Work, Travel, Festival, Transitional

### Travel
- subcategory: destination city or country (e.g. "Chicago", "Italy", "Bali") OR travel type
  - Outdoor adventures, hikes, national parks, road trips → always "Nature & Road Trip" (never "Nature" or "Road Trip" separately)
  - Urban exploration → city name
  - Beach/coastal content → "Beach"
  - Mountain content without a specific destination → "Mountains"
- tertiary: activity or vibe — Architecture, Street Food, Nightlife, Hiking, Beaches, Culture, Day Trip, Scenic Views

### Fitness
- subcategory: Yoga, Gym, Running, Pilates, HIIT, Nutrition, Wellness, Dance, Cycling, Swimming
- tertiary: optional focus — e.g. "Strength", "Flexibility", "Cardio", "Meal Prep", "Recovery"

### Beauty
- subcategory: Skincare, Makeup, Haircare, Nails, Fragrance
- tertiary: optional — e.g. "Routine", "Tutorial", "Product Review", "Natural", "Bold"

### Art & Design
- subcategory: Painting, Photography, Illustration, Architecture, Graphic Design, Sculpture, Interior Design, Digital Art
- tertiary: style or medium if distinguishable

### Entertainment
- subcategory: exactly one of — Movies, TV Shows, Music, Books, Comedy, Podcasts, Games
- tertiary for Movies: Rom-Com, Action, Drama, Horror, Thriller, Animation, Documentary, Comedy, Sci-Fi
- tertiary for TV Shows: Rom-Com, Drama, Reality, Crime, Sci-Fi, Animation, Comedy, K-Drama
- tertiary for Music: Pop, Hip-Hop, R&B, Indie, Classical, Electronic, Country, Jazz

### Education
- subcategory: Career, Finance, Self-Help, Productivity, Tech, Science, History, Language, Parenting, Psychology

### Other
- Use only when no other category fits
- subcategory must still be specific and descriptive — never vague
- tertiary: required if subcategory alone is insufficient

---

## EDGE CASES

- **Ambiguous food posts** (no caption, food photo only): use visual cues in alt text; set confidence "medium" or "low"
- **Multi-topic posts** (e.g. travel + food): pick the dominant theme; use tags to capture secondary topics
- **Reels / video posts** with minimal alt text: infer from account handle and any available caption; set confidence "low" if truly unclear
- **Product ads or sponsored posts**: categorize by product type, not the fact that it's an ad
- **Memes or text-only posts**: use Entertainment › Comedy or Education based on content
- **Alt text is only "Photo by @username"** with zero description: infer from handle, set confidence "low", use tags to note the uncertainty`;



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
    // arr elements are already-parsed objects — parseResult handles both strings and objects
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
          batchCats = await callCompletionsBatch(postsForApi);
          break;
        } catch (err) {
          if (err.fatal) throw err;
          // CDN image errors → retry text-only once
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

      // ── Batch failed → fall back to individual calls for each post ─────────
      if (!batchCats) {
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
