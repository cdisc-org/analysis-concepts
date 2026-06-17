/**
 * BC grouping by USDM Activity.
 *
 * Each USDM Activity owns a list of biomedicalConceptIds — the BCs collected
 * during that protocol activity. Activity names ('ECG', 'Hematology',
 * 'Chemistry', 'ADAS-Cog', 'Demographics', …) are exactly the clinical
 * buckets a user wants to see BCs grouped under, and they're curated by the
 * study author rather than by a hand-maintained taxonomy. Grouping BCs by
 * their owning Activity therefore replaces any external vocabulary file.
 *
 * A BC can be referenced by multiple activities (e.g. Systolic Blood
 * Pressure appears in both "Vital Signs Supine" and "Vital Signs Standing").
 * The first Activity wins for display grouping; BCs referenced by no
 * Activity fall into the `ungroupedLabel` bucket.
 */

const DEFAULT_UNGROUPED_LABEL = 'Other';

/**
 * Build a BC-id → first Activity name index from the parsed USDM study.
 *
 * Resolves BCs through BOTH paths the USDM schema supports:
 *   (a) `activity.biomedicalConceptIds` — direct BC reference
 *   (b) `activity.bcCategoryIds` → `bcCategories[i].memberIds` — indirect
 *       via a bcCategory (used in USDM v4 by Chemistry / Urinalysis /
 *       Vital Signs activities that group BCs into a category instead of
 *       listing them individually).
 *
 * The direct path takes precedence. For BCs referenced by more than one
 * activity (e.g. Supine and Standing vital signs share SBP/DBP/HR), the
 * first activity wins.
 *
 * Returns an empty map if activities are missing.
 *
 * @param {object} parsedStudy  the parsed USDM object (state.selectedStudy)
 * @returns {Map<string, string>}
 */
export function buildBCActivityIndex(parsedStudy) {
  const index = new Map();
  // Prefer the flat parsed shape; fall back to nested USDM so this helper
  // also works if callers hand it a raw USDM.
  const activities = parsedStudy?.activities
    || parsedStudy?.versions?.[0]?.studyDesigns?.[0]?.activities
    || parsedStudy?.studyDesigns?.[0]?.activities
    || [];
  const bcCategories = parsedStudy?.bcCategories
    || parsedStudy?.versions?.[0]?.bcCategories
    || parsedStudy?.studyDesigns?.[0]?.bcCategories
    || [];
  const catById = new Map(bcCategories.map(c => [c.id, c]));

  // Pass 1 — direct biomedicalConceptIds links (highest precedence)
  for (const activity of activities) {
    const activityName = activity.label || activity.name || activity.id;
    if (!activityName) continue;
    for (const bcId of activity.biomedicalConceptIds || []) {
      if (!index.has(bcId)) index.set(bcId, activityName);
    }
  }

  // Pass 2 — indirect bcCategoryIds → bcCategories[*].memberIds links
  for (const activity of activities) {
    const activityName = activity.label || activity.name || activity.id;
    if (!activityName) continue;
    for (const catId of activity.bcCategoryIds || []) {
      const category = catById.get(catId);
      if (!category) continue;
      for (const memberId of category.memberIds || []) {
        if (!index.has(memberId)) index.set(memberId, activityName);
      }
    }
  }

  return index;
}

/**
 * Group an array of BCs by the USDM Activity that collects them. Returns
 * an array of `{ group, bcs }` entries, sorted alphabetically by group
 * name with the ungrouped bucket last. Within each group, BCs are sorted
 * alphabetically by name.
 *
 * Callers pass `parsedStudy` explicitly so this module is pure.
 *
 * @param {Array<{id?: string, name?: string, code?: string}>} bcs
 * @param {object} parsedStudy
 * @param {string} [ungroupedLabel='Other']
 * @returns {Array<{group: string, bcs: Array}>}
 */
export function groupBCsByActivity(bcs, parsedStudy, ungroupedLabel = DEFAULT_UNGROUPED_LABEL) {
  const index = buildBCActivityIndex(parsedStudy);
  const groupsMap = {};
  for (const bc of bcs || []) {
    const activityName = index.get(bc.id) || ungroupedLabel;
    if (!groupsMap[activityName]) groupsMap[activityName] = [];
    groupsMap[activityName].push(bc);
  }

  // Sort within each group by display name (falls back to raw name)
  for (const arr of Object.values(groupsMap)) {
    arr.sort((a, b) => (a.displayName || a.name || '').localeCompare(b.displayName || b.name || ''));
  }

  // Alphabetical group order with ungrouped bucket last
  const names = Object.keys(groupsMap)
    .filter(n => n !== ungroupedLabel)
    .sort();
  const result = names.map(n => ({ group: n, bcs: groupsMap[n] }));
  if (groupsMap[ungroupedLabel]) {
    result.push({ group: ungroupedLabel, bcs: groupsMap[ungroupedLabel] });
  }
  return result;
}
