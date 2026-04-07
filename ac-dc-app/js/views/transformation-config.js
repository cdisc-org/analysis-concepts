import { appState, navigateTo } from '../app.js';
import { loadMethod } from '../data-loader.js';
import { getAllEndpoints, getVisitLabels, getPopulationNames, getArmNames, getBiomedicalConcepts, getEndpointParameterOptions } from '../utils/usdm-parser.js';
import { composeFullSentence } from '../utils/phrase-engine.js';
import { buildSyntaxTemplatePlainText } from './endpoint-spec.js';
import {
  getOutputMapping, getInputBindings,
  getMethodConfigurations, getDimensions
} from '../utils/transformation-linker.js';
import { displayConcept, formatDimensionConstraints, formatSliceDisplay, resolveBindingShape, buildSliceLookup } from '../utils/concept-display.js';

// ===== Helper: Get concept dropdown options from DC model =====

export function getConceptOptions(role, dcModel) {
  if (!dcModel) return [];
  const options = [];

  if (role.dataType === 'string' || role.statisticalRole === 'fixed_effect') {
    // Dimensional concepts for categorical/factor roles
    const dims = dcModel.dimensionalConcepts || {};
    for (const [name, info] of Object.entries(dims)) {
      if (name === 'note') continue;
      options.push({ value: name, label: name, type: 'dimensional', description: info.definition || '' });
    }
    // Also include shared dimensions from OC Instance Model
    const sharedDims = appState?.ocModel?.Observation?.sharedDimensions || {};
    for (const [name, info] of Object.entries(sharedDims)) {
      if (!options.find(o => o.value === name)) {
        options.push({ value: name, label: name, type: 'dimensional', description: info.relationship || '' });
      }
    }
  }

  // Derivation concepts (from categories)
  const categories = dcModel.categories || {};
  for (const [catName, cat] of Object.entries(categories)) {
    const concepts = cat.concepts || {};
    for (const [conceptName, conceptInfo] of Object.entries(concepts)) {
      options.push({
        value: conceptName,
        label: `${conceptName} (${catName})`,
        type: 'concept',
        description: conceptInfo.definition || ''
      });
    }
  }

  // For numeric roles, also offer dimensional concepts (sometimes used as covariates)
  if (role.dataType === 'numeric' && role.statisticalRole !== 'fixed_effect') {
    const dims = dcModel.dimensionalConcepts || {};
    for (const [name, info] of Object.entries(dims)) {
      if (name === 'note') continue;
      if (!options.find(o => o.value === name)) {
        options.push({ value: name, label: name, type: 'dimensional', description: info.definition || '' });
      }
    }
    // Also include shared dimensions from OC Instance Model
    const sharedDims = appState?.ocModel?.Observation?.sharedDimensions || {};
    for (const [name, info] of Object.entries(sharedDims)) {
      if (!options.find(o => o.value === name)) {
        options.push({ value: name, label: name, type: 'dimensional', description: info.relationship || '' });
      }
    }
  }

  return options;
}

// ===== Helper: Parse default interactions from expression =====

export function parseDefaultInteractions(defaultExpression) {
  if (!defaultExpression) return [];
  // Match patterns like "covariate:group" or "X:Y"
  const interactionPattern = /(\w+):(\w+)/g;
  const interactions = [];
  let match;
  while ((match = interactionPattern.exec(defaultExpression)) !== null) {
    interactions.push(`${match[1]}:${match[2]}`);
  }
  return interactions;
}

// ===== Helper: Classify bindings by statistical role =====

export function classifyBindings(customBindings, method) {
  const inputRoles = method.input_roles || [];
  const roleMap = {};
  for (const role of inputRoles) {
    roleMap[role.name] = role;
  }

  const grouped = {};
  for (const b of customBindings) {
    if (!grouped[b.methodRole]) grouped[b.methodRole] = [];
    grouped[b.methodRole].push(b);
  }

  const result = {
    response: [], covariate: [], fixed_effect: [],
    repeated_subject: [], repeated_factor: [], strata: [],
    // For assignment notation: roles without statisticalRole
    untyped: []
  };

  for (const [roleName, bindings] of Object.entries(grouped)) {
    const role = roleMap[roleName];
    if (!role) continue;
    // Use concept + dimension suffix for formula display
    const concepts = bindings.map(b => {
      let suffix = '';
      if (b.slice) {
        suffix = ` @ ${b.slice.charAt(0).toUpperCase() + b.slice.slice(1)}`;
      } else if (b.dimensionConstraints) {
        suffix = formatDimensionConstraints(b.dimensionConstraints);
      }
      return b.concept + suffix.replace(/ @ /g, '@');
    });
    const statRole = role.statisticalRole;
    if (statRole && result[statRole]) {
      result[statRole].push(...concepts);
    } else if (!statRole) {
      result.untyped.push(...concepts.map(c => ({ concept: c, roleName })));
    }
  }

  return { ...result, roleMap };
}

// ===== Helper: Build expression string =====

export function buildExpressionString(customBindings, method, interactions) {
  if (!customBindings || !method) return '';

  const notation = method.formula?.notation || 'assignment';
  const cls = classifyBindings(customBindings, method);

  if (notation === 'assignment') {
    return buildAssignmentExpression(customBindings, method, cls);
  } else if (notation === 'survival') {
    return buildSurvivalExpression(cls, interactions);
  } else {
    // wilkinson_rogers (default model formula)
    return buildWilkinsonExpression(cls, interactions);
  }
}

export function buildWilkinsonExpression(cls, interactions) {
  const lhs = cls.response.join(' + ') || '?';
  const rhsParts = [...cls.covariate, ...cls.fixed_effect];
  let rhs = rhsParts.join(' + ') || '1';

  if (interactions?.length > 0) {
    rhs += ' + ' + interactions.join(' + ');
  }

  let expr = `${lhs} ~ ${rhs}`;

  if (cls.repeated_subject.length > 0 || cls.repeated_factor.length > 0) {
    const subj = cls.repeated_subject.join(', ');
    const factor = cls.repeated_factor.join(', ');
    if (subj && factor) expr += ` | ${subj} / ${factor}`;
    else if (subj) expr += ` | ${subj}`;
  }

  return expr;
}

export function buildSurvivalExpression(cls, interactions) {
  // Survival LHS: Surv(time, event) — response roles are time and event
  const survArgs = cls.response.length >= 2
    ? `Surv(${cls.response[0]}, ${cls.response[1]})`
    : cls.response.length === 1
      ? `Surv(${cls.response[0]})`
      : 'Surv(?)';

  const rhsParts = [...cls.covariate, ...cls.fixed_effect];

  if (interactions?.length > 0) {
    rhsParts.push(...interactions);
  }

  // Strata terms use strata() wrapper
  const strataParts = cls.strata.map(s => `strata(${s})`);
  const allRhs = [...rhsParts, ...strataParts];
  const rhs = allRhs.join(' + ') || '1';

  return `${survArgs} ~ ${rhs}`;
}

export function buildAssignmentExpression(customBindings, method, cls) {
  // Assignment notation: result := FUNC(variable) OVER (group)
  // Use the method's default_expression as template, substituting bound concepts
  const defaultExpr = method.formula?.default_expression || '';
  if (!defaultExpr) return '';

  const inputRoles = method.input_roles || [];
  const roleMap = {};
  for (const role of inputRoles) {
    roleMap[role.name] = role;
  }

  // Build role->concepts mapping
  const roleConcepts = {};
  for (const b of customBindings) {
    if (!roleConcepts[b.methodRole]) roleConcepts[b.methodRole] = [];
    roleConcepts[b.methodRole].push(b.concept);
  }

  // Replace role placeholders in default expression
  let expr = defaultExpr;
  for (const role of inputRoles) {
    const concepts = roleConcepts[role.name] || [];
    if (concepts.length > 0) {
      const replacement = concepts.join(', ');
      // Replace the role name in the expression (case-insensitive)
      expr = expr.replace(new RegExp(`\\b${role.name}\\b`, 'gi'), replacement);
    }
  }

  return expr;
}

/**
 * Build a ResolvedExpression object for the study eSAP model.
 * Includes notation, template (method default), resolved (with concepts), and active interactions.
 */
export function buildResolvedExpressionObject(customBindings, method, interactions) {
  if (!method?.formula) return null;
  const resolved = buildExpressionString(customBindings, method, interactions || []);
  if (!resolved) return null;
  return {
    notation: method.formula.notation || 'assignment',
    resolved,
    interactions: (interactions || []).length > 0 ? [...interactions] : undefined
  };
}

// ===== Helper: Render formula with colored spans =====

export function renderFormulaExpression(customBindings, method, interactions) {
  if (!customBindings || !method) return '';

  const notation = method.formula?.notation || 'assignment';
  const inputRoles = method.input_roles || [];
  const roleMap = {};
  for (const role of inputRoles) {
    roleMap[role.name] = role;
  }

  // Build lookups: concept -> statistical role, concept -> display options
  // Use concept + dim suffix as key to distinguish same concept at different slices
  const conceptRoleMap = {};
  const conceptOptsMap = {};
  for (const b of customBindings) {
    const role = roleMap[b.methodRole];
    if (role) {
      let suffix = '';
      if (b.slice) {
        suffix = ` @ ${b.slice.charAt(0).toUpperCase() + b.slice.slice(1)}`;
      } else if (b.dimensionConstraints) {
        suffix = formatDimensionConstraints(b.dimensionConstraints);
      }
      const key = b.concept + suffix.replace(/ @ /g, '@');
      if (role.statisticalRole) conceptRoleMap[key] = role.statisticalRole;
      const opts = {};
      if (role.dataType) opts.dataType = role.dataType;
      if (b.qualifierType) opts.qualifierType = b.qualifierType;
      if (b.qualifierValue) opts.qualifierValue = b.qualifierValue;
      if (b.slice) {
        opts.slice = b.slice;
        opts.namedSlices = buildSliceLookup(appState.selectedTransformation);
      } else if (b.dimensionConstraints) {
        opts.dimensionConstraints = b.dimensionConstraints;
      }
      conceptOptsMap[key] = opts;
    }
  }

  function colorSpan(concept, overrideRole) {
    const statRole = overrideRole || conceptRoleMap[concept] || '';
    const cssClass = statRole ? `formula-term-${statRole.replace(/_/g, '-')}` : '';
    return `<span class="${cssClass}">${displayConcept(concept, conceptOptsMap[concept])}</span>`;
  }

  const op = (s) => `<span class="formula-operator">${s}</span>`;

  const cls = classifyBindings(customBindings, method);

  if (notation === 'assignment') {
    return renderAssignmentFormula(customBindings, method, cls, colorSpan, op);
  } else if (notation === 'survival') {
    return renderSurvivalFormula(cls, interactions, colorSpan, op, conceptRoleMap, conceptOptsMap);
  } else {
    return renderWilkinsonFormula(cls, interactions, colorSpan, op, conceptRoleMap, conceptOptsMap);
  }
}

export function renderWilkinsonFormula(cls, interactions, colorSpan, op, conceptRoleMap, conceptOptsMap) {
  const lhs = cls.response.map(c => colorSpan(c)).join(` ${op('+')} `) || '?';
  const rhsParts = [
    ...cls.covariate.map(c => colorSpan(c)),
    ...cls.fixed_effect.map(c => colorSpan(c))
  ];

  const interParts = (interactions || []).map(inter => {
    const [a, b] = inter.split(':');
    const aRole = conceptRoleMap[a] || 'covariate';
    const bRole = conceptRoleMap[b] || 'fixed_effect';
    return `<span class="formula-term-${aRole.replace(/_/g, '-')}">${displayConcept(a, conceptOptsMap[a])}</span>${op(':')}<span class="formula-term-${bRole.replace(/_/g, '-')}">${displayConcept(b, conceptOptsMap[b])}</span>`;
  });

  const allRhs = [...rhsParts, ...interParts];
  let html = `${lhs} ${op('~')} ${allRhs.join(` ${op('+')} `) || '1'}`;

  if (cls.repeated_subject.length > 0 || cls.repeated_factor.length > 0) {
    const subj = cls.repeated_subject.map(c => `<span class="formula-term-repeated">${displayConcept(c, conceptOptsMap[c])}</span>`).join(', ');
    const factor = cls.repeated_factor.map(c => `<span class="formula-term-repeated">${displayConcept(c, conceptOptsMap[c])}</span>`).join(', ');
    if (subj && factor) html += ` ${op('|')} ${subj} ${op('/')} ${factor}`;
    else if (subj) html += ` ${op('|')} ${subj}`;
  }

  return html;
}

export function renderSurvivalFormula(cls, interactions, colorSpan, op, conceptRoleMap, conceptOptsMap) {
  // Surv(time, event) ~ covariates + factors + strata(strata_var)
  let survLhs;
  if (cls.response.length >= 2) {
    survLhs = `${op('Surv(')}${colorSpan(cls.response[0])}${op(',')} ${colorSpan(cls.response[1])}${op(')')}`;
  } else if (cls.response.length === 1) {
    survLhs = `${op('Surv(')}${colorSpan(cls.response[0])}${op(')')}`;
  } else {
    survLhs = `${op('Surv(?)')}`;
  }

  const rhsParts = [
    ...cls.covariate.map(c => colorSpan(c)),
    ...cls.fixed_effect.map(c => colorSpan(c))
  ];

  const interParts = (interactions || []).map(inter => {
    const [a, b] = inter.split(':');
    const aRole = conceptRoleMap[a] || 'covariate';
    const bRole = conceptRoleMap[b] || 'fixed_effect';
    return `<span class="formula-term-${aRole.replace(/_/g, '-')}">${displayConcept(a, conceptOptsMap[a])}</span>${op(':')}<span class="formula-term-${bRole.replace(/_/g, '-')}">${displayConcept(b, conceptOptsMap[b])}</span>`;
  });

  // Strata get special wrapping
  const strataParts = cls.strata.map(s =>
    `${op('strata(')}${colorSpan(s, 'strata')}${op(')')}`
  );

  const allRhs = [...rhsParts, ...interParts, ...strataParts];
  return `${survLhs} ${op('~')} ${allRhs.join(` ${op('+')} `) || '1'}`;
}

export function renderAssignmentFormula(customBindings, method, cls, colorSpan, op) {
  // For assignment notation, render the expression with substituted concepts
  const defaultExpr = method.formula?.default_expression || '';
  if (!defaultExpr) return '';

  const inputRoles = method.input_roles || [];
  const roleConcepts = {};
  for (const b of customBindings) {
    if (!roleConcepts[b.methodRole]) roleConcepts[b.methodRole] = [];
    roleConcepts[b.methodRole].push(b.concept);
  }

  // Tokenize and colorize: replace role names with colored spans
  let html = defaultExpr;

  // Replace keywords with operator spans
  const keywords = ['OVER', 'MEAN', 'MEDIAN', 'SUM', 'COUNT', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'];
  for (const kw of keywords) {
    html = html.replace(new RegExp(`\\b${kw}\\b`, 'g'), `<span class="formula-operator">${kw}</span>`);
  }
  // Replace := operator
  html = html.replace(':=', op(':='));
  // Replace result keyword
  html = html.replace(/\bresult\b/, `<span class="formula-term-response">result</span>`);

  // Replace role names with colored concept names
  for (const role of inputRoles) {
    const concepts = roleConcepts[role.name] || [];
    if (concepts.length > 0) {
      const statRole = role.statisticalRole || 'response';
      const replacement = concepts.map(c => colorSpan(c, statRole)).join(', ');
      html = html.replace(new RegExp(`\\b${role.name}\\b`, 'gi'), replacement);
    }
  }

  return html;
}

// ===== Helper: Generate all possible interaction pairings =====

export function generateInteractionPairings(customBindings, method) {
  if (!customBindings || !method) return [];
  const notation = method.formula?.notation || 'assignment';
  // Interactions only apply to model-formula notations
  if (notation === 'assignment') return [];

  const cls = classifyBindings(customBindings, method);

  const pairings = [];
  // Covariate x fixed_effect interactions
  for (const cov of cls.covariate) {
    for (const fe of cls.fixed_effect) {
      pairings.push(`${cov}:${fe}`);
    }
  }
  // Fixed_effect x fixed_effect interactions (when multiple factors)
  if (cls.fixed_effect.length > 1) {
    for (let i = 0; i < cls.fixed_effect.length; i++) {
      for (let j = i + 1; j < cls.fixed_effect.length; j++) {
        pairings.push(`${cls.fixed_effect[i]}:${cls.fixed_effect[j]}`);
      }
    }
  }
  return pairings;
}

// ===== Helper: Render interactive bindings =====

export function renderInteractiveBindings(customBindings, method, dcModel) {
  if (!method || !customBindings) return '';

  const inputRoles = method.input_roles || [];
  const roleMap = {};
  for (const role of inputRoles) {
    roleMap[role.name] = role;
  }

  // Group bindings by methodRole
  const grouped = {};
  for (const b of customBindings) {
    if (!grouped[b.methodRole]) grouped[b.methodRole] = [];
    grouped[b.methodRole].push(b);
  }

  // Track which bindings came from the original template
  // Use the transformation library's version as the ground truth
  const lib = appState.transformationLibrary;
  const originalTransform = lib?.analysisTransformations?.find(
    t => t.oid === appState.selectedTransformation?.oid
  );
  const templateConcepts = new Set(
    (originalTransform?.bindings || appState.selectedTransformation?.bindings || [])
      .filter(b => b.direction !== 'output')
      .map(b => `${b.methodRole}|${b.concept}`)
  );

  let html = '';

  for (const role of inputRoles) {
    const bindings = grouped[role.name] || [];
    const cardinalityLabel = role.cardinality === 'single' ? 'single'
      : role.cardinality === 'multiple' ? 'multiple'
      : 'single or multiple';
    const requiredLabel = role.required ? 'required' : 'optional';

    const canAdd = role.cardinality === 'multiple' || role.cardinality === 'single_or_multiple';
    const canRemove = (b) => {
      const isTemplate = templateConcepts.has(`${b.methodRole}|${b.concept}`);
      if (!isTemplate) return true;  // custom bindings always removable
      if (role.cardinality === 'single' && role.required) return false;
      if (role.required && bindings.length <= 1) return false;
      return true;
    };

    html += `<div class="binding-role-group">`;
    html += `<div class="binding-role-header">
      <span class="binding-role-name">${role.name}</span>
      <span class="binding-role-cardinality">(${cardinalityLabel}, ${requiredLabel})</span>
    </div>`;

    for (let i = 0; i < bindings.length; i++) {
      const b = bindings[i];
      const isTemplate = templateConcepts.has(`${b.methodRole}|${b.concept}`);
      const isCustom = !isTemplate;
      const isDimensional = b.dataStructureRole === 'dimension';

      const bindingDisplayOpts = { dataType: role.dataType };
      if (b.qualifierType) bindingDisplayOpts.qualifierType = b.qualifierType;
      if (b.qualifierValue) bindingDisplayOpts.qualifierValue = b.qualifierValue;
      if (b.slice) {
        bindingDisplayOpts.slice = b.slice;
        bindingDisplayOpts.namedSlices = buildSliceLookup(appState.selectedTransformation);
      } else if (b.dimensionConstraints) {
        bindingDisplayOpts.dimensionConstraints = b.dimensionConstraints;
      }

      // Resolve dimensional shape from DC/OC models
      const namedSlicesStandalone = buildSliceLookup(appState.selectedTransformation);
      const shapeStandalone = resolveBindingShape(b.concept, b, appState.dcModel, appState.ocModel, namedSlicesStandalone);
      const standaloneBindingId = `standalone-${role.name}-${i}`;
      const shapeHtmlStandalone = renderShapeAnnotation(shapeStandalone, standaloneBindingId);

      html += `<div class="binding-row ${isCustom ? 'binding-row-custom' : ''}" style="flex-direction:column; align-items:flex-start;">
        <div style="display:flex; align-items:center; gap:6px; width:100%;">
          <span class="binding-concept"><code>${displayConcept(b.concept, bindingDisplayOpts)}</code>${b.description ? ` — "${b.description}"` : ''}</span>
          <span class="binding-badge badge ${isDimensional ? 'badge-teal' : 'badge-blue'}">${b.dataStructureRole || (isDimensional ? 'dimension' : 'measure')}</span>
          ${isCustom ? '<span class="binding-badge badge badge-secondary">custom</span>' : ''}
          ${canRemove(b) ? `<button class="binding-remove" data-role="${role.name}" data-index="${i}" title="Remove" style="margin-left:auto;">&times;</button>` : ''}
        </div>
        ${shapeHtmlStandalone}
      </div>`;
    }

    if (canAdd) {
      const options = getConceptOptions(role, dcModel);
      // For multi-cardinality roles, allow same concept with different dimensional constraints
      // Only filter out exact duplicates (same concept + same constraints)
      const boundKeys = new Set(bindings.map(b => {
        const sliceStr = b.slice || (b.dimensionConstraints ? JSON.stringify(b.dimensionConstraints) : '');
        return `${b.concept}|${sliceStr}`;
      }));
      const available = options.filter(o => !boundKeys.has(`${o.value}|`));

      const addLabel = role.statisticalRole === 'fixed_effect' ? 'Factor'
        : role.statisticalRole === 'covariate' ? 'Covariate'
        : 'Binding';

      // Get available visit labels for dimensional constraint dropdown
      const visitLabels = appState.selectedStudy ? getVisitLabels(appState.selectedStudy) : [];

      html += `<div class="binding-add-row">
        <span class="binding-add-label">+ Add ${addLabel}</span>
        <select class="binding-add-select" data-role="${role.name}">
          <option value="">Select concept...</option>
          ${available.map(o => `<option value="${o.value}" data-type="${o.type}">${displayConcept(o.label)}</option>`).join('')}
        </select>
        <select class="binding-dim-constraint" data-role="${role.name}" style="display:none; margin-left:4px;">
          <option value="">@ (no constraint)</option>
          ${visitLabels.map(v => `<option value="${v}">@ ${v}</option>`).join('')}
        </select>
      </div>`;
    }

    html += `</div>`;
  }

  return html;
}


/**
 * Render dimensional shape line and expandable provenance panel for a binding.
 * Returns HTML string with a "Dims:" line and a hidden provenance detail block.
 */
function renderShapeAnnotation(shape, bindingId) {
  if (!shape) return '';

  let dimsLine = '';
  if (shape.source === 'category') {
    // C.* concept: show free dimensions joined with ×
    const freeParts = shape.freeDimensions.length > 0 ? shape.freeDimensions.join(' × ') : 'scalar';
    dimsLine = `Dims: ${freeParts}`;
  } else {
    // Dimensional concept or shared dimension: show cardinality
    const card = shape.cardinality || '0..1';
    dimsLine = `Dims: per observation (${card})`;
  }

  // Build provenance detail rows
  const provenanceRows = [];
  if (shape.source === 'category') {
    provenanceRows.push(`Layer: DC (${shape.categoryName})`);
    if (shape.valueType) provenanceRows.push(`ValueType: ${shape.valueType}`);
    if (Object.keys(shape.fixedDimensions).length > 0) {
      const fixed = Object.entries(shape.fixedDimensions).map(([k, v]) => `${k} = ${v}`).join(', ');
      provenanceRows.push(`Fixed: ${fixed}`);
    }
  } else if (shape.source === 'dimensionalConcept') {
    provenanceRows.push('Layer: DC (dimensionalConcept)');
    if (shape.valueType) provenanceRows.push(`ValueType: ${shape.valueType}`);
    if (shape.relationship) provenanceRows.push(`Relationship: ${shape.relationship}`);
    if (shape.cardinality) provenanceRows.push(`Cardinality: ${shape.cardinality}`);
  } else if (shape.source === 'sharedDimension') {
    provenanceRows.push('Layer: OC (sharedDimensions)');
    if (shape.valueType) provenanceRows.push(`ValueType: ${shape.valueType}`);
    if (shape.relationship) provenanceRows.push(`Relationship: ${shape.relationship}`);
    if (shape.cardinality) provenanceRows.push(`Cardinality: ${shape.cardinality}`);
  }
  if (shape.qualifierType && shape.qualifierValue) {
    provenanceRows.push(`${shape.qualifierType} = ${shape.qualifierValue}`);
  }

  const provenanceHtml = provenanceRows.length > 0 ? `
    <div class="binding-provenance" data-binding-id="${bindingId}" style="display:none; margin-top:4px; padding:6px 10px; background:rgba(0,0,0,0.02); border:1px solid var(--cdisc-border); border-radius:var(--radius); font-size:10px; line-height:1.6; color:var(--cdisc-text-secondary);">
      ${provenanceRows.map(r => `<div>${r}</div>`).join('')}
    </div>` : '';

  return `
    <div class="binding-shape-line" data-binding-id="${bindingId}" style="font-size:10px; color:var(--cdisc-text-secondary); margin-top:2px; cursor:pointer;" title="Click to show model provenance">
      ${dimsLine}
    </div>
    ${provenanceHtml}`;
}


/**
 * Render interactive bindings filtered by dataStructureRole ('measure' or 'dimension').
 * Used by endpoint-how.js to split bindings into "Input Measures" and "Input Dimensions" sections.
 *
 * Adds cube-structure annotations:
 * - Endpoint linkage on response bindings ("from endpoint: ...")
 * - Slice resolution inline ("slice: baseline -> AnalysisVisit = Baseline")
 * - Value type badges
 */
export function renderInteractiveBindingsByRole(customBindings, method, dcModel, roleFilter, paramValue, derivation, transform) {
  if (!method || !customBindings) return '';

  const inputRoles = method.input_roles || [];
  const roleMap = {};
  for (const role of inputRoles) {
    roleMap[role.name] = role;
  }

  // Filter bindings to only those matching the roleFilter
  const filteredBindings = customBindings.filter(b => {
    const dsRole = b.dataStructureRole || 'measure';
    return dsRole === roleFilter;
  });

  if (filteredBindings.length === 0) return '';

  // Group filtered bindings by methodRole
  const grouped = {};
  for (const b of filteredBindings) {
    if (!grouped[b.methodRole]) grouped[b.methodRole] = [];
    grouped[b.methodRole].push(b);
  }

  // Track template bindings
  const lib = appState.transformationLibrary;
  const originalTransform = lib?.analysisTransformations?.find(
    t => t.oid === appState.selectedTransformation?.oid
  );
  const templateConcepts = new Set(
    (originalTransform?.bindings || appState.selectedTransformation?.bindings || [])
      .filter(b => b.direction !== 'output')
      .map(b => `${b.methodRole}|${b.concept}`)
  );

  const rawSlices = buildSliceLookup(transform);

  // Resolve slice dimension values: per-slice user overrides > {placeholder} resolution > template defaults
  const activeSpec = appState.endpointSpecs?.[appState.activeEndpointId] || {};
  const dimValues = activeSpec.dimensionValues || {};
  const sliceOverrides = activeSpec.sliceDimensionOverrides || {};
  const resolvedParamValue = paramValue || dimValues.Parameter || '';
  const namedSlices = {};
  for (const [name, def] of Object.entries(rawSlices)) {
    const fixedDims = {};
    const overrides = sliceOverrides[name] || {};
    for (const [dim, val] of Object.entries(def.fixedDimensions || def)) {
      // 1. Per-slice user override takes precedence
      if (overrides[dim] !== undefined && overrides[dim] !== '') {
        fixedDims[dim] = overrides[dim];
      } else if (typeof val === 'string' && val.startsWith('{') && val.endsWith('}')) {
        // 2. Full placeholder — resolve from endpoint dimension values
        const key = val.slice(1, -1);
        const dimKey = key.charAt(0).toUpperCase() + key.slice(1);
        fixedDims[dim] = dimValues[dimKey] || dimValues[key] || val;
      } else if (typeof val === 'string' && val.includes('{')) {
        // 3. Partial placeholder — resolve inline tokens
        let resolved = val;
        resolved = resolved.replace(/\{parameter\}/gi, resolvedParamValue || '{parameter}');
        resolved = resolved.replace(/\{(\w+)\}/g, (match, key) => {
          const dimKey = key.charAt(0).toUpperCase() + key.slice(1);
          return dimValues[dimKey] || dimValues[key] || match;
        });
        fixedDims[dim] = resolved;
      } else {
        fixedDims[dim] = val;  // 4. Literal — preserve as-is
      }
    }
    namedSlices[name] = { fixedDimensions: fixedDims };
  }

  let html = '';

  // Only show roles that have bindings matching this filter (or can add them)
  for (const role of inputRoles) {
    const bindings = grouped[role.name] || [];
    // For dimension filter, only show roles whose bindings are dimensions
    // For measure filter, only show roles whose bindings are measures
    // Also show roles that have no bindings yet but would match (based on statisticalRole)
    const roleMatchesFilter = roleFilter === 'dimension'
      ? (role.statisticalRole === 'fixed_effect' || role.statisticalRole === 'strata')
      : (role.statisticalRole !== 'fixed_effect' && role.statisticalRole !== 'strata');

    if (bindings.length === 0 && !roleMatchesFilter) continue;

    const cardinalityLabel = role.cardinality === 'single' ? 'single'
      : role.cardinality === 'multiple' ? 'multiple'
      : 'single or multiple';
    const requiredLabel = role.required ? 'required' : 'optional';

    const canAdd = role.cardinality === 'multiple' || role.cardinality === 'single_or_multiple';
    const canRemove = (b) => {
      const isTemplate = templateConcepts.has(`${b.methodRole}|${b.concept}`);
      if (!isTemplate) return true;  // custom bindings always removable
      if (role.cardinality === 'single' && role.required) return false;
      if (role.required && bindings.length <= 1) return false;
      return true;
    };

    html += `<div class="binding-role-group">`;
    html += `<div class="binding-role-header">
      <span class="binding-role-name">${role.name}</span>
      <span class="binding-role-cardinality">(${cardinalityLabel}, ${requiredLabel})</span>
    </div>`;

    for (let i = 0; i < bindings.length; i++) {
      const b = bindings[i];
      const isTemplate = templateConcepts.has(`${b.methodRole}|${b.concept}`);
      const isCustom = !isTemplate;

      const bindingDisplayOpts = { dataType: role.dataType };
      if (b.qualifierType) bindingDisplayOpts.qualifierType = b.qualifierType;
      if (b.qualifierValue) bindingDisplayOpts.qualifierValue = b.qualifierValue;
      if (b.slice) {
        bindingDisplayOpts.slice = b.slice;
        bindingDisplayOpts.namedSlices = namedSlices;
      } else if (b.dimensionConstraints) {
        bindingDisplayOpts.dimensionConstraints = b.dimensionConstraints;
      }

      // Endpoint linkage annotation for the response binding
      const isResponse = role.statisticalRole === 'response' && i === 0;
      const endpointLink = isResponse && paramValue
        ? `<div style="font-size:10px; color:var(--cdisc-primary); margin-top:2px;">\u2190 from endpoint: "${paramValue}"</div>`
        : '';

      // Slice resolution annotation — editable inline inputs for each dimension value
      let sliceAnnotation = '';
      if (b.slice && namedSlices[b.slice]) {
        const sliceDef = namedSlices[b.slice];
        const dims = sliceDef.fixedDimensions || sliceDef;
        const dimInputs = Object.entries(dims).map(([k, v]) => {
          const inputId = `slice-dim-${b.slice}-${k}-${role.name}-${i}`;
          return `<span style="display:inline-flex; align-items:center; gap:2px;">
            <span class="badge badge-teal" style="font-size:9px; padding:0 4px;">${k}</span>=<input
              class="ep-slice-dim-input" data-slice-name="${b.slice}" data-dim="${k}" data-role="${role.name}" data-binding-idx="${i}"
              id="${inputId}" value="${v}" placeholder="${k}"
              style="font-size:10px; padding:1px 4px; border:1px solid var(--cdisc-border); border-radius:3px; width:${Math.max(60, v.length * 7)}px; color:var(--cdisc-accent2); background:transparent;">
          </span>`;
        }).join(' ');
        sliceAnnotation = `<div style="font-size:10px; color:var(--cdisc-accent2); margin-top:4px; display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
          <span style="color:var(--cdisc-text-secondary);">slice: ${b.slice} →</span> ${dimInputs}
        </div>`;
      }

      // Value type badge
      const valueType = b.requiredValueType || '';

      // Resolve dimensional shape from DC/OC models
      const shape = resolveBindingShape(b.concept, b, appState.dcModel, appState.ocModel, namedSlices);
      const bindingId = `byrole-${role.name}-${i}`;
      const shapeValueType = shape?.valueType || valueType;
      const shapeHtml = renderShapeAnnotation(shape, bindingId);

      html += `<div class="binding-row ${isCustom ? 'binding-row-custom' : ''}" style="flex-direction:column; align-items:flex-start;">
        <div style="display:flex; align-items:center; gap:6px; width:100%;">
          <span class="binding-concept"><code>${displayConcept(b.concept, bindingDisplayOpts)}</code></span>
          <span class="binding-badge badge ${roleFilter === 'dimension' ? 'badge-teal' : 'badge-blue'}">${roleFilter}</span>
          ${shapeValueType ? `<span style="font-size:9px; color:var(--cdisc-text-secondary);">${shapeValueType}</span>` : ''}
          ${isCustom ? '<span class="binding-badge badge badge-secondary">custom</span>' : ''}
          ${canRemove(b) ? `<button class="binding-remove" data-role="${role.name}" data-index="${i}" title="Remove" style="margin-left:auto;">&times;</button>` : ''}
        </div>
        ${endpointLink}
        ${sliceAnnotation}
        ${shapeHtml}
      </div>`;
    }

    if (canAdd) {
      const options = getConceptOptions(role, dcModel);
      const boundKeys = new Set(bindings.map(b => {
        const sliceStr = b.slice || (b.dimensionConstraints ? JSON.stringify(b.dimensionConstraints) : '');
        return `${b.concept}|${sliceStr}`;
      }));
      const available = options.filter(o => !boundKeys.has(`${o.value}|`));

      const addLabel = role.statisticalRole === 'fixed_effect' ? 'Factor'
        : role.statisticalRole === 'covariate' ? 'Covariate'
        : 'Binding';

      const visitLabels = appState.selectedStudy ? getVisitLabels(appState.selectedStudy) : [];

      html += `<div class="binding-add-row">
        <span class="binding-add-label">+ Add ${addLabel}</span>
        <select class="binding-add-select" data-role="${role.name}">
          <option value="">Select concept...</option>
          ${available.map(o => `<option value="${o.value}" data-type="${o.type}">${displayConcept(o.label)}</option>`).join('')}
        </select>
        <select class="binding-dim-constraint" data-role="${role.name}" style="display:none; margin-left:4px;">
          <option value="">@ (no constraint)</option>
          ${visitLabels.map(v => `<option value="${v}">@ ${v}</option>`).join('')}
        </select>
      </div>`;
    }

    html += `</div>`;
  }

  return html;
}


// ===== Main render function =====

export async function renderTransformationConfig(container) {
  const study = appState.selectedStudy;
  const transformation = appState.selectedTransformation;
  const lib = appState.transformationLibrary;

  if (!transformation || !study) {
    container.innerHTML = '<div class="card" style="text-align:center; padding:40px;"><h3>Missing prerequisites</h3><p style="margin-top:8px; color:var(--cdisc-text-secondary);">Please select a study and configure a transformation first.</p></div>';
    return;
  }

  const currentEp = getAllEndpoints(study).find(ep => ep.id === appState.currentEndpointId);

  // Show loading while method loads
  container.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading method details...</span></div>`;

  let method = null;
  try {
    method = await loadMethod(appState, transformation.usesMethod);
  } catch (e) {
    console.warn('Could not load method:', e);
  }

  // Initialize resolvedBindings from template if null
  if (appState.resolvedBindings === null) {
    appState.resolvedBindings = JSON.parse(JSON.stringify(
      (transformation.bindings || []).filter(b => b.direction !== 'output')
    ));
  }

  // Initialize dimensionalSliceValues as a flat { dim: value } map
  if (appState.dimensionalSliceValues === null && transformation.sliceKeys) {
    const values = {};
    const configKeyMap = { Parameter: 'parameter', AnalysisVisit: 'visit', Population: 'population' };
    const epSpec = appState.endpointSpecs?.[appState.currentEndpointId];
    const specDimValues = epSpec?.dimensionValues || {};

    for (const sk of transformation.sliceKeys) {
      const dim = sk.dimension;
      values[dim] = null;
      if (specDimValues[dim]) {
        values[dim] = specDimValues[dim];
        continue;
      }
      const configKey = configKeyMap[dim];
      if (configKey) {
        for (const cp of appState.composedPhrases) {
          if (cp.config[configKey]) { values[dim] = cp.config[configKey]; break; }
        }
      }
    }
    appState.dimensionalSliceValues = values;
  }

  // Initialize methodConfig from endpoint spec if null
  if (appState.methodConfig === null) {
    const epSpec = appState.endpointSpecs?.[appState.currentEndpointId];
    appState.methodConfig = { ...(epSpec?.methodConfigOverrides || {}) };
  }

  // Initialize activeInteractions from default expression
  if (appState.activeInteractions.length === 0 && method?.formula?.default_expression) {
    const defaultInteractions = parseDefaultInteractions(method.formula.default_expression);
    // Map role names to actual concept names from bindings
    if (defaultInteractions.length > 0) {
      const roleMap = {};
      for (const role of (method.input_roles || [])) {
        roleMap[role.name] = role;
      }
      // Build a role->concepts lookup from current bindings
      const roleConcepts = {};
      for (const b of appState.resolvedBindings) {
        if (!roleConcepts[b.methodRole]) roleConcepts[b.methodRole] = [];
        roleConcepts[b.methodRole].push(b.concept);
      }
      // Default interactions use role names — only pre-check if we can resolve them
      // We don't pre-check by default since default_expression typically has "covariate:group"
      // which are role names, not concept names. Interactions are opt-in.
    }
  }

  const customBindings = appState.resolvedBindings;
  const outputMapping = getOutputMapping(transformation, appState.acModel, method, customBindings, appState.activeInteractions);
  const dimensions = getDimensions(transformation);
  const methodConfigs = method ? getMethodConfigurations(method, transformation, appState.methodConfig || {}) : [];
  const popNames = getPopulationNames(study);
  const popMap = {};
  for (const p of popNames) {
    popMap[p.value] = p.label;
  }
  const epSpec = appState.endpointSpecs?.[appState.currentEndpointId];
  const syntaxPrefix = (currentEp && epSpec) ? buildSyntaxTemplatePlainText(currentEp, epSpec, study) : '';
  const resolvedSentence = composeFullSentence(appState.composedPhrases, lib, { population: popMap }, syntaxPrefix);

  // Build concept → display options map at this scope (used by formula rendering + output spec cards)
  // Each entry: { dataType, qualifierType, qualifierValue, dimensionConstraints }
  const conceptDisplayOpts = {};
  if (method?.input_roles && customBindings) {
    const roleMap = {};
    for (const role of method.input_roles) roleMap[role.name] = role;
    for (const b of customBindings) {
      const role = roleMap[b.methodRole];
      const opts = {};
      if (role?.dataType) opts.dataType = role.dataType;
      if (b.qualifierType) opts.qualifierType = b.qualifierType;
      if (b.qualifierValue) opts.qualifierValue = b.qualifierValue;
      if (b.slice) {
        opts.slice = b.slice;
        opts.namedSlices = buildSliceLookup(transformation);
      } else if (b.dimensionConstraints) {
        opts.dimensionConstraints = b.dimensionConstraints;
      }
      conceptDisplayOpts[b.concept] = opts;
    }
  }

  // Build formula and interaction data
  const hasFormula = !!method?.formula;
  const notation = method?.formula?.notation || '';
  const hasModelFormula = notation === 'wilkinson_rogers' || notation === 'survival';
  const formulaHtml = hasFormula ? renderFormulaExpression(customBindings, method, appState.activeInteractions) : '';
  const interactionPairings = hasModelFormula ? generateInteractionPairings(customBindings, method) : [];

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:24px;">
      <div>
        <h2 style="font-size:18px; font-weight:700;">Transformation Configuration</h2>
        <p style="color:var(--cdisc-text-secondary); font-size:13px; margin-top:4px;">
          ${currentEp ? `${currentEp.name}${appState.endpointSpecs?.[appState.currentEndpointId]?.conceptCategory ? ` [${appState.endpointSpecs[appState.currentEndpointId].conceptCategory}]` : ''}: ` : ''}${transformation.name}
        </p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="btn-back-sp">&larr; Back to SmartPhrases</button>
        <button class="btn btn-primary" id="btn-configure-derivations">Configure Derivations &rarr;</button>
      </div>
    </div>

    <!-- Composed Sentence -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:8px; font-size:14px;">Analysis Description</div>
      <div class="sentence-preview">${resolvedSentence || '<em>No sentence composed</em>'}</div>
    </div>

    <!-- Transformation Overview -->
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section">
        <div class="transform-section-title">Analysis Transformation</div>
        <table class="data-table">
          <tbody>
            <tr><td style="width:160px; font-weight:600;">Name</td><td>${transformation.name}</td></tr>
            <tr><td style="font-weight:600;">OID</td><td><code>${transformation.oid}</code></td></tr>
            <tr><td style="font-weight:600;">Method</td><td><code>${transformation.usesMethod}</code></td></tr>
            <tr><td style="font-weight:600;">AC Category</td><td><span class="badge badge-blue">${transformation.acCategory || 'N/A'}</span></td></tr>
            ${transformation.description ? `<tr><td style="font-weight:600;">Description</td><td>${transformation.description}</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Interactive Input Bindings -->
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section" style="margin-bottom:0;">
        <div class="transform-section-title">Input Bindings</div>
        <div id="interactive-bindings">
          ${method ? renderInteractiveBindings(customBindings, method, appState.dcModel) : `
            <table class="data-table">
              <thead><tr><th>Method Role</th><th>Concept</th><th>Source</th><th>Type</th></tr></thead>
              <tbody>
                ${getInputBindings(transformation).map(b => `
                  <tr>
                    <td style="font-weight:600;">${b.role}</td>
                    <td><code>${displayConcept(b.concept, {
                      qualifierType: b.qualifierType,
                      qualifierValue: b.qualifierValue
                    })}</code></td>
                    <td>${b.from || b.description || '-'}</td>
                    <td><span class="badge ${b.dataStructureRole === 'dimension' ? 'badge-teal' : 'badge-blue'}">${b.dataStructureRole || 'measure'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    </div>

    <!-- Dimensional Slices -->
    ${transformation.sliceKeys?.length > 0 ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section" style="margin-bottom:0;">
        <div class="transform-section-title">Dimensional Slices</div>
        <p style="font-size:12px; color:var(--cdisc-text-secondary); margin-bottom:12px;">
          Configure the specific dimension values this analysis operates on.
        </p>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px;" id="dimensional-slices">
          ${transformation.sliceKeys.map(sk => {
            const dim = sk.dimension;
            const userValue = (appState.dimensionalSliceValues || {})[dim] || null;
            let options = [];
            if (sk.source === 'biomedicalConcept' || sk.source === 'endpoint') {
              options = getEndpointParameterOptions(study, appState.currentEndpointId, appState.endpointSpecs);
            } else if (sk.source === 'visit') {
              options = getVisitLabels(study);
            } else if (sk.source === 'population') {
              options = getPopulationNames(study);
            }
            return `
              <div class="config-field">
                <label class="config-label">${dim}</label>
                <select class="config-select" data-slice-dim="${dim}">
                  <option value="">-- Select --</option>
                  ${options.map(opt => {
                    const v = typeof opt === 'object' ? opt.value : opt;
                    const l = typeof opt === 'object' ? opt.label : opt;
                    const tip = typeof opt === 'object' && opt.label !== opt.value ? ` title="${l}"` : '';
                    return `<option value="${v}"${tip} ${v === userValue ? 'selected' : ''}>${v}</option>`;
                  }).join('')}
                </select>
                <div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:4px;">Source: ${sk.source}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Model Expression -->
    ${hasFormula ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section" style="margin-bottom:0;">
        <div class="transform-section-title">Model Expression</div>
        ${method.formula.generic_expression ? `
          <div style="font-size:12px; color:var(--cdisc-text-secondary); margin-bottom:10px;">
            Template: <code style="font-family:'SF Mono','Fira Code','Consolas',monospace; background:var(--cdisc-background); padding:2px 6px; border-radius:4px;">${method.formula.generic_expression}</code>
          </div>
        ` : ''}
        <div class="formula-display" id="formula-display">${formulaHtml}</div>
        ${hasModelFormula ? (interactionPairings.length > 0 ? `
          <div style="margin-top:14px;">
            <div style="font-size:12px; font-weight:600; color:var(--cdisc-text-secondary); margin-bottom:6px;">Interaction terms:</div>
            <div class="interaction-list" id="interaction-list">
              ${interactionPairings.map(pair => {
                const checked = appState.activeInteractions.includes(pair);
                return `<label><input type="checkbox" data-interaction="${pair}" ${checked ? 'checked' : ''}> ${pair}</label>`;
              }).join('')}
            </div>
          </div>
        ` : `
          <div style="margin-top:8px; font-size:12px; color:var(--cdisc-text-secondary); font-style:italic;" id="interaction-placeholder">
            Add covariates and factors to enable interaction terms
          </div>
        `) : ''}
      </div>
    </div>
    ` : ''}

    <!-- Method Configuration -->
    ${methodConfigs.length > 0 ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section">
        <div class="transform-section-title">Method Configuration (${transformation.usesMethod})</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:16px;">
          ${methodConfigs.map(cfg => {
            const sourceColor = cfg.source === 'user' ? 'var(--cdisc-accent2)' : cfg.source === 'transformation' ? 'var(--cdisc-primary)' : 'var(--cdisc-text-secondary)';
            const sourceLabel = cfg.source === 'user' ? 'custom' : cfg.source === 'transformation' ? 'template' : 'default';
            return `
            <div class="config-field">
              <label class="config-label" style="display:flex; align-items:center; gap:6px;">
                ${cfg.label}
                <span style="font-size:9px; color:${sourceColor}; font-weight:500; text-transform:none; letter-spacing:0;">${sourceLabel}</span>
              </label>
              ${cfg.options.length > 0 ? `
                <select class="config-select" data-config-key="${cfg.key}">
                  ${cfg.options.map(opt => `
                    <option value="${opt}" ${String(opt) === String(cfg.value) ? 'selected' : ''}>${opt}</option>
                  `).join('')}
                </select>
              ` : `
                <input class="config-input" data-config-key="${cfg.key}" value="${cfg.value != null ? cfg.value : ''}" placeholder="${cfg.description}">
              `}
              ${cfg.description ? `<div style="font-size:11px; color:var(--cdisc-text-secondary); margin-top:4px;">${cfg.description}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Dimensions -->
    ${(dimensions.dimensions || []).length > 0 ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section">
        <div class="transform-section-title">Dimensions</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${dimensions.dimensions.map(d => `
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="badge badge-teal">${displayConcept(d.dimension)}</span>
              <span style="font-size:12px; color:var(--cdisc-text-secondary);">${d.role}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Output Specification -->
    ${outputMapping.length > 0 ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section">
        <div class="transform-section-title">Output Specification</div>
        <p style="font-size:12px; color:var(--cdisc-text-secondary); margin-bottom:12px;">
          Method output slots mapped to AC result patterns
        </p>
        <div class="slot-grid">
          ${outputMapping.map(slot => `
            <div class="slot-card">
              <div class="slot-card-title">${slot.slot} &rarr; ${slot.patternName}</div>
              ${slot.constituents.length > 0 ? `
                <div class="slot-card-stats">
                  Statistics: ${slot.constituents.join(', ')}
                </div>
              ` : ''}
              ${slot.dimensions.length > 0 ? `
                <div class="slot-card-stats" style="margin-top:4px;">
                  Indexed by: ${slot.dimensions.map(id => {
                    // For interaction terms like "Measure:Treatment", display each part
                    if (id.includes(':')) {
                      return id.split(':').map(part => {
                        return displayConcept(part, conceptDisplayOpts[part]);
                      }).join(':');
                    }
                    return displayConcept(id, conceptDisplayOpts[id]);
                  }).join(', ')}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    ` : ''}
  `;

  // ===== Wire event handlers =====

  // Binding shape click-to-expand provenance
  container.querySelectorAll('.binding-shape-line').forEach(line => {
    line.addEventListener('click', (e) => {
      e.stopPropagation();
      const bindingId = line.dataset.bindingId;
      const prov = line.parentElement?.querySelector(`.binding-provenance[data-binding-id="${bindingId}"]`);
      if (prov) {
        prov.style.display = prov.style.display === 'none' ? 'block' : 'none';
      }
    });
  });

  // Remove binding buttons
  container.querySelectorAll('.binding-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const roleName = btn.dataset.role;
      const idx = parseInt(btn.dataset.index, 10);
      // Find and remove the idx-th binding for this role
      let count = 0;
      for (let i = 0; i < appState.resolvedBindings.length; i++) {
        if (appState.resolvedBindings[i].methodRole === roleName) {
          if (count === idx) {
            appState.resolvedBindings.splice(i, 1);
            break;
          }
          count++;
        }
      }
      // Clean up interactions referencing removed concept
      const removedConcepts = new Set(appState.resolvedBindings.map(b => b.concept));
      appState.activeInteractions = appState.activeInteractions.filter(inter => {
        const [a, b] = inter.split(':');
        return removedConcepts.has(a) && removedConcepts.has(b);
      });
      renderTransformationConfig(container);
    });
  });

  // Add binding selects — show dimensional constraint dropdown for derivation concepts
  container.querySelectorAll('.binding-add-select').forEach(select => {
    const dimSelect = select.parentElement?.querySelector('.binding-dim-constraint');

    select.addEventListener('change', () => {
      const value = select.value;
      // Show dim constraint dropdown for measure concepts (Change, Measure, etc.)
      const selectedOption = select.options[select.selectedIndex];
      const type = selectedOption.dataset.type || 'concept';
      if (dimSelect) {
        dimSelect.style.display = (value && type === 'concept') ? '' : 'none';
      }
      if (!value) return;

      // For dimensional concepts (no dim constraint needed), add immediately
      if (type === 'dimensional') {
        appState.resolvedBindings.push({
          methodRole: select.dataset.role,
          concept: value,
          direction: 'input',
          dataStructureRole: type === 'dimensional' ? 'dimension' : 'measure',
          description: '',
          _custom: true
        });
        renderTransformationConfig(container);
      }
      // For derivation concepts, wait for user to optionally pick a dim constraint
      // and then click to confirm, or just re-render if no dim select
      else if (!dimSelect) {
        appState.resolvedBindings.push({
          methodRole: select.dataset.role,
          concept: value,
          direction: 'input',
          dataStructureRole: type === 'dimensional' ? 'dimension' : 'measure',
          description: '',
          _custom: true
        });
        renderTransformationConfig(container);
      }
    });

    // When dim constraint is selected, add the binding with constraint
    if (dimSelect) {
      dimSelect.addEventListener('change', () => {
        const conceptSelect = dimSelect.parentElement?.querySelector('.binding-add-select');
        const concept = conceptSelect?.value;
        if (!concept) return;
        const roleName = dimSelect.dataset.role;
        const dimValue = dimSelect.value;
        const type = conceptSelect.options[conceptSelect.selectedIndex]?.dataset?.type || 'concept';

        const binding = {
          methodRole: roleName,
          concept: concept,
          direction: 'input',
          dataStructureRole: type === 'dimensional' ? 'dimension' : 'measure',
          description: dimValue ? `${concept} @ ${dimValue}` : '',
          _custom: true
        };
        if (dimValue) {
          binding.slice = dimValue.toLowerCase();
          if (!transformation.slices) transformation.slices = [];
          if (!transformation.slices.find(s => s.name === binding.slice)) {
            transformation.slices.push({
              name: binding.slice,
              constraints: [{ dimension: 'AnalysisVisit', value: dimValue }]
            });
          }
        }

        appState.resolvedBindings.push(binding);
        renderTransformationConfig(container);
      });
    }
  });

  // Interaction checkboxes
  container.querySelectorAll('#interaction-list input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const inter = cb.dataset.interaction;
      if (cb.checked) {
        if (!appState.activeInteractions.includes(inter)) {
          appState.activeInteractions.push(inter);
        }
      } else {
        appState.activeInteractions = appState.activeInteractions.filter(i => i !== inter);
      }
      // Full re-render to update formula, output spec (dimensions), and all displays
      renderTransformationConfig(container);
    });
  });

  // Dimensional slice dropdowns
  container.querySelectorAll('[data-slice-dim]').forEach(select => {
    select.addEventListener('change', () => {
      const dim = select.dataset.sliceDim;
      if (appState.dimensionalSliceValues) {
        appState.dimensionalSliceValues[dim] = select.value;
      }
    });
  });

  // Method configuration change handlers
  container.querySelectorAll('[data-config-key]').forEach(el => {
    const eventType = el.tagName === 'SELECT' ? 'change' : 'change';
    el.addEventListener(eventType, () => {
      const configKey = el.dataset.configKey;
      let value = el.value;
      // Preserve numeric types for numeric configs
      if (!isNaN(value) && value !== '') value = Number(value);

      if (!appState.methodConfig) appState.methodConfig = {};

      // Find the method default for this key
      const cfgDef = (method?.configurations || []).find(c => c.name === configKey);
      const methodDefault = cfgDef?.defaultValue;

      // Sparse: only store if different from default
      if (value === methodDefault || String(value) === String(methodDefault)) {
        delete appState.methodConfig[configKey];
      } else {
        appState.methodConfig[configKey] = value;
      }

      // Persist to endpoint spec
      const epId = appState.currentEndpointId;
      if (epId && appState.endpointSpecs[epId]) {
        appState.endpointSpecs[epId].methodConfigOverrides = { ...appState.methodConfig };
      }

      // Re-render to update source indicators
      renderTransformationConfig(container);
    });
  });

  // Navigation
  container.querySelector('#btn-back-sp').addEventListener('click', () => navigateTo(5));
  container.querySelector('#btn-configure-derivations').addEventListener('click', () => {
    // Patch the transformation with custom bindings and dimensional slices before navigating
    appState.selectedTransformation = {
      ...transformation,
      bindings: [
        ...appState.resolvedBindings,
        ...(transformation.bindings || []).filter(b => b.direction === 'output')
      ],
      dimensionalSliceValues: appState.dimensionalSliceValues
    };
    // Initialize derivation state if needed
    if (!appState.derivationChain) appState.derivationChain = [];
    if (!appState.confirmedTerminals) appState.confirmedTerminals = [];
    navigateTo(7);
  });
}
