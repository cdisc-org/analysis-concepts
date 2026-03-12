import { renderHeader } from './components/header.js';
import { renderSidebar } from './components/sidebar.js';
import { loadAllData } from './data-loader.js';
import { renderStudySelect } from './views/study-select.js';
import { renderStudyOverview } from './views/study-overview.js';
import { renderEsapBuilder } from './views/esap-builder.js';
import { renderSmartPhraseBuilder } from './views/smartphrase-builder.js';
import { renderTransformationConfig } from './views/transformation-config.js';
import { renderDerivationPipeline } from './views/derivation-pipeline.js';

// ===== Application State =====
export const appState = {
  currentStep: 1,
  studies: [],
  selectedStudyIndex: null,
  selectedStudy: null,
  selectedEndpoints: [],
  esapAnalyses: {},
  currentEndpointId: null,
  composedPhrases: [],
  matchedTransformations: [],
  selectedTransformation: null,
  selectedDerivations: {},
  derivationChain: [],
  confirmedTerminals: [],
  customInputBindings: null,   // null = use template defaults; array = user-modified
  activeInteractions: [],      // array of "concept1:concept2" strings
  // Raw USDM and index for reference resolution
  rawUsdm: null,
  usdmIndex: null,
  // eSAP narrative linking: sectionKey → array of NarrativeContentItem IDs
  esapLinkedNarratives: {
    studyInfo: [],
    studyDesign: [],
    population: [],
    objectives: [],
    methods: []
  },
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
  { num: 3, label: 'eSAP Builder', sublabel: 'Create analysis plan', icon: '3' },
  { num: 4, label: 'SmartPhrases', sublabel: 'Compose analysis descriptions', icon: '4' },
  { num: 5, label: 'Configure', sublabel: 'Transformation templates', icon: '5' },
  { num: 6, label: 'Derivations', sublabel: 'Build derivation pipeline', icon: '6' }
];

// ===== Router =====
function getStepFromHash() {
  const match = location.hash.match(/#\/step\/(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

export function navigateTo(step) {
  if (step < 1 || step > 6) return;
  location.hash = `#/step/${step}`;
}

function renderCurrentStep() {
  const content = document.getElementById('app-content');
  if (!content) return;

  appState.currentStep = getStepFromHash();
  renderSidebar();

  if (!appState.loaded) {
    content.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading data...</span></div>`;
    return;
  }

  switch (appState.currentStep) {
    case 1: renderStudySelect(content); break;
    case 2: renderStudyOverview(content); break;
    case 3: renderEsapBuilder(content); break;
    case 4: renderSmartPhraseBuilder(content); break;
    case 5: renderTransformationConfig(content); break;
    case 6: renderDerivationPipeline(content); break;
    default: renderStudySelect(content);
  }
}

// ===== Init =====
async function init() {
  renderHeader();
  renderSidebar();
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
        <p style="margin-top:8px; color:var(--cdisc-gray);">${err.message}</p>
        <p style="margin-top:12px; font-size:12px; color:var(--cdisc-gray);">
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
