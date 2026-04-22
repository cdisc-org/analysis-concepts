import { appState, renderCurrentStep, navigateTo } from '../app.js';
import { serializeStudyInstance, deserializeStudyInstance } from '../utils/instance-serializer.js';
import { composeFullSentence } from '../utils/phrase-engine.js';
import { getPopulationNames, getAllEndpoints } from '../utils/usdm-parser.js';
import { buildSyntaxTemplatePlainText } from '../views/endpoint-spec.js';

export function renderHeader() {
  const header = document.getElementById('app-header');
  header.innerHTML = `
    <div class="header-logo">
      <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" fill="rgba(255,255,255,0.15)"/>
        <path d="M8 18 L14 12 L14 16 L22 16 L22 12 L28 18 L22 24 L22 20 L14 20 L14 24 Z" fill="white" opacity="0.9"/>
        <circle cx="10" cy="10" r="3" fill="rgba(255,255,255,0.4)"/>
        <circle cx="26" cy="26" r="3" fill="rgba(255,255,255,0.4)"/>
      </svg>
      <span>eSAP</span>
    </div>
    <div class="header-center">
      <h1>Analysis Concepts / Derivation Concepts</h1>
    </div>
    <select class="model-view-toggle" id="model-view-toggle">
      <option value="concepts">Concepts</option>
      <option value="adam">ADaM Variables</option>
      <option value="omop">OMOP Fields</option>
      <option value="fhir">FHIR Elements</option>
      <option value="concepts_adam">Concepts + ADaM</option>
      <option value="concepts_omop">Concepts + OMOP</option>
      <option value="concepts_fhir">Concepts + FHIR</option>
    </select>
    <button class="header-btn" id="btn-save-instance" title="Save study instance">Save</button>
    <button class="header-btn" id="btn-load-instance" title="Load study instance">Load</button>
    <div class="header-badge">360i Phase 2</div>
  `;

  const toggle = header.querySelector('#model-view-toggle');
  toggle.value = appState.modelViewMode || 'concepts';

  // Use event delegation on the header so the handler survives DOM re-renders
  // triggered by renderCurrentStep(). Only attach once via a flag.
  if (!header._viewToggleBound) {
    header.addEventListener('change', (e) => {
      if (e.target.id === 'model-view-toggle') {
        appState.modelViewMode = e.target.value;
        renderCurrentStep();
      }
    });
    header._viewToggleBound = true;
  }

  // Save button — serialize and download as JSON
  header.querySelector('#btn-save-instance').addEventListener('click', () => {
    if (!appState.loaded) return;
    const instance = serializeStudyInstance(appState);
    const slug = (instance.studyRef.studyName || 'study')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    const blob = new Blob([JSON.stringify(instance, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}.study-instance.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Load button — file picker, deserialize, navigate to eSAP builder
  header.querySelector('#btn-load-instance').addEventListener('click', () => {
    if (!appState.loaded) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const warnings = deserializeStudyInstance(json, appState);

        // Recompute resolvedSentence for all endpoint analyses
        const lib = appState.transformationLibrary;
        const study = appState.selectedStudy;
        if (lib && study) {
          const popNames = getPopulationNames(study);
          const popMap = {};
          for (const p of popNames) { popMap[p.value] = p.label; }
          const allEndpoints = getAllEndpoints(study);
          for (const [epId, analysis] of Object.entries(appState.esapAnalyses)) {
            const ep = allEndpoints.find(e => e.id === epId);
            const epSpec = appState.endpointSpecs?.[epId];
            const syntaxPrefix = (ep && epSpec) ? buildSyntaxTemplatePlainText(ep, epSpec, study) : '';
            analysis.resolvedSentence = composeFullSentence(
              analysis.phrases || [], lib, { population: popMap }, syntaxPrefix
            );
          }
        }

        if (warnings.length > 0) {
          console.warn('Study instance load warnings:', warnings);
          alert('Loaded with warnings:\n' + warnings.join('\n'));
        }

        const targetStep = json?.preferences?.currentStep;
        navigateTo(typeof targetStep === 'number' && targetStep >= 1 && targetStep <= 8 ? targetStep : 4);
      } catch (err) {
        console.error('Failed to load study instance:', err);
        alert('Failed to load study instance: ' + err.message);
      }
    };
    input.click();
  });
}
