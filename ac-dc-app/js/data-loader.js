import { parseUSDM } from './utils/usdm-parser.js';
import { buildUsdmIndex } from './utils/usdm-ref-resolver.js';

const BASE = getBasePath();

function getBasePath() {
  // If served from repo root, paths resolve from there
  // If served from ac-dc-app/, we need to go up one level
  const path = location.pathname;
  if (path.includes('ac-dc-app')) {
    return path.substring(0, path.indexOf('ac-dc-app'));
  }
  return '/';
}

async function fetchJSON(path) {
  const url = BASE + path;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load ${path}: ${resp.status}`);
  return resp.json();
}

export async function loadAllData(state) {
  // Load all data sources in parallel
  const [
    usdm,
    acModel,
    dcModel,
    transformationLibrary,
    methodsIndex,
    statisticsVocabulary,
    outputClassTemplates
  ] = await Promise.all([
    fetchJSON('ac-dc-app/data/CDISC_Pilot_Study_usdm.json'),
    fetchJSON('model/concept/AC_Concept_Model_v016.json'),
    fetchJSON('model/concept/Option_D_Clinical_with_Dimensions.json'),
    fetchJSON('lib/transformations/ACDC_Transformation_Library_v06.json'),
    fetchJSON('lib/methods/_index.json'),
    fetchJSON('model/method/statistics_vocabulary.json'),
    fetchJSON('model/method/output_class_templates.json')
  ]);

  // Store raw USDM and build index for reference resolution
  state.rawUsdm = usdm;
  state.usdmIndex = buildUsdmIndex(usdm);

  // Parse USDM into a simplified study object
  const parsedStudy = parseUSDM(usdm);

  state.studies = [parsedStudy];
  state.acModel = acModel;
  state.dcModel = dcModel;
  state.transformationLibrary = transformationLibrary;
  state.methodsIndex = methodsIndex;
  state.statisticsVocabulary = statisticsVocabulary;
  state.outputClassTemplates = outputClassTemplates;
}

export async function loadMethod(state, methodOid) {
  if (state.methodsCache[methodOid]) return state.methodsCache[methodOid];

  const entry = state.methodsIndex.methods.find(m => m.oid === methodOid);
  if (!entry) throw new Error(`Method not found: ${methodOid}`);

  const method = await fetchJSON(`lib/methods/${entry.path}`);
  state.methodsCache[methodOid] = method;
  return method;
}
