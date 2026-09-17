import { appState, navigateTo, rebuildSpec } from '../app.js';
import { getAllEndpoints, getDerivationBCTopicDecode, getEndpointParameterOptions, getArmNames, getVisitLabels, getPopulationNames } from '../utils/usdm-parser.js';
import {
  initWebR, loadXptFile, executeR, isInitialized,
  getLoadedDatasets, loadEngine, setJsonVariable
} from '../utils/webr-engine.js';
import { generateExecutionPayload, getVariableOptions, getDefaultVariable, resolveCallTemplate, resolveDerivationCallTemplate } from '../utils/r-code-generator.js';
import { buildPipelineGraph, orderChainPostOrder, computeColumnMap, computeAnalysisInputColumns } from '../utils/transformation-linker.js';
import { loadMethod, getBasePath } from '../data-loader.js';
import { getSpecParameterValue } from './endpoint-spec.js';
import { substituteTokens, buildDimensionTokenSource, TOKEN_DEFAULTS } from '../utils/concept-display.js';

/**
 * Resolve a derivation's slices into concrete {dimension, value} constraints
 * for the payload sent to R. Slice constraints referencing a conceptCategory
 * are substituted with the user's concrete pick from dimensionOverrides;
 * value-level overrides from derivationSliceOverrides are also applied.
 * Returns [] when the derivation declares no slices.
 */
function resolveDerivationSlices(transform, slotKey, dimensionOverrides, categoriesMap, derivSliceOverrides, endpointPicks, endpointParameterValue, endpointSpec) {
  const slices = transform?.slices || [];
  if (slices.length === 0) return [];
  const bindings = transform.bindings || [];
  const perSlotOverrides = derivSliceOverrides?.[slotKey] || {};
  const picks = endpointPicks || {};
  // Generic `{token}` substitution. Sources, in priority order:
  //   1. spec.tokenValues       — user-edited per-endpoint token map
  //   2. explicit parameter     — endpointParameterValue when supplied
  //   3. dimension values       — buildDimensionTokenSource(spec.dimensionValues)
  //   4. TOKEN_DEFAULTS         — built-in fallbacks (e.g. baseline_visit → 'Baseline')
  // Adding a new token to a transformation requires no code change here;
  // declaring it in metadata + supplying a value via tokenValues is enough.
  const specTokens = endpointSpec?.tokenValues || {};
  const explicitParam = endpointParameterValue ? { parameter: endpointParameterValue } : null;
  const dimTokens = buildDimensionTokenSource(endpointSpec?.dimensionValues);
  const substTokens = (val) => substituteTokens(val, specTokens, explicitParam, dimTokens, TOKEN_DEFAULTS);
  return slices.map(s => {
    // Spec-level overrides keyed by (sliceName, dim). User types "BASELINE"
    // in Step 3's slice chip → endpointSpec.sliceDimensionOverrides is what
    // they edit. The execute path needs to honor it so the engine's slice
    // pre-join filters on the correct value. Without this lookup the value
    // silently reverts to TOKEN_DEFAULTS (e.g. "Baseline") while the UI
    // displays "BASELINE" — exactly the kind of UI/engine divergence the
    // metadata-first principle should prevent.
    const sliceLevelOverrides = endpointSpec?.sliceDimensionOverrides?.[s.name] || {};
    const constraints = [];
    const resolvedValues = {};
    for (const c of (s.constraints || [])) {
      // The library is heterogeneous: derivation slices use {concept, value},
      // analysis slices use {dimension, value}. Accept both — they name the
      // same thing (the cube dim/concept being constrained).
      let dim = c.dimension || c.concept;
      if (!dim && c.conceptCategory) {
        // Resolve the category with the same precedence as bindings:
        //   per-slot override → endpoint pick → category first member.
        for (let i = 0; i < bindings.length; i++) {
          if (bindings[i].conceptCategory === c.conceptCategory) {
            dim = dimensionOverrides?.[slotKey]?.[i]?.concept;
            if (dim) break;
          }
        }
        if (!dim) dim = picks[c.conceptCategory];
        if (!dim) dim = categoriesMap?.[c.conceptCategory]?.members?.[0]?.concept;
      } else if (dim && categoriesMap) {
        // Cascade explicit category-member concepts through the endpoint
        // pick (or the category's first member as default). Library
        // declares AnalysisVisit (DC); the user's effective visit layer
        // is whatever VisitDimension resolves to. Without this cascade
        // the engine looks for an AnalysisVisit column that doesn't
        // exist in SDTM data and silently drops the constraint.
        for (const [catName, catDef] of Object.entries(categoriesMap)) {
          if (catDef?.members?.some(m => m.concept === dim)) {
            const userPick = picks[catName];
            const fallback = catDef.members[0]?.concept;
            dim = userPick || fallback || dim;
            break;
          }
        }
      }
      if (!dim) continue;
      // Precedence (most-specific first): per-slot override → spec-level
      // slice override → library default + token sub.
      const slotOverride = perSlotOverrides?.[s.name]?.[dim];
      const sliceOverride = sliceLevelOverrides[dim];
      const finalVal = substTokens(slotOverride ?? sliceOverride ?? c.value);
      constraints.push({ dimension: dim, value: finalVal });
      resolvedValues[dim] = finalVal;
    }
    return { name: s.name, constraints, resolvedValues };
  });
}

/**
 * Find which loaded datasets could provide a given concept, given the
 * binding's qualifier (e.g. IntentType=Planned). Walks **every store
 * mapping** in `conceptMappings` (adam, sdtm, omop, …) — a SDTM-loaded
 * scenario should still find Treatment via the sdtm.dimensions.Treatment
 * mapping (ARM/ARMCD), not just adam's TRTP/TRTA.
 *
 * The logic mirrors what `ingest_to_concepts` does per-dataset at runtime:
 *   - Read `byDataType` primary candidates (string > code > id > decimal > integer)
 *   - Read qualifier sub-map candidates (e.g. dim.intentType.Planned.{string,code,...})
 *   - Read alternativeVariables
 * Returns dataset names whose columns include any candidate from any store.
 */
/**
 * The cross-dataset join key is the concept marked as the subject identity
 * in the OC instance model. `OC_Instance_Model_v016.json` tags it with
 * `relationship: "aboutSubject"` on a shared dimension; whichever concept
 * name carries that tag is the join key. No hardcoded "Subject" string —
 * if the model renames the concept tomorrow, this still resolves.
 */
function _getSubjectJoinConcept() {
  const sharedDims = appState?.ocModel?.Observation?.sharedDimensions || {};
  for (const [name, def] of Object.entries(sharedDims)) {
    if (def?.relationship === 'aboutSubject') return name;
  }
  return null;
}

/**
 * Which concept-mapping store best fits a loaded dataset, by counting how many
 * of its columns the store declares. Mirrors detect_store() in acdc_engine.R,
 * including the SDTM "--" domain-code substitution, so the Execute panel offers
 * the same variables the engine will actually resolve.
 *
 * @param {string} datasetName - the selected dataset (case-insensitive)
 * @returns {string|null} store key ('sdtm' | 'adam' | …), or null when unknown
 */
function _detectStoreForDataset(datasetName) {
  const mappings = appState.conceptMappings;
  if (!mappings || !datasetName) return null;
  const ds = (getLoadedDatasets() || [])
    .find(d => String(d.name).toUpperCase() === String(datasetName).toUpperCase());
  const cols = new Set(ds?.columns || []);
  if (cols.size === 0) return null;

  // SDTM mappings use "--" placeholders; recover the 2-character domain the way
  // .detect_sdtm_domain does — a declared suffix matched against a column.
  const domainFor = (store) => {
    const suffixes = new Set();
    const walk = (entry) => {
      for (const v of Object.values(entry?.byDataType || {})) {
        if (typeof v === 'string' && v.startsWith('--')) suffixes.add(v.slice(2));
      }
      for (const v of Object.values(entry?.facets || {})) {
        if (typeof v === 'string' && v.startsWith('--')) suffixes.add(v.slice(2));
      }
    };
    Object.values(store.concepts || {}).forEach(walk);
    Object.values(store.dimensions || {}).forEach(walk);
    for (const sfx of suffixes) {
      for (const c of cols) {
        const m = c.match(new RegExp(`^([A-Z]{2})${sfx}$`));
        if (m) return m[1];
      }
    }
    return null;
  };

  let best = null, bestCount = 0;
  for (const [key, store] of Object.entries(mappings)) {
    if (!store || typeof store !== 'object') continue;
    const domain = key === 'sdtm' ? domainFor(store) : null;
    const resolve = (v) => (typeof v === 'string' && v.startsWith('--') && domain)
      ? domain + v.slice(2) : v;
    let count = 0;
    const tally = (entry) => {
      const seen = new Set();
      for (const v of Object.values(entry?.byDataType || {})) seen.add(resolve(v));
      for (const v of Object.values(entry?.facets || {})) seen.add(resolve(v));
      for (const v of (entry?.alternativeVariables || [])) seen.add(resolve(v));
      for (const v of seen) if (typeof v === 'string' && cols.has(v)) count++;
    };
    Object.values(store.concepts || {}).forEach(tally);
    Object.values(store.dimensions || {}).forEach(tally);
    if (count > bestCount) { best = key; bestCount = count; }
  }
  return best;
}

/**
 * Which concept key a BC's identifying value constrains.
 *
 * A Findings-class BC is identified by --TESTCD, whose concept is
 * Observation.Identification.Topic. An Events-class BC (DS, AE) has no
 * --TESTCD at all — its identity is an assigned value in --DECOD/--TERM, so
 * constraining Topic filters a column those records leave empty and selects
 * nothing. Resolve the concept from the SDTM mappings rather than assuming.
 *
 * `--DECOD` is declared by more than one concept (EventTerm, Intervention), so
 * when several match, prefer one this transformation already mentions in its
 * bindings or slices; otherwise fall back to Topic, the historical behaviour.
 *
 * @param {string|null} sourceVariable - e.g. 'DSDECOD', or null for the Topic path
 * @param {object} transform - the derivation transformation, for disambiguation
 * @returns {string} concept key to constrain
 */
function _conceptForBcVariable(sourceVariable, transform) {
  const TOPIC = 'Observation.Identification.Topic';
  if (!sourceVariable) return TOPIC;
  const sdtm = appState.conceptMappings?.sdtm;
  if (!sdtm) return TOPIC;
  // 'DSDECOD' -> '--DECOD'; an already-generic '--DECOD' passes through.
  const generic = /^--/.test(sourceVariable)
    ? sourceVariable
    : `--${String(sourceVariable).replace(/^[A-Z]{2}/i, '').toUpperCase()}`;

  const candidates = [];
  for (const [name, entry] of Object.entries(sdtm.concepts || {})) {
    for (const [facet, v] of Object.entries(entry?.facets || {})) {
      if (v === generic) candidates.push(`${name}.${facet}`);
    }
  }
  if (candidates.length === 0) return TOPIC;
  if (candidates.length === 1) return candidates[0];

  const mentioned = new Set();
  for (const b of (transform?.bindings || [])) if (b?.concept) mentioned.add(b.concept);
  for (const sl of (transform?.slices || [])) {
    for (const c of (sl?.constraints || [])) if (c?.concept) mentioned.add(c.concept);
  }
  return candidates.find(c => mentioned.has(c) || mentioned.has(c.split('.')[0]))
    || TOPIC;
}

/**
 * "Where does this dimension come from" — the per-binding auxiliary-source row.
 *
 * Choosing the dataset that supplies a dimension is an EXECUTION binding, not a
 * store-specific display detail, so the row must render in every view mode.
 * Concept mode used to omit it, and with it the only way to say where Treatment
 * comes from: the engine refused the run with "no auxiliarySource is declared"
 * while the panel offered no control to fix it.
 *
 * @returns {string} a <tr>, or '' when the primary dataset already provides it
 */
/**
 * The chain node that supplies an analysis role, if any.
 *
 * A time-to-event duration and a censoring flag have no SDTM representation —
 * correctly, since SDTM records observations and these are analysis-layer
 * concepts. When the endpoint derives them, the column comes from the chain
 * (__col_…), not from a source variable, so reporting "no mapping" against the
 * source store describes a lookup that was never meant to succeed.
 *
 * Chain root slot keys are `<analysisOid>/<concept>/<index>`; matching on the
 * concept alone is enough to identify the node and tolerates a binding list
 * that has been filtered for display.
 *
 * @returns {{derivationOid: string, column: string}|null}
 */
function _chainNodeForRole(ep, analysisTransformOid, concept) {
  if (!concept) return null;
  const chain = appState.endpointSpecs?.[ep?.id]?.derivationChain || [];
  // Root keys are `<analysisOid>/<concept>/<index>`. Match the analysis oid
  // when the caller knows it, and otherwise any root slot for this concept —
  // a root key has exactly three segments, so this cannot match a nested node.
  const entry = chain.find(e => {
    if (typeof e.slotKey !== 'string') return false;
    const parts = e.slotKey.split('/');
    if (parts.length !== 3 || parts[1] !== concept) return false;
    return analysisTransformOid ? parts[0] === analysisTransformOid : true;
  });
  if (entry) {
    return {
      derivationOid: entry.derivationOid,
      column: '__col_' + String(entry.slotKey).replace(/[^A-Za-z0-9]/g, '_'),
      via: null
    };
  }

  // A role can also be supplied by a pipeline REFERENCE rather than its own
  // chain node: the ANCOVA covariate is not a fresh reading of the source, it
  // IS the derived total score taken at baseline. The execute path already
  // resolves these (computeAnalysisInputColumns), so showing the raw source
  // variable here contradicted what the run actually uses.
  const refs = appState.endpointSpecs?.[ep?.id]?.pipelineReferences || [];
  const ref = refs.find(r => {
    const parts = String(r.slotKey || '').split('/');
    if (parts.length !== 3 || parts[1] !== concept) return false;
    return analysisTransformOid ? parts[0] === analysisTransformOid : true;
  });
  if (ref) {
    const target = chain.find(e => e.slotKey === ref.referenceSlotKey);
    if (target) {
      return {
        derivationOid: target.derivationOid,
        column: '__col_' + String(target.slotKey).replace(/[^A-Za-z0-9]/g, '_'),
        via: ref.referenceLabel || null
      };
    }
  }
  return null;
}

/**
 * Does the derivation chain PRODUCE this dimension?
 *
 * The endpoint's parameter identity ("Adas-Cog(11) Subscore") is the label of
 * what the chain computed — it is not a value any source row carries, so
 * resolving it to QSTEST and filtering on it is wrong in both directions: the
 * label isn't in the data, and the rows the chain must read are the individual
 * items. A chain step that declares an output dimension (directly or through a
 * conceptCategory the endpoint has picked) owns that dimension downstream.
 *
 * @returns {{derivationOid: string}|null}
 */
function _chainProducesDimension(ep, concept) {
  if (!concept) return null;
  const spec = appState.endpointSpecs?.[ep?.id];
  const chain = spec?.derivationChain || [];
  if (chain.length === 0) return null;
  const picks = spec?.dimensionCategoryPicks || {};
  const lib = appState.transformationLibrary || {};
  const byOid = new Map([...(lib.derivationTransformations || []),
                         ...(lib.analysisTransformations || [])].map(t => [t.oid, t]));
  // Only the PARAMETER identity, not every output dimension. Subject and Visit
  // are declared as outputs too, but the chain passes their values through
  // unchanged and USUBJID/VISIT really are the columns behind them — calling
  // those "from the derivation chain" would trade one wrong label for another.
  // The parameter is different in kind: its value is the endpoint's label for
  // what was computed, and no source row carries it.
  const paramConcept = picks.ParameterDimension || 'Parameter';
  if (concept !== paramConcept) return null;
  // An endpoint WITH a chain has a minted parameter by construction: the
  // analysed measure is computed, so its identity is the endpoint's label for
  // the result. ZE carries no ZETEST column at all and no row says
  // "Progression-Free Survival", yet the panel offered ZETEST as the
  // implementation variable. Not every chain step declares an explicit output
  // ParameterDimension binding, so the chain's existence is the signal.
  if (chain.length > 0) {
    return { derivationOid: chain[chain.length - 1].derivationOid, minted: true };
  }
  for (const entry of chain) {
    const tx = byOid.get(entry.derivationOid);
    for (const b of (tx?.bindings || [])) {
      if (b.direction !== 'output' || b.dataStructureRole !== 'dimension') continue;
      const produced = b.concept || picks[b.conceptCategory];
      if (produced && produced === concept) return { derivationOid: entry.derivationOid };
    }
  }
  return null;
}

function _auxSourceRow(b, concept, ep, resultState, selectedDataset, loadedDatasets, hasLoadedColumns) {
  let auxRow = '';
  const isAuxCandidate = b.direction !== 'output'
                      && b.dataStructureRole === 'dimension'
                      && b.methodRole !== 'constraint'
                      && !!concept;
  if (isAuxCandidate && hasLoadedColumns) {
    const providers = _findDatasetsProvidingConcept(concept, b.qualifierType, b.qualifierValue, appState.conceptMappings, loadedDatasets);
    const primary = (selectedDataset || '').toUpperCase();
    const hasPrimary = providers.some(n => n.toUpperCase() === primary);
    // Only show the picker when the primary doesn't provide the concept.
    // enrich_dimensions (acdc_engine.R) skips any concept already in the
    // primary's columns — so a picker whose answer the engine will ignore
    // creates the illusion of a decision the user must make. Hide it.
    // When the primary lacks the concept and ≥1 aux dataset provides it,
    // the picker still appears (and disambiguates between aux candidates
    // when there's more than one).
    const showPicker = !hasPrimary && providers.length > 0;
    if (showPicker) {
      // Eager auto-fill: the picker's displayed default is the
      // metadata's only logical answer when providers.length === 1
      // (one dataset provides the concept) or when the primary
      // doesn't provide it (only one non-primary candidate). A
      // <select> without a change-event leaves resultState empty
      // — the engine then errors at enrich_dimensions because no
      // auxiliarySource is declared. Persist the default here so
      // the spec sent to the engine matches the UI display.
      if (!resultState.auxiliarySources) resultState.auxiliarySources = {};
      const subjectKey = _getSubjectJoinConcept();
      if (!resultState.auxiliarySources[concept]?.dataset) {
        resultState.auxiliarySources[concept] = {
          ...(resultState.auxiliarySources[concept] || {}),
          dataset: hasPrimary ? selectedDataset : providers[0],
          joinKey: resultState.auxiliarySources[concept]?.joinKey || subjectKey
        };
      }
      const auxOverrides = resultState.auxiliarySources;
      const currentDs = auxOverrides[concept].dataset;
      const currentJoin = auxOverrides[concept].joinKey;
      const opts = providers.map(n =>
        `<option value="${n}" ${n === currentDs ? 'selected' : ''}>${n}${n.toUpperCase() === primary ? ' (primary)' : ''}</option>`
      ).join('');
      auxRow = `<tr class="exec-aux-source-row" style="background:rgba(0,0,0,0.02);">
        <td colspan="2" style="padding-left:24px; color:var(--cdisc-text-secondary); font-size:10px; font-style:italic;">↳ source dataset</td>
        <td colspan="3" style="font-size:11px;">
          <select class="exec-aux-source-select" data-ep-id="${ep.id}" data-concept="${concept}"
              style="font-size:11px; padding:2px 4px;">${opts}</select>
          <span style="font-size:10px; color:var(--cdisc-text-secondary); margin-left:8px;">join key:</span>
          <input class="exec-aux-source-join" data-ep-id="${ep.id}" data-concept="${concept}"
              value="${currentJoin}" style="font-size:11px; padding:2px 4px; width:80px; font-family:monospace;">
        </td>
      </tr>`;
    }
  }
  return auxRow;
}

/**
 * The SDTM domain code for a loaded dataset ("QS" for qs_usdm_aligned), by
 * matching a mapping's "--" suffix against the dataset's columns. Mirrors
 * .detect_sdtm_domain() in acdc_engine.R.
 *
 * @returns {string|null} two-letter domain, or null for non-SDTM stores
 */
function _detectSdtmDomain(store, datasetName) {
  if (!store || !datasetName) return null;
  const ds = (getLoadedDatasets() || [])
    .find(d => String(d.name).toUpperCase() === String(datasetName).toUpperCase());
  const cols = new Set(ds?.columns || []);
  if (cols.size === 0) return null;
  const suffixes = new Set();
  const walk = (entry) => {
    for (const v of Object.values(entry?.byDataType || {}))
      if (typeof v === 'string' && v.startsWith('--')) suffixes.add(v.slice(2));
    for (const v of Object.values(entry?.facets || {}))
      if (typeof v === 'string' && v.startsWith('--')) suffixes.add(v.slice(2));
  };
  Object.values(store.concepts || {}).forEach(walk);
  Object.values(store.dimensions || {}).forEach(walk);
  for (const sfx of suffixes) {
    for (const c of cols) {
      const m = c.match(new RegExp(`^([A-Z]{2})${sfx}$`));
      if (m) return m[1];
    }
  }
  return null;
}

/**
 * A copy of the store's mappings with every "--" placeholder replaced by the
 * dataset's actual domain, so the panel shows QSSTRESN and QSTEST rather than
 * --STRESN and --TEST — the latter is a template, not a variable any dataset
 * has, and it leaked into the displayed model statement too. Non-SDTM stores
 * and datasets whose domain can't be determined pass through untouched.
 */
function _withDomainResolved(store, datasetName) {
  const domain = _detectSdtmDomain(store, datasetName);
  if (!domain) return store;
  const sub = (v) => (typeof v === 'string' && v.startsWith('--')) ? domain + v.slice(2) : v;
  const mapEntry = (entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const out = { ...entry };
    if (entry.variable) out.variable = String(entry.variable).split('/').map(sub).join('/');
    for (const key of ['byDataType', 'facets', 'intentType']) {
      if (!entry[key]) continue;
      out[key] = Object.fromEntries(Object.entries(entry[key]).map(([k, v]) =>
        [k, (v && typeof v === 'object') ? Object.fromEntries(
              Object.entries(v).map(([k2, v2]) => [k2, Array.isArray(v2) ? v2.map(sub) : sub(v2)]))
           : sub(v)]));
    }
    if (Array.isArray(entry.alternativeVariables)) out.alternativeVariables = entry.alternativeVariables.map(sub);
    return out;
  };
  const mapSection = (sec) => sec
    ? Object.fromEntries(Object.entries(sec).map(([k, v]) => [k, mapEntry(v)]))
    : sec;
  return { ...store, concepts: mapSection(store.concepts), dimensions: mapSection(store.dimensions) };
}

function _findDatasetsProvidingConcept(concept, qualifierType, qualifierValue, conceptMappings, loadedDatasets) {
  if (!concept || !conceptMappings) return [];
  const stores = Object.keys(conceptMappings);
  if (stores.length === 0) return [];

  const collectCandidates = (storeName) => {
    const dim = conceptMappings[storeName]?.dimensions?.[concept];
    if (!dim) return null;
    const candidates = new Set();
    if (dim.byDataType) {
      for (const v of Object.values(dim.byDataType)) {
        if (typeof v === 'string') candidates.add(v);
      }
    }
    if (qualifierType && qualifierValue) {
      const qkey = qualifierType.charAt(0).toLowerCase() + qualifierType.slice(1);
      const qvar = dim[qkey]?.[qualifierValue];
      if (qvar) {
        for (const v of Object.values(qvar)) {
          if (typeof v === 'string') candidates.add(v);
        }
      }
    }
    if (Array.isArray(dim.alternativeVariables)) {
      dim.alternativeVariables.forEach(v => { if (typeof v === 'string') candidates.add(v); });
    }
    return candidates.size > 0 ? candidates : null;
  };

  const allCandidates = new Set();
  for (const s of stores) {
    const c = collectCandidates(s);
    if (c) for (const v of c) allCandidates.add(v);
  }
  if (allCandidates.size === 0) return [];

  return (loadedDatasets || [])
    .filter(ds => {
      const cols = new Set(ds.columns || []);
      for (const c of allCandidates) if (cols.has(c)) return true;
      return false;
    })
    .map(ds => ds.name);
}

/**
 * Apply the user's per-analysis UI overrides (slice values + variables, plus
 * method config overrides) to a deep copy of the resolved analysis. Used by
 * BOTH the rendering path (so the displayed Specification JSON matches what
 * the engine will actually run) and the execute path. Returning a shared,
 * idempotent helper guarantees what-you-see is what-runs.
 *
 * @param {Object} analysis - The resolved analysis from `resolvedEp.analyses[aIdx]`
 * @param {Object} resultState - per-endpoint result state (sliceOverrides, varOverrides)
 * @param {Object} liveConfigOverrides - optional config-overrides map (epSpec.methodConfigOverrides)
 * @param {Function} [resolveDimColumn] - optional (dim) => column resolver; when supplied, fills `resolvedVariables` for unspecified dims
 * @returns {Object} a deep-cloned, patched analysis
 */
function _applyLiveOverridesToAnalysis(analysis, resultState, liveConfigOverrides, resolveDimColumn) {
  const out = JSON.parse(JSON.stringify(analysis || {}));
  const sliceOverrides = resultState?.sliceOverrides || {};
  if (out.resolvedSlices) {
    for (const s of out.resolvedSlices) {
      const vals = s.resolvedValues || {};
      const vars = s.resolvedVariables || {};
      for (const dim of Object.keys(vals)) {
        const key = `${s.name}|${dim}`;
        if (sliceOverrides[key]?.value !== undefined) {
          vals[dim] = sliceOverrides[key].value;
        }
        const explicit = sliceOverrides[key]?.variable;
        if (explicit) {
          vars[dim] = explicit;
        } else if (typeof resolveDimColumn === 'function') {
          const resolved = resolveDimColumn(dim);
          if (resolved && resolved !== dim) vars[dim] = resolved;
        }
      }
      if (Object.keys(vars).length > 0) s.resolvedVariables = vars;
    }
  }
  const live = liveConfigOverrides || {};
  if (Object.keys(live).length > 0) {
    const existing = out.configurationValues || [];
    for (const [name, value] of Object.entries(live)) {
      const idx = existing.findIndex(cv => cv.name === name);
      if (idx >= 0) existing[idx] = { name, value: String(value) };
      else existing.push({ name, value: String(value) });
    }
    out.configurationValues = existing;
  }
  // Auxiliary sources: per-binding-concept declaration of which loaded
  // dataset provides the column (and which key joins it to the primary).
  // The engine reads this at execute time instead of auto-scanning.
  const auxOverrides = resultState?.auxiliarySources || {};
  if (Object.keys(auxOverrides).length > 0) {
    out.auxiliarySources = JSON.parse(JSON.stringify(auxOverrides));
  }
  return out;
}

/**
 * Determine expected datasets for configured endpoints based on their dimensions
 * and derivation chains. Returns an array of { domain, reason } objects.
 */
function _getExpectedDatasets(configuredEps) {
  const expected = new Map(); // domain → Set<reason>

  for (const ep of configuredEps) {
    const spec = appState.endpointSpecs?.[ep.id];
    if (!spec) continue;

    // Check if there's a derivation chain (SDTM → needs observation domain + enrichment domains)
    const hasDerivations = (spec.derivationChain || []).some(e => e.derivationOid);
    if (hasDerivations) {
      // Primary observation domain from BC reference
      const bcRef = (appState.selectedStudy?.biomedicalConcepts || [])
        .find(bc => spec.linkedBCIds?.includes(bc.id));
      // Derive domain code from BC TESTCD property name prefix (e.g., VSTESTCD → VS)
      const domainProp = (bcRef?.properties || []).find(p => /TESTCD/i.test(p.name));
      const domainCode = domainProp?.name?.replace(/TESTCD$/i, '') || '';
      if (domainCode) {
        const addReason = (d, r) => {
          if (!expected.has(d)) expected.set(d, new Set());
          expected.get(d).add(r);
        };
        addReason(domainCode, 'observation data');
      }
    }

    // Check dimensions that require auxiliary domains
    const analyses = spec.selectedAnalyses || [];
    for (const analysis of analyses) {
      const bindings = analysis.resolvedBindings || [];
      for (const b of bindings) {
        const concept = (b.concept || '').replace(/@.*/, '');
        if (concept === 'Treatment' || concept === 'Site') {
          if (!expected.has('DM')) expected.set('DM', new Set());
          expected.get('DM').add(`${concept} dimension`);
        }
      }
    }
  }

  return Array.from(expected.entries()).map(([domain, reasons]) => ({
    domain,
    reason: Array.from(reasons).join(', ')
  }));
}

export function renderExecuteAnalysis(container) {
  const study = appState.selectedStudy;
  if (!study) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>No study selected</h3></div>';
    return;
  }

  rebuildSpec();

  const allEndpoints = getAllEndpoints(study);
  const selectedEps = allEndpoints.filter(ep => appState.selectedEndpoints.includes(ep.id));
  const configuredEps = selectedEps.filter(ep =>
    appState.endpointSpecs[ep.id]?.selectedAnalyses?.length > 0
  );

  // Ensure every analysis's methodDef is in cache before render — without it,
  // method config defaults (e.g. alpha=0.05 for ANCOVA) never reach the R
  // engine, leaving `<alpha>` unsubstituted in the callTemplate.
  const missingMethodOids = new Set();
  for (const ep of configuredEps) {
    const analyses = appState.resolvedSpec?.endpoints?.find(r => r.id === ep.id)?.analyses || [];
    for (const a of analyses) {
      const oid = a?.method?.oid;
      if (oid && !appState.methodsCache[oid]) missingMethodOids.add(oid);
    }
  }
  if (missingMethodOids.size > 0) {
    Promise.all([...missingMethodOids].map(oid =>
      loadMethod(appState, oid).catch(err => console.error('loadMethod failed:', oid, err))
    )).then(() => renderExecuteAnalysis(container));
  }

  const webRReady = isInitialized();
  const datasets = appState.loadedDatasets || [];

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">Execute Analysis</h2>
        <p style="color:var(--cdisc-text-secondary); font-size:13px; margin-top:4px;">
          Run analyses from the specification metadata via WebR
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="btn-back-derivations">&larr; Derivations</button>
        <button class="btn btn-secondary" id="btn-back-esap">&larr; eSAP</button>
      </div>
    </div>

    <!-- WebR Engine -->
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <h3 style="font-size:14px; font-weight:600;">R Engine</h3>
        ${webRReady
          ? '<div class="exec-status exec-status-ready">WebR Ready</div>'
          : `<div style="display:flex; align-items:center;">
              <button class="btn btn-primary" id="btn-init-webr">Initialize WebR Engine</button>
              <span id="webr-progress" style="margin-left:12px; font-size:12px; color:var(--cdisc-text-secondary);"></span>
             </div>`}
      </div>
    </div>

    <!-- Data Upload -->
    <div class="card" style="margin-bottom:16px;">
      <h3 style="font-size:14px; font-weight:600; margin-bottom:12px;">Analysis / Source Datasets</h3>
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
        <label class="btn btn-secondary" style="cursor:pointer;">
          Upload .xpt / .csv files
          <input type="file" id="xpt-file-input" accept=".xpt,.csv" multiple style="display:none;">
        </label>
        <span id="upload-status" style="font-size:12px; color:var(--cdisc-text-secondary);"></span>
      </div>
      ${_renderStudyDatasetPicker(datasets)}
      ${datasets.length > 0 ? _renderDatasetTable(datasets) : `
      <div style="font-size:12px; color:var(--cdisc-text-secondary);">No datasets loaded. Upload SDTM or ADaM .xpt or .csv files to begin.</div>`}
      ${(() => {
        const expectedDs = _getExpectedDatasets(configuredEps);
        if (expectedDs.length === 0) return '';
        const loadedNames = new Set(datasets.map(d => d.name.toUpperCase()));
        return `<div style="margin-top:8px; font-size:11px; color:var(--cdisc-text-secondary); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <span style="font-weight:600;">Expected:</span>
          ${expectedDs.map(d => {
            const loaded = loadedNames.has(d.domain.toUpperCase());
            return `<span style="padding:1px 6px; border-radius:3px; border:1px solid ${loaded ? 'var(--cdisc-primary)' : 'var(--cdisc-border)'}; background:${loaded ? 'var(--cdisc-primary-light)' : 'transparent'};" title="${d.reason}">${d.domain}.xpt ${loaded ? '\u2713' : ''}</span>`;
          }).join('')}
        </div>`;
      })()}
    </div>

    <!-- Endpoint Analyses -->
    <div class="card">
      <h3 style="font-size:14px; font-weight:600; margin-bottom:12px;">
        Configured Analyses <span style="font-weight:400; color:var(--cdisc-text-secondary);">(${configuredEps.length})</span>
      </h3>
      ${configuredEps.length > 0
        ? configuredEps.map(ep => _renderEndpointCard(ep, study, datasets, webRReady)).join('')
        : '<div style="font-size:12px; color:var(--cdisc-text-secondary);">No analyses configured. Set up endpoints in Steps 3-4 first.</div>'}
    </div>

    ${_styles()}
  `;

  _wireEvents(container, configuredEps, study);
}

// ---------------------------------------------------------------------------
// Dataset table
// ---------------------------------------------------------------------------

/**
 * The datasets shipped with the SELECTED study, from data/datasets.json.
 * Keyed by the study's `data` folder in studies.json, so adding a study means
 * adding a folder and two manifest entries — no code change here.
 *
 * @returns {{store:string, name:string, path:string, format:string, label:string}[]}
 */
function _studyDatasetCatalogue() {
  const manifest = appState.datasetManifest;
  const key = appState.studyManifest?.[appState.selectedStudyIndex]?.data;
  const entry = key && manifest ? manifest[key] : null;
  if (!entry) return [];
  return ['sdtm', 'adam'].flatMap(store =>
    (entry[store] || []).map(d => ({ ...d, store })));
}

/**
 * Chips for the selected study's shipped datasets — click one to load it, or
 * "Load all". Uploading still works; this just removes the hand-picking of
 * twelve files from disk on every reload. Studies with no manifest entry
 * render nothing, so the panel degrades to upload-only.
 */
function _renderStudyDatasetPicker(datasets) {
  const catalogue = _studyDatasetCatalogue();
  if (catalogue.length === 0) return '';
  const loaded = new Set((datasets || []).map(d => String(d.name).toUpperCase()));
  const pending = catalogue.filter(d => !loaded.has(d.name.toUpperCase()));
  const chip = (d) => {
    const isLoaded = loaded.has(d.name.toUpperCase());
    return `<button class="exec-study-dataset" data-path="${d.path}" data-name="${d.name}"
      data-format="${d.format}" ${isLoaded ? 'disabled' : ''}
      title="${d.label || d.store.toUpperCase()}"
      style="padding:1px 7px; border-radius:3px; font-size:11px; cursor:${isLoaded ? 'default' : 'pointer'};
             border:1px solid ${isLoaded ? 'var(--cdisc-primary)' : 'var(--cdisc-border)'};
             background:${isLoaded ? 'var(--cdisc-primary-light)' : 'transparent'};
             color:inherit;">${d.name}${isLoaded ? ' \u2713' : ''}</button>`;
  };
  const group = (store) => {
    const items = catalogue.filter(d => d.store === store);
    if (items.length === 0) return '';
    return `<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:4px;">
      <span style="font-weight:600; font-size:11px; min-width:42px;">${store.toUpperCase()}</span>
      ${items.map(chip).join('')}
    </div>`;
  };
  return `<div style="margin-bottom:12px; font-size:11px; color:var(--cdisc-text-secondary);">
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="font-weight:600;">Study datasets</span>
      ${pending.length > 0
        ? `<button id="exec-load-all-datasets" class="btn btn-secondary" style="padding:1px 8px; font-size:11px;">Load all (${pending.length})</button>`
        : `<span>all loaded</span>`}
    </div>
    ${group('sdtm')}
    ${group('adam')}
  </div>`;
}

function _renderDatasetTable(datasets) {
  return `<table style="width:100%; font-size:12px; border-collapse:collapse;">
    <thead><tr style="text-align:left; border-bottom:1px solid var(--cdisc-border);">
      <th style="padding:4px 8px;">Dataset</th><th style="padding:4px 8px;">Rows</th>
      <th style="padding:4px 8px;">Cols</th><th style="padding:4px 8px;">Variables</th>
    </tr></thead>
    <tbody>${datasets.map(ds => `<tr>
      <td style="padding:4px 8px; font-weight:600;">${ds.name}</td>
      <td style="padding:4px 8px;">${ds.nrow.toLocaleString()}</td>
      <td style="padding:4px 8px;">${ds.ncol}</td>
      <td style="padding:4px 8px; font-size:11px; color:var(--cdisc-text-secondary);">${ds.columns.slice(0, 8).join(', ')}${ds.columns.length > 8 ? ', ...' : ''}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ---------------------------------------------------------------------------
// Endpoint card — header + per-analysis sub-cards + combined ARD view
// ---------------------------------------------------------------------------

function _renderEndpointCard(ep, study, datasets, webRReady) {
  const spec = appState.endpointSpecs[ep.id];
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === ep.id);
  const result = _ensureEndpointResult(ep.id);
  // Which store's variables are offered is a property of THE DATA, not of the
  // view toggle. modelViewMode is presentation — it decides how names are
  // displayed — so driving the options from it meant merely *looking* at ADaM
  // changed what you could *pick* against SDTM data. Detect the store from the
  // loaded dataset's columns, exactly as the engine's detect_store does, so the
  // panel and the engine cannot disagree.
  const activeStore = _detectStoreForDataset(result.datasetOverride || resolvedEp?.targetDataset)
    || 'adam';
  const activeDataset = result.datasetOverride || resolvedEp?.targetDataset;
  const adam = _withDomainResolved(
    appState.conceptMappings?.[activeStore] || appState.conceptMappings?.adam || {},
    activeDataset);
  const selectedDataset = (result.datasetOverride || resolvedEp?.targetDataset || '').toLowerCase();
  const analyses = resolvedEp?.analyses || [];

  // Union of languages across all analyses' implementations
  const implCatalog = appState.methodImplementationCatalog?.implementations || {};
  const langSet = new Set();
  for (const a of analyses) {
    const oid = a?.method?.oid;
    if (!oid) continue;
    for (const impl of (implCatalog[oid] || [])) {
      if (impl.language) langSet.add(impl.language);
    }
  }
  const availableLangs = [...langSet];
  const selectedLang = result.selectedLang || (availableLangs.includes('R') ? 'R' : availableLangs[0] || 'R');

  const anyRunning = analyses.some((_, i) => result.analysisResults?.[i]?.status === 'running');
  const anyComplete = analyses.some((_, i) => result.analysisResults?.[i]?.status === 'complete');
  const canRunAll = webRReady && datasets.length > 0 && analyses.length > 0 && !!selectedDataset;

  const statusClass = anyRunning ? 'exec-card-running' : (anyComplete ? 'exec-card-complete' : '');

  return `
    <div class="exec-endpoint-card ${statusClass}" data-ep-id="${ep.id}">
      <!-- Header -->
      <div class="exec-card-header">
        <div>
          <strong>${ep.name}</strong>
          <span class="badge ${ep.level.includes('Primary') ? 'badge-primary' : 'badge-secondary'}" style="margin-left:6px;">${ep.level}</span>
          <span style="font-size:11px; color:var(--cdisc-text-secondary); margin-left:8px;">
            ${analyses.length} ${analyses.length === 1 ? 'analysis' : 'analyses'}
          </span>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${anyRunning ? '<span class="badge badge-blue">Running...</span>' : ''}
          <button class="btn btn-primary btn-sm exec-run-all-btn" data-ep-id="${ep.id}"
            ${!canRunAll ? 'disabled style="opacity:0.5;"' : ''}>
            ${anyComplete ? 'Re-run all' : 'Run all'}
          </button>
        </div>
      </div>

      <!-- Endpoint-level meta (shared across analyses) -->
      <div class="exec-card-meta">
        <span>${spec.conceptCategory || ''}</span>
        <span style="display:flex; align-items:center; gap:4px;">Language:
          ${availableLangs.length > 1 ? `
          <select class="exec-lang-select" data-ep-id="${ep.id}" style="font-size:11px; padding:2px 6px;">
            ${availableLangs.map(lang => `<option value="${lang}" ${lang === selectedLang ? 'selected' : ''}>${lang}</option>`).join('')}
          </select>` : `<code>${selectedLang}</code>`}
        </span>
        <span style="display:flex; align-items:center; gap:4px;">Dataset:
          ${datasets.length > 0 ? `
          <select class="exec-dataset-select" data-ep-id="${ep.id}" style="font-size:11px; padding:2px 6px;">
            <option value="">-- select --</option>
            ${datasets.map(ds => `<option value="${ds.name}" ${ds.name === selectedDataset ? 'selected' : ''}>${ds.name} (${ds.nrow.toLocaleString()})</option>`).join('')}
          </select>` : `<code>${selectedDataset || 'not set'}</code>`}
        </span>
        ${anyComplete || anyRunning ? `<button class="btn-reset-exec" data-ep-id="${ep.id}" style="margin-left:auto; font-size:10px; padding:2px 8px; cursor:pointer; background:none; border:1px solid var(--cdisc-border); border-radius:3px; color:var(--cdisc-text-secondary);">Reset</button>` : ''}
      </div>

      <!-- Derivation Pipeline (if any) -->
      ${_renderDerivationSummary(ep, result)}

      <!-- Analysis sub-cards -->
      ${analyses.length === 0
        ? '<div style="font-size:12px; color:var(--cdisc-text-secondary); padding:10px;">No analyses configured for this endpoint.</div>'
        : analyses.map((analysis, aIdx) =>
            _renderAnalysisSubcard(ep, analysis, aIdx, result, adam, selectedLang, selectedDataset, webRReady, datasets.length > 0, datasets)
          ).join('')}

      <!-- Combined ARD / cube view (long format across all completed analyses) -->
      ${anyComplete ? _renderCombinedARD(ep, analyses, result) : ''}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Analysis sub-card — bindings, slices, formula, generated program, results
// ---------------------------------------------------------------------------

function _renderAnalysisSubcard(ep, analysis, aIdx, resultState, adam, selectedLang, selectedDataset, webRReady, hasDatasets, datasets) {
  const methodOid = analysis?.method?.oid || '';
  const methodDef = appState.methodsCache?.[methodOid] || null;
  const methodName = methodDef?.name || methodOid;

  // Build column-presence and distinct-value lookups across loaded datasets.
  // Used to (a) filter binding-variable candidates to columns that actually
  // exist in loaded data, and (b) populate slice value dropdowns with real
  // data values (e.g. EFFFL → ["N","Y"]) instead of variable names.
  const loadedDatasets = Array.isArray(datasets) ? datasets : [];
  const loadedColumnSet = new Set();
  const dataValuesByVar = {}; // colName → string[] of distinct values (union across datasets)
  for (const ds of loadedDatasets) {
    for (const col of (ds.columns || [])) loadedColumnSet.add(col);
    for (const [col, vals] of Object.entries(ds.distinctValues || {})) {
      if (!Array.isArray(vals) || vals.length === 0) continue;
      const merged = new Set(dataValuesByVar[col] || []);
      vals.forEach(v => merged.add(v));
      dataValuesByVar[col] = [...merged].sort();
    }
  }
  const hasLoadedColumns = loadedColumnSet.size > 0;

  // Detect ADaM-style population flag columns: any character column whose
  // distinct values are a subset of {Y, N}. Used to surface study-specific
  // flag columns (custom names like FLG_PP1, ADASEFFFL) for "domain-keyed"
  // dimensions like Population — whose model byDataType enumerates only
  // CDISC-standard names (ITTFL/SAFFL/EFFFL/...) and so misses non-standard
  // flags entirely.
  const detectedFlagColumns = Object.entries(dataValuesByVar)
    .filter(([, vals]) => vals.length > 0 && vals.length <= 2 && vals.every(v => v === 'Y' || v === 'N'))
    .map(([col]) => col)
    .sort();

  const implCatalog = appState.methodImplementationCatalog?.implementations || {};
  const implList = implCatalog[methodOid] || [];
  const rImpl = implList.find(i => i.language === 'R') || null;
  const selectedImpl = implList.find(i => i.language === selectedLang) || rImpl;

  // Build a per-analysis spec for payload generation (so the R engine, which
  // reads spec$analyses[[1]], gets the correct analysis). The displayed
  // Specification JSON must reflect the user's UI overrides — otherwise
  // what-you-see drifts from what-runs. Use the same helper the execute
  // path uses so both paths produce identical patched analyses.
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === ep.id);
  const liveCfgOverrides = appState.endpointSpecs?.[ep.id]?.methodConfigOverrides
    || appState.methodConfig || {};
  const patchedAnalysisForDisplay = _applyLiveOverridesToAnalysis(
    analysis, resultState, liveCfgOverrides
  );
  const singleAnalysisSpec = resolvedEp
    ? { ...resolvedEp, analyses: [patchedAnalysisForDisplay], targetDataset: selectedDataset || resolvedEp.targetDataset }
    : null;
  const payload = singleAnalysisSpec
    ? generateExecutionPayload(singleAnalysisSpec, appState.conceptMappings, resultState.varOverrides, methodDef, rImpl, null, null, null)
    : null;

  const aResult = resultState.analysisResults?.[aIdx] || {};
  const aStatusClass = aResult.status === 'complete' ? 'exec-sub-complete'
    : aResult.status === 'running' ? 'exec-sub-running'
    : aResult.status === 'error' ? 'exec-sub-error' : '';

  const bindings = analysis?.resolvedBindings || [];
  const slices = analysis?.resolvedSlices || [];
  const expression = analysis?.resolvedExpression;

  // Split bindings into "active" (consumed by the method or structurally
  // functional) and "inactive template defaults" (bindings that aren't used).
  // Method input_roles (response, group) plus structural roles (constraint,
  // partition) are always active — the engine uses them even if the method
  // definition doesn't explicitly list them as input roles.
  const STRUCTURAL_ROLES = new Set(['constraint', 'partition']);
  const methodInputRoleNames = new Set(
    (methodDef?.input_roles || []).map(r => r.name)
  );
  const inputBindings = bindings.filter(b => b.direction !== 'output');
  const activeBindings = methodInputRoleNames.size > 0
    ? inputBindings.filter(b => methodInputRoleNames.has(b.methodRole) || STRUCTURAL_ROLES.has(b.methodRole))
    : inputBindings;
  const inactiveBindings = methodInputRoleNames.size > 0
    ? inputBindings.filter(b => !methodInputRoleNames.has(b.methodRole) && !STRUCTURAL_ROLES.has(b.methodRole))
    : [];

  const canRun = webRReady && hasDatasets && !!payload && !!selectedDataset;

  return `
    <details class="exec-analysis-sub ${aStatusClass}" data-ep-id="${ep.id}" data-a-idx="${aIdx}" open>
      <summary class="exec-sub-header" style="cursor:pointer;">
        <div>
          <span class="exec-sub-seq">#${aIdx + 1}</span>
          <strong>${methodName}</strong>
          <span style="font-size:10px; color:var(--cdisc-text-secondary); margin-left:6px;">${methodOid}</span>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${aResult.status === 'complete' ? '<span class="badge badge-teal">Complete</span>' : ''}
          ${aResult.status === 'error' ? '<span class="badge" style="background:var(--cdisc-error); color:white;">Error</span>' : ''}
          ${aResult.status === 'running' ? '<span class="badge badge-blue">Running...</span>' : ''}
          <button class="btn btn-primary btn-sm exec-run-btn" data-ep-id="${ep.id}" data-a-idx="${aIdx}"
            onclick="event.stopPropagation();"
            ${!canRun ? 'disabled style="opacity:0.5;"' : ''}>
            ${aResult.status === 'complete' ? 'Re-run' : 'Execute'}
          </button>
        </div>
      </summary>

      <!-- Resolved Bindings — view-mode-aware variable display -->
      ${activeBindings.length > 0 ? (() => {
        const viewMode = appState.modelViewMode || 'concepts';
        const isConceptMode = viewMode === 'concepts';
        const varColLabel = isConceptMode ? 'Concept Key' : 'Implementation Variable';
        return `
      <div class="exec-bindings-section">
        <div class="exec-bindings-title">RESOLVED BINDINGS (from specification)</div>
        <table class="exec-bindings-table">
          <thead><tr><th>Role</th><th>Concept</th><th>${varColLabel}</th><th>Type</th><th>Slice</th></tr></thead>
          <tbody>${activeBindings.map(b => {
            const concept = b.concept?.replace(/@.*/, '') || '';
            if (isConceptMode) {
              // In concept mode, show the concept key the engine will use (no store-specific dropdown)
              let conceptKey = concept;
              if (b.qualifierType === 'facet' && b.qualifierValue) {
                const facet = b.qualifierValue.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('.');
                conceptKey = concept + '.' + facet;
              }
              return '<tr>' +
                '<td>' + b.methodRole + '</td>' +
                '<td><code>' + concept + '</code></td>' +
                '<td><code>' + conceptKey + '</code></td>' +
                '<td>' + b.dataStructureRole + '</td>' +
                '<td>' + (b.slice || '--') + '</td>' +
              '</tr>' + _auxSourceRow(b, concept, ep, resultState, selectedDataset, loadedDatasets, hasLoadedColumns);
            }
            // Resolve against the store of the dataset this binding actually
            // comes from. With an SDTM primary and an ADaM auxiliary, the
            // Treatment row showed ARM (the SDTM answer) while reading ADSL,
            // whose planned-treatment variable is TRT01P. ADSL happens to carry
            // ARM too, so the run was right and the label was not — the kind of
            // coincidence that hides the bug until a study without ARM appears.
            const auxDs = resultState.auxiliarySources?.[concept]?.dataset;
            const bindingStore = auxDs
              ? _withDomainResolved(
                  appState.conceptMappings?.[_detectStoreForDataset(auxDs)] || adam, auxDs)
              : adam;
            const allOptions = getVariableOptions(concept, bindingStore, b.requiredValueType, b.dataStructureRole);
            // Always offer every model-declared option, plus displayVar as
            // fallback. (Earlier removed the loadedColumnSet filter so chained
            // derivations whose model columns get produced downstream still
            // render the dropdown — see commit history for context.)
            const overrides = resultState.varOverrides || {};
            const displayVar = overrides[concept]
              || getDefaultVariable(concept, b.dataStructureRole, bindingStore, b);
            const options = [...new Set([...allOptions, displayVar].filter(Boolean))];
            // displayVar may be null when the concept has no mapping in the
            // active data store (e.g. user picked Observation.Identification.Topic
            // (OC) for ParameterDimension but the dataset is ADaM, where the
            // matching column is Parameter (PARAM/PARAMCD)).
            // A chain-supplied role wins over any source variable. The engine
            // binds these to the derived __col_, so showing QSSTRESN because
            // Measure happens to map there described a column the run never
            // reads. Checking this only in the unmapped fallback caught the
            // roles with no store mapping at all (TimeToEvent, Flag) and
            // missed the ones that do map — the ANCOVA covariate above all.
            const chainNode = _chainNodeForRole(ep, analysis?.basedOn?.transformationId, concept)
              || (b.dataStructureRole === 'dimension' ? _chainProducesDimension(ep, concept) : null);
            const varCell = chainNode
              ? (() => {
                  // The covariate is not the derived column itself but a SLICE
                  // of it (that score at baseline), so name the slice when the
                  // binding declares one — the engine pre-joins "<col>__<slice>".
                  const sliceNote = b.slice ? ` sliced at ${b.slice}` : '';
                  const label = chainNode.via
                    ? `from the derivation chain (${chainNode.via})`
                    : 'from the derivation chain';
                  return `<span style="font-size:11px; font-style:italic; color:var(--cdisc-text-secondary);"
                    title="Produced by ${chainNode.derivationOid} in the derivation pipeline as ${chainNode.column}${sliceNote ? ', ' + sliceNote.trim() : ''} — no source variable is read for this role.">&#8627; ${label}${sliceNote}</span>`;
                })()
              : displayVar
              ? (options.length > 1
                ? '<select class="exec-var-override" data-ep-id="' + ep.id + '" data-concept="' + concept + '"' +
                  ' style="font-size:11px; padding:2px 4px; font-family:monospace;">' +
                  options.map(v => '<option value="' + v + '"' + (v === displayVar ? ' selected' : '') + '>' + v + '</option>').join('') +
                  '</select>'
                : '<code>' + displayVar + '</code>')
              : '<span style="color:var(--cdisc-error); font-size:11px; font-style:italic;" title="Concept has no mapping in the active data store, and no chain node or pipeline reference supplies it.">— (no mapping)</span>';

            // Auxiliary-source picker row: explicit per-binding "where does
            // this column come from" choice. Shown for non-constraint
            // dimension bindings where (a) the primary dataset doesn't
            // provide the concept (forces user to pick aux), or (b) more
            // than one loaded dataset provides it (user has a real choice).
            // Storage: resultState.auxiliarySources[concept] = {dataset, joinKey}
            // The engine reads this map at execute time; no auto-scan.
            const auxRow = _auxSourceRow(b, concept, ep, resultState, selectedDataset, loadedDatasets, hasLoadedColumns);


            return '<tr>' +
              '<td>' + b.methodRole + '</td>' +
              '<td><code>' + concept + '</code></td>' +
              '<td>' + varCell + '</td>' +
              '<td>' + b.dataStructureRole + '</td>' +
              '<td>' + (b.slice || '--') + '</td>' +
            '</tr>' + auxRow;
          }).join('')}
          </tbody>
        </table>
        ${inactiveBindings.length > 0 ? `
          <details style="margin-top:6px;">
            <summary style="font-size:10px; color:var(--cdisc-text-secondary); cursor:pointer;">
              Template defaults not consumed by ${methodOid} (${inactiveBindings.length})
            </summary>
            <table class="exec-bindings-table" style="opacity:0.6; margin-top:4px;">
              <thead><tr><th>Role</th><th>Concept</th><th>Type</th><th>Slice</th></tr></thead>
              <tbody>${inactiveBindings.map(b => `
                <tr>
                  <td>${b.methodRole}</td>
                  <td><code>${b.concept?.replace(/@.*/, '') || ''}</code></td>
                  <td>${b.dataStructureRole}</td>
                  <td>${b.slice || '--'}</td>
                </tr>
              `).join('')}
              </tbody>
            </table>
          </details>
        ` : ''}
      </div>`;
      })() : ''}

      <!-- Resolved Slices -->
      ${slices.length > 0 ? (() => {
        const isConceptMode = (appState.modelViewMode || 'concepts') === 'concepts';
        // Build USDM value suggestions per dimension concept. The spec author
        // doesn't have data values at this stage — they have USDM design data
        // (arms, visits, populations) and CDISC controlled terminology.
        const usdmValues = {};
        const parsedStudy = appState.selectedStudy;
        if (parsedStudy) {
          const paramOpts = getEndpointParameterOptions(parsedStudy, ep.id, appState.endpointSpecs);
          if (paramOpts?.length) usdmValues['Parameter'] = paramOpts;
          const armOpts = getArmNames(parsedStudy);
          if (armOpts?.length) usdmValues['Treatment'] = armOpts;
          const visitOpts = getVisitLabels(parsedStudy);
          if (visitOpts?.length) usdmValues['AnalysisVisit'] = visitOpts;
          // Population: USDM analysisPopulations[]/populations[] names. Note
          // that these are protocol-level identifiers (e.g. "AP_1",
          // "Efficacy Population") that don't typically match an ADaM Y/N
          // flag value. The CT-aware "Y" option (added below per-row when
          // the bound variable is a --FL column) covers the actual-filter
          // case; the USDM names persist the analysis-population identity
          // for documentation / write-back.
          const popOpts = getPopulationNames(parsedStudy);
          if (popOpts?.length) usdmValues['Population'] = popOpts.map(p => p.value || p);
        }
        // CDISC controlled-terminology defaults per dimension. ADaMIG flag
        // columns (--FL) are NY-codelist controlled — in-pop = "Y".
        const ctValues = {};
        const isFlagColumn = (col) => typeof col === 'string' && /FL$/i.test(col);
        return `
      <div class="exec-bindings-section">
        <div class="exec-bindings-title">RESOLVED SLICES (cube constraints)</div>
        <table class="exec-bindings-table">
          <thead><tr><th>Slice</th><th>Dimension</th><th>${isConceptMode ? 'Concept Key' : 'Implementation Variable'}</th><th>Value</th></tr></thead>
          <tbody>${slices.map(s => {
            const dims = s.resolvedValues || {};
            return Object.entries(dims).map(([dim, val]) => {
              // Resolve the dimension against a store that can actually
              // represent it. Population has NO SDTM mapping — analysis-set
              // flags are an ADaM construct — so with an SDTM primary the cell
              // showed "null" and offered USDM population ids as values. An id
              // identifies which population is meant; the implementation is a
              // flag variable plus "Y", which lives in the loaded ADSL.
              const dimStore = (adam?.dimensions?.[dim] || adam?.concepts?.[dim])
                ? adam
                : (() => {
                    const provs = _findDatasetsProvidingConcept(
                      dim, null, null, appState.conceptMappings, loadedDatasets);
                    const ds = provs[0];
                    if (!ds) return adam;
                    return _withDomainResolved(
                      appState.conceptMappings?.[_detectStoreForDataset(ds)] || adam, ds);
                  })();
              const allDimOptions = getVariableOptions(dim, dimStore, null, 'dimension');
              // For domain-keyed dimensions like Population (whose byDataType uses
              // clinical descriptors instead of standard data-type keys), the model's
              // enumerated variables only cover CDISC-standard names. Augment with
              // every Y/N flag column detected in the loaded data so study-specific
              // flags appear in the dropdown.
              const dimEntry = dimStore?.dimensions?.[dim] || dimStore?.concepts?.[dim];
              const isDomainKeyed = dimEntry?.byDataType
                && !Object.keys(dimEntry.byDataType).some(k => ['string', 'code', 'id', 'decimal', 'integer'].includes(k));
              const augmentedDimOptions = isDomainKeyed
                ? [...new Set([...allDimOptions, ...detectedFlagColumns])]
                : allDimOptions;
              const sliceOverrides = resultState.sliceOverrides || {};
              const overrideKey = `${s.name}|${dim}`;
              const currentVal = sliceOverrides[overrideKey]?.value ?? val;
              const currentVar = sliceOverrides[overrideKey]?.variable;
              const defaultVar = getDefaultVariable(dim, 'dimension', dimStore);
              // For domain-keyed dimensions, prefer a flag column that ACTUALLY
              // exists in loaded data over the model's first-listed default
              // (which may be a CDISC standard the study doesn't use).
              const displayVar = currentVar
                || (isDomainKeyed && !loadedColumnSet.has(defaultVar) && detectedFlagColumns[0])
                || defaultVar;
              // Always offer every model-declared option for the dimension,
              // not just those present in the source upload. For chained
              // derivations the chain *produces* the model columns
              // (PARAMCD/PARAM/AVISIT/...) so the source dataset won't contain
              // them yet — gating on loadedColumnSet would lock the user into
              // a single read-only label. The displayVar is always included
              // as a fallback to cover study-specific picks (e.g. flag columns).
              const dimOptions = [...new Set([...augmentedDimOptions, displayVar].filter(Boolean))];
              const usdmOpts = usdmValues[dim] || [];
              const dataVals = dataValuesByVar[displayVar] || [];
              // CT-aware: when the bound variable is an ADaM flag column
              // (--FL suffix), the codelist (NY) gives Y/N as the only valid
              // values. Surface them in the dropdown so the spec author
              // doesn't need to inspect the data.
              const ctOpts = isFlagColumn(displayVar) ? ['Y', 'N'] : [];
              const hasAnyValueOptions = usdmOpts.length > 0 || dataVals.length > 0 || ctOpts.length > 0;
              return `<tr>
                <td>${s.name}</td>
                <td>${dim}</td>
                <td>${_chainProducesDimension(ep, dim)
                  ? `<span style="font-size:11px; font-style:italic; color:var(--cdisc-text-secondary);"
                      title="Minted on the endpoint: the label for what the chain computed. No source row carries this value — ZE has no ZETEST column — so it cannot filter the input. On ADaM output it lands in PARAM.">&#8627; minted on the endpoint</span>`
                  : isConceptMode
                  ? `<code>${dim}</code>`
                  : (dimOptions.length > 1 ? `
                  <select class="exec-slice-var-override" data-ep-id="${ep.id}" data-slice="${s.name}" data-dim="${dim}"
                    style="font-size:11px; padding:2px 4px; font-family:monospace;">
                    ${dimOptions.map(v => `<option value="${v}" ${v === displayVar ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>` : `<code>${displayVar}</code>`)}</td>
                <td>${hasAnyValueOptions ? `
                  <select class="exec-slice-val-override" data-ep-id="${ep.id}" data-slice="${s.name}" data-dim="${dim}"
                    style="font-size:11px; padding:2px 6px; width:200px;">
                    ${dataVals.length > 0 ? `<optgroup label="${displayVar} values">
                      ${dataVals.map(v => `<option value="${_escapeAttr(v)}" ${v === currentVal ? 'selected' : ''}>${v}</option>`).join('')}
                    </optgroup>` : ''}
                    ${ctOpts.length > 0 ? `<optgroup label="CT (NY codelist)">
                      ${ctOpts.map(v => `<option value="${_escapeAttr(v)}" ${v === currentVal ? 'selected' : ''}>${v}</option>`).join('')}
                    </optgroup>` : ''}
                    ${usdmOpts.length > 0 ? `<optgroup label="USDM">
                      ${usdmOpts.map(v => `<option value="${_escapeAttr(v)}" ${v === currentVal ? 'selected' : ''}>${v}</option>`).join('')}
                    </optgroup>` : ''}
                    <optgroup label="Template">
                      <option value="${_escapeAttr(val)}" ${val === currentVal && !usdmOpts.includes(val) && !dataVals.includes(val) && !ctOpts.includes(val) ? 'selected' : ''}>${val}</option>
                    </optgroup>
                  </select>`
                  : `<input class="exec-slice-val-override" data-ep-id="${ep.id}" data-slice="${s.name}" data-dim="${dim}"
                  value="${_escapeAttr(currentVal)}" style="font-size:11px; padding:2px 6px; width:180px;
                  border:1px solid var(--cdisc-border); border-radius:3px;">`}</td>
              </tr>`;
            }).join('');
          }).join('')}
          </tbody>
        </table>
      </div>`;
      })() : ''}

      <!-- Expression / formula -->
      ${expression ? (() => {
        const varMap = {};
        for (const b of bindings) {
          if (b.direction === 'output') continue;
          const concept = (b.concept || '').replace(/@.*/, '');
          const userOverride = resultState.varOverrides?.[concept];
          // Same precedence as the bindings, slices and results tables:
          // the user's pick, then the store the view asks for, then — only for
          // a role the chain does NOT supply — the source-store default. The
          // formula used to read the source store unconditionally and printed
          // QSSTRESN for a covariate that is a derived column.
          const chainSupplied = !!_chainNodeForRole(ep, analysis?.basedOn?.transformationId, concept)
            || (b.dataStructureRole === 'dimension' && !!_chainProducesDimension(ep, concept));
          const presentVar = _presentationVarStrict(concept, b);
          const sourceVar = chainSupplied
            ? null
            : getDefaultVariable(concept, b.dataStructureRole, adam, b);
          varMap[concept] = userOverride || presentVar || sourceVar || concept;
        }
        let resolved = expression.resolved || '';
        const keys = Object.keys(varMap).sort((a, b) => b.length - a.length);
        for (const key of keys) {
          resolved = resolved.replace(new RegExp(`\\b${key}(@\\w+)?\\b`, 'g'), varMap[key]);
        }
        return `
        <div class="exec-bindings-section">
          <div class="exec-bindings-title">FORMULA (${expression.notation || 'unknown'})</div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            <code style="font-size:12px; background:var(--cdisc-background); padding:4px 10px; border-radius:4px; display:inline-block; color:var(--cdisc-text-secondary);">
              ${_escapeHtml((expression.resolved || '').replace(/@\w+/g, ''))}
            </code>
            <code style="font-size:12px; background:var(--cdisc-background); padding:4px 10px; border-radius:4px; display:inline-block; font-weight:600;">
              ${_escapeHtml(resolved)}
            </code>
          </div>
        </div>`;
      })() : ''}

      <!-- Spec JSON + Concept Mappings -->
      <div style="display:flex; gap:0; margin-top:12px; flex-wrap:wrap;">
        <details class="exec-code-details">
          <summary>Specification JSON</summary>
          <pre class="exec-code-pre">${payload ? _escapeHtml(payload.specJson) : 'No specification available'}</pre>
        </details>
        <details class="exec-code-details">
          <summary>Concept Mappings</summary>
          <pre class="exec-code-pre">${payload ? _escapeHtml(payload.mappingJson) : ''}</pre>
        </details>
      </div>

      <!-- Error -->
      ${aResult.error ? `
      <div style="margin-top:8px; padding:10px 14px; background:rgba(220,53,69,0.08); border:1px solid var(--cdisc-error); border-radius:var(--radius); font-size:12px; color:var(--cdisc-error); white-space:pre-wrap;">
        <strong>Error:</strong> ${_escapeHtml(aResult.error)}
      </div>` : ''}

      <!-- Console output (diagnostics) -->
      ${aResult.console ? `
      <details style="margin-top:6px; font-size:11px;">
        <summary style="cursor:pointer; color:var(--cdisc-text-secondary);">Engine console output</summary>
        <pre style="margin:4px 0; padding:8px; background:rgba(0,0,0,0.04); border-radius:var(--radius); font-size:10px; max-height:300px; overflow:auto;">${_escapeHtml(aResult.console)}</pre>
      </details>` : ''}

      <!-- Derived Data Preview (store-mapped post-derivation rows) -->
      ${aResult.results?.derived_data_preview ? _renderDerivedDataPreview(aResult.results) : ''}

      <!-- Results (per-analysis) -->
      ${aResult.results ? _renderARDResults(aResult.results, analysis, adam, resultState.varOverrides, aResult.analysisInputColumns) : ''}

      <!-- Generated Program -->
      ${selectedImpl ? (() => {
        const liveOvr = appState.endpointSpecs?.[ep.id]?.methodConfigOverrides || appState.methodConfig || {};
        const configs = _buildConfigs(analysis, methodDef, liveOvr);
        // Mirror _executeAnalysis's effectiveOverrides: promote each binding's
        // visible default into the override map UNLESS that default is the
        // canonical primary that ingest will rename away (in which case the
        // engine should use the concept-key column directly). Keeps the
        // preview formula in sync with what actually runs.
        const previewOverrides = { ...(resultState.varOverrides || {}) };
        for (const b of bindings) {
          if (b.direction === 'output') continue;
          const concept = (b.concept || '').replace(/@.*/, '');
          if (!concept || previewOverrides[concept] !== undefined) continue;
          const entry = adam?.dimensions?.[concept] || adam?.concepts?.[concept];
          const bt = entry?.byDataType;
          if (!bt) continue;
          const def = getDefaultVariable(concept, b.dataStructureRole, adam, b);
          if (!def || def === concept) continue;
          if (hasLoadedColumns && !loadedColumnSet.has(def)) continue;
          if (def === Object.values(bt)[0]) continue;
          previewOverrides[concept] = def;
        }
        // The R engine filters `selectedDataset` through execute_cube → analysis_data
        // BEFORE running the call template. Show the same name in the preview so it's
        // clear the model fits filtered rows, not the raw upload.
        const callCode = resolveCallTemplate(selectedImpl, bindings, previewOverrides, adam, configs, 'analysis_data', analysis?.outputConfiguration);
        const sliceOverridesForPreview = resultState.sliceOverrides || {};
        const cubeHeader = _renderCubePreviewHeader(selectedDataset, slices, sliceOverridesForPreview, previewOverrides);
        const resolvedCode = (cubeHeader ? cubeHeader + '\n\n' : '') + callCode;
        return `
      <div class="exec-bindings-section" style="margin-top:16px;">
        <div class="exec-bindings-title">GENERATED ${selectedLang} PROGRAM</div>
        <div style="display:flex; gap:0; flex-wrap:wrap;">
          ${payload && selectedLang === 'R' ? `
          <details class="exec-code-details" open>
            <summary>Metadata-Driven (via engine)</summary>
            <pre class="exec-code-pre">${_escapeHtml(payload.bootstrapCode)}</pre>
          </details>` : ''}
          <details class="exec-code-details" open>
            <summary>Resolved (standalone)</summary>
            <pre class="exec-code-pre">${resolvedCode ? _escapeHtml(resolvedCode) : 'No implementation available'}</pre>
          </details>
        </div>
      </div>`;
      })() : `
      <div class="exec-bindings-section" style="margin-top:16px;">
        <div class="exec-bindings-title">GENERATED ${selectedLang} PROGRAM</div>
        <div style="font-size:11px; color:var(--cdisc-text-secondary); padding:6px 0;">No ${selectedLang} implementation available for ${methodOid}.</div>
      </div>`}
    </details>
  `;
}

// ---------------------------------------------------------------------------
// ARD results rendering
// ---------------------------------------------------------------------------

/**
 * Build a reverse lookup keyed by both the ADaM variable name AND any
 * chain-lookup column the engine routed this role through.
 *
 * Why both: Scenario-1 analyses fit `lm(CHG ~ BASE + TRT01P + SITEGR1)`, so
 * Type III row names match ADaM variables directly. Scenario-2 analyses fit
 * `lm(\`__col_T_CFB_…\` ~ \`__col_T_CFB_…_Measure_0__parameter_baseline\` +
 * TRT01P + SITEGR1)` — the covariate term in the result is the engine's
 * internal chain-output column, which is unintelligible to a reader. Adding
 * the `__col_*` keys lets `_classifyTerm` map them back to the role's ADaM
 * variable for display.
 *
 * Slice awareness: a Measure binding with a baseline-style slice should map
 * to the `byDataType.baseline` variable (BASE), not the default
 * `byDataType.decimal` (AVAL).
 */
/**
 * A readable name for a chain-produced column in the results tables.
 *
 * `__col_T_CFB_ANCOVA_Change_0_Measure_0__parameter_baseline` is the derived
 * ADAS total score taken at baseline. Naming it after a store variable
 * (QSSTRESN) described a column the model never used — the fitted formula
 * really is the derived column — so the Type III table attributed the
 * covariate to raw source data.
 *
 * @param {string} col - a `__col_…` column name, optionally slice-suffixed
 * @returns {string|null} e.g. "ADAS-Cog (11) Total Score at parameter_baseline"
 */
function _labelForChainColumn(col) {
  if (typeof col !== 'string' || !col.startsWith('__col_')) return null;
  const lib = appState.transformationLibrary || {};
  const byOid = new Map([...(lib.derivationTransformations || []),
                         ...(lib.analysisTransformations || [])].map(t => [t.oid, t]));
  const sanitize = k => '__col_' + String(k).replace(/[^A-Za-z0-9]/g, '_');
  let best = null;
  for (const spec of Object.values(appState.endpointSpecs || {})) {
    for (const entry of (spec?.derivationChain || [])) {
      const base = sanitize(entry.slotKey);
      // Longest match wins: one slot key can be a prefix of a deeper one.
      if (col === base || col.startsWith(base + '__')) {
        if (!best || base.length > best.base.length) best = { base, entry };
      }
    }
  }
  if (!best) return null;
  const name = byOid.get(best.entry.derivationOid)?.name || best.entry.derivationOid;
  const slice = col.length > best.base.length ? col.slice(best.base.length + 2) : '';
  return slice ? `${name} at ${slice}` : name;
}

/**
 * The variable naming a concept in the store the VIEW is set to — strictly.
 *
 * "Strictly" means no falling through to another data type: a baseline-sliced
 * measure resolves only via the store's `baseline` key. ADaM declares
 * Measure.baseline = BASE and Change = CHG; SDTM declares neither, because it
 * does not represent derived values. Falling through in SDTM produced
 * --STRESN, a raw source column the analysis never read.
 *
 * Returns null in concept view (the caller then shows the derivation) and
 * whenever the presentation store has no representation for the concept.
 */
function _presentationVarStrict(concept, binding) {
  const store = _resolvePresentationStore(appState.modelViewMode);
  if (!store || !concept) return null;
  const maps = appState.conceptMappings?.[store];
  const entry = maps?.concepts?.[concept] || maps?.dimensions?.[concept];
  const bt = entry?.byDataType;
  if (!bt) return null;
  // Honour the binding's qualifier first: Treatment@IntentType=Planned is TRTP
  // in ADaM, not TRTA. byDataType carries the UNqualified default, which is why
  // a planned-treatment binding kept surfacing the actual-treatment variable.
  if (binding?.qualifierType && binding?.qualifierValue) {
    const qkey = binding.qualifierType.charAt(0).toLowerCase() + binding.qualifierType.slice(1);
    const q = entry?.[qkey]?.[binding.qualifierValue];
    const qv = q && (q.string || q.code || q.decimal);
    if (typeof qv === 'string' && !qv.startsWith('--')) return qv;
  }
  const wantsBaseline = /baseline/i.test(binding?.slice || '');
  const v = wantsBaseline
    ? bt.baseline
    : (binding?.dataStructureRole === 'measure' ? (bt.decimal || bt.code || bt.string)
                                                : (bt.code || bt.string || bt.decimal));
  // A "--" placeholder means SDTM, where this concept is domain-prefixed; the
  // term tables have no dataset context to resolve it, so decline rather than
  // print a template.
  return (typeof v === 'string' && !v.startsWith('--')) ? v : null;
}

function _buildTermRoleMap(analysisBindings, adam, varOverrides, analysisInputColumns) {
  const map = {};
  if (!analysisBindings) return map;

  const resolveAdamVar = (b, concept) => {
    if (varOverrides?.[concept]) return varOverrides[concept];
    const entry = adam?.concepts?.[concept] || adam?.dimensions?.[concept];
    if (!entry) return concept.toUpperCase();
    const bt = entry.byDataType;
    if (!bt) return entry.variable?.split('/')[0] || concept.toUpperCase();
    const wantsBaseline = /baseline/i.test(b.slice || '');
    if (b.dataStructureRole === 'measure') {
      return wantsBaseline
        ? (bt.baseline || bt.decimal || bt.code || bt.string)
        : (bt.decimal || bt.baseline || bt.code || bt.string);
    }
    return bt.code || bt.string || bt.decimal;
  };

  for (const b of analysisBindings) {
    if (b.direction === 'output') continue;
    const concept = (b.concept || '').replace(/@.*/, '');
    const role = b.methodRole || '';
    const adamVar = resolveAdamVar(b, concept);
    if (!adamVar) continue;
    const roleLabel = role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    map[adamVar] = { role, roleLabel, concept, displayName: adamVar };
  }

  if (analysisInputColumns) {
    for (const role of Object.keys(analysisInputColumns)) {
      const col = analysisInputColumns[role];
      if (!col || !col.startsWith('__col_')) continue;
      const binding = analysisBindings.find(b =>
        b.methodRole === role && b.direction !== 'output');
      if (!binding) continue;
      const concept = (binding.concept || '').replace(/@.*/, '');
      // Name it in the store the VIEW asks for, and only when that store really
      // represents this concept. ADaM has BASE for a baseline measure and CHG
      // for a change, so "ADaM variables only" should say BASE. SDTM has
      // neither — no baseline key, no Change mapping at all — so there the
      // honest name is the derivation that produced it. The old code fell
      // through to --STRESN, naming a raw source column for a derived value.
      const displayName = _presentationVarStrict(concept, binding)
        || _labelForChainColumn(col)
        || resolveAdamVar(binding, concept) || concept.toUpperCase();
      const roleLabel = role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      map[col] = { role, roleLabel, concept, displayName };
    }
  }
  return map;
}

function _classifyTerm(term, roleMap) {
  const empty = { roleLabel: '', role: '', concept: '', displayName: '' };
  if (!term) return empty;
  // R's anova/Anova preserves backticks around non-syntactic column names
  // (chain-lookup `__col_*` outputs). Strip them before lookup.
  const stripTicks = (s) => s.replace(/^`|`$/g, '');
  const t = stripTicks(String(term).trim());
  if (t.includes(':')) {
    const parts = t.split(':').map(stripTicks);
    const entries = parts.map(p => roleMap[p]);
    const roles = entries.map(e => e?.role || '').filter(Boolean);
    const concepts = entries.map(e => e?.concept || '').filter(Boolean);
    const displays = parts.map((p, i) => entries[i]?.displayName || p);
    const concept = concepts.length === 2 ? `${concepts[0]}:${concepts[1]}` : '';
    const role = roles.length === 2 ? `${roles[0]}:${roles[1]}` : '';
    return { roleLabel: 'Interaction', role, concept, displayName: displays.join(':') };
  }
  const entry = roleMap[t];
  if (!entry) return { ...empty, displayName: t };
  return { roleLabel: entry.roleLabel, role: entry.role, concept: entry.concept, displayName: entry.displayName };
}

function _filterRowsByOutputConfig(rows, termKey, roleMap, selectedDimensions) {
  if (!selectedDimensions || !termKey) return rows;
  const selected = new Set(selectedDimensions);
  return rows.filter(row => {
    const term = row[termKey];
    const { concept } = _classifyTerm(term, roleMap);
    if (!concept) return true;
    return selected.has(concept);
  });
}

/**
 * Render the store-mapped derived-data preview. Columns carry their
 * ADaM names (TRT01P, AVAL, AVISIT...) — the engine ran the derivation
 * chain in concept-keyed form and applied present_as_store() to head
 * rows before returning. Shown as a collapsed details so it doesn't
 * push the ARD result table off-screen.
 */
function _renderDerivedDataPreview(results) {
  const raw = results?.derived_data_preview;
  if (!raw) return '';
  const rows = Array.isArray(raw) ? raw : [raw];
  if (rows.length === 0 || !rows[0]) return '';
  const cols = Object.keys(rows[0]);
  if (cols.length === 0) return '';
  const store = (results.derived_data_store || 'adam').toUpperCase();
  const total = results.derived_data_total;
  const totalSuffix = (typeof total === 'number' && total > rows.length)
    ? ` of ${total.toLocaleString()}`
    : '';
  return `
    <details class="exec-bindings-section" style="margin-top:10px;" open>
      <summary style="cursor:pointer;">
        <span class="exec-bindings-title" style="display:inline;">DERIVED DATA PREVIEW</span>
        <span style="font-size:11px; color:var(--cdisc-text-secondary); margin-left:6px;">
          ${store} columns — first ${rows.length} row${rows.length === 1 ? '' : 's'}${totalSuffix}
        </span>
      </summary>
      <div style="margin-top:6px; overflow-x:auto;">
        <table class="exec-bindings-table" style="font-size:10px;">
          <thead><tr>${cols.map(c => `<th><code>${_escapeHtml(c)}</code></th>`).join('')}</tr></thead>
          <tbody>${rows.map(row => `<tr>${cols.map(c => {
            const v = row[c];
            return `<td>${_escapeHtml(v == null ? '' : String(v))}</td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    </details>
  `;
}

function _renderARDResults(results, analysis, adam, varOverrides, analysisInputColumns) {
  const sections = [];
  const roleMap = _buildTermRoleMap(
    analysis?.resolvedBindings, adam, varOverrides,
    analysisInputColumns || analysis?.analysisInputColumns
  );

  const outputConfigArr = analysis?.outputConfiguration || [];
  const outputConfigMap = {};
  for (const cfg of outputConfigArr) {
    outputConfigMap[cfg.outputClass] = cfg.selectedDimensions;
  }

  if (results.computed_value) {
    sections.push({ id: 'computed', label: 'Result',
      html: _renderComputedValueTable(results.computed_value, analysis) });
  }
  if (results.ls_means) {
    sections.push({ id: 'lsmeans', label: 'LS Means',
      html: _renderTable(_toRows(results.ls_means), ['Group', 'estimate', 'SE', 'df', 'CI_lower', 'CI_upper']) });
  }
  if (results.contrasts) {
    sections.push({ id: 'contrasts', label: 'Contrasts',
      html: _renderTable(_toRows(results.contrasts), ['Contrast', 'estimate', 'SE', 'df', 'CI_lower', 'CI_upper', 't_statistic', 'p_value']) });
  }
  if (results.type3_tests) {
    let rows = _toRows(results.type3_tests);
    const selectedDims = outputConfigMap['type3_tests'];
    rows = _filterRowsByOutputConfig(rows, 'Term', roleMap, selectedDims);
    sections.push({ id: 'type3', label: 'Type III Tests',
      html: _renderAnnotatedTable(rows, ['Term', 'Type', 'SS', 'df', 'F_statistic', 'p_value'], 'Term', roleMap) });
  }
  if (results.fit_statistics) {
    sections.push({ id: 'fit', label: 'Fit Statistics',
      html: `<table class="exec-ard-table"><thead><tr><th>Statistic</th><th>Value</th></tr></thead><tbody>
        ${Object.entries(results.fit_statistics).map(([k, v]) => `<tr><td>${k}</td><td>${_fmt(v)}</td></tr>`).join('')}
      </tbody></table>` });
  }
  // Survival output classes. Without these the log-rank test ran, produced its
  // chi-square and p-value, and rendered nothing — `sections` stayed empty and
  // the function returned '' while the analysis reported Complete.
  if (results.test_result) {
    const r = results.test_result;
    const rows = Array.isArray(r) ? r : [r];
    sections.push({ id: 'test', label: 'Test Result',
      html: _renderTable(_toRows(rows), ['chi_squared', 'df', 'p_value']) });
  }
  if (results.event_summary) {
    sections.push({ id: 'events', label: 'Event Summary',
      html: _renderTable(_toRows(results.event_summary), ['Group', 'n_risk', 'n_event', 'n_censored']) });
  }
  if (results.median_survival) {
    sections.push({ id: 'median', label: 'Median Survival',
      html: _renderTable(_toRows(results.median_survival), ['Group', 'median', 'CI_lower', 'CI_upper']) });
  }
  if (results.survival_table) {
    sections.push({ id: 'survtab', label: 'Survival Table',
      html: _renderTable(_toRows(results.survival_table),
        ['Group', 'time', 'n_risk', 'n_event', 'n_censored', 'survival_prob', 'SE', 'CI_lower', 'CI_upper']) });
  }
  if (results.landmark_estimates) {
    sections.push({ id: 'landmark', label: 'Landmark Estimates',
      html: _renderTable(_toRows(results.landmark_estimates),
        ['Group', 'time', 'survival_prob', 'SE', 'CI_lower', 'CI_upper']) });
  }
  if (sections.length === 0) {
    // Say so rather than rendering nothing: an analysis that completed but
    // produced no displayable class is a gap in this renderer, not an empty result.
    const keys = Object.keys(results || {}).filter(k => k !== 'derived_data_preview');
    return keys.length
      ? `<div class="exec-bindings-section"><div class="exec-bindings-title">RESULTS</div>
         <div style="font-size:12px; color:var(--cdisc-text-secondary);">
           The analysis returned ${keys.map(k => `<code>${k}</code>`).join(', ')},
           which this view cannot render yet.</div></div>`
      : '';
  }

  return `
    <div class="exec-ard-tabs">${sections.map((s, i) =>
      `<div class="exec-ard-tab ${i === 0 ? 'active' : ''}" data-tab="${s.id}">${s.label}</div>`
    ).join('')}</div>
    ${sections.map((s, i) =>
      `<div class="exec-ard-section ${i === 0 ? 'active' : ''}" data-tab-panel="${s.id}">${s.html}</div>`
    ).join('')}
  `;
}

/**
 * Render a computed_value result (from descriptive stats: Count, Mean, SD,
 * Median, Min, Max). The R outputMapping returns positional dim_1/dim_2/dim_3
 * columns plus a `value` column. We rename the dim columns to the concept names
 * of the fixed_effect bindings (in order) for display.
 */
function _renderComputedValueTable(computed, analysis) {
  const rows = _toRows(computed);
  if (!rows?.length) return '<div style="font-size:12px; color:var(--cdisc-text-secondary);">No data</div>';

  const constraintDims = _getConstraintDimensions(analysis);
  const dimConcepts = _getFixedEffectConcepts(analysis);
  const statName = _getStatisticName(analysis);

  // Figure out which dim columns have content (drop empty trailing dims)
  const dimCols = ['dim_1', 'dim_2', 'dim_3'].filter((c, i) => {
    if (i >= dimConcepts.length) return false;
    return rows.some(r => r[c] != null && r[c] !== '');
  });
  const headers = [
    ...constraintDims.map(c => c.concept),
    ...dimCols.map((_, i) => dimConcepts[i] || `Dim ${i + 1}`),
    statName || 'Value'
  ];

  return `<table class="exec-ard-table">
    <thead><tr>${headers.map(h => `<th>${_escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => {
      const cells = [
        ...constraintDims.map(c => `<td>${_escapeHtml(c.value)}</td>`),
        ...dimCols.map(c => `<td>${_escapeHtml(row[c] ?? '')}</td>`),
        `<td>${_fmt(row.value)}</td>`
      ];
      return `<tr>${cells.join('')}</tr>`;
    }).join('')}</tbody>
  </table>`;
}

/**
 * Combined ARD / cube view — long format table spanning all completed
 * analyses on an endpoint. Columns: dim concepts... + Statistic + Value.
 * Rows: one per (group × statistic) tuple.
 */
function _renderCombinedARD(ep, analyses, resultState) {
  // Gather completed analyses with computed_value results
  const completed = [];
  for (let i = 0; i < analyses.length; i++) {
    const aRes = resultState.analysisResults?.[i];
    if (aRes?.status !== 'complete' || !aRes.results?.computed_value) continue;
    completed.push({ analysis: analyses[i], results: aRes.results });
  }
  if (completed.length === 0) return '';

  // Union of constraint + fixed-effect dimensions across analyses
  const constraintConceptUnion = [];
  const dimConceptUnion = [];
  for (const { analysis } of completed) {
    for (const c of _getConstraintDimensions(analysis)) {
      if (!constraintConceptUnion.find(x => x.concept === c.concept)) constraintConceptUnion.push(c);
    }
    for (const c of _getFixedEffectConcepts(analysis)) {
      if (!dimConceptUnion.includes(c)) dimConceptUnion.push(c);
    }
  }

  // Build long-format rows
  const rows = [];
  for (const { analysis, results } of completed) {
    const analysisConstraints = _getConstraintDimensions(analysis);
    const concepts = _getFixedEffectConcepts(analysis);
    const statName = _getStatisticName(analysis) || analysis?.method?.oid || 'value';
    const cvRows = _toRows(results.computed_value);
    for (const cv of cvRows) {
      const row = { Statistic: statName, Value: cv.value };
      // Add constraint dimension values (constant per analysis)
      for (const c of analysisConstraints) {
        row[c.concept] = c.value;
      }
      // Map this analysis' dim_1..dim_N onto concept names
      for (let i = 0; i < concepts.length; i++) {
        row[concepts[i]] = cv[`dim_${i + 1}`] ?? '';
      }
      rows.push(row);
    }
  }

  if (rows.length === 0) return '';

  const headers = [...constraintConceptUnion.map(c => c.concept), ...dimConceptUnion, 'Statistic', 'Value'];

  return `
    <div class="exec-combined-ard">
      <div class="exec-bindings-title" style="margin-top:16px; margin-bottom:6px;">COMBINED ARD (long format)</div>
      <table class="exec-ard-table">
        <thead><tr>${headers.map(h => `<th>${_escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(row => `<tr>${headers.map(h => {
          const val = row[h];
          if (val == null || val === '') return '<td style="color:var(--cdisc-text-secondary);">--</td>';
          if (h === 'Value') return `<td>${_fmt(val)}</td>`;
          return `<td>${_escapeHtml(String(val))}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

/**
 * Extract the ordered list of concept names bound to any input role whose
 * statistical role is 'fixed_effect'. The binding stores `methodRole` (the
 * method input_role `name`, e.g. "group" or "fixed_effect"), which may differ
 * from the statistical role — M.Mean declares its grouping input as
 * name="group", statisticalRole="fixed_effect". We look up the method
 * definition to map roles correctly.
 */
function _getFixedEffectConcepts(analysis) {
  const methodOid = analysis?.method?.oid;
  const methodDef = methodOid ? appState.methodsCache?.[methodOid] : null;
  // Find input_role names whose statisticalRole is 'fixed_effect'
  const fixedEffectRoleNames = new Set();
  for (const ir of (methodDef?.input_roles || [])) {
    if (ir.statisticalRole === 'fixed_effect') fixedEffectRoleNames.add(ir.name);
  }
  // Fallback: if method def is unavailable or declares none, accept the
  // common literal role names used across the library.
  if (fixedEffectRoleNames.size === 0) {
    fixedEffectRoleNames.add('fixed_effect');
    fixedEffectRoleNames.add('group');
  }

  const out = [];
  for (const b of (analysis?.resolvedBindings || [])) {
    if (b.direction === 'output') continue;
    if (!fixedEffectRoleNames.has(b.methodRole)) continue;
    const concept = (b.concept || '').replace(/@.*/, '');
    if (concept && !out.includes(concept)) out.push(concept);
  }
  return out;
}

/**
 * Get constraint dimensions and their resolved values from the analysis slices.
 * These are dimensions that filter the data (e.g., Parameter = "Weight (kg)")
 * but don't appear in the R result because the method only groups by fixed_effects.
 * Returns array of { concept, value } objects.
 */
function _getConstraintDimensions(analysis) {
  const constraints = [];
  const sliceValues = {};
  for (const s of (analysis?.resolvedSlices || [])) {
    for (const [dim, val] of Object.entries(s.resolvedValues || {})) {
      sliceValues[dim] = val;
    }
  }
  for (const b of (analysis?.resolvedBindings || [])) {
    if (b.methodRole !== 'constraint') continue;
    const concept = (b.concept || '').replace(/@.*/, '');
    if (concept && sliceValues[concept]) {
      constraints.push({ concept, value: sliceValues[concept] });
    }
  }
  return constraints;
}

/** Look up the statistic name (e.g. 'n', 'mean', 'sd') for a method. */
function _getStatisticName(analysis) {
  const methodOid = analysis?.method?.oid;
  if (!methodOid) return null;
  const methodDef = appState.methodsCache?.[methodOid];
  const cls = methodDef?.output_specification?.output_classes?.[0];
  return cls?.statistics?.[0] || null;
}

function _renderAnnotatedTable(rows, columns, termKey, roleMap) {
  if (!rows?.length) return '<div style="font-size:12px; color:var(--cdisc-text-secondary);">No data</div>';
  return `<table class="exec-ard-table">
    <thead><tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => {
      const { roleLabel, displayName } = _classifyTerm(row[termKey], roleMap);
      return `<tr>${columns.map(c => {
        if (c === 'Type') {
          const color = roleLabel === 'Interaction' ? 'var(--cdisc-accent2)'
            : roleLabel === 'Covariate' ? 'var(--cdisc-text-secondary)'
            : 'var(--cdisc-primary)';
          return `<td style="font-size:10px; font-style:italic; color:${color};">${roleLabel}</td>`;
        }
        if (c === termKey) {
          return `<td>${_escapeHtml(displayName || String(row[termKey] ?? ''))}</td>`;
        }
        return `<td>${_fmt(row[c])}</td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody>
  </table>`;
}

function _renderTable(rows, columns) {
  if (!rows?.length) return '<div style="font-size:12px; color:var(--cdisc-text-secondary);">No data</div>';
  return `<table class="exec-ard-table">
    <thead><tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row =>
      `<tr>${columns.map(c => `<td>${_fmt(row[c])}</td>`).join('')}</tr>`
    ).join('')}</tbody>
  </table>`;
}

/**
 * Map a modelViewMode value to the store key the R engine should use for
 * present_as_store(). Returns null when the user has picked concept-only
 * — engine then skips the rename and the preview shows concept keys.
 */
function _resolvePresentationStore(mode) {
  if (!mode || mode === 'concepts') return null;
  const key = mode.startsWith('concepts_') ? mode.slice('concepts_'.length) : mode;
  return ['adam', 'sdtm', 'omop', 'fhir'].includes(key) ? key : 'adam';
}

function _toRows(df) {
  if (Array.isArray(df)) return df;
  const keys = Object.keys(df);
  if (keys.length === 0) return [];
  const first = df[keys[0]];
  const n = Array.isArray(first) ? first.length : 1;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = {};
    for (const k of keys) row[k] = Array.isArray(df[k]) ? df[k][i] : df[k];
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function _wireEvents(container, configuredEps, study) {
  container.querySelector('#btn-back-derivations')?.addEventListener('click', () => navigateTo(6));
  container.querySelector('#btn-back-esap')?.addEventListener('click', () => navigateTo(7));

  // WebR init
  container.querySelector('#btn-init-webr')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-init-webr');
    const progress = container.querySelector('#webr-progress');
    btn.disabled = true;
    btn.textContent = 'Initializing...';
    try {
      await initWebR(msg => { if (progress) progress.textContent = msg; });
      progress.textContent = 'Loading AC/DC engine...';
      await loadEngine();
      renderExecuteAnalysis(container);
    } catch (err) {
      if (progress) progress.textContent = `Error: ${err.message}`;
      btn.disabled = false;
      btn.textContent = 'Retry';
    }
  });

  // XPT upload
  container.querySelector('#xpt-file-input')?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const status = container.querySelector('#upload-status');
    if (!isInitialized()) { if (status) status.textContent = 'Initialize WebR first.'; return; }

    for (const file of files) {
      const format = /\.csv$/i.test(file.name) ? 'csv' : 'xpt';
      const name = file.name.replace(/\.(xpt|csv)$/i, '').toUpperCase();
      if (status) status.textContent = `Loading ${name}...`;
      try {
        await loadXptFile(await file.arrayBuffer(), name, format);
        appState.loadedDatasets = getLoadedDatasets();
      } catch (err) {
        if (status) status.textContent = `Error: ${err.message}`;
      }
    }
    renderExecuteAnalysis(container);
  });

  // Study dataset chips — fetch from the manifest path instead of hand-picking
  // the same twelve files off disk on every reload.
  const loadStudyDatasets = async (specs) => {
    // Re-query the node every time: renderExecuteAnalysis replaces innerHTML,
    // so a reference captured before the re-render points at a detached node
    // and the message silently goes nowhere.
    const setStatus = (msg) => {
      const el = container.querySelector('#upload-status');
      if (el) el.textContent = msg;
    };
    if (!isInitialized()) { setStatus('Initialize WebR first.'); return; }
    const failed = [];
    for (const { path, name, format } of specs) {
      setStatus(`Loading ${name}...`);
      try {
        // getBasePath() is absolute. A bare relative `ac-dc-app/${path}` is
        // resolved against the document URL, so serving the app from
        // /ac-dc-app/index.html asked for /ac-dc-app/ac-dc-app/data/... .
        const res = await fetch(`${getBasePath()}ac-dc-app/${path}`);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        await loadXptFile(await res.arrayBuffer(), name.toUpperCase(), format);
        appState.loadedDatasets = getLoadedDatasets();
      } catch (err) {
        console.error('[execute] dataset load failed', path, err);
        failed.push(`${name} (${err.message})`);
      }
    }
    renderExecuteAnalysis(container);
    // AFTER the re-render — the old status node is gone by now.
    setStatus(failed.length ? `Could not load ${failed.join(', ')}` : '');
  };

  container.querySelectorAll('.exec-study-dataset').forEach(btn => {
    btn.addEventListener('click', () => loadStudyDatasets([{
      path: btn.dataset.path, name: btn.dataset.name, format: btn.dataset.format
    }]));
  });

  container.querySelector('#exec-load-all-datasets')?.addEventListener('click', () => {
    const loaded = new Set((getLoadedDatasets() || []).map(d => String(d.name).toUpperCase()));
    loadStudyDatasets(_studyDatasetCatalogue().filter(d => !loaded.has(d.name.toUpperCase())));
  });

  // Slice value/variable overrides
  container.querySelectorAll('.exec-slice-var-override, .exec-slice-val-override').forEach(el => {
    el.addEventListener('change', () => {
      const epId = el.dataset.epId;
      const key = `${el.dataset.slice}|${el.dataset.dim}`;
      const res = _ensureEndpointResult(epId);
      if (!res.sliceOverrides) res.sliceOverrides = {};
      if (!res.sliceOverrides[key]) res.sliceOverrides[key] = {};
      if (el.classList.contains('exec-slice-var-override')) {
        res.sliceOverrides[key].variable = el.value;
      } else {
        res.sliceOverrides[key].value = el.value;
      }
    });
  });

  // Variable override dropdowns — re-render to update bootstrap + formula display
  container.querySelectorAll('.exec-var-override').forEach(sel => {
    sel.addEventListener('change', () => {
      const epId = sel.dataset.epId;
      const concept = sel.dataset.concept;
      const res = _ensureEndpointResult(epId);
      if (!res.varOverrides) res.varOverrides = {};
      res.varOverrides[concept] = sel.value;
      renderExecuteAnalysis(container);
    });
  });

  // Auxiliary-source picker (dataset + joinKey) — explicit per-binding
  // declaration of "this concept comes from this loaded dataset". Replaces
  // the old runtime auto-scan in the engine. Stored on the per-endpoint
  // resultState.auxiliarySources map; flows into the spec at execute time.
  const _setAux = (epId, concept, key, value) => {
    const res = _ensureEndpointResult(epId);
    if (!res.auxiliarySources) res.auxiliarySources = {};
    if (!res.auxiliarySources[concept]) res.auxiliarySources[concept] = { joinKey: _getSubjectJoinConcept() };
    res.auxiliarySources[concept][key] = value;
  };
  container.querySelectorAll('.exec-aux-source-select').forEach(sel => {
    sel.addEventListener('change', () => {
      _setAux(sel.dataset.epId, sel.dataset.concept, 'dataset', sel.value);
    });
  });
  container.querySelectorAll('.exec-aux-source-join').forEach(inp => {
    inp.addEventListener('change', () => {
      _setAux(inp.dataset.epId, inp.dataset.concept, 'joinKey', inp.value || _getSubjectJoinConcept());
    });
    inp.addEventListener('input', () => {
      _setAux(inp.dataset.epId, inp.dataset.concept, 'joinKey', inp.value || _getSubjectJoinConcept());
    });
  });

  // Language selection
  container.querySelectorAll('.exec-lang-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const epId = sel.dataset.epId;
      const res = _ensureEndpointResult(epId);
      res.selectedLang = sel.value;
      renderExecuteAnalysis(container);
    });
  });

  // Dataset selection
  container.querySelectorAll('.exec-dataset-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const epId = sel.dataset.epId;
      const res = _ensureEndpointResult(epId);
      res.datasetOverride = sel.value;
      renderExecuteAnalysis(container);
    });
  });

  // Derivation source store/domain overrides (execution-layer config)
  container.querySelectorAll('.exec-deriv-config-input').forEach(el => {
    el.addEventListener('change', () => {
      const epId = el.dataset.epId;
      const slotKey = el.dataset.slotKey;
      const configKey = el.dataset.configKey;
      let value = el.value;
      if (!isNaN(value) && value !== '') value = Number(value);
      const spec = appState.endpointSpecs?.[epId];
      if (!spec) return;
      if (!spec.derivationConfigValues) spec.derivationConfigValues = {};
      if (!spec.derivationConfigValues[slotKey]) spec.derivationConfigValues[slotKey] = {};
      if (value === '' || value == null) {
        delete spec.derivationConfigValues[slotKey][configKey];
      } else {
        spec.derivationConfigValues[slotKey][configKey] = value;
      }
    });
  });

  // Reset execution (clears per-analysis results but preserves selections)
  container.querySelectorAll('.btn-reset-exec').forEach(btn => {
    btn.addEventListener('click', () => {
      const epId = btn.dataset.epId;
      const prev = appState.endpointResults[epId] || {};
      appState.endpointResults[epId] = {
        varOverrides: prev.varOverrides,
        datasetOverride: prev.datasetOverride,
        selectedLang: prev.selectedLang,
        sliceOverrides: prev.sliceOverrides,
        auxiliarySources: prev.auxiliarySources,
        analysisResults: {}
      };
      renderExecuteAnalysis(container);
    });
  });

  // Per-analysis execute buttons
  container.querySelectorAll('.exec-run-btn').forEach(btn => {
    btn.addEventListener('click', () => _executeAnalysis(container, btn.dataset.epId, Number(btn.dataset.aIdx)));
  });

  // Run-all (batch) button
  container.querySelectorAll('.exec-run-all-btn').forEach(btn => {
    btn.addEventListener('click', () => _executeAllAnalyses(container, btn.dataset.epId));
  });

  // Derivation-only buttons
  container.querySelectorAll('.exec-derive-only-btn').forEach(btn => {
    btn.addEventListener('click', () => _executeDerivationOnly(container, btn.dataset.epId));
  });

  // ARD tabs
  container.querySelectorAll('.exec-ard-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const sub = tab.closest('.exec-analysis-sub') || tab.closest('.exec-endpoint-card');
      if (!sub) return;
      // Only toggle tabs within the same tab group (sub-card)
      const tabGroup = tab.parentElement;
      const panels = tabGroup.nextElementSibling
        ? Array.from(tabGroup.parentElement.querySelectorAll(':scope > .exec-ard-section'))
        : [];
      tabGroup.querySelectorAll('.exec-ard-tab').forEach(t => t.classList.remove('active'));
      panels.forEach(s => s.classList.remove('active'));
      tab.classList.add('active');
      const target = tabGroup.parentElement.querySelector(`:scope > [data-tab-panel="${tab.dataset.tab}"]`);
      if (target) target.classList.add('active');
    });
  });
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Execute a single analysis for an endpoint. Builds a per-analysis patched
 * spec (with analyses: [selected]) so the single-analysis R engine receives
 * the correct one via spec$analyses[[1]].
 */
async function _executeAnalysis(container, epId, aIdx) {
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === epId);
  if (!resolvedEp) return;
  const analysis = resolvedEp.analyses?.[aIdx];
  if (!analysis) return;

  // Ensure methodDef is in cache before building the payload — without it,
  // method config defaults (alpha, ss_type, …) never reach R and template
  // placeholders like <alpha> survive into the executed code.
  const oid = analysis?.method?.oid;
  if (oid && !appState.methodsCache[oid]) {
    try { await loadMethod(appState, oid); }
    catch (err) { console.error('loadMethod failed:', oid, err); }
  }

  // Always reload the engine to pick up latest changes
  try {
    await loadEngine();
  } catch (err) {
    _setAnalysisResult(epId, aIdx, { status: 'error', error: `Failed to load engine: ${err.message}` });
    renderExecuteAnalysis(container);
    return;
  }

  const resultState = _ensureEndpointResult(epId);
  const overrides = resultState.varOverrides || null;
  const selectedDataset = (resultState.datasetOverride || resolvedEp.targetDataset || '').toLowerCase();

  // Snapshot loaded-data column-presence + Y/N flag detection — same logic as
  // the render path uses, so the engine sees the same column choices the user
  // saw in the dropdowns (whether or not they explicitly clicked).
  const _adamForExec = appState.conceptMappings?.adam || {};
  const _loadedDsForExec = getLoadedDatasets();
  const _loadedColsForExec = new Set();
  const _flagColsForExec = [];
  for (const ds of _loadedDsForExec) {
    for (const col of (ds.columns || [])) _loadedColsForExec.add(col);
    for (const [col, vals] of Object.entries(ds.distinctValues || {})) {
      if (Array.isArray(vals) && vals.length > 0 && vals.length <= 2 && vals.every(v => v === 'Y' || v === 'N')) {
        _flagColsForExec.push(col);
      }
    }
  }
  _flagColsForExec.sort();
  // Only auto-resolve a column for domain-keyed dimensions (e.g. Population).
  // Type-keyed dims (Parameter, AnalysisVisit, …) are handled by the R engine's
  // existing fallback: look up the dim_name itself, which after ingest is the
  // canonical concept-keyed column (PARAM→Parameter, AVISIT→AnalysisVisit).
  // Auto-defaulting those to PARAMCD/AVISITN would break label-based filters.
  const _resolveDimColumn = (dim) => {
    const entry = _adamForExec.dimensions?.[dim] || _adamForExec.concepts?.[dim];
    if (!entry?.byDataType) return null;
    const isDomainKeyed = !Object.keys(entry.byDataType).some(k =>
      ['string', 'code', 'id', 'decimal', 'integer'].includes(k));
    if (!isDomainKeyed) return null;
    const bt = entry.byDataType;
    const modelDefault = bt.code || bt.string || bt.decimal || Object.values(bt)[0];
    if (modelDefault && _loadedColsForExec.has(modelDefault)) return modelDefault;
    if (_flagColsForExec.length > 0) return _flagColsForExec[0];
    return modelDefault;
  };

  // Build the patched single-analysis spec via the shared helper. The helper
  // applies slice value/variable overrides, method config overrides, AND
  // auxiliarySources (per-concept dataset declarations) — all in one place,
  // so the displayed Specification JSON (rendered via the same helper at the
  // top of the view) and the spec sent to the engine are identical by
  // construction. Earlier this path duplicated the slice-override loop
  // inline and silently dropped auxiliarySources, which is why declaring
  // a Treatment source in the UI didn't reach the engine.
  const liveOverrides = appState.endpointSpecs?.[epId]?.methodConfigOverrides
    || appState.methodConfig || {};
  const singleAnalysis = _applyLiveOverridesToAnalysis(
    analysis, resultState, liveOverrides, _resolveDimColumn
  );
  const patchedSpec = {
    ...resolvedEp,
    analyses: [singleAnalysis],
    targetDataset: selectedDataset
  };

  // Auto-resolve binding variable defaults into the override map ONLY when
  // the dropdown's displayed default differs from the canonical primary that
  // ingest_to_concepts renames away. Without this guard:
  //   - Site → default SITEGR1, primary SITEID-renamed-to-Site → DIFFERS, set override
  //     (otherwise engine substitutes "Site" = SITEID, 30 levels instead of 3)
  //   - Change → default CHG, primary CHG-renamed-to-Change → SAME, no override needed
  //     (overriding to CHG would make engine reach for a column ingest just deleted)
  // Heuristic: ingest's primary picker takes the first byDataType entry (string-
  // first for dimensions); JS getDefaultVariable picks code-first for dimensions
  // and decimal-first for measures. When those agree, ingest will rename the
  // chosen column away — so leave the override empty and let the engine use the
  // concept-key column directly.
  const effectiveOverrides = { ...(overrides || {}) };
  for (const b of (singleAnalysis?.resolvedBindings || [])) {
    if (b.direction === 'output') continue;
    const concept = (b.concept || '').replace(/@.*/, '');
    if (!concept) continue;
    if (effectiveOverrides[concept] !== undefined) continue;  // explicit pick wins
    const entry = _adamForExec.dimensions?.[concept] || _adamForExec.concepts?.[concept];
    const bt = entry?.byDataType;
    if (!bt) continue;
    const def = getDefaultVariable(concept, b.dataStructureRole, _adamForExec, b);
    if (!def || def === concept || !_loadedColsForExec.has(def)) continue;
    // canonical primary that ingest will rename: first byDataType value
    const ingestPrimary = Object.values(bt)[0];
    if (def === ingestPrimary) continue;  // would clash with rename
    effectiveOverrides[concept] = def;
  }

  const methodOid = analysis?.method?.oid || '';
  const methodDef = appState.methodsCache?.[methodOid] || null;
  const implCatalog = appState.methodImplementationCatalog?.implementations || {};
  const rImpl = implCatalog[methodOid]?.find(i => i.language === 'R') || null;

  if (!rImpl) {
    _setAnalysisResult(epId, aIdx, { status: 'error', error: `No R implementation available for ${methodOid}` });
    renderExecuteAnalysis(container);
    return;
  }

  // Build engine-ready derivation chain from raw chain + transformation library
  const rawChain = appState.endpointSpecs?.[epId]?.derivationChain || [];
  console.log('[AC/DC] epId:', epId, 'rawChain:', JSON.stringify(rawChain));
  const derivConfigValues = appState.endpointSpecs?.[epId]?.derivationConfigValues || {};
  const txLib = [
    ...(appState.transformationLibrary?.derivationTransformations || []),
    ...(appState.transformationLibrary?.analysisTransformations || [])
  ];
  // Per-derivation BC Topic constraint resolution via shared helper.
  // Each derivation's terminal slotKey identifies the BC (Step 6 choice),
  // with endpoint-level BC (Step 5) as fallback inside the helper.
  const endpointSpec = appState.endpointSpecs?.[epId];
  const study = appState.selectedStudy;

  // R engine executes derivations in array order with no dependency sort —
  // reorder post-order (leaves first) so child aggregations produce columns
  // before parent derivations reference them.
  const fullLib = appState.transformationLibrary;
  const analysisTx = fullLib?.analysisTransformations?.find(
    t => t.oid === endpointSpec?.selectedTransformationOid
  );
  const confirmedKeys = new Set(
    (endpointSpec?.confirmedTerminals || []).map(t => t.slotKey)
  );
  const slotsForSort = analysisTx
    ? buildPipelineGraph(analysisTx, fullLib,
        endpointSpec?.selectedDerivations || {}, confirmedKeys,
        endpointSpec?.dimensionCategoryPicks || {},
        appState.conceptCategories?.categories || {})
    : [];
  // Collect every live slot key (path-unique post-§3) so we can drop stale
  // chain entries whose keys reference an older graph shape. Without this,
  // pre-§3 saved specs keep feeding entries with now-unknown slotKeys —
  // computeColumnMap can't resolve them and the R engine falls back to the
  // concept-keyed column names, triggering merge-induced .x/.y collisions.
  const liveKeys = new Set();
  (function collect(list) {
    for (const s of (list || [])) { liveKeys.add(s.key); if (s.children?.length) collect(s.children); }
  })(slotsForSort);
  const cleanRawChain = (rawChain || []).filter(e => liveKeys.has(e.slotKey));
  if (cleanRawChain.length !== (rawChain || []).length) {
    console.warn('[AC/DC] Dropped', (rawChain?.length || 0) - cleanRawChain.length,
      'stale derivationChain entries whose slotKey no longer matches the current graph. Re-pick affected slots in Step 6 if needed.');
  }
  const pipelineRefs = endpointSpec?.pipelineReferences || [];
  const sortedRawChain = orderChainPostOrder(slotsForSort, cleanRawChain, pipelineRefs);
  const columnMap = computeColumnMap(slotsForSort, sortedRawChain, pipelineRefs);

  // Debug: surface chain→columnMap mapping so we can see if any entry is empty
  console.log('[§3 columnMap]', {
    chainLen: sortedRawChain.length,
    liveKeys: Array.from(liveKeys).slice(0, 5),
    mapKeys: Object.keys(columnMap),
    firstMap: sortedRawChain[0] ? columnMap[sortedRawChain[0].slotKey] : null
  });

  // Analysis-level chain-lookup: build role→column for the analysis transform's
  // own measure bindings so execute_cube doesn't fall back to concept-keyed
  // names that don't match the derived __col_ columns.
  const analysisInputColumns = computeAnalysisInputColumns(
    slotsForSort, sortedRawChain, pipelineRefs, analysisTx
  );
  console.log('[§3.7 analysisInputColumns]', analysisInputColumns);
  // Attach to the analysis object so R's execute_cube can apply the override.
  // `singleAnalysis` is held by reference inside `patchedSpec.analyses`, so
  // mutating it here propagates into the serialised spec_json.
  singleAnalysis.analysisInputColumns = analysisInputColumns;

  const dimensionOverrides = endpointSpec?.dimensionOverrides || {};
  const conceptCategories = appState.conceptCategories?.categories || {};

  const derivationChain = sortedRawChain
    .filter(entry => entry.derivationOid)
    .map(entry => {
      const transform = txLib.find(t => t.oid === entry.derivationOid);
      if (!transform) return null;
      // Resolve conceptCategory bindings → concrete concepts using:
      //   1. per-slot Step 6 override
      //   2. per-endpoint Step 3 category pick (cascades across all slots)
      //   3. category's first member
      const endpointPicks = endpointSpec?.dimensionCategoryPicks || {};
      const resolvedBindings = (transform.bindings || []).map((b, i) => {
        if (!b.conceptCategory) return b;
        const override = dimensionOverrides[entry.slotKey]?.[i]?.concept;
        const endpointPick = endpointPicks[b.conceptCategory];
        const fallback = conceptCategories[b.conceptCategory]?.members?.[0]?.concept;
        const concrete = override || endpointPick || b.concept || fallback;
        if (!concrete) return b;
        // Drop the category and inject the concrete concept
        const { conceptCategory: _drop, ...rest } = b;
        return { ...rest, concept: concrete };
      });
      // Merge library method configs + user overrides. Preserve native JS
      // types for array/object values (e.g. windowed-visit schedule) so R
      // can consume them as lists via configs$<name>. Only stringify scalars
      // so that existing numeric/string placeholders keep working.
      const normConfig = v => (v !== null && typeof v === 'object') ? v : String(v);
      const configValues = [
        ...(transform.methodConfigurations || []).map(mc =>
          ({ name: mc.configurationName, value: normConfig(mc.value) }))
      ];
      const userConfigs = derivConfigValues[entry.slotKey] || {};
      for (const [name, value] of Object.entries(userConfigs)) {
        const idx = configValues.findIndex(cv => cv.name === name);
        if (idx >= 0) configValues[idx] = { name, value: normConfig(value) };
        else configValues.push({ name, value: normConfig(value) });
      }

      // Auto-inject `parameter_label` config when the derivation declares an
      // output binding with methodRole="parameter_label" (e.g. T.UnitConversion).
      // The R callTemplate uses <parameter_label> as a placeholder to stamp the
      // endpoint's user-defined Parameter label (e.g. "Weight (kg)") onto every
      // converted row, so the downstream analysis cube can filter on it.
      const hasParamLabelOutput = (transform.bindings || []).some(b =>
        b.direction === 'output' && b.methodRole === 'parameter_label'
      );
      if (hasParamLabelOutput && !configValues.some(cv => cv.name === 'parameter_label')) {
        const paramLabel = getSpecParameterValue(epId, endpointSpec, study);
        if (paramLabel) configValues.push({ name: 'parameter_label', value: String(paramLabel) });
      }
      // BC Topic IN-filter: when the user linked BCs to a leaf under this
      // derivation, emit a constraint on Observation.Identification.Topic so
      // the engine narrows raw rows to those BCs before aggregating. This
      // applies to every derivation in the chain — once filtered, downstream
      // derivations see the narrowed dataset (the IN-clause is a no-op on
      // already-filtered rows). Without this gate, aggregations mix every
      // questionnaire TESTCD (NPI, DAS, ADAS, …) into the same sums/counts.
      const constraintValues = [];
      let bcInfo = getDerivationBCTopicDecode(endpointSpec, entry.slotKey, study);
      const terminalList = endpointSpec?.confirmedTerminals || [];
      if (!bcInfo) {
        // A terminal sits BELOW the derivation that reads it: a leaf's BC is on its
        // child slot (.../FirstValue/0/Timing/0), never on the leaf itself. Only a
        // DIRECT child counts — a derivation whose inputs are all chain outputs reads
        // no source rows, so inheriting a descendant leaf's filter would constrain
        // derived columns by a topic they never carried.
        const depth = String(entry.slotKey).split('/').length;
        const below = terminalList.filter(t => t.linkedBCIds?.length
          && String(t.slotKey).startsWith(entry.slotKey + '/')
          && String(t.slotKey).split('/').length === depth + 2);
        if (below.length) bcInfo = getDerivationBCTopicDecode(endpointSpec, below[0].slotKey, study);
      }
      if (!bcInfo) {
        // Chain-wide fallback, valid ONLY when every BC terminal names the same
        // topic set — one family of concepts, as with the 11 ADAS items, where
        // narrowing downstream steps to that family is a no-op. When a chain draws
        // on several distinct BCs (progression, randomisation, death) borrowing one
        // leaf's filter for an unrelated derivation is simply wrong: it filtered the
        // progression leaf to randomisation records and left nothing to aggregate.
        const sets = terminalList
          .filter(t => t.linkedBCIds?.length)
          .map(t => (getDerivationBCTopicDecode(endpointSpec, t.slotKey, study)?.decodes || []).join('|'))
          .filter(Boolean);
        if (new Set(sets).size === 1) {
          const first = terminalList.find(t => t.linkedBCIds?.length);
          bcInfo = getDerivationBCTopicDecode(endpointSpec, first.slotKey, study);
        }
      }
      if (bcInfo) {
        // Single-BC path keeps scalar (back-compat); multi-BC emits array
        // which R's filter loop handles via %in%.
        const value = (bcInfo.decodes && bcInfo.decodes.length > 1) ? bcInfo.decodes : bcInfo.decode;
        // A BC identifying a FAMILY of records (one per subject, reason varies)
        // carries no assigned value, so the resolver returns the NCI concept
        // code. That never appears in a Topic column — filtering on it selects
        // nothing. Such a BC constrains through its slice instead.
        const isConceptCode = (v) => typeof v === 'string' && /^C\d+$/.test(v);
        if (value && !(Array.isArray(value) ? value.every(isConceptCode) : isConceptCode(value))) {
          constraintValues.push({
            dimension: _conceptForBcVariable(bcInfo.sourceVariable, transform),
            value
          });
        }
      }
      const resolvedSlices = resolveDerivationSlices(
        transform, entry.slotKey, dimensionOverrides, conceptCategories,
        endpointSpec?.derivationSliceOverrides, endpointPicks,
        getSpecParameterValue(epId, endpointSpec, study),
        endpointSpec
      );
      const cols = columnMap[entry.slotKey] || {};
      return {
        slotKey: entry.slotKey,
        method: { oid: transform.usesMethod },
        resolvedBindings,
        configurationValues: configValues,
        constraintValues,
        resolvedSlices,
        outputColumn: cols.outputColumn || null,
        inputColumns: cols.inputColumns || {},
        sourceStore: userConfigs.sourceStore || null,
        sourceDomain: userConfigs.sourceDomain || null
      };
    })
    .filter(Boolean);
  console.log('%c[AC/DC] derivationChain: ' + derivationChain.length + ' entries', 'color:blue;font-weight:bold', derivationChain);
  if (derivationChain.length > 0) {
    console.log('%c[AC/DC] First derivation configs:', 'color:blue', derivationChain[0].configurationValues);
    console.log('%c[AC/DC] First derivation bindings:', 'color:blue', derivationChain[0].resolvedBindings?.length, 'bindings');
  }
  const unitConversions = appState.unitConversions || null;
  const rImplCatalog = derivationChain.length > 0
    ? Object.values(appState.methodImplementationCatalog?.implementations || {}).flat().filter(i => i.language === 'R')
    : null;

  const availableDatasets = getLoadedDatasets().map(d => d.name);
  const presentationStore = _resolvePresentationStore(appState.modelViewMode);
  const payload = generateExecutionPayload(
    patchedSpec, appState.conceptMappings, effectiveOverrides, methodDef, rImpl,
    derivationChain, unitConversions, rImplCatalog, availableDatasets,
    appState.conceptCategories, presentationStore
  );

  _setAnalysisResult(epId, aIdx, { status: 'running', results: null, error: null });
  renderExecuteAnalysis(container);

  try {
    await setJsonVariable('spec_json', payload.specJson);
    await setJsonVariable('mapping_json', payload.mappingJson);
    await setJsonVariable('method_json', payload.methodJson);
    await setJsonVariable('r_impl_json', payload.rImplJson);
    if (payload.overridesJson !== 'NULL') {
      await setJsonVariable('overrides_json', payload.overridesJson);
    }
    if (payload.derivationsJson !== 'null') {
      await setJsonVariable('derivations_json', payload.derivationsJson);
    }
    if (payload.unitConversionsJson !== 'null') {
      await setJsonVariable('unit_conversions_json', payload.unitConversionsJson);
    }
    if (payload.rImplsJson !== 'null') {
      await setJsonVariable('r_impls_json', payload.rImplsJson);
    }
    if (payload.conceptCategoriesJson !== 'null') {
      await setJsonVariable('concept_categories_json', payload.conceptCategoriesJson);
    }

    const result = await executeR(payload.bootstrapCode);

    if (result.success) {
      let parsed = result.result;
      try {
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        else if (parsed?.values) parsed = JSON.parse(parsed.values[0]);
      } catch (e) { /* keep as-is */ }

      // Check for engine-level errors caught by the bootstrap tryCatch
      if (parsed?.engine_error) {
        const errMsg = parsed.engine_error + (parsed.console ? '\n\nConsole:\n' + parsed.console : '');
        _setAnalysisResult(epId, aIdx, { status: 'error', results: null, error: errMsg });
      } else {
        // Attach console output to results for diagnostics
        const console = parsed?.console;
        if (console) delete parsed.console;
        // Persist analysisInputColumns alongside results so the Type III
        // renderer can map chain-lookup columns (__col_*) back to their
        // ADaM variable for display. The original analysis object in
        // resolvedSpec doesn't carry this — it's only stamped onto the
        // engine-bound `singleAnalysis` clone above.
        _setAnalysisResult(epId, aIdx, {
          status: 'complete', results: parsed, error: null, console,
          analysisInputColumns
        });
      }
    } else {
      _setAnalysisResult(epId, aIdx, { status: 'error', results: null, error: result.error });
    }
  } catch (err) {
    _setAnalysisResult(epId, aIdx, { status: 'error', results: null, error: err.message });
  }

  renderExecuteAnalysis(container);
}

/**
 * Batch execute — run every analysis on an endpoint sequentially. Sequential
 * rather than parallel because the WebR engine has shared global state
 * (spec_json, mapping_json, etc.) between calls.
 */
async function _executeAllAnalyses(container, epId) {
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === epId);
  if (!resolvedEp) return;
  const analyses = resolvedEp.analyses || [];
  for (let i = 0; i < analyses.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    await _executeAnalysis(container, epId, i);
  }
}

// ---------------------------------------------------------------------------
// Derivation pipeline summary for Execute panel
// ---------------------------------------------------------------------------

/**
 * Run only the derivation pipeline (no analysis) for diagnostic purposes.
 * Calls acdc_derive_only in the R engine and displays column diagnostics.
 */
async function _executeDerivationOnly(container, epId) {
  const resolvedEp = appState.resolvedSpec?.endpoints?.find(r => r.id === epId);
  if (!resolvedEp) return;

  try { await loadEngine(); } catch (err) {
    console.error('Failed to load engine:', err);
    return;
  }

  // Reuse the same derivation chain building logic from _executeAnalysis
  const rawChain = appState.endpointSpecs?.[epId]?.derivationChain || [];
  const derivConfigValues = appState.endpointSpecs?.[epId]?.derivationConfigValues || {};
  const txLib = [
    ...(appState.transformationLibrary?.derivationTransformations || []),
    ...(appState.transformationLibrary?.analysisTransformations || [])
  ];
  // Per-derivation BC Topic constraint resolution via shared helper
  const endpointSpec = appState.endpointSpecs?.[epId];
  const study = appState.selectedStudy;

  // Reorder to post-order (leaves first) so child aggregations run before
  // parent derivations consume their output columns.
  const fullLib = appState.transformationLibrary;
  const analysisTx = fullLib?.analysisTransformations?.find(
    t => t.oid === endpointSpec?.selectedTransformationOid
  );
  const confirmedKeys = new Set(
    (endpointSpec?.confirmedTerminals || []).map(t => t.slotKey)
  );
  const slotsForSort = analysisTx
    ? buildPipelineGraph(analysisTx, fullLib,
        endpointSpec?.selectedDerivations || {}, confirmedKeys,
        endpointSpec?.dimensionCategoryPicks || {},
        appState.conceptCategories?.categories || {})
    : [];
  const liveKeys = new Set();
  (function collect(list) {
    for (const s of (list || [])) { liveKeys.add(s.key); if (s.children?.length) collect(s.children); }
  })(slotsForSort);
  const cleanRawChain = (rawChain || []).filter(e => liveKeys.has(e.slotKey));
  if (cleanRawChain.length !== (rawChain || []).length) {
    console.warn('[AC/DC] Dropped', (rawChain?.length || 0) - cleanRawChain.length,
      'stale derivationChain entries whose slotKey no longer matches the current graph.');
  }
  const pipelineRefs = endpointSpec?.pipelineReferences || [];
  const sortedRawChain = orderChainPostOrder(slotsForSort, cleanRawChain, pipelineRefs);
  const columnMap = computeColumnMap(slotsForSort, sortedRawChain, pipelineRefs);

  console.log('[§3 columnMap DERIV-ONLY]', {
    chainLen: sortedRawChain.length,
    liveKeys: Array.from(liveKeys).slice(0, 5),
    mapKeys: Object.keys(columnMap),
    firstMap: sortedRawChain[0] ? columnMap[sortedRawChain[0].slotKey] : null
  });

  const dimensionOverrides = endpointSpec?.dimensionOverrides || {};
  const endpointPicks = endpointSpec?.dimensionCategoryPicks || {};
  const conceptCategoriesMap = appState.conceptCategories?.categories || {};

  const derivationChain = sortedRawChain.filter(e => e.derivationOid).map(entry => {
    const transform = txLib.find(t => t.oid === entry.derivationOid);
    if (!transform) return null;
    const resolvedBindings = (transform.bindings || []).map((b, i) => {
      if (!b.conceptCategory) return b;
      const override = dimensionOverrides[entry.slotKey]?.[i]?.concept;
      const endpointPick = endpointPicks[b.conceptCategory];
      const fallback = conceptCategoriesMap[b.conceptCategory]?.members?.[0]?.concept;
      const concrete = override || endpointPick || b.concept || fallback;
      if (!concrete) return b;
      const { conceptCategory: _drop, ...rest } = b;
      return { ...rest, concept: concrete };
    });
    const normConfig2 = v => (v !== null && typeof v === 'object') ? v : String(v);
    const configValues = [...(transform.methodConfigurations || []).map(mc =>
      ({ name: mc.configurationName, value: normConfig2(mc.value) }))];
    const userConfigs = derivConfigValues[entry.slotKey] || {};
    for (const [name, value] of Object.entries(userConfigs)) {
      const idx = configValues.findIndex(cv => cv.name === name);
      if (idx >= 0) configValues[idx] = { name, value: normConfig2(value) };
      else configValues.push({ name, value: normConfig2(value) });
    }

    // Mirror _executeAnalysis: auto-inject parameter_label for derivations
    // declaring an output binding with methodRole="parameter_label" (T.UnitConversion).
    const hasParamLabelOutput2 = (transform.bindings || []).some(b =>
      b.direction === 'output' && b.methodRole === 'parameter_label'
    );
    if (hasParamLabelOutput2 && !configValues.some(cv => cv.name === 'parameter_label')) {
      const paramLabel = getSpecParameterValue(epId, endpointSpec, study);
      if (paramLabel) configValues.push({ name: 'parameter_label', value: String(paramLabel) });
    }

    // BC Topic IN-filter: when the user linked BCs to a leaf under this
    // derivation, emit a constraint on Observation.Identification.Topic so
    // the engine narrows raw rows to those BCs before aggregating. Mirrors
    // the analyse-path constraint construction.
    const constraintValues = [];
    let bcInfo = getDerivationBCTopicDecode(endpointSpec, entry.slotKey, study);
    const terminalList = endpointSpec?.confirmedTerminals || [];
    if (!bcInfo) {
      // A terminal sits BELOW the derivation that reads it: a leaf's BC is on its
      // child slot (.../FirstValue/0/Timing/0), never on the leaf itself. Only a
      // DIRECT child counts — a derivation whose inputs are all chain outputs reads
      // no source rows, so inheriting a descendant leaf's filter would constrain
      // derived columns by a topic they never carried.
      const depth = String(entry.slotKey).split('/').length;
      const below = terminalList.filter(t => t.linkedBCIds?.length
        && String(t.slotKey).startsWith(entry.slotKey + '/')
        && String(t.slotKey).split('/').length === depth + 2);
      if (below.length) bcInfo = getDerivationBCTopicDecode(endpointSpec, below[0].slotKey, study);
    }
    if (!bcInfo) {
      // Chain-wide fallback, valid ONLY when every BC terminal names the same
      // topic set — one family of concepts, as with the 11 ADAS items, where
      // narrowing downstream steps to that family is a no-op. When a chain draws
      // on several distinct BCs (progression, randomisation, death) borrowing one
      // leaf's filter for an unrelated derivation is simply wrong: it filtered the
      // progression leaf to randomisation records and left nothing to aggregate.
      const sets = terminalList
        .filter(t => t.linkedBCIds?.length)
        .map(t => (getDerivationBCTopicDecode(endpointSpec, t.slotKey, study)?.decodes || []).join('|'))
        .filter(Boolean);
      if (new Set(sets).size === 1) {
        const first = terminalList.find(t => t.linkedBCIds?.length);
        bcInfo = getDerivationBCTopicDecode(endpointSpec, first.slotKey, study);
      }
    }
    if (bcInfo) {
      const value = (bcInfo.decodes && bcInfo.decodes.length > 1) ? bcInfo.decodes : bcInfo.decode;
      // A BC that identifies a FAMILY of records rather than one type carries no
      // assigned value, so the resolver falls back to the NCI concept code. That
      // code never appears in a Topic column — emitting it as a filter would
      // select nothing. Such a BC constrains via its slice instead.
      const isConceptCode = (v) => typeof v === 'string' && /^C\d+$/.test(v);
      if (value && !(Array.isArray(value) ? value.every(isConceptCode) : isConceptCode(value))) {
        constraintValues.push({
          dimension: _conceptForBcVariable(bcInfo.sourceVariable, transform),
          value
        });
      }
    }
    const resolvedSlices = resolveDerivationSlices(
      transform, entry.slotKey, dimensionOverrides, conceptCategoriesMap,
      endpointSpec?.derivationSliceOverrides, endpointPicks,
      getSpecParameterValue(epId, endpointSpec, study),
      endpointSpec
    );
    const cols = columnMap[entry.slotKey] || {};
    const result = {
      slotKey: entry.slotKey,
      method: { oid: transform.usesMethod },
      resolvedBindings,
      configurationValues: configValues,
      constraintValues,
      resolvedSlices,
      outputColumn: cols.outputColumn || null,
      inputColumns: cols.inputColumns || {}
    };
    console.log('[derivation]', transform.oid, 'constraintValues:', JSON.stringify(constraintValues));
    return result;
  }).filter(Boolean);

  if (derivationChain.length === 0) {
    // Surface this — silent no-op was confusing for users whose spec saved
    // an empty derivationChain or had all entries pruned for stale slotKeys.
    console.warn('[derivation-only]', epId, 'has no executable derivation chain. Check Step 6 selections and console above for stale-key pruning warnings.');
    const resultStateW = _ensureEndpointResult(epId);
    resultStateW.derivationOnlyMessage = 'No derivations to execute. Check Step 6 — pick a derivation for each chain slot, or upload data with the source columns this transformation expects.';
    renderExecuteAnalysis(container);
    return;
  }

  const resultState = _ensureEndpointResult(epId);
  const datasets = getLoadedDatasets();
  const selectedDataset = resultState.datasetOverride || datasets[0]?.name;
  const datasetName = (selectedDataset || 'addata').toLowerCase();

  const specJson = JSON.stringify({
    targetStore: resolvedEp.targetStore || 'adam',
    targetDataset: selectedDataset
  });
  const mappingJson = JSON.stringify(appState.conceptMappings);
  const derivationsJson = JSON.stringify(derivationChain);
  const unitConversionsJson = JSON.stringify(appState.unitConversions || null);
  const rImplCatalog = Object.values(appState.methodImplementationCatalog?.implementations || {}).flat().filter(i => i.language === 'R');
  const rImplsJson = JSON.stringify(rImplCatalog);
  // The "display this dataset" preview store. The user picks one of
  // {adam, sdtm, omop, fhir} (combined or pure form) in the header toggle;
  // we collapse that to the bare store key here. Concept-only mode keeps the
  // engine-internal concept keys visible — diagnostic fallback.
  const presentationStore = _resolvePresentationStore(appState.modelViewMode);

  try {
    await setJsonVariable('spec_json', specJson);
    await setJsonVariable('mapping_json', mappingJson);
    await setJsonVariable('derivations_json', derivationsJson);
    await setJsonVariable('unit_conversions_json', unitConversionsJson);
    await setJsonVariable('r_impls_json', rImplsJson);

    const allDatasetNames = datasets.map(d => d.name);
    const code = [
      `spec <- jsonlite::fromJSON(spec_json, simplifyVector = FALSE)`,
      `all_mappings <- jsonlite::fromJSON(mapping_json, simplifyVector = FALSE)`,
      `target_store <- spec$targetStore; if (is.null(target_store)) target_store <- "adam"`,
      `mappings <- all_mappings[[target_store]]; if (is.null(mappings)) mappings <- all_mappings$adam`,
      `derivations <- jsonlite::fromJSON(derivations_json, simplifyVector = FALSE)`,
      `unit_conversions <- jsonlite::fromJSON(unit_conversions_json, simplifyVector = FALSE)`,
      `r_impls <- jsonlite::fromJSON(r_impls_json, simplifyVector = FALSE)`,
      `dataset <- get("${datasetName}")`,
      `available_datasets <- c(${allDatasetNames.map(d => `"${d}"`).join(', ')})`,
      `presentation_store <- ${presentationStore ? `"${presentationStore}"` : 'NULL'}`,
      `result <- acdc_derive_only(spec, mappings, dataset, derivations, unit_conversions, r_impls, all_mappings, available_datasets, presentation_store = presentation_store)`,
      `jsonlite::toJSON(result, auto_unbox = TRUE, pretty = TRUE, digits = NA)`  // digits = NA keeps full precision: jsonlite defaults to 4 decimal
      // places, which serialises a p-value of 1.6e-05 as 0.
    ].join('\n');

    const result = await executeR(code);
    if (result.success) {
      let parsed = result.result;
      try {
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        else if (parsed?.values) parsed = JSON.parse(parsed.values[0]);
      } catch (e) { /* keep */ }
      resultState.derivationOnly = parsed;
    } else {
      resultState.derivationOnly = { error: result.error };
    }
  } catch (err) {
    resultState.derivationOnly = { error: err.message };
  }

  renderExecuteAnalysis(container);
}

/**
 * Build resolved R code for the derivation chain by walking each entry in
 * execution (post-) order, looking up its R implementation, and
 * substituting role/config placeholders. Uses transformation-linker's
 * computeColumnMap to assign unique chain-lookup column names
 * (`__col_T_*_<role>_<idx>`) — same names the R engine produces at runtime —
 * so the resolved code is a faithful, runnable mirror of what eval()s.
 */
function _renderChainResolvedCode(ep) {
  const spec = appState.endpointSpecs?.[ep.id];
  if (!spec) return '';
  const rawChain = spec.derivationChain || [];
  if (rawChain.length === 0) return '';

  const fullLib = appState.transformationLibrary;
  const txLib = [
    ...(fullLib?.derivationTransformations || []),
    ...(fullLib?.analysisTransformations || [])
  ];
  const analysisTx = fullLib?.analysisTransformations?.find(
    t => t.oid === spec.selectedTransformationOid
  );
  if (!analysisTx) return '';

  // Reuse the same chain-building pipeline as _executeAnalysis so the
  // chain-lookup column names align with what the engine actually uses.
  const confirmedKeys = new Set((spec.confirmedTerminals || []).map(t => t.slotKey));
  const slotsForSort = buildPipelineGraph(
    analysisTx, fullLib,
    spec.selectedDerivations || {}, confirmedKeys,
    spec.dimensionCategoryPicks || {},
    appState.conceptCategories?.categories || {}
  );
  const liveKeys = new Set();
  (function collect(list) {
    for (const s of (list || [])) { liveKeys.add(s.key); if (s.children?.length) collect(s.children); }
  })(slotsForSort);
  const cleanRawChain = rawChain.filter(e => liveKeys.has(e.slotKey));
  const pipelineRefs = spec.pipelineReferences || [];
  const sortedChain = orderChainPostOrder(slotsForSort, cleanRawChain, pipelineRefs);
  const columnMap = computeColumnMap(slotsForSort, sortedChain, pipelineRefs);

  // R impl catalog (flatten across methods, filter to R, language-key by oid)
  const allImpls = Object.values(appState.methodImplementationCatalog?.implementations || {})
    .flat()
    .filter(i => i.language === 'R');
  const rImplByOid = {};
  for (const i of allImpls) rImplByOid[i.methodOid] = i;

  const adam = appState.conceptMappings?.adam || {};
  const methodTypeByOid = {};
  for (const m of (appState.methodsIndex?.methods || [])) {
    if (m.oid) methodTypeByOid[m.oid] = m.type;
  }

  const blocks = [];
  let stepN = 1;
  for (const rawEntry of sortedChain) {
    const transform = txLib.find(t => t.oid === rawEntry.derivationOid);
    if (!transform) continue;
    const usesMethod = transform.usesMethod;
    // Skip analysis-typed entries — those have their own resolved-code pane below
    if (methodTypeByOid[usesMethod] === 'analysis') continue;

    // Augment the entry with chain-lookup overrides + a resolvedBindings
    // copy that knows about constraint values. We rebuild a minimal version
    // here — the full version (with slice resolution etc.) is built at
    // execute time, but for display the column map is what matters.
    //
    // Configs come from two sources, in increasing precedence:
    //   1. transform.methodConfigurations — the library default values that
    //      bake in the method's role (e.g. agg_func='sum' for T.ADAS_Sum…).
    //   2. spec.derivationConfigValues[slotKey] — per-instance overrides
    //      the user set in Step 6. Same merge order as _executeAnalysis.
    const cols = columnMap[rawEntry.slotKey] || {};
    const configMap = new Map();
    for (const mc of (transform.methodConfigurations || [])) {
      if (mc?.configurationName != null) configMap.set(mc.configurationName, mc.value);
    }
    for (const [name, value] of Object.entries(spec.derivationConfigValues?.[rawEntry.slotKey] || {})) {
      configMap.set(name, value);
    }
    const entry = {
      ...rawEntry,
      outputColumn: cols.outputColumn || null,
      inputColumns: cols.inputColumns || {},
      resolvedBindings: transform.bindings || [],
      configurationValues: [...configMap.entries()].map(([name, value]) => ({ name, value }))
    };

    const impl = rImplByOid[usesMethod];
    let body;
    if (!impl?.callTemplate) {
      body = `# (no R implementation registered for ${usesMethod})`;
    } else {
      body = resolveDerivationCallTemplate(
        entry, transform, impl, adam,
        spec.dimensionCategoryPicks || {},
        appState.conceptCategories?.categories || {}
      ) || '# (resolver returned empty)';
    }
    blocks.push(`# Step ${stepN++} — ${transform.name}  (${usesMethod})\n${body}`);
  }

  if (blocks.length === 0) return '';

  const code = [
    `# AC/DC derivation chain — runs on the concept-keyed cube (concept_data).`,
    `# Each block is the resolved R for one transformation step, in execution order.`,
    `# Chain-output columns use __col_* names so sibling derivations producing the`,
    `# same concept don't collide on merge — same convention used by acdc_engine.R.`,
    ``,
    blocks.join('\n\n')
  ].join('\n');

  return `
    <details class="exec-bindings-section" style="margin-top:10px; background:rgba(0,0,0,0.02); border:1px solid var(--cdisc-border); border-radius:var(--radius); padding:8px 12px;">
      <summary style="cursor:pointer; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--cdisc-text-secondary);">
        Resolved R Code &mdash; Derivation Chain
        <span style="font-weight:400; text-transform:none; letter-spacing:0; margin-left:6px; color:var(--cdisc-text-secondary);">
          ${blocks.length} step${blocks.length === 1 ? '' : 's'}
        </span>
      </summary>
      <pre class="exec-code-pre" style="margin:8px 0 0; max-height:420px; overflow:auto;">${_escapeHtml(code)}</pre>
    </details>`;
}

function _renderDerivationSummary(ep, result) {
  const rawChain = appState.endpointSpecs?.[ep.id]?.derivationChain || [];
  const derivConfigValues = appState.endpointSpecs?.[ep.id]?.derivationConfigValues || {};
  const txLib = [
    ...(appState.transformationLibrary?.derivationTransformations || []),
    ...(appState.transformationLibrary?.analysisTransformations || [])
  ];

  const derivations = rawChain
    .filter(entry => entry.derivationOid)
    .map(entry => {
      const transform = txLib.find(t => t.oid === entry.derivationOid);
      const configs = derivConfigValues[entry.slotKey] || {};
      return { entry, transform, configs };
    })
    .filter(d => d.transform);

  if (derivations.length === 0) return '';

  // Check if there's a derivation-only result stored
  const derivResult = appState.endpointResults[ep.id]?.derivationOnly;
  const derivMessage = appState.endpointResults[ep.id]?.derivationOnlyMessage;

  // Overall pipeline status reflects the most recent execution. Two paths can
  // exercise the derivation chain:
  //   (a) Full analysis execute — chain runs as Step 2 of acdc_execute. Errors
  //       before Step 5 mean the chain failed. Status comes from analysisResults.
  //   (b) "Run Derivation Only" button — runs acdc_derive_only; result lands in
  //       derivationOnly. Has its own success/error signal.
  // Per-step granularity would require the engine to emit a structured per-
  // derivation status array; for now we color all steps with the overall.
  // NOTE: result.analysisResults is an OBJECT keyed by analysis index (see
  // `_ensureEndpointResult`), not an array — must iterate via Object.values.
  const analysisStatuses = Object.values(result?.analysisResults || {});
  const anyComplete = analysisStatuses.some(a => a?.status === 'complete');
  const anyRunning = analysisStatuses.some(a => a?.status === 'running');
  const anyError = analysisStatuses.some(a => a?.status === 'error');
  const derivOnlyHasError = !!derivResult?.error;
  const derivOnlyComplete = !!derivResult && !derivResult.error;
  const pipelineStatus = anyRunning ? 'running'
    : anyError ? 'error'
    : anyComplete ? 'complete'
    : derivOnlyHasError ? 'error'
    : derivOnlyComplete ? 'complete'
    : 'pending';
  const statusBadge = pipelineStatus === 'running'
      ? '<span class="badge badge-blue" style="font-size:10px;">Running…</span>'
    : pipelineStatus === 'complete'
      ? '<span class="badge badge-teal" style="font-size:10px;">✓ Complete</span>'
    : pipelineStatus === 'error'
      ? '<span class="badge" style="font-size:10px; background:var(--cdisc-error); color:white;">✗ Failed</span>'
    : '<span style="font-size:10px; color:var(--cdisc-text-secondary);">Not yet run</span>';

  // Step-status dot color follows the overall pipeline status. Pending = gray.
  const stepDotColor = pipelineStatus === 'complete' ? 'var(--cdisc-success, #22863a)'
    : pipelineStatus === 'error' ? 'var(--cdisc-error, #cb2431)'
    : pipelineStatus === 'running' ? 'var(--cdisc-primary, #0366d6)'
    : 'var(--cdisc-text-secondary, #888)';
  const stepDot = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${stepDotColor};"></span>`;

  // methodsIndex tags each method with type: "analysis" | "derivation".
  // Filter out any chain entries whose method is type=analysis — those are
  // rendered separately as the interactive analysis sub-card below the
  // pipeline (with variable/slice selects), so showing them again here
  // would be redundant.
  const methodTypeByOid = {};
  for (const m of (appState.methodsIndex?.methods || [])) {
    if (m.oid) methodTypeByOid[m.oid] = m.type;
  }
  const isAnalysisMethod = (oid) => methodTypeByOid[oid] === 'analysis';
  const derivationSteps = derivations.filter(d => !isAnalysisMethod(d.transform.usesMethod));
  const derivationCount = derivationSteps.length;

  // Compact "Execution Order" panel — derivation rows only. The analysis
  // step is the interactive sub-card below this panel.
  const orderHtml = derivationSteps.map((d, i) => `
    <div style="display:grid; grid-template-columns:20px 28px 1fr auto; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid var(--cdisc-border);">
      <div>${stepDot}</div>
      <div style="font-size:11px; font-weight:700; color:var(--cdisc-text-secondary); text-align:right;">${i + 1}.</div>
      <div>
        <div style="font-size:12px; color:var(--cdisc-text);">${_escapeHtml(d.transform.name || d.transform.oid)}</div>
        <div style="font-size:10px; color:var(--cdisc-text-secondary);">concept: <code>${_escapeHtml(d.entry.concept || '')}</code></div>
      </div>
      <span class="badge badge-secondary" style="font-size:10px;">${_escapeHtml(d.transform.usesMethod || '')}</span>
    </div>
  `).join('');
  const analysisRootRow = '';

  return `
    <details class="exec-bindings-section" style="margin:8px 0; padding:10px 14px; background:rgba(13,110,253,0.04); border:1px solid var(--cdisc-primary); border-radius:var(--radius);">
      <summary style="display:flex; align-items:center; gap:10px; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:var(--cdisc-primary); cursor:pointer; list-style:revert;">
        Derivation Pipeline (runs before analysis)
        ${statusBadge}
        <button class="btn btn-sm exec-derive-only-btn" data-ep-id="${ep.id}" style="margin-left:auto; font-size:11px; padding:2px 8px;" onclick="event.stopPropagation();">Run Derivation Only</button>
      </summary>
      <div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--cdisc-border);">
        <div style="font-size:11px; font-weight:600; color:var(--cdisc-text-secondary); margin-bottom:6px;">
          ${derivationCount} derivation${derivationCount === 1 ? '' : 's'} (analysis configured below)
        </div>
        ${orderHtml}
        ${analysisRootRow}
      </div>

      <!-- Resolved R Code (chain) — generated from method callTemplates + the
           chain-lookup column map. Same code the engine eval()s at runtime;
           viewers see what would run in their validated R environment. -->
      ${_renderChainResolvedCode(ep)}

      <details class="exec-deriv-details" style="margin-top:10px;">
        <summary style="font-size:11px; color:var(--cdisc-text-secondary); cursor:pointer; padding:4px 0;">Show full bindings &amp; cube details</summary>
      ${derivMessage && !derivResult ? `
      <div style="margin-top:6px; padding:8px 10px; background:rgba(255,193,7,0.1); border:1px solid var(--cdisc-warning, #ffc107); border-radius:var(--radius); font-size:11px;">
        ${_escapeHtml(derivMessage)}
      </div>` : ''}
      ${derivResult ? `
      <div style="margin-top:6px; padding:8px 10px; background:rgba(0,0,0,0.03); border-radius:var(--radius); font-size:11px; font-family:var(--font-mono);">
        ${(() => {
          // jsonlite::toJSON(auto_unbox=TRUE) collapses single-element character
          // vectors to JSON strings instead of single-element arrays. Normalise
          // every "list-of-strings" field on derivResult so the renderer can
          // treat them uniformly without TypeError on .join().
          const arr = (v) => v == null ? [] : Array.isArray(v) ? v : [v];
          const original_columns = arr(derivResult.original_columns);
          const ingested_columns = arr(derivResult.ingested_columns);
          const final_columns = arr(derivResult.final_columns);
          const enriched_dimensions = arr(derivResult.enriched_dimensions);
          const log = arr(derivResult.derivation_log);
          return `
        ${derivResult.error ? `<div style="color:var(--cdisc-error);"><strong>Error:</strong> ${_escapeHtml(derivResult.error)}</div>` : ''}
        <div><strong>Store:</strong> ${derivResult.detected_store || '?'} (${derivResult.match_count || 0} column matches${derivResult.domain_code ? `, domain=${derivResult.domain_code}` : ''})</div>
        <div><strong>Ingest:</strong> ${original_columns.join(', ')} → ${ingested_columns.join(', ')}</div>
        <div><strong>Final columns:</strong> ${final_columns.join(', ')}</div>
        <div><strong>Rows:</strong> ${derivResult.nrow || '?'}</div>
        ${log.map((d, i) => {
          const newCols = arr(d.new_columns);
          const colsAtFailure = arr(d.columns_at_failure);
          return `
          <div style="margin-top:4px;">
            <strong>#${i + 1} ${d.method || '?'}:</strong> ${d.status}
            ${newCols.length ? `<br>New columns: <code>${newCols.join(', ')}</code>` : ''}
            ${colsAtFailure.length ? `<br>Columns at failure: <code>${colsAtFailure.join(', ')}</code>` : ''}
          </div>`;
        }).join('')}
        ${enriched_dimensions.length ? `
          <div style="margin-top:4px;"><strong>Enriched dimensions:</strong> <code>${enriched_dimensions.join(', ')}</code> (merged from other datasets by Subject)</div>
        ` : ''}`;
        })()}
        ${derivResult.data_preview ? (() => {
          const preview = derivResult.data_preview;
          // jsonlite serializes data.frames as arrays of row objects
          const rowArr = Array.isArray(preview) ? preview : [preview];
          if (rowArr.length === 0) return '';
          const cols = Object.keys(rowArr[0] || {});
          if (cols.length === 0) return '';
          const storeLabel = (derivResult.data_preview_store || 'adam').toUpperCase();
          return '<div style="margin-top:8px; overflow-x:auto;"><strong>Data preview (' + storeLabel + ' columns, first ' + rowArr.length + ' rows):</strong>' +
            '<table class="exec-bindings-table" style="margin-top:4px; font-size:10px;"><thead><tr>' +
            cols.map(c => '<th>' + _escapeHtml(c) + '</th>').join('') +
            '</tr></thead><tbody>' +
            rowArr.map(row => '<tr>' + cols.map(c => {
              const v = row[c]; return '<td>' + _escapeHtml(v == null ? '' : String(v)) + '</td>';
            }).join('') + '</tr>').join('') +
            '</tbody></table></div>';
        })() : ''}
      </div>` : ''}
      ${derivations.map((d, i) => {
        const t = d.transform;
        const bindings = t.bindings || [];
        const inputBindings = bindings.filter(b => b.direction !== 'output');
        const outputBindings = bindings.filter(b => b.direction === 'output');
        // BC constraint resolution
        let bcInfo = getDerivationBCTopicDecode(appState.endpointSpecs?.[ep.id], d.entry.slotKey, appState.selectedStudy);
        if (!bcInfo) {
          const epSpec = appState.endpointSpecs?.[ep.id];
          for (const term of (epSpec?.confirmedTerminals || [])) {
            if (term.linkedBCIds?.length) {
              bcInfo = getDerivationBCTopicDecode(epSpec, term.slotKey, appState.selectedStudy);
              if (bcInfo) break;
            }
          }
        }
        const sourceStore = d.configs.sourceStore || '';
        const sourceDomain = d.configs.sourceDomain || '';
        return `
        <div style="padding:8px 0; font-size:12px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span class="badge badge-secondary">#${i + 1}</span>
            <strong>${t.name || t.oid}</strong>
            <span style="color:var(--cdisc-text-secondary);">${t.usesMethod || ''}</span>
          </div>

          <!-- Derivation bindings -->
          <div class="exec-bindings-section" style="margin-bottom:8px;">
            <div class="exec-bindings-title">BINDINGS</div>
            <table class="exec-bindings-table">
              <thead><tr><th>Role</th><th>Concept</th><th>Direction</th><th>Type</th></tr></thead>
              <tbody>
                ${inputBindings.map(b => `<tr>
                  <td>${b.methodRole || ''}</td>
                  <td><code>${(b.concept || '').replace(/@.*/, '')}${b.qualifierValue ? '.' + b.qualifierValue : ''}</code></td>
                  <td>input</td>
                  <td>${b.dataStructureRole || ''}</td>
                </tr>`).join('')}
                ${outputBindings.map(b => `<tr style="background:rgba(0,133,124,0.04);">
                  <td>${b.methodRole || ''}</td>
                  <td><code>${(b.concept || '').replace(/@.*/, '')}${b.qualifierValue ? '.' + b.qualifierValue : ''}</code></td>
                  <td><span class="badge badge-teal" style="font-size:9px;">output</span></td>
                  <td>${b.dataStructureRole || ''}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>

          <!-- Input cube / constraint -->
          <div class="exec-bindings-section" style="margin-bottom:8px;">
            <div class="exec-bindings-title">INPUT CUBE</div>
            <table class="exec-bindings-table">
              <thead><tr><th>Dimension</th><th>Value</th><th>Source</th></tr></thead>
              <tbody>
                ${bcInfo ? (() => {
                  // Render multi-BC as an IN-list and show every BC's name as a source chip.
                  // bcInfo.decodes/bcNames are arrays (post Topic-from-synonyms fix); fall back to
                  // singular fields for callers/BCs that still produce a single decode.
                  const decodes = (bcInfo.decodes && bcInfo.decodes.length > 0) ? bcInfo.decodes : [bcInfo.decode].filter(Boolean);
                  const names = (bcInfo.bcNames && bcInfo.bcNames.length > 0) ? bcInfo.bcNames : [bcInfo.bcName].filter(Boolean);
                  const valueCell = decodes.length > 1
                    ? `IN [ <code>${decodes.join('</code>, <code>')}</code> ]`
                    : `<code>${decodes[0] || ''}</code>`;
                  const sourceCell = names.map(n =>
                    `<span class="badge" style="background:var(--cdisc-primary-light);color:var(--cdisc-primary);font-size:9px; margin-right:4px;">BC: ${n}</span>`
                  ).join('');
                  return `<tr>
                    <td>Observation.Identification.Topic</td>
                    <td>${valueCell}</td>
                    <td>${sourceCell}</td>
                  </tr>`;
                })() : `<tr><td colspan="3" style="color:var(--cdisc-text-secondary);">No BC linked — derivation runs on all rows</td></tr>`}
                <tr>
                  <td>Source Store</td>
                  <td>
                    <select class="exec-deriv-config-input config-select" data-ep-id="${ep.id}" data-slot-key="${d.entry.slotKey}" data-config-key="sourceStore" style="font-size:11px; padding:2px 6px;">
                      <option value="">auto-detect</option>
                      ${Object.keys(appState.conceptMappings || {}).map(k => `<option value="${k}" ${k === sourceStore ? 'selected' : ''}>${k}</option>`).join('')}
                    </select>
                  </td>
                  <td style="font-size:10px; color:var(--cdisc-text-secondary);">auto-detected from uploaded data</td>
                </tr>
                <tr>
                  <td>Source Domain</td>
                  <td>
                    <input class="exec-deriv-config-input config-input" data-ep-id="${ep.id}" data-slot-key="${d.entry.slotKey}" data-config-key="sourceDomain"
                      value="${sourceDomain}" placeholder="auto" style="font-size:11px; padding:2px 6px; width:60px;">
                  </td>
                  <td style="font-size:10px; color:var(--cdisc-text-secondary);">domain code for -- prefix (e.g., VS, LB)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Configuration -->
          <div class="exec-bindings-section">
            <div class="exec-bindings-title">CONFIGURATION</div>
            <table class="exec-bindings-table">
              <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
              <tbody>
                ${Object.entries(d.configs).filter(([k]) => k !== 'sourceStore' && k !== 'sourceDomain').map(([k, v]) =>
                  `<tr><td>${k}</td><td><code>${v}</code></td></tr>`
                ).join('') || '<tr><td colspan="2" style="color:var(--cdisc-text-secondary);">No configuration</td></tr>'}
              </tbody>
            </table>
          </div>

          <!-- Output cube -->
          <div class="exec-bindings-section">
            <div class="exec-bindings-title">OUTPUT CUBE</div>
            <table class="exec-bindings-table">
              <thead><tr><th>Concept</th><th>Role</th><th>Type</th></tr></thead>
              <tbody>
                ${outputBindings.map(b => `<tr>
                  <td><code>${(b.concept || '').replace(/@.*/, '')}${b.qualifierValue ? '.' + b.qualifierValue : ''}</code></td>
                  <td>${b.methodRole || ''}</td>
                  <td>${b.dataStructureRole || ''}</td>
                </tr>`).join('') || '<tr><td colspan="3" style="color:var(--cdisc-text-secondary);">No output bindings</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`;
      }).join('')}
      </details>
    </details>`;
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the endpointResults slot exists and has the new shape. Silently
 * migrates the old single-analysis shape ({status, results, error}) into
 * analysisResults[0] so a user mid-session doesn't lose state.
 */
function _ensureEndpointResult(epId) {
  if (!appState.endpointResults[epId]) {
    appState.endpointResults[epId] = { analysisResults: {} };
  }
  const r = appState.endpointResults[epId];
  if (!r.analysisResults) {
    // Migrate legacy flat shape if present
    if (r.status || r.results || r.error) {
      r.analysisResults = { 0: { status: r.status, results: r.results, error: r.error } };
      delete r.status; delete r.results; delete r.error;
    } else {
      r.analysisResults = {};
    }
  }
  return r;
}

function _setAnalysisResult(epId, aIdx, patch) {
  const r = _ensureEndpointResult(epId);
  r.analysisResults[aIdx] = { ...(r.analysisResults[aIdx] || {}), ...patch };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render a comment block describing the cube extraction that the R engine
 * performs before the call template runs. Makes the standalone preview
 * honest: the user can see the slice constraints that filter `analysis_data`.
 *
 * Non-default slices inherit constraints from the default slice (Population,
 * etc.) — mirroring execute_cube's inheritance so baseline pulls don't leak
 * across populations.
 */
function _renderCubePreviewHeader(selectedDataset, slices, sliceOverrides, varOverrides) {
  if (!slices || slices.length === 0) return '';
  // Default slice: heuristic mirrors the R engine — the slice whose name
  // isn't claimed by a binding's b.slice attribute. We don't have bindings
  // here, so use convention: "endpoint" or the first slice.
  const defaultSlice = slices.find(s => s.name === 'endpoint') || slices[0];
  const defaultDims = defaultSlice?.resolvedValues || {};
  const renderConstraint = (sliceName, dim, val) => {
    const ovr = sliceOverrides?.[`${sliceName}|${dim}`] || {};
    const col = ovr.variable || varOverrides?.[dim] || dim;
    const value = ovr.value ?? val;
    return `${col} == ${JSON.stringify(value)}`;
  };
  const lines = [];
  lines.push(`# analysis_data is the cube extracted from ${selectedDataset || 'dataset'} by execute_cube():`);
  for (const s of slices) {
    const dims = s.resolvedValues || {};
    const isDefault = s === defaultSlice;
    const inheritedDims = isDefault ? {} :
      Object.fromEntries(Object.entries(defaultDims).filter(([d]) => !(d in dims)));
    const parts = [];
    for (const [dim, val] of Object.entries(dims)) {
      parts.push(renderConstraint(s.name, dim, val));
    }
    for (const [dim, val] of Object.entries(inheritedDims)) {
      // Inherited constraints come from the default slice — render with the
      // default slice's overrides, not this slice's.
      parts.push(renderConstraint(defaultSlice.name, dim, val) + '  # inherited from default');
    }
    if (parts.length > 0) {
      lines.push(`#   slice "${s.name}": ${parts.join(' & ')}`);
    }
  }
  return lines.join('\n');
}

/**
 * Build config map from method definition defaults + analysis overrides.
 * Mirrors the R engine's parse_configs() logic.
 */
function _buildConfigs(analysis, methodDef, liveOverrides) {
  const configs = {};
  // Method-level config defaults
  if (methodDef?.configurations) {
    for (const cfg of methodDef.configurations) {
      if (cfg.defaultValue != null) configs[cfg.name] = cfg.defaultValue;
    }
  }
  // Output-class-level config defaults (e.g., multiplicity_adjustment on contrasts)
  if (methodDef?.output_specification?.output_classes) {
    for (const oc of methodDef.output_specification.output_classes) {
      for (const cfg of oc.configurations || []) {
        if (cfg.defaultValue != null && !(cfg.name in configs)) {
          configs[cfg.name] = cfg.defaultValue;
        }
      }
    }
  }
  // Analysis-level overrides from serialized spec
  if (analysis?.configurationValues) {
    for (const cv of analysis.configurationValues) {
      const num = Number(cv.value);
      configs[cv.name] = isNaN(num) ? cv.value : num;
    }
  }
  // Live UI overrides (highest priority)
  for (const [name, value] of Object.entries(liveOverrides || {})) {
    const num = Number(value);
    configs[name] = isNaN(num) ? value : num;
  }
  return configs;
}

function _fmt(val) {
  if (val === null || val === undefined) return '--';
  if (typeof val === 'number') {
    if (Math.abs(val) < 0.001 && val !== 0) return val.toExponential(3);
    return Number.isInteger(val) ? val.toString() : val.toFixed(4);
  }
  return String(val);
}

function _escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function _escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function _styles() {
  return `<style>
    .exec-status { padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; }
    .exec-status-ready { background:rgba(40,167,69,0.1); color:#28a745; }
    .exec-endpoint-card { border:1px solid var(--cdisc-border); border-radius:var(--radius); padding:16px; margin-bottom:12px; }
    .exec-card-complete { border-left:3px solid #28a745; }
    .exec-card-running { border-left:3px solid var(--cdisc-primary); }
    .exec-card-error { border-left:3px solid var(--cdisc-error); }
    .exec-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .exec-card-meta { font-size:12px; color:var(--cdisc-text-secondary); display:flex; gap:16px; margin-bottom:12px; }
    .btn-sm { padding:4px 12px; font-size:12px; }

    /* Per-analysis sub-card */
    .exec-analysis-sub { border:1px solid var(--cdisc-border); border-radius:var(--radius); padding:12px; margin-top:10px; background:var(--cdisc-surface, #fff); }
    .exec-sub-complete { border-left:3px solid #28a745; }
    .exec-sub-running { border-left:3px solid var(--cdisc-primary); }
    .exec-sub-error { border-left:3px solid var(--cdisc-error); }
    .exec-sub-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    /* <summary class="exec-sub-header"> needs list-style suppression so the
       default disclosure triangle doesn't break the flex layout. The chevron
       below provides a clear expand/collapse affordance instead. */
    summary.exec-sub-header { list-style:none; }
    summary.exec-sub-header::-webkit-details-marker { display:none; }
    summary.exec-sub-header::before { content:'▸'; margin-right:6px; color:var(--cdisc-text-secondary); font-size:10px; transition:transform 0.15s; display:inline-block; }
    details[open] > summary.exec-sub-header::before { transform:rotate(90deg); }
    /* Same treatment for the derivation pipeline outer details/summary */
    details.exec-bindings-section > summary { list-style:none; }
    details.exec-bindings-section > summary::-webkit-details-marker { display:none; }
    details.exec-bindings-section > summary::before { content:'▸'; margin-right:6px; color:var(--cdisc-primary); font-size:11px; transition:transform 0.15s; display:inline-block; }
    details.exec-bindings-section[open] > summary::before { transform:rotate(90deg); }
    .exec-sub-seq { display:inline-block; min-width:22px; padding:1px 6px; margin-right:6px; font-size:10px; font-weight:700; color:var(--cdisc-text-secondary); background:var(--cdisc-background); border-radius:10px; }

    .exec-bindings-section { margin:10px 0; }
    .exec-bindings-title { font-size:10px; font-weight:700; color:var(--cdisc-text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; }
    .exec-bindings-table { width:100%; font-size:11px; border-collapse:collapse; }
    .exec-bindings-table th { text-align:left; padding:3px 8px; border-bottom:1px solid var(--cdisc-border); font-weight:600; color:var(--cdisc-text-secondary); font-size:10px; }
    .exec-bindings-table td { padding:3px 8px; border-bottom:1px solid var(--cdisc-border); }
    .exec-code-details { flex:1; min-width:200px; }
    .exec-code-details summary { cursor:pointer; font-size:12px; font-weight:600; color:var(--cdisc-primary); padding:6px 10px; border:1px solid var(--cdisc-border); border-radius:var(--radius) var(--radius) 0 0; }
    .exec-code-details[open] summary { background:var(--cdisc-primary-light); }
    .exec-code-pre { font-size:11px; line-height:1.5; background:var(--cdisc-background); padding:12px; border:1px solid var(--cdisc-border); border-top:0; border-radius:0 0 var(--radius) var(--radius); overflow-x:auto; max-height:400px; margin:0; }
    .exec-ard-tabs { display:flex; gap:0; border-bottom:2px solid var(--cdisc-border); margin:12px 0 8px; }
    .exec-ard-tab { padding:6px 14px; font-size:11px; font-weight:600; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-2px; color:var(--cdisc-text-secondary); }
    .exec-ard-tab:hover { color:var(--cdisc-text); }
    .exec-ard-tab.active { color:var(--cdisc-primary); border-bottom-color:var(--cdisc-primary); }
    .exec-ard-section { display:none; }
    .exec-ard-section.active { display:block; }
    .exec-ard-table { width:100%; font-size:11px; border-collapse:collapse; }
    .exec-ard-table th { text-align:left; padding:4px 8px; border-bottom:2px solid var(--cdisc-border); font-weight:600; color:var(--cdisc-text-secondary); font-size:10px; text-transform:uppercase; }
    .exec-ard-table td { padding:4px 8px; border-bottom:1px solid var(--cdisc-border); }
    .exec-ard-table tr:hover td { background:var(--cdisc-primary-light); }

    .exec-combined-ard { margin-top:16px; padding:12px; border:1px dashed var(--cdisc-border); border-radius:var(--radius); background:var(--cdisc-background); }
  </style>`;
}
