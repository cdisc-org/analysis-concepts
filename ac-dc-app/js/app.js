import { renderHeader } from './components/header.js';
import { renderSidebar } from './components/sidebar.js';
import { loadAllData } from './data-loader.js';
import { renderStudySelect } from './views/study-select.js';
import { renderStudyOverview } from './views/study-overview.js';
import { renderEsapBuilder } from './views/esap-builder.js';
import { renderDerivationPipeline } from './views/derivation-pipeline.js';
import { renderEndpointWhat } from './views/endpoint-what.js';
import { renderEndpointHow } from './views/endpoint-how.js';
import { renderEndpointSummary } from './views/endpoint-summary.js';
import { renderExecuteAnalysis } from './views/execute-analysis.js';
import { buildResolvedSpecification } from './utils/instance-serializer.js';
import { getAllEndpoints } from './utils/usdm-parser.js';

// ===== Application State =====
// Expose on window for console debugging
/** eSAP narrative sections, in document order. */
const ESAP_SECTIONS = [
  'abbreviations', 'introduction', 'objectives', 'studyDesign', 'protocolChanges',
  'estimands', 'endpoints', 'analysisSets', 'statMethods', 'statAnalysis',
  'software', 'references', 'shells', 'appendices'
];

function emptyNarrativeLinks() {
  return Object.fromEntries(ESAP_SECTIONS.map(k => [k, []]));
}

/**
 * The slice of appState that belongs to ONE study.
 *
 * Everything here is keyed by, or derived from, a USDM endpoint — and USDM ids
 * are document-local: "Endpoint_1" is simply the first endpoint of whichever
 * file you opened, so both studies have one. That is correct USDM; the app is
 * what has to know which study is selected. These fields therefore live in a
 * per-study workspace that switchStudy() swaps in and out. They keep their
 * names on appState, so every view goes on reading appState.endpointSpecs as
 * before and nothing else needs to know workspaces exist.
 *
 * Loaded data is deliberately NOT here: datasets live in one R global
 * environment keyed by bare name (dm, adsl), so two studies cannot hold theirs
 * at once. Switching clears them instead — see clearLoadedDatasets().
 */
function freshStudyWorkspace() {
  return {
    selectedEndpoints: [],
    esapAnalyses: {},
    currentEndpointId: null,
    activeEndpointId: null,
    composedPhrases: [],
    matchedTransformations: [],
    selectedTransformation: null,
    selectedDerivations: {},
    derivationChain: [],
    confirmedTerminals: [],
    resolvedBindings: null,
    dimensionalSliceValues: null,
    methodConfig: null,
    activeInteractions: [],
    endpointSpecs: {},
    esapLinkedNarratives: emptyNarrativeLinks(),
    resolvedSpec: null,
    endpointResults: {}
  };
}

const STUDY_WORKSPACE_FIELDS = Object.keys(freshStudyWorkspace());
const studyWorkspaces = new Map();

/**
 * Stable identity for a study, independent of list position. The manifest file
 * name is unique per entry; the index is a last resort for studies that were
 * not loaded from the manifest.
 */
export function studyKey(index = appState.selectedStudyIndex) {
  if (index === null || index === undefined) return null;
  return appState.studyManifest?.[index]?.file || `study-${index}`;
}

/**
 * Make `index` the selected study, parking the outgoing study's workspace and
 * restoring the incoming one. Returns to a study you visited earlier and its
 * endpoints, specs and results are exactly as you left them — without ever
 * letting one study's results render under another's endpoint of the same id.
 */
export function switchStudy(index) {
  const prevKey = studyKey(appState.selectedStudyIndex);
  if (prevKey !== null) {
    const parked = {};
    for (const f of STUDY_WORKSPACE_FIELDS) parked[f] = appState[f];
    studyWorkspaces.set(prevKey, parked);
  }
  appState.selectedStudyIndex = index;
  appState.selectedStudy = appState.studies[index] || null;
  Object.assign(appState, studyWorkspaces.get(studyKey(index)) || freshStudyWorkspace());
}

export const appState = window.appState = {
  currentStep: 1,
  studies: [],
  selectedStudyIndex: null,
  selectedStudy: null,
  selectedEndpoints: [],
  esapAnalyses: {},
  currentEndpointId: null,
  activeEndpointId: null,
  composedPhrases: [],
  matchedTransformations: [],
  selectedTransformation: null,
  selectedDerivations: {},
  derivationChain: [],
  confirmedTerminals: [],
  resolvedBindings: null,   // null = use template defaults; array = user-modified
  dimensionalSliceValues: null, // null = not yet initialized; object = user-configured slice values
  methodConfig: null,          // null = not yet initialized; object = user-configured method config overrides
  activeInteractions: [],      // array of "concept1:concept2" strings
  endpointSpecs: {},           // keyed by endpoint ID: { conceptCategory, dataType, parameterSource, parameterName, linkedBCIds, dimensionValues, derivationNote }
  // Raw USDM and index for reference resolution
  rawUsdm: null,
  rawUsdmFiles: [],
  usdmIndex: null,
  // eSAP narrative linking: sectionKey → array of NarrativeContentItem IDs
  esapLinkedNarratives: emptyNarrativeLinks(),
  // Concept-to-variable mapping
  conceptMappings: null,
  configPanelOpen: false,
  // Default: 'concepts_adam' renders concept keys annotated with their ADaM
  // variable mapping ("Measure [AVAL]") so spec authors see both layers
  // without toggling. In Execute, the Resolved Bindings table routes any
  // non-'concepts' mode through its Implementation Variable column — so the
  // store variables (TRT01P, AVAL, AVISIT) surface there by default. Users
  // can switch to a pure-concept or pure-variable view via the header
  // dropdown.
  modelViewMode: 'concepts_adam',  // concepts | adam | omop | fhir | concepts_adam | concepts_omop | concepts_fhir
  // CDISC Library cache index (kept for any future enrichment workflows; the
  // in-step Schedule of Activities tab does not depend on this).
  cdiscLibraryIndex: null,
  // Cached data sources
  acModel: null,
  dcModel: null,
  conceptCategories: null,
  transformationLibrary: null,
  methodsIndex: null,
  methodsCache: {},
  statisticsVocabulary: null,
  outputClassTemplates: null,
  loaded: false,
  // JSON-driven UI: cached resolved specification (single source of truth for rendering)
  resolvedSpec: null,
  // WebR execution state
  loadedDatasets: [],    // array of { name, nrow, ncol, columns }
  endpointResults: {}    // keyed by endpoint ID: { analysisResults: { [aIdx]: { status, results, error } }, varOverrides, sliceOverrides, datasetOverride, selectedLang }
};

/**
 * Rebuild the resolved specification from current appState.
 * Called before each step render so views can read from appState.resolvedSpec.
 */
export function rebuildSpec() {
  const study = appState.selectedStudy;
  if (!study || !appState.loaded) {
    appState.resolvedSpec = null;
    return;
  }
  // Sync resolvedSlices from current dimensionValues before rebuilding
  for (const [, spec] of Object.entries(appState.endpointSpecs || {})) {
    if (!spec?.cubeDimensions) continue;
    const fixedDims = {};
    for (const d of spec.cubeDimensions) {
      if (d.sliceValue && !d.isSliceKey && d.dimension !== 'Subject') {
        fixedDims[d.dimension] = d.sliceValue;
      }
    }
    // Also pull from dimensionValues (updated by input handlers)
    for (const [dim, val] of Object.entries(spec.dimensionValues || {})) {
      if (val) fixedDims[dim] = val;
    }
    if (Object.keys(fixedDims).length > 0) {
      const baseSlices = spec.cubeSlices || [];
      spec.resolvedSlices = baseSlices.length > 0
        ? baseSlices.map(s => ({ ...s, fixedDimensions: { ...s.fixedDimensions, ...fixedDims } }))
        : [{ name: 'endpoint', fixedDimensions: fixedDims }];
      spec.sliceKeyDimensions = [...new Set(Object.keys(fixedDims))];
    }
  }

  const allEndpoints = getAllEndpoints(study);
  const selectedEps = allEndpoints.filter(ep => appState.selectedEndpoints.includes(ep.id));
  appState.resolvedSpec = buildResolvedSpecification(appState, selectedEps, study);
}

// ===== Step definitions =====
export const STEPS = [
  { num: 1, label: 'Select Study', sublabel: 'Choose a study from USDM', icon: '1', layer: 'specification' },
  { num: 2, label: 'Study Overview', sublabel: 'Objectives, endpoints & design', icon: '2', layer: 'specification' },
  { num: 3, label: 'Endpoint', sublabel: 'Variable of interest', icon: '3', layer: 'specification' },
  { num: 4, label: 'Analysis', sublabel: 'Summary measure', icon: '4', layer: 'specification' },
  { num: 5, label: 'Summary', sublabel: 'Review all endpoints', icon: '5', layer: 'specification' },
  { num: 6, label: 'Derivations', sublabel: 'Dependent derivation pipeline', icon: '6', layer: 'specification' },
  { num: 7, label: 'eSAP Builder', sublabel: 'Generate analysis plan', icon: '7', layer: 'specification' },
  { num: 8, label: 'Execute', sublabel: 'Run analysis via WebR', icon: '8', layer: 'execution' }
];

// ===== Router =====
function getCurrentRoute() {
  const h = location.hash || '#/step/1';
  const step = h.match(/^#\/step\/(\d+)$/);
  if (step) return { kind: 'step', step: parseInt(step[1], 10) };
  return { kind: 'step', step: 1 };
}

export function navigateTo(step) {
  if (step < 1 || step > 8) return;
  appState.currentStep = step;
  // Update hash without triggering hashchange re-render
  history.replaceState(null, '', `#/step/${step}`);
  renderCurrentStep();
}

export function renderCurrentStep() {
  const content = document.getElementById('app-content');
  if (!content) return;

  // Sync state from hash
  const route = getCurrentRoute();
  if (route.step !== appState.currentStep) appState.currentStep = route.step;
  renderSidebar();

  if (!appState.loaded) {
    content.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading data...</span></div>`;
    return;
  }

  // Rebuild resolved specification before rendering (JSON-driven UI)
  rebuildSpec();

  switch (appState.currentStep) {
    case 1: renderStudySelect(content); break;
    case 2: renderStudyOverview(content); break;
    case 3: renderEndpointWhat(content); break;
    case 4: renderEndpointHow(content); break;
    case 5: renderEndpointSummary(content); break;
    case 6: renderDerivationPipeline(content); break;
    case 7: renderEsapBuilder(content); break;
    case 8: renderExecuteAnalysis(content); break;
    default: renderStudySelect(content);
  }
}

// ===== Init =====
async function init() {
  renderHeader();
  renderSidebar();

  // Create study config panel container
  const studyConfigPanel = document.createElement('div');
  studyConfigPanel.id = 'study-config-panel';
  document.getElementById('app-layout').appendChild(studyConfigPanel);

  renderCurrentStep();

  window.addEventListener('hashchange', renderCurrentStep);

  try {
    await loadAllData(appState);
    appState.loaded = true;
    renderCurrentStep();
  } catch (err) {
    console.error('Failed to load data:', err);
    const content = document.getElementById('app-content');
    content.innerHTML = `
      <div class="card" style="text-align:center; padding:40px; color:var(--cdisc-error);">
        <h3>Failed to load data</h3>
        <p style="margin-top:8px; color:var(--cdisc-text-secondary);">${err.message}</p>
        <p style="margin-top:12px; font-size:12px; color:var(--cdisc-text-secondary);">
          Make sure you are serving from the repository root:<br>
          <code>python3 ac-dc-app/serve.py</code>
        </p>
      </div>`;
  }
}

if (!location.hash) {
  location.hash = '#/step/1';
}

init();
