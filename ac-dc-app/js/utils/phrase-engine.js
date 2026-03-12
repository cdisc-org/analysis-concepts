/**
 * SmartPhrase resolution engine.
 * Resolves phrase templates, composes sentences, and matches transformations.
 */

/**
 * Resolve a single SmartPhrase template with given configuration values.
 */
export function resolvePhrase(phrase, config, displayOverrides = {}) {
  let resolved = phrase.phrase_template;
  for (const key of phrase.configurations) {
    const value = config[key];
    if (value) {
      const display = (displayOverrides[key] && displayOverrides[key][value]) || value;
      resolved = resolved.replace(`{${key}}`, display);
    }
  }
  return resolved;
}

/**
 * Compose a full sentence from an array of phrase entries.
 * Each entry: { oid, phrase, config }
 */
export function composeFullSentence(phraseEntries, library, displayOverrides = {}) {
  return phraseEntries
    .map(entry => {
      const sp = library.smartPhrases.find(p => p.oid === entry.oid);
      if (!sp) return '';
      return resolvePhrase(sp, entry.config, displayOverrides);
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Check if all configuration placeholders in a phrase are filled.
 */
export function isPhraseComplete(phrase, config) {
  return phrase.configurations.every(key => config[key] && config[key].trim() !== '');
}

/**
 * Find analysis transformations that match the set of composed SmartPhrase OIDs.
 * A match means all the user's chosen phrase OIDs are within the transformation's validSmartPhrases.
 */
export function findMatchingTransformations(phraseOids, library) {
  if (!phraseOids.length) return [];

  const analyses = library.analysisTransformations || [];
  return analyses
    .map(t => {
      const validSet = new Set(t.validSmartPhrases || []);
      const matchCount = phraseOids.filter(oid => validSet.has(oid)).length;
      const coverage = matchCount / phraseOids.length;
      return { transformation: t, coverage, matchCount };
    })
    .filter(r => r.coverage >= 0.5) // at least 50% overlap
    .sort((a, b) => b.coverage - a.coverage || b.matchCount - a.matchCount)
    .map(r => r.transformation);
}

/**
 * Find derivation transformations that match a given SmartPhrase OID set.
 */
export function findMatchingDerivations(phraseOids, library) {
  const derivations = library.derivationTransformations || [];
  return derivations.filter(t => {
    const validSet = new Set(t.validSmartPhrases || []);
    return phraseOids.some(oid => validSet.has(oid));
  });
}

/**
 * Get the composed phrase template for a transformation with placeholders highlighted.
 */
export function getComposedPhraseHTML(transformation) {
  const phrase = transformation.composedPhrase || '';
  return phrase.replace(/\{(\w+)\}/g, '<span class="placeholder">{$1}</span>');
}

/**
 * Group SmartPhrases by their role for palette display.
 */
export function groupPhrasesByRole(smartPhrases) {
  const groups = {};
  const roleOrder = ['endpoint', 'parameter', 'timepoint', 'population', 'grouping', 'method', 'method_qualifier', 'covariate'];

  for (const sp of smartPhrases) {
    const role = sp.role || 'other';
    if (!groups[role]) groups[role] = [];
    groups[role].push(sp);
  }

  // Sort by defined order
  const ordered = {};
  for (const role of roleOrder) {
    if (groups[role]) ordered[role] = groups[role];
  }
  // Add any remaining roles
  for (const role of Object.keys(groups)) {
    if (!ordered[role]) ordered[role] = groups[role];
  }

  return ordered;
}

/**
 * Get a human-readable label for a role.
 */
export function getRoleLabel(role) {
  const labels = {
    endpoint: 'Endpoint Type',
    parameter: 'Parameter',
    timepoint: 'Timepoint',
    population: 'Population',
    grouping: 'Grouping',
    method: 'Statistical Method',
    method_qualifier: 'Method Qualifier',
    covariate: 'Covariates'
  };
  return labels[role] || role;
}
