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
  // Load study manifest and all other data sources in parallel
  const [
    studyManifest,
    acModel,
    dcModel,
    transformationLibrary,
    methodsIndex,
    statisticsVocabulary,
    outputClassTemplates,
    conceptVariableMappings,
    qualifierTypes,
    ocModel,
    ocBcMapping,
    methodImplementationCatalog,
    esapSchema
  ] = await Promise.all([
    fetchJSON('ac-dc-app/data/usdm/studies.json'),
    fetchJSON('model/concept/AC_Concept_Model_v016.json'),
    fetchJSON('model/concept/Option_B_Clinical.json'),
    fetchJSON('lib/transformations/ACDC_Transformation_Library_v06.json'),
    fetchJSON('lib/methods/_index.json'),
    fetchJSON('model/method/statistics_vocabulary.json'),
    fetchJSON('model/method/output_class_templates.json'),
    fetchJSON('ac-dc-app/data/concept-variable-mappings.json'),
    fetchJSON('model/concept/CDDM_Shared_QualifierTypes.json'),
    fetchJSON('model/concept/OC_Instance_Model_v016.json'),
    fetchJSON('model/shared/oc_bc_property_mapping.json'),
    fetchJSON('model/method/method_implementation_catalog.schema.json'),
    fetchJSON('model/study/study_esap.schema.json')
  ]);

  // Load all USDM study files in parallel
  const usdmFiles = await Promise.all(
    studyManifest.map(entry =>
      fetchJSON(`ac-dc-app/data/usdm/${entry.file}`)
    )
  );

  // Parse each USDM into a study object and store raw data
  state.rawUsdmFiles = usdmFiles;
  state.studies = usdmFiles.map(usdm => parseUSDM(usdm));

  // Set first study as default for backward compat (rawUsdm/usdmIndex)
  state.rawUsdm = usdmFiles[0];
  state.usdmIndex = buildUsdmIndex(usdmFiles[0]);

  state.acModel = acModel;
  state.dcModel = dcModel;
  state.transformationLibrary = transformationLibrary;
  state.methodsIndex = methodsIndex;
  state.statisticsVocabulary = statisticsVocabulary;
  state.outputClassTemplates = outputClassTemplates;
  // Deep-clone so user edits don't mutate the original
  state.conceptMappings = JSON.parse(JSON.stringify(conceptVariableMappings));
  state.qualifierTypes = qualifierTypes;
  state.ocModel = ocModel;
  state.ocBcMapping = ocBcMapping;
  state.methodImplementationCatalog = methodImplementationCatalog;
  state.esapSchema = esapSchema;
}

/**
 * Set the active study by index. Updates rawUsdm and usdmIndex
 * so that reference resolution and narrative views work correctly.
 */
export function setActiveStudy(state, index) {
  if (state.rawUsdmFiles && state.rawUsdmFiles[index]) {
    state.rawUsdm = state.rawUsdmFiles[index];
    state.usdmIndex = buildUsdmIndex(state.rawUsdmFiles[index]);
  }
}

export async function loadMethod(state, methodOid) {
  if (state.methodsCache[methodOid]) return state.methodsCache[methodOid];

  const entry = state.methodsIndex.methods.find(m => m.oid === methodOid);
  if (!entry) throw new Error(`Method not found: ${methodOid}`);

  const method = await fetchJSON(`lib/methods/${entry.path}`);
  state.methodsCache[methodOid] = method;
  return method;
}
