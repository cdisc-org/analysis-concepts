/*
 * Proves per-study state isolation: USDM endpoint ids are document-local, so
 * every study has an "Endpoint_1". Specs and execution results keyed by that id
 * must never cross between studies — the failure this guards against showed one
 * study's subjects and treatment arms inside another study's analysis.
 *
 *   node scripts/verify_study_isolation.mjs
 */
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.location = { pathname: '/' };
// app.js calls init() on import and renders the shell; give it inert elements
// so the module loads. We only exercise the state machinery below.
const el = () => ({
  innerHTML: '', textContent: '', style: {}, dataset: {}, classList: { add(){}, remove(){}, contains:()=>false },
  addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){},
  querySelector: () => el(), querySelectorAll: () => [], closest: () => null
});
globalThis.document = {
  addEventListener(){}, createElement: el, body: el(),
  querySelector: () => el(), querySelectorAll: () => [], getElementById: () => el()
};
globalThis.localStorage = { getItem:()=>null, setItem(){}, removeItem(){} };
globalThis.fetch = async () => ({ ok: false, json: async()=>({}), text: async()=>'' });

const { appState, switchStudy, studyKey } = await import('../ac-dc-app/js/app.js');

const failures = [];
const check = (name, cond, detail) => { if (!cond) failures.push(name + (detail ? ` — ${detail}` : '')); };

appState.studies = [{ name: 'Pilot' }, { name: 'Cancer' }];
appState.studyManifest = [{ file: 'pilot.json' }, { file: 'cancer.json' }];

check('studyKey is the manifest file, not the index', studyKey(1) === 'cancer.json', studyKey(1));

// --- study 0: author a spec and record a result --------------------------
switchStudy(0);
appState.endpointSpecs['Endpoint_1'] = { parameterName: 'ADAS-Cog (11)' };
appState.endpointResults['Endpoint_1'] = { analysisResults: { 0: { status: 'complete', subject: 'LZZT-001' } } };
appState.selectedEndpoints = ['Endpoint_1'];

// --- study 1: SAME endpoint id, must start clean -------------------------
switchStudy(1);
check('switching studies selects the new study', appState.selectedStudy.name === 'Cancer');
check('spec does not leak across studies',
  appState.endpointSpecs['Endpoint_1'] === undefined,
  JSON.stringify(appState.endpointSpecs['Endpoint_1']));
check('results do not leak across studies',
  appState.endpointResults['Endpoint_1'] === undefined,
  JSON.stringify(appState.endpointResults['Endpoint_1']));
check('selected endpoints do not leak', appState.selectedEndpoints.length === 0);
check('narrative links start empty and are not shared',
  Array.isArray(appState.esapLinkedNarratives.objectives)
    && appState.esapLinkedNarratives.objectives.length === 0);

appState.endpointSpecs['Endpoint_1'] = { parameterName: 'Progression-Free Survival' };
appState.endpointResults['Endpoint_1'] = { analysisResults: { 0: { status: 'complete', subject: 'NCT01797120-0001' } } };

// --- back to study 0: its own work is intact, unchanged ------------------
switchStudy(0);
check('returning to a study restores its spec',
  appState.endpointSpecs['Endpoint_1']?.parameterName === 'ADAS-Cog (11)',
  JSON.stringify(appState.endpointSpecs['Endpoint_1']));
check('returning to a study restores its results',
  appState.endpointResults['Endpoint_1']?.analysisResults?.[0]?.subject === 'LZZT-001',
  JSON.stringify(appState.endpointResults['Endpoint_1']));
check('the other study did not overwrite it',
  appState.endpointSpecs['Endpoint_1']?.parameterName !== 'Progression-Free Survival');

// --- and study 1 is still intact too -------------------------------------
switchStudy(1);
check('the second study kept its own spec',
  appState.endpointSpecs['Endpoint_1']?.parameterName === 'Progression-Free Survival');
check('the second study kept its own results',
  appState.endpointResults['Endpoint_1']?.analysisResults?.[0]?.subject === 'NCT01797120-0001');

// --- mutating one workspace must not alias the other ---------------------
switchStudy(0);
appState.esapLinkedNarratives.objectives.push('NarrativeContentItem_1');
switchStudy(1);
check('narrative links are per-study, not a shared object',
  appState.esapLinkedNarratives.objectives.length === 0,
  JSON.stringify(appState.esapLinkedNarratives.objectives));

if (failures.length) {
  console.error(`FAIL — ${failures.length} check(s):`);
  failures.forEach(f => console.error('  -', f));
  process.exit(1);
}
console.log('PASS — study workspaces stay isolated across an "Endpoint_1" collision.');
