// content-ig.js — injected at document_start in the MAIN world on instagram.com
//
// Two responsibilities:
//
// 1. IntersectionObserver wrapper
//    Tracks every observer + its targets so background.js can call
//    window.__igForceLoad() to directly invoke callbacks with fake
//    "fully intersecting" entries — bypassing the render pipeline so
//    Instagram's infinite scroll fires even in background tabs.
//
// 2. Fetch interceptor
//    Captures post data from Instagram's feed API responses as they
//    arrive, storing them in a buffer.  background.js drains the buffer
//    via window.__igDrainPosts() at the start of every scrape chunk,
//    so posts are collected regardless of whether the DOM has rendered.

(function () {

  // ── 1. IntersectionObserver wrapper ────────────────────────────────────────

  const _NativeIO = window.IntersectionObserver;
  if (_NativeIO) {
    const _registry = new Set();

    class _IO {
      constructor(callback, options) {
        this._callback = callback;
        this._targets  = new Set();
        this._native   = new _NativeIO((entries) => callback(entries, this), options);
        _registry.add(this);
      }
      observe(el)    { this._targets.add(el);    this._native.observe(el);    }
      unobserve(el)  { this._targets.delete(el); this._native.unobserve(el);  }
      disconnect()   { this._targets.clear();    this._native.disconnect();    _registry.delete(this); }
      takeRecords()  { return this._native.takeRecords(); }
      get root()       { return this._native.root; }
      get rootMargin() { return this._native.rootMargin; }
      get thresholds() { return this._native.thresholds; }
    }

    window.IntersectionObserver = _IO;

    // Directly invoke every observer's callback with fake "fully visible"
    // entries for all tracked targets.  Uses proper DOMRect objects and
    // binds `this` so Instagram's callback can safely call obs.unobserve().
    window.__igForceLoad = function () {
      const fakeRect = new DOMRect(0, 0, 100, 100);
      const fakeRoot = new DOMRect(0, 0, window.innerWidth || 1280, window.innerHeight || 900);
      for (const obs of _registry) {
        if (!obs._targets.size) continue;
        const entries = [...obs._targets].map(target => ({
          target,
          isIntersecting:    true,
          intersectionRatio: 1,
          boundingClientRect: fakeRect,
          intersectionRect:   fakeRect,
          rootBounds:         fakeRoot,
          time: performance.now(),
        }));
        try { obs._callback.call(obs, entries, obs); } catch (_) {}
      }
    };
  }

  // ── 2. Fetch + XHR interceptors ───────────────────────────────────────────

  const _postBuffer = [];

  // Atomically drain all buffered posts and return them.
  window.__igDrainPosts = function () { return _postBuffer.splice(0); };

  // Extract a flat array of post-like items from any known Instagram API response shape.
  function _extractItems(data) {
    // REST / private API: { items: [ {media: {...}} | {...} ] }
    // Items may be wrapped as { media: {...} } — unwrap if so.
    if (Array.isArray(data?.items)) return data.items.map(i => i.media || i);
    if (Array.isArray(data?.media?.items)) return data.media.items.map(i => i.media || i);
    if (Array.isArray(data?.feed_items)) return data.feed_items.map(i => i.media || i);

    const gql = data?.data;
    if (!gql) return [];

    // Old GraphQL edge format: data.data.user.edge_saved_media.edges[].node
    const oldEdges = gql.user?.edge_saved_media?.edges;
    if (Array.isArray(oldEdges)) return oldEdges.map(e => e.node).filter(Boolean);

    // New xdt format: data.data.<key containing "saved" or "collection">.edges[].node or .node.media
    for (const key of Object.keys(gql)) {
      if (!key.includes('saved') && !key.includes('collection')) continue;
      const edges = gql[key]?.edges;
      if (Array.isArray(edges)) {
        return edges.map(e => e.node?.media || e.node).filter(Boolean);
      }
    }

    // Fallback: scan all top-level keys in data.data for any edges array whose nodes look like posts
    for (const key of Object.keys(gql)) {
      const edges = gql[key]?.edges;
      if (!Array.isArray(edges) || !edges.length) continue;
      const node = edges[0]?.node?.media || edges[0]?.node;
      if (node && (node.code || node.shortcode)) {
        return edges.map(e => e.node?.media || e.node).filter(Boolean);
      }
    }

    return [];
  }

  function _processApiResponse(url, data) {
    const items = _extractItems(data);
    if (!items.length) return;

    const first = items[0];
    if (!(first.code || first.shortcode)) return;

    for (const item of items) {
      const code = item.code || item.shortcode;
      if (!code) continue;

      // Old GraphQL nodes use __typename / is_video / video_url
      // REST / xdt nodes use media_type / video_versions
      const isGqlNode = item.__typename != null || item.is_video != null;

      let isReel, thumbnail_src, video_src;

      if (isGqlNode) {
        isReel       = item.is_video === true || item.__typename === 'GraphVideo';
        thumbnail_src = item.thumbnail_src || item.display_url || null;
        video_src    = isReel ? (item.video_url || null) : null;
      } else {
        const hasVideoVersions = !!(item.video_versions?.length);
        isReel = hasVideoVersions || item.media_type === 2 || item.product_type === 'clips';
        thumbnail_src = item.thumbnail_url || null;
        if (!thumbnail_src) {
          const media = item.carousel_media?.[0] ?? item;
          thumbnail_src = media.image_versions2?.candidates?.[0]?.url ?? null;
        }
        video_src = (isReel && item.video_versions?.length) ? item.video_versions[0].url : null;
      }

      _postBuffer.push({
        post_url:  isReel ? `https://www.instagram.com/reel/${code}/` : `https://www.instagram.com/p/${code}/`,
        thumbnail_src,
        video_src,
        alt_text:  item.accessibility_caption || null,
        post_type: isReel ? 'reel' : 'photo',
      });
    }

    window.dispatchEvent(new CustomEvent('ig:posts-loaded'));
  }

  function _isSavedFeedUrl(url) {
    return /\/api\/v1\/(feed\/(saved|collection)|saved_feed)/.test(url) ||
           /\/graphql\/query/.test(url);
  }

  // Fetch interceptor (kept in case Instagram ever uses fetch for these calls)
  const _origFetch = window.fetch;
  window.fetch = function (resource, init) {
    const promise = _origFetch.apply(this, arguments);
    const url = (typeof resource === 'string' ? resource : resource?.url) || '';
    if (_isSavedFeedUrl(url)) {
      promise.then(resp => resp.clone().json()).then(data => _processApiResponse(url, data)).catch(() => {});
    }
    return promise;
  };

  // XHR interceptor — Instagram uses XHR for all its API/GraphQL calls
  const _origXhrOpen = window.XMLHttpRequest.prototype.open;
  const _origXhrSend = window.XMLHttpRequest.prototype.send;

  window.XMLHttpRequest.prototype.open = function (method, url) {
    this._igUrl = String(url || '');
    return _origXhrOpen.apply(this, arguments);
  };

  window.XMLHttpRequest.prototype.send = function (body) {
    const url = this._igUrl || '';
    if (_isSavedFeedUrl(url)) {
      this.addEventListener('load', () => {
        try { _processApiResponse(url, JSON.parse(this.responseText)); } catch {}
      });
    }
    return _origXhrSend.apply(this, arguments);
  };

})();
