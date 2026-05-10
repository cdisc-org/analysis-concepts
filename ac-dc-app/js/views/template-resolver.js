/**
 * Resolve TransCelerate Core TEE wizard tokens (e.g. [Endpoint(s)/Estimand(s)])
 * against the live study + endpoint configuration.
 *
 * Tokens fall into two shapes:
 *   - Alternation: [A/B] or [A/B/C]   — pick one based on the study state
 *   - Single:     [Other]              — drop entirely (vestigial CPT optionality)
 *
 * The map below holds a per-token resolver. Anything not in the map falls back
 * to the alternation default (first option) or — for single-token brackets — gets dropped.
 */

const SINGLE_BRACKET_RE = /\[([^\[\]/]+)\]/g;
const ALT_BRACKET_RE = /\[([^\[\]/]+(?:\/[^\[\]/]+)+)\]/g;

const RESOLVERS = {
  '[Endpoint(s)/Estimand(s)]': ({ selectedEps, endpointSpecs }) => {
    const anyEstimand = (selectedEps || []).some(ep => {
      const spec = endpointSpecs?.[ep.id];
      return spec?.estimandFramework || spec?.intercurrentEvents?.length;
    });
    return anyEstimand ? 'Estimand(s)' : 'Endpoint(s)';
  },

  '[Analysis/Analyses]': ({ analysisCount = 0 }) => analysisCount > 1 ? 'Analyses' : 'Analysis',

  '[Decision Criteria/Statistical Hypotheses]': ({ selectedEps, endpointSpecs }) => {
    const anyHypothesis = (selectedEps || []).some(ep => {
      const spec = endpointSpecs?.[ep.id] || {};
      return (spec.selectedAnalyses || []).some(a =>
        a.hypothesisTest || a.testStatistic || a.alpha != null
      );
    });
    return anyHypothesis ? 'Statistical Hypotheses' : 'Decision Criteria';
  },

  '[Key/Confirmatory]': ({ secondaryEps = [] }) => {
    const anyConfirmatory = secondaryEps.some(ep =>
      /confirmatory/i.test(ep.level) || /confirmatory/i.test(ep.name || '')
    );
    return anyConfirmatory ? 'Confirmatory' : 'Key';
  },

  '[Tertiary/Exploratory/Other]': ({ selectedEps = [] }) => {
    if (selectedEps.some(ep => /exploratory/i.test(ep.level))) return 'Exploratory';
    if (selectedEps.some(ep => /tertiary/i.test(ep.level))) return 'Tertiary';
    return 'Other';
  },

  // Single-token brackets — drop entirely
  '[Other]': () => '',
  '[Acronym:]': () => 'Acronym:',
  '[label]': () => '',
  '[and Definitions of Terms]': () => 'and Definitions of Terms'
};

function resolveToken(token, ctx) {
  if (RESOLVERS[token]) return RESOLVERS[token](ctx);
  // Generic alternation fallback: first option
  const m = token.match(/^\[([^\[\]]+)\]$/);
  if (m && m[1].includes('/')) {
    return m[1].split('/')[0].trim();
  }
  // Single-token unknowns: drop
  return '';
}

/**
 * Resolve every bracket token in `title` to plain text.
 * Whitespace around dropped tokens is collapsed so we don't leave double spaces.
 */
export function resolveTitle(title, ctx = {}) {
  if (!title) return '';
  // First handle alternation brackets, then any single-token brackets that remain.
  let out = title.replace(ALT_BRACKET_RE, (full) => resolveToken(full, ctx));
  out = out.replace(SINGLE_BRACKET_RE, (full) => resolveToken(full, ctx));
  return out.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Build the resolver context once per render.
 */
export function buildResolverContext(appState, selectedEps) {
  const endpointSpecs = appState.endpointSpecs || {};
  let analysisCount = 0;
  for (const ep of selectedEps || []) {
    analysisCount += (endpointSpecs[ep.id]?.selectedAnalyses || []).length;
  }
  return {
    selectedEps,
    endpointSpecs,
    analysisCount,
    secondaryEps: (selectedEps || []).filter(ep => /secondary/i.test(ep.level))
  };
}
