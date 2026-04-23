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
  // Cache-bust library/method JSON (config-author files that change often
  // during demo iteration). Stable models stay cached. Without this a
  // normal refresh keeps serving the previous JSON from browser disk cache,
  // which silently hides edits to method configs / transformation library.
  const isLibrary = /^lib\/(methods|transformations|method_implementations)\//.test(path);
  const url = BASE + path + (isLibrary ? `?v=${Date.now()}` : '');
  const resp = await fetch(url, isLibrary ? { cache: 'no-store' } : undefined);
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
    phraseRoleAppConfig,
    methodsIndex,
    statisticsVocabulary,
    outputClassTemplates,
    conceptVariableMappings,
    qualifierTypes,
    ocModel,
    ocBcMapping,
    bcOcInstanceMapping,
    rImplementationCatalog,
    sasImplementationCatalog,
    esapSchema,
    unitConversions,
    configurationConcepts,
    conceptCategories
  ] = await Promise.all([
    fetchJSON('ac-dc-app/data/usdm/studies.json'),
    fetchJSON('model/concept/AC_Concept_Model_v016.json'),
    fetchJSON('model/concept/Option_B_Clinical.json'),
    fetchJSON('lib/transformations/ACDC_Transformation_Library_v06.json'),
    fetchJSON('ac-dc-app/data/phrase-role-config.json'),
    fetchJSON('lib/methods/_index.json'),
    fetchJSON('model/method/statistics_vocabulary.json'),
    fetchJSON('model/method/output_class_templates.json'),
    fetchJSON('ac-dc-app/data/concept-variable-mappings.json'),
    fetchJSON('model/concept/CDDM_Shared_QualifierTypes.json'),
    fetchJSON('model/concept/OC_Instance_Model_v016.json'),
    fetchJSON('model/shared/oc_bc_property_mapping.json'),
    fetchJSON('model/shared/bc_to_oc_instance_mapping.json'),
    fetchJSON('lib/method_implementations/r_implementations.json'),
    fetchJSON('lib/method_implementations/sas_implementations.json'),
    fetchJSON('model/study/study_esap.schema.json'),
    fetchJSON('model/vocabularies/unit_conversions.json'),
    fetchJSON('model/method/configuration_concepts.json'),
    fetchJSON('model/concept/concept_categories.json')
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
  state.phraseRoleAppConfig = phraseRoleAppConfig;
  state.methodsIndex = methodsIndex;
  state.statisticsVocabulary = statisticsVocabulary;
  state.outputClassTemplates = outputClassTemplates;
  // Deep-clone so user edits don't mutate the original
  state.conceptMappings = JSON.parse(JSON.stringify(conceptVariableMappings));
  state.qualifierTypes = qualifierTypes;
  state.ocModel = ocModel;
  state.ocBcMapping = ocBcMapping;
  state.bcOcInstanceMapping = bcOcInstanceMapping;
  // Merge R + SAS implementation catalogs into a single lookup
  const mergedImpls = { ...rImplementationCatalog.implementations };
  for (const [oid, sasImpls] of Object.entries(sasImplementationCatalog.implementations)) {
    mergedImpls[oid] = [...(mergedImpls[oid] || []), ...sasImpls];
  }
  state.methodImplementationCatalog = { ...rImplementationCatalog, implementations: mergedImpls };
  state.esapSchema = esapSchema;
  state.unitConversions = unitConversions;
  state.configurationConcepts = configurationConcepts;
  state.conceptCategories = conceptCategories;
}

/**
 * Expand short-form conforms_to configurations in-place on a method object.
 * Follows the conformance rules in model/method/configuration_concepts.json:
 * - Fill missing name, dataType, description, defaultValue (from typical_default)
 * - For enum concepts with scopes: filter values by applicable_scopes,
 *   compute enumValues + codings
 * - Local fields always override inherited ones
 */
function expandMethodConfigs(method, concepts) {
  if (!concepts?.concepts || !method) return;
  const registry = concepts.concepts;

  const expandList = (configs) => {
    if (!Array.isArray(configs)) return;
    for (const cfg of configs) {
      if (!cfg.conforms_to) continue;
      const concept = registry[cfg.conforms_to];
      if (!concept) continue;

      if (!cfg.name) cfg.name = cfg.conforms_to;
      if (!cfg.dataType) cfg.dataType = concept.dataType;
      if (!cfg.description) cfg.description = concept.description;
      if (cfg.defaultValue == null && concept.typical_default != null) {
        cfg.defaultValue = concept.typical_default;
      }

      // Enum concepts with a values catalog — filter by applicable_scopes
      if (concept.values) {
        const scopes = cfg.applicable_scopes || (concept.scopes?.universal ? ['universal'] : []);
        const filtered = Object.entries(concept.values)
          .filter(([, def]) => scopes.includes(def.scope));
        if (!cfg.enumValues) {
          cfg.enumValues = filtered.map(([name]) => name);
        }
        if (!cfg.codings) {
          cfg.codings = filtered.flatMap(([, def]) => def.codings || []);
        }
      }
    }
  };

  expandList(method.configurations);

  if (method.output_specification?.output_classes) {
    for (const oc of method.output_specification.output_classes) {
      expandList(oc.configurations);
    }
  }
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
  expandMethodConfigs(method, state.configurationConcepts);
  state.methodsCache[methodOid] = method;
  return method;
}
