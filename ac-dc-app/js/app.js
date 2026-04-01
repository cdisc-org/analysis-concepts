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

// ===== Application State =====
export const appState = {
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
  esapLinkedNarratives: {
    abbreviations: [],
    introduction: [],
    objectives: [],
    studyDesign: [],
    protocolChanges: [],
    estimands: [],
    endpoints: [],
    analysisSets: [],
    statMethods: [],
    statAnalysis: [],
    software: [],
    references: [],
    shells: [],
    appendices: []
  },
  // Concept-to-variable mapping
  conceptMappings: null,
  configPanelOpen: false,
  modelViewMode: 'concepts',  // concepts | adam | omop | fhir | concepts_adam | concepts_omop | concepts_fhir
  // Cached data sources
  acModel: null,
  dcModel: null,
  transformationLibrary: null,
  methodsIndex: null,
  methodsCache: {},
  statisticsVocabulary: null,
  outputClassTemplates: null,
  loaded: false
};

// ===== Step definitions =====
export const STEPS = [
  { num: 1, label: 'Select Study', sublabel: 'Choose a study from USDM', icon: '1' },
  { num: 2, label: 'Study Overview', sublabel: 'Objectives, endpoints & design', icon: '2' },
  { num: 3, label: 'Endpoint', sublabel: 'Variable of interest', icon: '3' },
  { num: 4, label: 'Analysis', sublabel: 'Summary measure', icon: '4' },
  { num: 5, label: 'Summary', sublabel: 'Review all endpoints', icon: '5' },
  { num: 6, label: 'Derivations', sublabel: 'Dependent derivation pipeline', icon: '6' },
  { num: 7, label: 'eSAP Builder', sublabel: 'Generate analysis plan', icon: '7' }
];

// ===== Router =====
function getStepFromHash() {
  const match = location.hash.match(/#\/step\/(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

export function navigateTo(step) {
  if (step < 1 || step > 7) return;
  appState.currentStep = step;
  // Update hash without triggering hashchange re-render
  history.replaceState(null, '', `#/step/${step}`);
  renderCurrentStep();
}

export function renderCurrentStep() {
  const content = document.getElementById('app-content');
  if (!content) return;

  // Sync from hash only if not already set by navigateTo
  const hashStep = getStepFromHash();
  if (hashStep !== appState.currentStep) {
    appState.currentStep = hashStep;
  }
  renderSidebar();

  if (!appState.loaded) {
    content.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading data...</span></div>`;
    return;
  }

  switch (appState.currentStep) {
    case 1: renderStudySelect(content); break;
    case 2: renderStudyOverview(content); break;
    case 3: renderEndpointWhat(content); break;
    case 4: renderEndpointHow(content); break;
    case 5: renderEndpointSummary(content); break;
    case 6: renderDerivationPipeline(content); break;
    case 7: renderEsapBuilder(content); break;
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
