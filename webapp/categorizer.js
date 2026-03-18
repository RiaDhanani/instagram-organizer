// categorizer.js — OpenAI Vision API client with batching, rate limiting, and fallback
window.IG = window.IG || {};

window.IG.Categorizer = (() => {
  const SYSTEM_PROMPT = `You are a categorization assistant for Instagram saved posts.
Output ONLY a valid JSON object — no markdown, no explanation — with exactly this structure:
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

## Taxonomy — follow this exactly:

### Food
- If it looks like a recipe, how-to, or home cooking → subcategory: "Recipes", tertiary: cuisine type (e.g. "Italian", "Mexican", "Desserts", "Healthy", "Asian", "Baking", "Drinks")
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

  // ── Core OpenAI chat completions call ────────────────────────────────────────
  async function callCompletions(content, apiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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
      // Quota exceeded = fatal (no point retrying, user needs to add credits)
      if (/quota|billing|credit|exceeded your current/i.test(msg429)) {
        const err = new Error(`Out of OpenAI credits: ${msg429}`);
        err.fatal = true;
        throw err;
      }
      const err = new Error(`429: ${msg429}`);
      err.retryAfter = retryAfter;
      throw err;
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const msg = errBody.error?.message || response.statusText;
      // 401 = bad API key — fatal, no point retrying
      if (response.status === 401) {
        const err = new Error('401: Invalid API key — please check your key in Settings.');
        err.fatal = true;
        throw err;
      }
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

  // ── Web search via OpenAI Responses API ───────────────────────────────────
  async function searchForContext(accountName, apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          tools: [{ type: 'web_search_preview' }],
          input: `What is the Instagram account @${accountName}? Is it a restaurant, bar, cafe, or other food/lifestyle place? What city is it in and what is it known for? Answer in 2 sentences max.`,
        }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      const texts = (data.output || [])
        .filter(o => o.type === 'message')
        .flatMap(m => (m.content || []))
        .filter(c => c.type === 'output_text')
        .map(c => c.text);
      return texts.join(' ').trim() || null;
    } catch {
      return null;
    }
  }

  // ── Decide whether a web search is needed ─────────────────────────────────
  // Restaurants always get a search pass — city identification can't be reliably
  // inferred from alt text alone and wrong cities are common even at "high" confidence.
  function needsSearch(result) {
    if (result.category === 'Food' && result.subcategory === 'Restaurants') return true;
    if (result.confidence !== 'high') return true;
    return false;
  }

  // ── Two-pass categorization: search & re-categorize when needed ───────────
  async function categorizeOne(post, apiKey) {
    await waitForRateLimit();

    const content = [];

    if (post.thumbnail_src) {
      content.push({
        type: 'image_url',
        image_url: { url: post.thumbnail_src, detail: 'low' },
      });
    }

    const textLines = [];
    if (post.alt_text) textLines.push(`Alt text: ${post.alt_text}`);
    if (post.post_type) textLines.push(`Post type: ${post.post_type}`);
    textLines.push('Categorize this saved Instagram post.');
    content.push({ type: 'text', text: textLines.join('\n') });

    let result;
    try {
      result = await callCompletions(content, apiKey);
    } catch (err) {
      // If image URL caused the error (expired CDN = 400, 403, 422), retry text-only
      if (post.thumbnail_src && [400, 403, 422].includes(err.status)) {
        return categorizeOne({ ...post, thumbnail_src: null }, apiKey);
      }
      throw err;
    }

    // Search for more context and re-categorize when needed
    if (needsSearch(result)) {
      const accountName = extractAccountName(post.alt_text);
      if (accountName) {
        const searchCtx = await searchForContext(accountName, apiKey);
        if (searchCtx) {
          const enrichedContent = [
            ...content,
            {
              type: 'text',
              text: `Additional context from web search about @${accountName}: ${searchCtx}\nUsing this information, provide the final categorization.`,
            },
          ];
          try {
            result = await callCompletions(enrichedContent, apiKey);
          } catch { /* fall back to initial result */ }
        }
      }
    }

    return result;
  }

  function parseResult(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    const obj = JSON.parse(match[0]);
    // If model still returned "General" despite instructions, replace with "Other"
    const sub = String(obj.subcategory || 'Other');
    return {
      category: String(obj.category || 'Other'),
      subcategory: sub === 'General' ? 'Other' : sub,
      tertiary: (obj.tertiary && String(obj.tertiary).toLowerCase() !== 'null') ? String(obj.tertiary) : null,
      tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [],
      confidence: ['high', 'medium', 'low'].includes(obj.confidence) ? obj.confidence : 'low',
    };
  }

  async function categorizeWithRetry(post, apiKey, maxAttempts = 6) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await categorizeOne(post, apiKey);
      } catch (err) {
        // Fatal errors (e.g. 401 bad key) — propagate immediately, don't retry
        if (err.fatal) throw err;
        const is429 = err.message.startsWith('429');
        if (attempt === maxAttempts - 1) {
          console.error('[Categorizer] Failed after', maxAttempts, 'attempts:', post.post_url, '—', err.message);
          return {
            category: 'Uncategorized',
            subcategory: 'Error',
            tertiary: null,
            tags: [],
            confidence: 'low',
            error: err.message,
          };
        }
        const waitMs = is429
          ? Math.max((err.retryAfter || 30) * 1000 + 2000, (attempt + 1) * 15000)
          : 3000 * (attempt + 1);
        console.warn('[Categorizer] Attempt', attempt + 1, 'failed:', err.message, `— waiting ${waitMs}ms…`);
        await sleep(waitMs);
      }
    }
  }

  async function categorizeAll(posts, apiKey, onProgress, skipImages = false) {
    // Fully sequential — one request at a time to avoid concurrent 429 storms
    const BETWEEN_REQUESTS_MS = 1200; // ~50 RPM pace, well within tier-1 limits

    const results = [];
    let errorCount = 0;
    let lastError = null;
    let consecutiveFails = 0;

    for (let i = 0; i < posts.length; i++) {
      const post = skipImages ? { ...posts[i], thumbnail_src: null } : posts[i];

      const categorization = await categorizeWithRetry(post, apiKey);

      if (categorization.error) {
        errorCount++;
        lastError = categorization.error;
        consecutiveFails++;
        // If every single post in the first 5 fails, something is systematically wrong — abort
        if (consecutiveFails >= 5 && i < 5) {
          throw new Error(`All requests failing: ${lastError}`);
        }
      } else {
        consecutiveFails = 0;
      }

      results.push({ ...posts[i], categorization });
      onProgress(i + 1, posts.length, errorCount, lastError);

      // Wait between requests; skip delay after the last one
      if (i < posts.length - 1) {
        await sleep(BETWEEN_REQUESTS_MS);
      }
    }

    return { results, errorCount };
  }

  return { categorizeAll };
})();
