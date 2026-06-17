// ============================================================================
// Define-XML 2.1 + Analysis Results Metadata (ARM v1.0) generator
// ============================================================================
//
// Projects the concept-keyed AC/DC spec onto a CDISC Define-XML 2.1 document
// for the ADaM datasets, plus the ARM (Analysis Results Metadata) extension.
// This is a *projection*, not authoring — the concepts/derivations/methods are
// the source of truth; this re-serialises the resolved spec as XML.
//
// Reference package (schema + worked example + stylesheet) lives in-repo at
//   ac-dc-app/data/DefineV2111_0/
// The output mirrors examples/Define-XML-2-1-ADaM/adam/defineV21-ADaM.xml and
// validates against schema/cdisc-arm-1.0/arm1-0-0.xsd.
//
// Honesty requirement: every field with no source in the spec is recorded in
// the returned `gaps[]` (rendered as an in-app coverage report); where the
// affected element permits it, an inline def:CommentDef ("GAP: …") is attached.
//
// Dataset model (confirmed with the user):
//  • Assignment is PER transformation instance (spec.datasetAssignments, keyed
//    `${epId}::derivation|analysis::${oid}`); multiple endpoints may share a
//    dataset, and one endpoint's variables may span several datasets.
//  • A derived variable lives in the dataset of the derivation that PRODUCES it.
//  • An analysis (e.g. ANCOVA) produces no stored variable. Its ARM *input*
//    dataset (arm:AnalysisDataset) is the BDS where the analysed variable lives
//    — i.e. the derivation dataset — NOT the analysis instance's own assignment
//    (which is a results/display dataset, recorded as a gap note).
// ============================================================================

import { buildResolvedSpecification } from './instance-serializer.js';
import { resolveCallTemplate } from './r-code-generator.js';

// ----- base path / URLs (mirrors data-loader.getBasePath) -------------------

function getBasePath() {
  const path = location.pathname;
  if (path.includes('ac-dc-app')) return path.substring(0, path.indexOf('ac-dc-app'));
  return '/';
}

/** Absolute same-origin URL to the bundled CDISC stylesheet (for the PI). */
export function stylesheetHref() {
  return `${location.origin}${getBasePath()}ac-dc-app/data/DefineV2111_0/stylesheets/define2-1.xsl`;
}

// ----- tiny XML helpers (no dependency, matches the no-build app) -----------

function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render an attribute map, skipping null/undefined/'' values. */
function attrs(map) {
  return Object.entries(map)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${xmlEsc(v)}"`).join('');
}

/** ODM Description/TranslatedText block. */
function descr(text, indent = '   ') {
  if (!text) return '';
  return `${indent}<Description>\n${indent}   <TranslatedText xml:lang="en">${xmlEsc(text)}</TranslatedText>\n${indent}</Description>\n`;
}

// ----- ADaMIG_v1.3.csv loader (variable-level reference metadata) -----------
// Not loaded at bootstrap, so we lazy-fetch + parse here and cache.

let _adamigCache = null;

function parseCsv(text) {
  // Minimal RFC-4180-ish parser (handles quoted fields with commas/quotes).
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Both ADaM source catalogues share the same column layout (see
// conceptMappings.adam._meta.sources). BDS/ADSL variables live in the ADaMIG
// catalogue; OCCDS variables (ADAE etc.) live in the OCCDS catalogue.
const ADAMIG_SOURCES = ['ADaMIG_v1.3.csv', 'ADaM_OCCDS_v1.1.csv'];

async function loadAdamig() {
  if (_adamigCache) return _adamigCache;
  const map = {};
  for (const file of ADAMIG_SOURCES) {
    try {
      const resp = await fetch(`${getBasePath()}ac-dc-app/data/${file}`);
      if (!resp.ok) continue;
      const rows = parseCsv(await resp.text());
      const header = rows[0].map(h => h.replace(/^"|"$/g, ''));
      const idx = (name) => header.findIndex(h => h.trim() === name);
      const ci = {
        struct: idx('Data Structure Name'),
        name: idx('Variable Name'), label: idx('Variable Label'), type: idx('Type'),
        set: idx('Variable Set'),
        clCode: idx('CDISC CT Codelist Code(s)'), clSub: idx('CDISC CT Codelist Submission Value(s)'),
        core: idx('Core')
      };
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const name = (row[ci.name] || '').trim();
        if (!name || map[name]) continue; // first definition wins (vars recur)
        map[name] = {
          structure: (row[ci.struct] || '').trim(),
          label: (row[ci.label] || '').trim(),
          type: (row[ci.type] || '').trim(),
          variableSet: (row[ci.set] || '').trim(),
          codelistCode: (row[ci.clCode] || '').trim(),
          codelistSub: (row[ci.clSub] || '').trim(),
          core: (row[ci.core] || '').trim()
        };
      }
    } catch { /* non-fatal: gap-annotated downstream */ }
  }
  _adamigCache = map;
  return map;
}

// ----- concept → ADaM variable projection (mirrors esap-builder.rowFromBinding)

const firstToken = (v) => (v ? String(v).split('/')[0] : '');

/** Map a Char/Num ADaMIG type (or a concept dataType) to a Define DataType. */
function defineDataType(adamigType, dtype, varName) {
  if (adamigType === 'Char') return 'text';
  if (adamigType === 'Num') {
    if (/N$|FL$|SEQ$|FN$/.test(varName)) return 'integer';
    return 'float';
  }
  const t = (dtype || '').toLowerCase();
  if (['decimal', 'float'].includes(t)) return 'float';
  if (['integer'].includes(t)) return 'integer';
  return 'text';
}

/**
 * Resolve a binding to an ADaM variable + origin classification.
 * Returns { variable, dtype, concept, derived, methodOid, sdtmVar, slice }.
 */
function projectVariable(binding, adamMap, sdtmMap, derivedConcepts, derivLib, epSpec) {
  const concept = (binding.concept || '').replace(/@.*/, '');
  if (!concept) return null;
  const sliceIsBaseline = !!(binding.slice && /baseline/i.test(binding.slice));
  const entry = adamMap.concepts?.[concept] || adamMap.dimensions?.[concept];
  let variable = null;
  let dtype = (binding.requiredValueType || '').toLowerCase();
  if (entry?.byDataType) {
    if (sliceIsBaseline && entry.byDataType.baseline) variable = entry.byDataType.baseline;
    else for (const k of ['decimal', 'integer', 'string', 'code', 'id']) {
      if (entry.byDataType[k]) { variable = entry.byDataType[k]; dtype = dtype || k; break; }
    }
  }
  if (!variable && entry?.variable) variable = entry.variable;
  variable = firstToken(variable);
  if (!variable) return null;

  const derived = derivedConcepts.has(concept);
  let methodOid = '';
  if (derived) {
    for (const e of (epSpec?.derivationChain || [])) {
      const d = derivLib.find(x => x.oid === e.derivationOid);
      const out = d?.bindings?.find(b => b.direction === 'output');
      if ((out?.concept || '').replace(/@.*/, '') === concept) { methodOid = d.usesMethod || ''; break; }
    }
  }
  let sdtmVar = '';
  if (!derived) {
    const se = sdtmMap.concepts?.[concept] || sdtmMap.dimensions?.[concept];
    if (se?.byDataType) for (const k of ['string', 'code', 'decimal', 'integer', 'id']) {
      if (se.byDataType[k]) { sdtmVar = se.byDataType[k]; break; }
    }
    sdtmVar = firstToken(sdtmVar || se?.variable || '');
  }
  return { variable, dtype, concept, derived, methodOid, sdtmVar, slice: binding.slice || '' };
}

/**
 * Resolve a cube dimension name → the ADaM variable used for WhereClause
 * selection, from the concept-mapping metadata (NOT hardcoded). Prefers the
 * coded form (PARAMCD, AVISIT). Returns null when the dimension has no ADaM
 * realisation (e.g. SDTM-only "Visit"), so it's simply skipped.
 */
function sliceDimVar(dim, adamMap) {
  const entry = adamMap.dimensions?.[dim] || adamMap.concepts?.[dim];
  if (!entry) return null;
  return firstToken(entry.byDataType?.code || entry.byDataType?.string || entry.variable) || null;
}

/**
 * Derive the ADaM def:Class CT submission value for a dataset from the
 * "Data Structure Name" of its variables (ADaMIG/OCCDS CSV). Identifier
 * variables resolve to Subject-Level, so a more specific structure
 * (Basic / Occurrence) wins when present. Returns null when unknown.
 */
function deriveDataClass(order, adamig) {
  const ctOf = (s) => s.replace(/-/g, ' ').toUpperCase();
  const structs = order.map(n => adamig[n]?.structure).filter(Boolean);
  const chosen = structs.find(s => !/subject/i.test(s)) || structs[0];
  return chosen ? ctOf(chosen) : null;
}

/**
 * Derive def:Structure ("One record per subject per parameter per analysis
 * visit") from the cube/key dimensions whose ADaM variable is present in the
 * dataset — sourced from the concept-mapping dimensions, not hardcoded.
 */
function deriveDataStructure(info, adamMap) {
  const order = [['Subject', 'subject'], ['Parameter', 'parameter'], ['AnalysisVisit', 'analysis visit'],
    ['Timepoint', 'timepoint'], ['Period', 'period'], ['Site', 'site']];
  const parts = [];
  for (const [dim, human] of order) {
    const e = adamMap.dimensions?.[dim];
    const v = firstToken(e?.byDataType?.code || e?.byDataType?.id || e?.byDataType?.string || e?.variable);
    if (v && info[v]) parts.push(human);
  }
  return parts.length ? 'One record per ' + parts.join(' per ') : 'One record per subject';
}

// ============================================================================
// Main entry
// ============================================================================

/**
 * @param {object} [options] - { language?: 'R'|'SAS' } overrides the per-endpoint
 *   selectedLang. Drives BOTH the MethodDef FormalExpression and the ARM
 *   ProgrammingCode, so they're always the same language.
 * @returns {Promise<{ xml: string, gaps: Array<{category,field,reason}> }>}
 */
export async function buildDefineXml(appState, selectedEps, study, options = {}) {
  const gaps = [];
  let comCounter = 0;
  const commentDefs = []; // { oid, text }
  /** Record a gap + emit a def:CommentDef; returns the OID to attach via
   *  def:CommentOID. Use ONLY on elements that permit it (ItemGroupDef, ItemDef,
   *  CodeList). */
  const gap = (category, field, reason) => {
    gaps.push({ category, field, reason });
    const oid = `COM.GAP.${++comCounter}`;
    commentDefs.push({ oid, text: `GAP: ${field} — ${reason}` });
    return oid;
  };
  /** Record a gap for the coverage report only (no inline CommentDef). */
  const note = (category, field, reason) => { gaps.push({ category, field, reason }); };

  const resolved = buildResolvedSpecification(appState, selectedEps, study);
  const adamMap = appState.conceptMappings?.adam || {};
  const sdtmMap = appState.conceptMappings?.sdtm || {};
  const lib = appState.transformationLibrary;
  const derivLib = lib?.derivationTransformations || [];
  const implCatalog = appState.methodImplementationCatalog?.implementations || {};
  const methodsCache = appState.methodsCache || {};
  const adamig = await loadAdamig();
  if (Object.keys(adamig).length === 0) {
    note('global', 'ADaMIG_v1.3.csv', 'reference CSV not loaded — labels/types/codelist codes default or omitted');
  }

  // Per-instance dataset assignment helpers.
  const dsKey = (epId, type, oid) => `${epId}::${type}::${oid}`;
  const fallbackDataset = (rep, spec) =>
    (spec.targetDataset || rep.targetDataset || '').toUpperCase() ||
    ('AD' + ((spec.dimensionValues?.Parameter || rep.name || 'DATA').replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase()));

  // Accumulators (emitted in MetaDataVersion schema order).
  const whereClauseDefs = [];
  const itemGroupDefs = [];
  const itemDefs = [];
  const codeLists = [];
  const methodDefs = [];
  const leafDefs = [];
  const armDisplays = [];
  const emittedItemOIDs = new Set();
  const emittedCodeLists = new Set();
  const emittedMethods = new Set();

  // AnalysisPurpose maps the USDM endpoint LEVEL (a USDM Code — C85826 Primary,
  // C85827 Secondary, …, read as rep.level) onto the ARM AnalysisPurpose CT.
  // The level is sourced from USDM; only the "… OUTCOME MEASURE" submission
  // value is ARM controlled terminology (gap-noted). Unmapped → omit.
  const armAnalysisPurpose = (level) => {
    const l = (level || '').toLowerCase();
    if (/primary/.test(l)) return 'PRIMARY OUTCOME MEASURE';
    if (/secondary/.test(l)) return 'SECONDARY OUTCOME MEASURE';
    if (/explor/.test(l)) return 'EXPLORATORY OUTCOME MEASURE';
    return null;
  };

  // Variables grouped by resolved dataset: dsVars[name] = { order:[], info:{} }.
  const dsVars = {};
  const ensureDs = (n) => (dsVars[n] = dsVars[n] || { order: [], info: {} });
  const addVar = (dsName, name, info) => {
    if (!dsName || !name) return;
    const d = ensureDs(dsName);
    if (!d.info[name]) { d.order.push(name); d.info[name] = info; }
    else if (info.methodOid && !d.info[name].methodOid) Object.assign(d.info[name], info);
  };
  const armData = []; // { rep, spec, analysis, ai, inputDataset }

  // ===== pass 1: project variables + resolve each one's dataset ==============
  for (const rep of resolved.endpoints) {
    const spec = appState.endpointSpecs?.[rep.id] || {};
    // Implementation language — a parameter: explicit option → the app's
    // per-endpoint selectedLang (Execute view) → R. Drives MethodDef + ARM.
    const lang = (options.language || appState.endpointResults?.[rep.id]?.selectedLang || 'R').toUpperCase();
    const assignments = spec.datasetAssignments || {};
    const fb = fallbackDataset(rep, spec);
    if (!spec.targetDataset && !Object.keys(assignments).length) {
      note('dataset', `${rep.name} → dataset name`, `no dataset assigned in the ADaM Dataset Assignment view; defaulted to ${fb}`);
    }

    // Concept produced by each derivation → that derivation's assigned dataset.
    const conceptDataset = {};
    for (const e of (spec.derivationChain || [])) {
      const d = derivLib.find(x => x.oid === e.derivationOid);
      const out = d?.bindings?.find(b => b.direction === 'output');
      const c = (out?.concept || '').replace(/@.*/, '');
      if (!c) continue;
      conceptDataset[c] = (assignments[dsKey(rep.id, 'derivation', e.derivationOid)] || spec.targetDataset || fb).toUpperCase();
    }
    const derivedConcepts = new Set(Object.keys(conceptDataset));

    (rep.analyses || []).forEach((analysis, ai) => {
      // The response/analysed variable's concept → its BDS input dataset.
      const respBinding = (analysis.resolvedBindings || []).find(b =>
        b.methodRole === 'response' || (b.dataStructureRole === 'measure' && b.direction !== 'output'));
      const respConcept = (respBinding?.concept || '').replace(/@.*/, '');
      const analysisOid = analysis.basedOn?.transformationId || analysis.transformationOid;
      const analysisAssigned = (assignments[dsKey(rep.id, 'analysis', analysisOid)] || '').toUpperCase();
      const inputDataset = conceptDataset[respConcept] || analysisAssigned || (spec.targetDataset || '').toUpperCase() || fb;

      // An analysis assigned to a results dataset distinct from its BDS input.
      if (analysisAssigned && analysisAssigned !== inputDataset) {
        note('arm', `${rep.id} analysis dataset`, `analysis assigned to "${analysisAssigned}" (results dataset); ARM input dataset is the BDS "${inputDataset}" where the analysed variable lives`);
      }

      // BDS key variables — the ADaM realisations of the Study + Subject
      // dimensions, from the concept-mapping metadata (not hardcoded names).
      [{ concept: 'Study', key: 1 }, { concept: 'Subject', key: 2 }].forEach(({ concept, key }) => {
        const e = adamMap.dimensions?.[concept];
        const v = firstToken(e?.byDataType?.id || e?.byDataType?.string || e?.variable);
        if (!v) return;
        const ref = adamig[v] || {};
        addVar(inputDataset, v, { dtype: defineDataType(ref.type, 'id', v), label: ref.label || e?.notes || '', concept, key });
      });

      for (const b of (analysis.resolvedBindings || [])) {
        if (b.direction === 'output') continue;
        const proj = projectVariable(b, adamMap, sdtmMap, derivedConcepts, derivLib, spec);
        if (!proj) continue;
        // Derived variable → its producing derivation's dataset; else the BDS.
        const varDs = (proj.derived && conceptDataset[proj.concept]) || inputDataset;
        let methodOID = '';
        if (proj.derived && proj.methodOid) {
          methodOID = `MT.${varDs}.${proj.variable}`;
          if (!emittedMethods.has(methodOID)) {
            emittedMethods.add(methodOID);
            methodDefs.push(buildMethodDef(methodOID, proj, analysis, spec, {
              adamMap, methodsCache, implCatalog, derivLib, dsName: varDs, note, lang
            }));
          }
        }
        const ref = adamig[proj.variable] || {};
        addVar(varDs, proj.variable, {
          dtype: defineDataType(ref.type, proj.dtype, proj.variable),
          label: ref.label || '', concept: proj.concept, derived: proj.derived,
          methodOid: methodOID, sdtmVar: proj.sdtmVar,
          codelistCode: ref.codelistCode, codelistSub: ref.codelistSub
        });
      }

      // Ensure the slice / WhereClause selection variables exist in the dataset
      // (PARAMCD, AVISIT, population flag …) — derived from the slice dimensions
      // + concept-mapping, so the ARM WhereClause never dangles.
      const slice0 = (analysis.resolvedSlices?.[0]?.resolvedValues) || spec.dimensionValues || {};
      for (const dim of Object.keys(slice0)) {
        const wv = sliceDimVar(dim, adamMap);
        if (!wv) continue;
        const ref = adamig[wv] || {};
        addVar(inputDataset, wv, { dtype: defineDataType(ref.type, 'code', wv), label: ref.label || '', concept: dim });
      }

      armData.push({ rep, spec, analysis, ai, inputDataset, lang });
    });
  }

  // ===== pass 2: emit ItemDefs + ItemGroupDef per dataset ====================
  for (const [dsName, d] of Object.entries(dsVars)) {
    // def:Class from the ADaM "Data Structure Name" (CSV); def:Structure from
    // the dataset's key/cube dimensions; Repeating follows from the class.
    let defClass = deriveDataClass(d.order, adamig);
    if (!defClass) {
      defClass = dsName === 'ADSL' ? 'SUBJECT LEVEL ANALYSIS DATASET' : 'BASIC DATA STRUCTURE';
      note('dataset', `${dsName} def:Class`, 'ADaM Data Structure Name not found in CSV; class inferred from name');
    }
    const isSubjectLevel = /SUBJECT/.test(defClass);
    const defStructure = isSubjectLevel ? 'One record per subject' : deriveDataStructure(d.info, adamMap);
    const repeating = isSubjectLevel ? 'No' : 'Yes';

    for (const name of d.order) {
      const v = d.info[name];
      const itemOID = `IT.${dsName}.${name}`;
      if (emittedItemOIDs.has(itemOID)) continue;
      emittedItemOIDs.add(itemOID);

      const ref = adamig[name] || {};
      let label = v.label || ref.label;
      let labelComment = '';
      if (!label) { label = name; labelComment = gap('variable', `${itemOID} label`, 'no label in ADaMIG/concept metadata'); }

      let originXml;
      if (v.derived) originXml = `      <def:Origin Type="Derived" Source="Sponsor"/>\n`;
      else if (v.sdtmVar) originXml = `      <def:Origin Type="Predecessor">\n         <Description><TranslatedText xml:lang="en">${xmlEsc(v.sdtmVar)}</TranslatedText></Description>\n      </def:Origin>\n`;
      else originXml = `      <def:Origin Type="Assigned"/>\n`;

      let codeListRef = '';
      if (ref.codelistCode) {
        const clOID = `CL.${name}`;
        if (!emittedCodeLists.has(clOID)) {
          emittedCodeLists.add(clOID);
          const ctGap = gap('codelist', `${clOID} version`, 'CDISC CT package version not available offline — emitted as external reference');
          codeLists.push(
            `   <CodeList OID="${clOID}" Name="${xmlEsc(ref.codelistSub || name)}" DataType="text" def:CommentOID="${ctGap}">\n` +
            `      <ExternalCodeList Dictionary="CDISC CT" Version="UNKNOWN" href="https://evs.nci.nih.gov/ftp1/CDISC/"/>\n` +
            `   </CodeList>`);
        }
        codeListRef = `      <CodeListRef CodeListOID="${clOID}"/>\n`;
      }

      const lengthGap = gap('variable', `${itemOID} Length/SASFieldName/DisplayFormat`, 'not in AC/DC metadata (derive from .xpt in future)');
      const dt = v.dtype || defineDataType(ref.type, '', name);
      itemDefs.push(
        `   <ItemDef${attrs({ OID: itemOID, Name: name, DataType: dt, 'def:CommentOID': labelComment || lengthGap })}>\n` +
        descr(label, '      ') + originXml + codeListRef +
        `   </ItemDef>`);
    }

    const igOID = `IG.${dsName}`;
    const leafID = `LF.${dsName}`;
    const itemRefs = d.order.map((name, i) => {
      const v = d.info[name];
      return `      <ItemRef${attrs({
        ItemOID: `IT.${dsName}.${name}`, OrderNumber: i + 1,
        Mandatory: v.key ? 'Yes' : 'No', KeySequence: v.key || null, MethodOID: v.methodOid || null
      })}/>`;
    }).join('\n');

    itemGroupDefs.push(
      `   <ItemGroupDef${attrs({
        OID: igOID, Name: dsName, SASDatasetName: dsName,
        Repeating: repeating, IsReferenceData: 'No', Purpose: 'Analysis',
        'def:StandardOID': 'STD.01',
        'def:Structure': defStructure,
        'def:ArchiveLocationID': leafID
      })}>\n` +
      descr(`${dsName} analysis dataset`, '      ') + itemRefs + '\n' +
      `      <def:Class Name="${defClass}"/>\n` +
      `      <def:leaf ID="${leafID}" xlink:href="${dsName.toLowerCase()}.xpt">\n` +
      `         <def:title>${dsName.toLowerCase()}.xpt</def:title>\n` +
      `      </def:leaf>\n` +
      `   </ItemGroupDef>`);
  }

  // ===== pass 3: ARM — one ResultDisplay per endpoint ========================
  const armByEp = {};
  for (const a of armData) (armByEp[a.rep.id] = armByEp[a.rep.id] || []).push(a);
  for (const [epId, entries] of Object.entries(armByEp)) {
    const rep = entries[0].rep;
    const dispOID = `RD.${epId}`;
    note('arm', `${dispOID} display document`, 'rendered table/figure output not available — no def:leaf target');

    // Human-readable label: prefer the formalized ("repaired") endpoint statement,
    // then the raw endpoint text, then the short handle (e.g. "END1").
    const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const epLabel = stripHtml(rep.$ui?.formalized) || stripHtml(rep.originalText) || rep.name;

    const results = entries.map(({ spec, analysis, ai, inputDataset, lang }) => {
      const dsName = inputDataset;
      const igOID = `IG.${dsName}`;
      const arOID = `AR.${epId}.R.${ai + 1}`;
      const ui = rep.$ui?.analyses?.[ai];
      const txName = ui?.transformName || epLabel;
      const methodOid = analysis.method?.oid || ui?.transformMethod;

      // WhereClause — selection criteria on the INPUT dataset.
      const slice = (analysis.resolvedSlices?.[0]?.resolvedValues) || spec.dimensionValues || {};
      const wcOID = `WC.${epId}.R.${ai + 1}.${dsName}`;
      const checks = [];
      for (const [dim, val] of Object.entries(slice)) {
        const wcVar = sliceDimVar(dim, adamMap);
        if (!wcVar || val == null || val === '') continue;
        if (dim === 'Parameter') note('arm', `${wcOID} PARAMCD value`, `slice holds the parameter label "${val}", not the PARAMCD submission value (needs BC/CT resolution)`);
        checks.push(
          `         <RangeCheck Comparator="EQ" SoftHard="Soft" def:ItemOID="IT.${dsName}.${wcVar}">\n` +
          `            <CheckValue>${xmlEsc(val)}</CheckValue>\n` +
          `         </RangeCheck>`);
      }
      if (slice.Population) note('arm', `${wcOID} population flag`, `population "${slice.Population}" not resolved to an ADaM flag (e.g. EFFFL/ITTFL)`);
      if (checks.length) whereClauseDefs.push(`   <def:WhereClauseDef OID="${wcOID}">\n${checks.join('\n')}\n   </def:WhereClauseDef>`);

      // Analysis variable — the response/analysed variable.
      const respBinding = (analysis.resolvedBindings || []).find(b =>
        b.methodRole === 'response' || (b.dataStructureRole === 'measure' && b.direction !== 'output'));
      let analysisVar = '';
      if (respBinding) {
        const p = projectVariable(respBinding, adamMap, sdtmMap, new Set([respBinding.concept]), derivLib, spec);
        analysisVar = p?.variable || '';
      }

      // AnalysisPurpose ← USDM endpoint level (mapped to ARM CT); AnalysisReason
      // is ARM CT not modelled in the spec (defaulted).
      const purpose = armAnalysisPurpose(rep.level);
      if (!purpose) note('arm', `${arOID} AnalysisPurpose`, `endpoint level "${rep.level}" not mapped to ARM AnalysisPurpose CT`);
      note('arm', `${arOID} AnalysisReason`, 'defaulted to "SPECIFIED IN SAP" (ARM CT; not in USDM/spec)');

      // ProgrammingCode — map role columns → ADaM variable names + fill configs.
      const overrides = {};
      for (const b of (analysis.resolvedBindings || [])) {
        if (b.direction === 'output' || !b.concept) continue;
        const p = projectVariable(b, adamMap, sdtmMap, new Set(), derivLib, spec);
        if (p?.variable) overrides[(b.concept || '').replace(/@.*/, '')] = p.variable;
      }
      const configs = {};
      for (const c of (ui?.methodConfigs || [])) if (c?.key != null && c.value != null) configs[c.key] = c.value;
      const code = resolveAnalysisCode(methodOid, analysis, adamMap, dsName, implCatalog, note, arOID, overrides, configs, lang);

      const paramRef = dsVars[dsName]?.info?.['PARAMCD'] ? ` ParameterOID="IT.${dsName}.PARAMCD"` : '';
      return (
        `         <arm:AnalysisResult OID="${arOID}"${paramRef} AnalysisReason="SPECIFIED IN SAP"${purpose ? ` AnalysisPurpose="${purpose}"` : ''}>\n` +
        descr(txName, '            ') +
        `            <arm:AnalysisDatasets>\n` +
        `               <arm:AnalysisDataset ItemGroupOID="${igOID}">\n` +
        (checks.length ? `                  <def:WhereClauseRef WhereClauseOID="${wcOID}"/>\n` : '') +
        (analysisVar ? `                  <arm:AnalysisVariable ItemOID="IT.${dsName}.${analysisVar}"/>\n` : '') +
        `               </arm:AnalysisDataset>\n` +
        `            </arm:AnalysisDatasets>\n` +
        `            <arm:Documentation>\n` +
        descr(buildDocText(methodOid, methodsCache, txName), '               ') +
        `            </arm:Documentation>\n` +
        (code
          ? `            <arm:ProgrammingCode Context="${xmlEsc(code.context)}">\n               <arm:Code>${xmlEsc(code.text)}</arm:Code>\n            </arm:ProgrammingCode>\n`
          : '') +
        `         </arm:AnalysisResult>`);
    });

    armDisplays.push(
      `      <arm:ResultDisplay OID="${dispOID}" Name="${xmlEsc(rep.name)}">\n` +
      descr(epLabel, '         ') + results.join('\n') + '\n' +
      `      </arm:ResultDisplay>`);
  }

  // --- def:CommentDef list (gaps) --------------------------------------------
  const commentDefXml = commentDefs.map(c =>
    `   <def:CommentDef OID="${c.oid}">\n${descr(c.text, '      ')}   </def:CommentDef>`
  ).join('\n');

  // --- assemble in MetaDataVersion schema order ------------------------------
  const igMeta = adamMap._meta || {};
  const fileTag = xmlEsc((study?.name || 'study').replace(/\s+/g, '_'));
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<?xml-stylesheet type="text/xsl" href="${stylesheetHref()}"?>\n` +
    `<!-- Generated by ac-dc-app from the AC/DC concept spec. This is a PROJECTION of the\n` +
    `     concept-keyed metadata onto Define-XML 2.1 + ARM v1.0. Fields without a source in\n` +
    `     the spec are marked with def:CommentDef "GAP: …" and listed in the in-app coverage report.\n` +
    `     The stylesheet href is an absolute same-origin path; adjust it for offline viewing. -->\n` +
    `<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3"\n` +
    `     xmlns:def="http://www.cdisc.org/ns/def/v2.1"\n` +
    `     xmlns:xlink="http://www.w3.org/1999/xlink"\n` +
    `     xmlns:arm="http://www.cdisc.org/ns/arm/v1.0"\n` +
    `     FileOID="ACDC.${fileTag}.Define-XML_2.1"\n` +
    `     ODMVersion="1.3.2" FileType="Snapshot" CreationDateTime="${new Date().toISOString()}"\n` +
    `     Originator="ac-dc-app" def:Context="Submission">\n` +
    `   <Study OID="STDY.${fileTag}">\n` +
    `      <GlobalVariables>\n` +
    `         <StudyName>${xmlEsc(study?.name || 'Study')}</StudyName>\n` +
    `         <StudyDescription>${xmlEsc(study?.name || 'Study')} ADaM Data Definitions</StudyDescription>\n` +
    `         <ProtocolName>${xmlEsc(study?.identifiers?.map(i => i.text).join(', ') || study?.name || 'Study')}</ProtocolName>\n` +
    `      </GlobalVariables>\n` +
    `      <MetaDataVersion OID="MDV.ACDC.ADaM" Name="${xmlEsc(study?.name || 'Study')} ADaM Definitions"\n` +
    `                       Description="ADaM Data Definitions" def:DefineVersion="2.1.0">\n` +
    `         <def:Standards>\n` +
    `            <def:Standard OID="STD.01" Name="ADaMIG" Type="IG" Status="Final" Version="${xmlEsc((igMeta.igVersion || 'v1.3').replace(/^v/, ''))}"/>\n` +
    `            <def:Standard OID="STD.CT.01" Name="CDISC/NCI" Type="CT" PublishingSet="ADaM" Status="Final" Version="UNKNOWN"/>\n` +
    `         </def:Standards>\n` +
    section(whereClauseDefs) +
    section(itemGroupDefs) +
    section(itemDefs) +
    section(codeLists) +
    section(methodDefs) +
    (commentDefXml ? commentDefXml + '\n' : '') +
    section(leafDefs) +
    (armDisplays.length
      ? `         <arm:AnalysisResultDisplays>\n${armDisplays.join('\n')}\n         </arm:AnalysisResultDisplays>\n`
      : '') +
    `      </MetaDataVersion>\n` +
    `   </Study>\n` +
    `</ODM>\n`;

  return { xml, gaps };
}

function section(arr) {
  return arr.length ? arr.join('\n') + '\n' : '';
}

// ----- MethodDef builder ----------------------------------------------------

function buildMethodDef(methodOID, proj, analysis, spec, ctx) {
  const { methodsCache, implCatalog, derivLib, adamMap, note, lang } = ctx;
  const m = methodsCache[proj.methodOid] || {};
  const name = m.name || proj.methodOid || methodOID;
  const desc = m.description || `Derived using ${proj.methodOid}`;
  if (!m.description) note('method', `${methodOID} description`, `method ${proj.methodOid} not in cache — description defaulted`);

  // Resolve the FormalExpression to ADaM variable names, in the chosen language.
  const impls = implCatalog[proj.methodOid] || [];
  const impl = impls.find(i => (i.language || '').toUpperCase() === lang && i.callTemplate)
    || impls.find(i => i.callTemplate);
  let formal = '';
  if (impl) {
    if ((impl.language || '').toUpperCase() !== lang) {
      note('method', `${methodOID} language`, `no ${lang} implementation for ${proj.methodOid}; FormalExpression emitted in ${impl.language}`);
    }
    // The producing derivation's role bindings (input + output) → ADaM vars.
    const entry = (spec.derivationChain || []).find(e => {
      const d = derivLib.find(x => x.oid === e.derivationOid);
      const out = d?.bindings?.find(b => b.direction === 'output');
      return d?.usesMethod === proj.methodOid && (out?.concept || '').replace(/@.*/, '') === proj.concept;
    });
    const d = entry && derivLib.find(x => x.oid === entry.derivationOid);
    const code = resolveRoleTemplate(impl, d?.bindings || [], adamMap, spec);
    if (/<[a-z_]+>/i.test(code)) note('method', `${methodOID} FormalExpression`, 'some role placeholders unresolved (no binding for a role)');
    formal = `      <FormalExpression Context="${xmlEsc(impl.language || 'TEXT')}">${xmlEsc(code)}</FormalExpression>`;
  }

  return `   <MethodDef OID="${methodOID}" Name="${xmlEsc(name)}" Type="Computation">\n` +
    descr(desc, '      ') + (formal ? formal + '\n' : '') +
    `   </MethodDef>`;
}

/**
 * Substitute <role> placeholders in a callTemplate with the ADaM variable each
 * binding projects to (input AND output roles), so a method's FormalExpression
 * reads in real ADaM variables (e.g. CHG <- AVAL - BASE). Mirrors the engine's
 * resolver but maps to ADaM names via projectVariable.
 */
function resolveRoleTemplate(impl, bindings, adamMap, spec) {
  let code = impl.callTemplate || '';
  const isR = (impl.language || '').toUpperCase() === 'R';
  const sep = impl.roleSeparator || (isR ? ' + ' : ' ');
  const roleMap = {};
  for (const b of bindings) {
    const role = b.methodRole;
    if (!role) continue;
    const v = projectVariable(b, adamMap, {}, new Set(), [], spec)?.variable;
    if (!v) continue;
    (roleMap[role] = roleMap[role] || []).push(v);
  }
  for (const role of Object.keys(roleMap).sort((a, b) => b.length - a.length)) {
    const ph = `<${role}>`, terms = roleMap[role];
    if (isR) code = code.replaceAll('`' + ph + '`', '`' + terms.join('` + `') + '`');
    code = code.replaceAll(ph, terms.join(sep));
  }
  return code;
}

// ----- ARM helpers ----------------------------------------------------------

function buildDocText(methodOid, methodsCache, fallback) {
  const m = methodsCache[methodOid];
  return (m && m.description) ? m.description : fallback;
}

/** Resolve the analysis call to standalone code in the chosen language. */
function resolveAnalysisCode(methodOid, analysis, adamMap, dsName, implCatalog, note, arOID, overrides, configs, lang) {
  const impls = implCatalog[methodOid] || [];
  const pick = impls.find(i => (i.language || '').toUpperCase() === lang && i.callTemplate)
    || impls.find(i => i.callTemplate);
  if (!pick) {
    note('arm', `${arOID} ProgrammingCode`, `no implementation found for ${methodOid}`);
    return null;
  }
  if ((pick.language || '').toUpperCase() !== lang) {
    note('arm', `${arOID} ProgrammingCode language`, `no ${lang} implementation for ${methodOid}; emitted in ${pick.language}`);
  }
  let text;
  try {
    text = resolveCallTemplate(pick, analysis.resolvedBindings || [], overrides || {}, adamMap, configs || {}, dsName.toLowerCase());
  } catch {
    text = pick.callTemplate;
  }
  if (/<[a-z_]+>/i.test(text)) {
    note('arm', `${arOID} ProgrammingCode`, 'some role/config placeholders unresolved (missing binding or config default)');
  }
  return { context: pick.language === 'SAS' ? 'SAS' : (pick.language || 'R'), text };
}
