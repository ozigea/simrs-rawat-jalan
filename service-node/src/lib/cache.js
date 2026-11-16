'use strict';

// Small in-memory TTL cache for dashboard aggregates (scenario D-6: 60 s per filter combination).
// Bounded so a client cycling through many filter values cannot grow the process without limit.
const MAX_ENTRIES = 500;

const createCache = (ttlMs, now = Date.now) => {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expires <= now()) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value); // oldest insertion
      store.set(key, { value, expires: now() + ttlMs });
    },
    clear: () => store.clear(),
    size: () => store.size,
  };
};

module.exports = { createCache };
