import { appState, navigateTo } from '../app.js';
import { loadMethod } from '../data-loader.js';
import { getAllEndpoints, getPopulationNames } from '../utils/usdm-parser.js';
import { composeFullSentence } from '../utils/phrase-engine.js';
import {
  getOutputMapping, getInputBindings,
  getMethodConfigurations, getDimensions
} from '../utils/transformation-linker.js';

// ===== Helper: Get concept dropdown options from DC model =====

function getConceptOptions(role, dcModel) {
  if (!dcModel) return [];
  const options = [];

  if (role.dataType === 'string' || role.statisticalRole === 'fixed_effect') {
    // Dimensional concepts for categorical/factor roles
    const dims = dcModel.dimensionalConcepts || {};
    for (const [name, info] of Object.entries(dims)) {
      options.push({ value: name, label: name, type: 'dimensional', description: info.definition || '' });
    }
  }

  // Derivation concepts (from categories)
  const categories = dcModel.categories || {};
  for (const [catName, cat] of Object.entries(categories)) {
    const concepts = cat.concepts || {};
    for (const [conceptName, conceptInfo] of Object.entries(concepts)) {
      const prefixed = `C.${conceptName}`;
      options.push({
        value: prefixed,
        label: `${prefixed} (${catName})`,
        type: 'concept',
        description: conceptInfo.definition || ''
      });
    }
  }

  // For numeric roles, also offer dimensional concepts (sometimes used as covariates)
  if (role.dataType === 'numeric' && role.statisticalRole !== 'fixed_effect') {
    const dims = dcModel.dimensionalConcepts || {};
    for (const [name, info] of Object.entries(dims)) {
      if (!options.find(o => o.value === name)) {
        options.push({ value: name, label: name, type: 'dimensional', description: info.definition || '' });
      }
    }
  }

  return options;
}

// ===== Helper: Parse default interactions from expression =====

function parseDefaultInteractions(defaultExpression) {
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

function classifyBindings(customBindings, method) {
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
    const concepts = bindings.map(b => b.concept);
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

function buildExpressionString(customBindings, method, interactions) {
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

function buildWilkinsonExpression(cls, interactions) {
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

function buildSurvivalExpression(cls, interactions) {
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

function buildAssignmentExpression(customBindings, method, cls) {
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

// ===== Helper: Render formula with colored spans =====

function renderFormulaExpression(customBindings, method, interactions) {
  if (!customBindings || !method) return '';

  const notation = method.formula?.notation || 'assignment';
  const inputRoles = method.input_roles || [];
  const roleMap = {};
  for (const role of inputRoles) {
    roleMap[role.name] = role;
  }

  // Build a lookup: concept -> statistical role
  const conceptRoleMap = {};
  for (const b of customBindings) {
    const role = roleMap[b.methodRole];
    if (role && role.statisticalRole) conceptRoleMap[b.concept] = role.statisticalRole;
  }

  function colorSpan(concept, overrideRole) {
    const statRole = overrideRole || conceptRoleMap[concept] || '';
    const cssClass = statRole ? `formula-term-${statRole.replace(/_/g, '-')}` : '';
    return `<span class="${cssClass}">${concept}</span>`;
  }

  const op = (s) => `<span class="formula-operator">${s}</span>`;

  const cls = classifyBindings(customBindings, method);

  if (notation === 'assignment') {
    return renderAssignmentFormula(customBindings, method, cls, colorSpan, op);
  } else if (notation === 'survival') {
    return renderSurvivalFormula(cls, interactions, colorSpan, op, conceptRoleMap);
  } else {
    return renderWilkinsonFormula(cls, interactions, colorSpan, op, conceptRoleMap);
  }
}

function renderWilkinsonFormula(cls, interactions, colorSpan, op, conceptRoleMap) {
  const lhs = cls.response.map(c => colorSpan(c)).join(` ${op('+')} `) || '?';
  const rhsParts = [
    ...cls.covariate.map(c => colorSpan(c)),
    ...cls.fixed_effect.map(c => colorSpan(c))
  ];

  const interParts = (interactions || []).map(inter => {
    const [a, b] = inter.split(':');
    const aRole = conceptRoleMap[a] || 'covariate';
    const bRole = conceptRoleMap[b] || 'fixed_effect';
    return `<span class="formula-term-${aRole.replace(/_/g, '-')}">${a}</span>${op(':')}<span class="formula-term-${bRole.replace(/_/g, '-')}">${b}</span>`;
  });

  const allRhs = [...rhsParts, ...interParts];
  let html = `${lhs} ${op('~')} ${allRhs.join(` ${op('+')} `) || '1'}`;

  if (cls.repeated_subject.length > 0 || cls.repeated_factor.length > 0) {
    const subj = cls.repeated_subject.map(c => `<span class="formula-term-repeated">${c}</span>`).join(', ');
    const factor = cls.repeated_factor.map(c => `<span class="formula-term-repeated">${c}</span>`).join(', ');
    if (subj && factor) html += ` ${op('|')} ${subj} ${op('/')} ${factor}`;
    else if (subj) html += ` ${op('|')} ${subj}`;
  }

  return html;
}

function renderSurvivalFormula(cls, interactions, colorSpan, op, conceptRoleMap) {
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
    return `<span class="formula-term-${aRole.replace(/_/g, '-')}">${a}</span>${op(':')}<span class="formula-term-${bRole.replace(/_/g, '-')}">${b}</span>`;
  });

  // Strata get special wrapping
  const strataParts = cls.strata.map(s =>
    `${op('strata(')}${colorSpan(s, 'strata')}${op(')')}`
  );

  const allRhs = [...rhsParts, ...interParts, ...strataParts];
  return `${survLhs} ${op('~')} ${allRhs.join(` ${op('+')} `) || '1'}`;
}

function renderAssignmentFormula(customBindings, method, cls, colorSpan, op) {
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

function generateInteractionPairings(customBindings, method) {
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

function renderInteractiveBindings(customBindings, method, dcModel) {
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
    (originalTransform?.inputBindings || appState.selectedTransformation?.inputBindings || [])
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
      const isDimensional = b.type === 'dimensional';

      html += `<div class="binding-row ${isCustom ? 'binding-row-custom' : ''}">
        <span class="binding-concept"><code>${b.concept}</code>${b.description ? ` — "${b.description}"` : ''}</span>
        <span class="binding-badge badge ${isDimensional ? 'badge-teal' : 'badge-blue'}">${isDimensional ? 'dimensional' : 'concept'}</span>
        ${isCustom ? '<span class="binding-badge badge badge-secondary">custom</span>' : ''}
        ${canRemove(b) ? `<button class="binding-remove" data-role="${role.name}" data-index="${i}" title="Remove">&times;</button>` : ''}
      </div>`;
    }

    if (canAdd) {
      const options = getConceptOptions(role, dcModel);
      // Filter out already-bound concepts
      const boundConcepts = new Set(bindings.map(b => b.concept));
      const available = options.filter(o => !boundConcepts.has(o.value));

      const addLabel = role.statisticalRole === 'fixed_effect' ? 'Factor'
        : role.statisticalRole === 'covariate' ? 'Covariate'
        : 'Binding';

      html += `<div class="binding-add-row">
        <span class="binding-add-label">+ Add ${addLabel}</span>
        <select class="binding-add-select" data-role="${role.name}">
          <option value="">Select concept...</option>
          ${available.map(o => `<option value="${o.value}" data-type="${o.type}">${o.label}</option>`).join('')}
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

  if (!transformation || !study) { navigateTo(4); return; }

  const currentEp = getAllEndpoints(study).find(ep => ep.id === appState.currentEndpointId);

  // Show loading while method loads
  container.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading method details...</span></div>`;

  let method = null;
  try {
    method = await loadMethod(appState, transformation.usesMethod);
  } catch (e) {
    console.warn('Could not load method:', e);
  }

  // Initialize customInputBindings from template if null
  if (appState.customInputBindings === null) {
    appState.customInputBindings = JSON.parse(JSON.stringify(transformation.inputBindings || []));
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
      for (const b of appState.customInputBindings) {
        if (!roleConcepts[b.methodRole]) roleConcepts[b.methodRole] = [];
        roleConcepts[b.methodRole].push(b.concept);
      }
      // Default interactions use role names — only pre-check if we can resolve them
      // We don't pre-check by default since default_expression typically has "covariate:group"
      // which are role names, not concept names. Interactions are opt-in.
    }
  }

  const customBindings = appState.customInputBindings;
  const outputMapping = getOutputMapping(transformation, appState.acModel);
  const dimensions = getDimensions(transformation);
  const methodConfigs = method ? getMethodConfigurations(method) : [];
  const popNames = getPopulationNames(study);
  const popMap = {};
  for (const p of popNames) {
    popMap[p.value] = p.label;
  }
  const resolvedSentence = composeFullSentence(appState.composedPhrases, lib, { population: popMap });

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
        <p style="color:var(--cdisc-gray); font-size:13px; margin-top:4px;">
          ${currentEp ? `${currentEp.name}: ` : ''}${transformation.name}
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
                    <td><code>${b.concept}</code></td>
                    <td>${b.from || b.description || '-'}</td>
                    <td><span class="badge ${b.type === 'dimensional' ? 'badge-teal' : 'badge-blue'}">${b.type}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    </div>

    <!-- Model Expression -->
    ${hasFormula ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section" style="margin-bottom:0;">
        <div class="transform-section-title">Model Expression</div>
        ${method.formula.generic_expression ? `
          <div style="font-size:12px; color:var(--cdisc-gray); margin-bottom:10px;">
            Template: <code style="font-family:'SF Mono','Fira Code','Consolas',monospace; background:var(--cdisc-light-gray); padding:2px 6px; border-radius:4px;">${method.formula.generic_expression}</code>
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
          <div style="margin-top:8px; font-size:12px; color:var(--cdisc-gray); font-style:italic;" id="interaction-placeholder">
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
          ${methodConfigs.map(cfg => `
            <div class="config-field">
              <label class="config-label">${cfg.label}</label>
              ${cfg.options.length > 0 ? `
                <select class="config-select" data-config-key="${cfg.key}">
                  ${cfg.options.map(opt => `
                    <option value="${opt}" ${opt === cfg.default ? 'selected' : ''}>${opt}</option>
                  `).join('')}
                </select>
              ` : `
                <input class="config-input" data-config-key="${cfg.key}" value="${cfg.value || cfg.default || ''}" placeholder="${cfg.description}">
              `}
              ${cfg.description ? `<div style="font-size:11px; color:var(--cdisc-gray); margin-top:4px;">${cfg.description}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Dimensions -->
    ${dimensions.inherited.length > 0 || dimensions.added.length > 0 ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section">
        <div class="transform-section-title">Dimensional Relationships</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <div>
            <div style="font-weight:600; font-size:12px; margin-bottom:8px; color:var(--cdisc-text);">Inherited</div>
            ${dimensions.inherited.map(d => `
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <span class="badge badge-teal">${d.dimension}</span>
                <span style="font-size:12px; color:var(--cdisc-gray);">${d.role}</span>
              </div>
            `).join('')}
          </div>
          <div>
            <div style="font-weight:600; font-size:12px; margin-bottom:8px; color:var(--cdisc-text);">Added</div>
            ${dimensions.added.map(d => `
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <span class="badge badge-blue">${d.dimension}</span>
                <span style="font-size:12px; color:var(--cdisc-gray);">${d.role}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Output Specification -->
    ${outputMapping.length > 0 ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="transform-section">
        <div class="transform-section-title">Output Specification</div>
        <p style="font-size:12px; color:var(--cdisc-gray); margin-bottom:12px;">
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
              ${slot.identifiedBy.length > 0 ? `
                <div class="slot-card-stats" style="margin-top:4px;">
                  Indexed by: ${slot.identifiedBy.join(', ')}
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

  // Remove binding buttons
  container.querySelectorAll('.binding-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const roleName = btn.dataset.role;
      const idx = parseInt(btn.dataset.index, 10);
      // Find and remove the idx-th binding for this role
      let count = 0;
      for (let i = 0; i < appState.customInputBindings.length; i++) {
        if (appState.customInputBindings[i].methodRole === roleName) {
          if (count === idx) {
            appState.customInputBindings.splice(i, 1);
            break;
          }
          count++;
        }
      }
      // Clean up interactions referencing removed concept
      const removedConcepts = new Set(appState.customInputBindings.map(b => b.concept));
      appState.activeInteractions = appState.activeInteractions.filter(inter => {
        const [a, b] = inter.split(':');
        return removedConcepts.has(a) && removedConcepts.has(b);
      });
      renderTransformationConfig(container);
    });
  });

  // Add binding selects
  container.querySelectorAll('.binding-add-select').forEach(select => {
    select.addEventListener('change', () => {
      const roleName = select.dataset.role;
      const value = select.value;
      if (!value) return;

      const selectedOption = select.options[select.selectedIndex];
      const type = selectedOption.dataset.type || 'concept';

      appState.customInputBindings.push({
        methodRole: roleName,
        concept: value,
        type: type,
        description: '',
        _custom: true
      });

      renderTransformationConfig(container);
    });
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
      // Update formula display without full re-render
      const formulaEl = container.querySelector('#formula-display');
      if (formulaEl) {
        formulaEl.innerHTML = renderFormulaExpression(appState.customInputBindings, method, appState.activeInteractions);
      }
    });
  });

  // Navigation
  container.querySelector('#btn-back-sp').addEventListener('click', () => navigateTo(4));
  container.querySelector('#btn-configure-derivations').addEventListener('click', () => {
    // Patch the transformation with custom bindings before navigating
    appState.selectedTransformation = { ...transformation, inputBindings: appState.customInputBindings };
    // Initialize derivation state if needed
    if (!appState.derivationChain) appState.derivationChain = [];
    if (!appState.confirmedTerminals) appState.confirmedTerminals = [];
    navigateTo(6);
  });
}
