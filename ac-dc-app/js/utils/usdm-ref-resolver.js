/**
 * USDM Reference Resolver
 * Builds an index of all USDM objects by id, and resolves <usdm:ref> tags
 * to actual values from the source data.
 */

/**
 * Recursively walk the USDM JSON and index every object that has an "id" property.
 * @param {object} obj - The raw USDM JSON root
 * @returns {Map<string, object>} id → object
 */
export function buildUsdmIndex(obj) {
  const index = new Map();

  function walk(node) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === 'object') {
      if (node.id) {
        index.set(node.id, node);
      }
      for (const key of Object.keys(node)) {
        walk(node[key]);
      }
    }
  }

  walk(obj);
  return index;
}

/**
 * Resolve all <usdm:ref> tags in an HTML string using the USDM index.
 * @param {string} htmlText - HTML containing <usdm:ref> tags
 * @param {Map<string, object>} index - id → object map from buildUsdmIndex
 * @returns {string} HTML with refs replaced by resolved values
 */
export function resolveUsdmRefs(htmlText, index) {
  if (!htmlText || !index) return htmlText || '';

  return htmlText.replace(
    /<usdm:ref\s+attribute="([^"]*)"\s+id="([^"]*)"\s+klass="([^"]*)"[^>]*>.*?<\/usdm:ref>/g,
    (match, attribute, id, klass) => {
      const element = index.get(id);
      if (!element) {
        return `<span class="usdm-ref-unresolved" title="Unresolved: ${klass} ${id}">[${klass}: ${id} not found]</span>`;
      }

      // Try direct attribute first, then standardCode wrapper (for AliasCode)
      let value = element[attribute];
      if (value === undefined || value === null) {
        value = element.standardCode?.[attribute];
      }
      if (value === undefined || value === null) {
        return `<span class="usdm-ref-unresolved" title="Attribute '${attribute}' not found on ${klass} ${id}">[${klass}: ${attribute}?]</span>`;
      }

      return `<span class="usdm-ref-resolved" title="${klass} (${id}) → ${attribute}">${value}</span>`;
    }
  );
}

/**
 * Take a narrativeContentItem, strip xmlns/usdm:tag, resolve refs, return clean HTML.
 * @param {{ id: string, name: string, text: string }} narrativeItem
 * @param {Map<string, object>} index
 * @returns {string} resolved HTML
 */
export function resolveNarrative(narrativeItem, index) {
  if (!narrativeItem?.text) return '';

  let html = narrativeItem.text
    .replace(/xmlns="[^"]*"/g, '')
    .replace(/<usdm:tag[^/]*\/>/g, '');

  html = resolveUsdmRefs(html, index);
  return html;
}
