import { appState, navigateTo } from '../app.js';
import { loadParentBc, loadSdtmSpec, setActiveStudy } from '../data-loader.js';
import { buildSoaMatrix } from '../utils/soa-matrix.js';

export function renderStudySoa(container, view) {
  const v = view === 'detailed' ? 'detailed' : 'protocol';

  // Pick which study to render: selected-if-enriched > fallback enriched study.
  const source = resolveSoaSource();
  if (!source) {
    container.innerHTML = renderMissingEnrichment();
    return;
  }
  const { study, rawUsdm, matrix, mode, alternate } = source;
  const title = study.displayName || study.name || 'Study';
  const notice = mode === 'fallback' ? `
    <div class="soa-notice">
      Selected study <strong>${escapeHtml(appState.selectedStudy?.displayName || appState.selectedStudy?.name || '(none)')}</strong> does not carry SDTM-specialization data,
      so SoA is showing the enriched variant <strong>${escapeHtml(title)}</strong>.
      ${alternate ? `<button class="btn btn-sm" id="soa-switch-to-enriched">Select this study</button>` : ''}
    </div>` : '';

  container.innerHTML = `
    <div class="soa-header">
      <div>
        <h2 class="soa-title">${v === 'protocol' ? 'Protocol SoA' : 'Detailed SoA'}</h2>
        <div class="soa-subtitle">${escapeHtml(title)} &middot; ${matrix.activities.length} activities &middot; ${matrix.encounters.length} encounters
          ${matrix.offMainActivityIds.length ? ` &middot; <span class="soa-warn">${matrix.offMainActivityIds.length} off-main-timeline</span>` : ''}
        </div>
      </div>
      <div class="soa-toolbar">
        <div class="soa-search">
          <span class="soa-search-icon" aria-hidden="true">&#x1F50D;</span>
          <input type="search" id="soa-search" placeholder="Find activity, BC, SDTM spec…" autocomplete="off" spellcheck="false">
          <button class="soa-search-clear hidden" id="soa-search-clear" aria-label="Clear search">&times;</button>
        </div>
        <div class="soa-match-count" id="soa-match-count"></div>
        <label class="soa-toggle"><input type="checkbox" id="soa-show-bcs" checked> Show BC sub-rows</label>
      </div>
    </div>
    ${notice}
    <div class="soa-layout" id="soa-layout">
      <div class="soa-grid" id="soa-grid">${renderGrid(study, matrix, v, true, '').html}</div>
      <aside class="soa-drillin hidden" id="soa-drillin">
        <div class="soa-drillin-empty">Click a BC to inspect its definition.</div>
      </aside>
    </div>
  `;

  // Wire the "switch to the enriched study" shortcut when falling back
  if (alternate) {
    container.querySelector('#soa-switch-to-enriched')?.addEventListener('click', () => {
      setActiveStudy(appState, alternate.index);
      appState.selectedStudyIndex = alternate.index;
      appState.selectedStudy = alternate.study;
      renderStudySoa(container, v);
    });
  }

  wireGridEvents(container, study, matrix, v);
}

/**
 * Pick which USDM to feed into the SoA views.
 * Priority:
 *   1. selectedStudy, if it carries the SoA extension
 *   2. the first enriched study on the manifest (state.soaStudy), if any
 * Returns null if nothing is available.
 */
function resolveSoaSource() {
  const selIdx = appState.selectedStudyIndex;
  const selectedStudy = appState.selectedStudy;
  if (selectedStudy?.isSoaEnriched && selIdx != null) {
    const rawUsdm = appState.rawUsdmFiles[selIdx];
    return {
      study: selectedStudy,
      rawUsdm,
      matrix: buildSoaMatrix(rawUsdm),
      mode: 'selected',
      alternate: null
    };
  }
  if (appState.soaStudy && appState.soaRawUsdm && appState.soaMatrix) {
    // Find the fallback's index in state.studies so we can offer to switch to it
    const altIdx = appState.studies.findIndex(s => s === appState.soaStudy);
    return {
      study: appState.soaStudy,
      rawUsdm: appState.soaRawUsdm,
      matrix: appState.soaMatrix,
      mode: selectedStudy ? 'fallback' : 'default',
      alternate: altIdx >= 0 ? { index: altIdx, study: appState.soaStudy } : null
    };
  }
  return null;
}

function renderMissingEnrichment() {
  return `
    <div class="card" style="max-width:720px; margin:40px auto; padding:24px;">
      <h2 style="margin-bottom:12px;">Study SoA — setup needed</h2>
      <p style="color:var(--cdisc-text-secondary); margin-bottom:12px;">
        The enriched USDM and CDISC Library cache haven't been generated yet.
      </p>
      <ol style="margin-left:20px; line-height:1.8; color:var(--cdisc-text-secondary);">
        <li>Put your CDISC Library API key in <code>.env</code> at the repo root
          (<code>CDISC_LIBRARY_API_KEY=...</code>). A template lives at <code>.env.example</code>.</li>
        <li>Run the enrichment script:
          <pre style="background:var(--cdisc-surface); padding:8px 12px; border-radius:4px; margin-top:6px; overflow:auto;">python scripts/enrich_usdm_for_soa.py --write</pre>
        </li>
        <li>Reload this page.</li>
      </ol>
    </div>
  `;
}

function renderGrid(study, matrix, view, showBcs, query) {
  const bcById = new Map(study.biomedicalConcepts.map(bc => [bc.id, bc]));
  const encounters = matrix.encounters;
  const q = (query || '').trim().toLowerCase();

  // Compute which rows survive the filter. A BC matches if any of its searchable
  // strings contains the query. An Activity survives if it matches OR at least
  // one of its BCs matches (preserves parent context).
  let activityMatchCount = 0;
  let bcMatchCount = 0;
  const activityVisible = new Map();
  const bcVisible = new Map();
  for (const a of matrix.activities) {
    const aMatches = !q || searchHit(activityHaystack(a), q);
    let anyChild = false;
    for (const bcId of a.biomedicalConceptIds) {
      const bc = bcById.get(bcId);
      if (!bc) continue;
      const bHay = bcHaystack(bc, view);
      const bMatches = !q || searchHit(bHay, q);
      // BC row is visible if it matches OR its activity matches (so "vitals" shows all under vitals)
      const visible = !q || bMatches || aMatches;
      bcVisible.set(bcId, { visible, matches: bMatches });
      if (visible && bMatches) bcMatchCount++;
      if (bMatches) anyChild = true;
    }
    const visible = !q || aMatches || anyChild;
    activityVisible.set(a.id, { visible, matches: aMatches });
    if (visible && (aMatches || anyChild)) activityMatchCount++;
  }

  const colgroup = `<colgroup><col class="soa-col-label">${encounters.map(() => '<col>').join('')}</colgroup>`;

  // Epoch group row (above encounter names) — only render if there's >=1 labelled epoch
  const epochRow = (matrix.epochGroups && matrix.epochGroups.some(g => g.label)) ? `
      <tr class="soa-epoch-row">
        <th class="soa-rowhead soa-epoch-rowhead"></th>
        ${matrix.epochGroups.map(g => `<th class="soa-epoch-cell" colspan="${g.span}" title="${escapeHtml(g.label)}">${escapeHtml(g.label)}</th>`).join('')}
      </tr>` : '';

  // Encounter header with an optional Study-Day / Week sub-line derived from USDM timings.
  const offsetFor = (eid) => matrix.encounterOffset?.get(eid);
  const anchorLabel = matrix.anchorEncounterLabel || 'the study anchor';
  const encounterHeaderCells = encounters.map(e => {
    const off = offsetFor(e.id);
    const sub = off ? `<div class="soa-enc-timing${off.isAnchor ? ' soa-enc-anchor' : ''}" title="${escapeHtml(formatOffsetTooltip(off, anchorLabel))}">${escapeHtml(formatOffsetShort(off))}</div>` : '';
    return `<th title="${escapeHtml(e.name)}"><div class="soa-enc-label">${escapeHtml(shortEncounter(e.label))}</div>${sub}</th>`;
  }).join('');

  const header = `
    <thead>
      ${epochRow}
      <tr>
        <th class="soa-rowhead">Activity / BC</th>
        ${encounterHeaderCells}
      </tr>
    </thead>`;
  const rows = matrix.activities.map(a =>
    renderActivityRows(a, matrix, encounters, bcById, view, showBcs, q, activityVisible, bcVisible)
  ).join('');

  const emptyNote = q && activityMatchCount === 0
    ? `<div class="soa-empty">No activities or BCs match <strong>${escapeHtml(q)}</strong>.</div>`
    : '';
  const counter = q ? `${activityMatchCount} activit${activityMatchCount === 1 ? 'y' : 'ies'}, ${bcMatchCount} BC${bcMatchCount === 1 ? '' : 's'}` : '';

  return {
    html: `<table class="data-table soa-table">${colgroup}${header}<tbody>${rows}</tbody></table>${emptyNote}`,
    counter
  };
}

function renderActivityRows(activity, matrix, encounters, bcById, view, showBcs, q, activityVisible, bcVisible) {
  const vis = activityVisible.get(activity.id);
  if (!vis.visible) return '';
  const cellSet = matrix.cells.get(activity.id) || new Set();
  const onMain = activity._onMain;
  const offBadge = onMain ? '' : ' <span class="soa-badge soa-badge-muted">sub-timeline only</span>';
  const cells = encounters.map(e => `<td class="${cellSet.has(e.id) ? 'soa-cell-mark' : ''}">${cellSet.has(e.id) ? '&times;' : ''}</td>`).join('');
  const label = highlight(escapeHtml(activity.label), q);
  const matchClass = vis.matches && q ? ' soa-row-matched' : '';
  const actRow = `
    <tr class="soa-activity-row${matchClass}">
      <td class="soa-rowhead"><span class="soa-activity-label">${label}</span>${offBadge}</td>
      ${cells}
    </tr>`;
  if (!showBcs || !activity.biomedicalConceptIds.length) return actRow;
  const bcRows = activity.biomedicalConceptIds.map(bcId => {
    const bcVis = bcVisible.get(bcId);
    if (!bcVis || !bcVis.visible) return '';
    const bc = bcById.get(bcId);
    if (!bc) return '';
    const bcLabel = renderBcLabel(bc, view, q);
    const clickable = isBcClickable(bc, view);
    const cls = `soa-bc-row${clickable ? ' soa-bc-clickable' : ''}${bcVis.matches && q ? ' soa-row-matched' : ''}`;
    const data = clickable ? ` data-bc-id="${bcId}"` : '';
    return `
      <tr class="${cls}"${data}>
        <td class="soa-rowhead">${bcLabel}</td>
        ${cells}
      </tr>`;
  }).join('');
  return actRow + bcRows;
}

function renderBcLabel(bc, view, q) {
  const name = highlight(escapeHtml(bc.name || bc.label || bc.id), q);
  if (view === 'protocol') {
    return `<span class="soa-bc-label">${name}</span>`;
  }
  const sel = bc.sdtmSpec?.selectedSpecId;
  if (sel) {
    return `<span class="soa-bc-label">${name} <span class="soa-arrow">&rarr;</span> <code class="soa-spec-id">${highlight(escapeHtml(sel), q)}</code></span>`;
  }
  return `<span class="soa-bc-label soa-bc-muted">${name}</span>`;
}

// ---------- search helpers ----------

function activityHaystack(activity) {
  return (activity.label || '').toLowerCase() + ' ' + (activity.name || '').toLowerCase();
}

function bcHaystack(bc, view) {
  const parts = [bc.name || '', bc.label || ''];
  if (Array.isArray(bc.synonyms)) parts.push(bc.synonyms.join(' '));
  if (view === 'detailed' && bc.sdtmSpec) {
    if (bc.sdtmSpec.selectedSpecId) parts.push(bc.sdtmSpec.selectedSpecId);
    if (Array.isArray(bc.sdtmSpec.candidateSpecIds)) parts.push(bc.sdtmSpec.candidateSpecIds.join(' '));
    if (bc.sdtmSpec.parentBcCode) parts.push(bc.sdtmSpec.parentBcCode);
  }
  return parts.join(' ').toLowerCase();
}

function searchHit(haystack, query) {
  return haystack.indexOf(query) !== -1;
}

/**
 * Wrap every case-insensitive occurrence of `query` inside the already-escaped
 * `html` with <mark>...</mark>. No-op when the query is empty.
 */
function highlight(html, q) {
  if (!q) return html;
  // Escape regex metacharacters in the query (the haystack is HTML-escaped plain text).
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return html.replace(re, m => `<mark class="soa-hit">${m}</mark>`);
}

function isBcClickable(bc, view) {
  if (view === 'protocol') return !!bc.sdtmSpec?.parentBcCode || !!bc.reference;
  // detailed: clickable if we have any selected spec or candidate
  return !!(bc.sdtmSpec?.selectedSpecId || (bc.sdtmSpec?.candidateSpecIds || []).length);
}

/**
 * Short offset cue for an encounter column header.
 * Displays "Day N" (or "Wk N" when the offset lands on a week boundary)
 * with a ±window suffix when present. Examples: "Day 1" (anchor), "Wk 2 ±3 d", "Day -1".
 */
function formatOffsetShort(off) {
  if (!off || off.day == null) return '';
  const base = off.week != null ? `Wk ${off.week}` : `Day ${off.day}`;
  const win  = off.windowDays > 0 ? ` ±${off.windowDays} d` : '';
  return base + win;
}

function formatOffsetTooltip(off, anchorLabel) {
  if (!off) return '';
  const parts = [`Study Day ${off.day}`];
  if (off.week != null) parts.push(`Week ${off.week}`);
  if (off.isAnchor) parts.push('(anchor — Fixed Reference)');
  else if (anchorLabel) parts.push(`anchor: ${anchorLabel}`);
  if (off.windowDays > 0) parts.push(`window: ±${off.windowDays} day${off.windowDays === 1 ? '' : 's'}`);
  if (off.windowLabel) parts.push(off.windowLabel);
  return parts.join(' — ');
}

function shortEncounter(label) {
  // Collapse "Screening 1" -> "Scr1", "Baseline" -> "Bsl", "Week 26 / Early Termination" -> "Wk26"
  if (!label) return '';
  const l = label.trim();
  const m = l.match(/^Screening\s*(\d+)/i);   if (m) return `Scr${m[1]}`;
  const w = l.match(/^Week\s*(\d+)/i);        if (w) return `Wk${w[1]}`;
  if (/^Baseline/i.test(l)) return 'Bsl';
  return l.length > 12 ? l.slice(0, 12) + '…' : l;
}

// ---------- interaction ----------

function wireGridEvents(container, study, matrix, view) {
  const bcById = new Map(study.biomedicalConcepts.map(bc => [bc.id, bc]));
  const layout = container.querySelector('#soa-layout');
  const grid = container.querySelector('#soa-grid');
  const drill = container.querySelector('#soa-drillin');
  const search = container.querySelector('#soa-search');
  const searchClear = container.querySelector('#soa-search-clear');
  const matchCount = container.querySelector('#soa-match-count');
  const showBcs = container.querySelector('#soa-show-bcs');

  const closeDrillIn = () => {
    drill.classList.add('hidden');
    layout.classList.remove('has-drillin');
  };
  const openDrillIn = () => {
    drill.classList.remove('hidden');
    layout.classList.add('has-drillin');
  };

  const rerenderGrid = () => {
    const result = renderGrid(study, matrix, view, showBcs.checked, search.value);
    grid.innerHTML = result.html;
    matchCount.textContent = result.counter;
    searchClear.classList.toggle('hidden', !search.value);
  };

  showBcs.addEventListener('change', rerenderGrid);
  search.addEventListener('input', rerenderGrid);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && search.value) {
      search.value = '';
      rerenderGrid();
    }
  });
  searchClear.addEventListener('click', () => {
    search.value = '';
    rerenderGrid();
    search.focus();
  });

  container.addEventListener('click', async (e) => {
    const row = e.target.closest('.soa-bc-clickable');
    if (!row) return;
    const bcId = row.dataset.bcId;
    if (!bcId) return;
    const bc = bcById.get(bcId);
    if (!bc) return;
    openDrillIn();
    drill.innerHTML = `<div class="soa-drillin-loading">Loading…</div>`;
    try {
      const html = view === 'protocol'
        ? await renderProtocolDrillIn(bc)
        : await renderDetailedDrillIn(bc);
      drill.innerHTML = html;
      drill.querySelector('.soa-drillin-close')?.addEventListener('click', closeDrillIn);
      drill.querySelectorAll('.soa-spec-accordion-header').forEach(h => {
        h.addEventListener('click', () => {
          h.closest('.soa-spec-candidate')?.classList.toggle('open');
        });
      });
    } catch (err) {
      drill.innerHTML = `<div class="soa-drillin-error">Failed to load: ${escapeHtml(String(err?.message || err))}</div>`;
    }
  });
}

// ---------- drill-ins ----------

async function renderProtocolDrillIn(bc) {
  const parentCode = bc.sdtmSpec?.parentBcCode || extractCCode(bc.reference);
  const header = drillInHeader(`${bc.name || bc.id}`, parentCode ? `Parent BC ${parentCode}` : 'Parent BC');
  if (!parentCode) {
    return header + `<div class="soa-drillin-body"><div class="soa-drillin-note">No parent BC reference available for this concept.</div></div>`;
  }
  const payload = await loadParentBc(parentCode);
  if (!payload) {
    return header + `<div class="soa-drillin-body"><div class="soa-drillin-note">No cached CDISC Library payload found for <code>${parentCode}</code>. Run <code>enrich_usdm_for_soa.py</code> to populate.</div></div>`;
  }
  return header + `<div class="soa-drillin-body">${renderParentBcBody(payload)}</div>`;
}

async function renderDetailedDrillIn(bc) {
  const header = drillInHeader(`${bc.name || bc.id}`, 'SDTM Dataset Specialization');
  const sel = bc.sdtmSpec?.selectedSpecId;
  const candidates = bc.sdtmSpec?.candidateSpecIds || [];
  const ids = sel
    ? [sel, ...candidates.filter(c => c !== sel)]
    : candidates.slice();
  if (!ids.length) {
    return header + `<div class="soa-drillin-body"><div class="soa-drillin-note">No SDTM specializations recorded for this BC.</div></div>`;
  }
  const sections = await Promise.all(ids.map(async (id, idx) => {
    const payload = await loadSdtmSpec(id);
    const isSelected = id === sel;
    return renderSpecCandidate(id, payload, isSelected, idx === 0);
  }));
  return header + `<div class="soa-drillin-body">${sections.join('')}</div>`;
}

function drillInHeader(title, subtitle) {
  return `
    <div class="soa-drillin-header">
      <div>
        <div class="soa-drillin-title">${escapeHtml(title)}</div>
        <div class="soa-drillin-subtitle">${escapeHtml(subtitle)}</div>
      </div>
      <button class="soa-drillin-close" aria-label="Close">&times;</button>
    </div>`;
}

function renderParentBcBody(payload) {
  const concept = payload.conceptId || '';
  const shortName = payload.shortName || payload.name || '';
  const synonyms = payload.synonym || payload.synonyms || [];
  const definition = payload.definition || '';
  const categories = payload.categories || [];
  const decs = payload.dataElementConcepts || [];
  return `
    <dl class="soa-kv">
      ${concept ? `<dt>Concept ID</dt><dd><code>${escapeHtml(concept)}</code></dd>` : ''}
      ${shortName ? `<dt>Short Name</dt><dd>${escapeHtml(shortName)}</dd>` : ''}
      ${categories.length ? `<dt>Categories</dt><dd>${categories.map(escapeHtml).join(', ')}</dd>` : ''}
      ${Array.isArray(synonyms) && synonyms.length ? `<dt>Synonyms</dt><dd>${synonyms.map(escapeHtml).join(', ')}</dd>` : ''}
      ${definition ? `<dt>Definition</dt><dd class="soa-def">${escapeHtml(definition)}</dd>` : ''}
    </dl>
    ${decs.length ? `
      <h4 class="soa-section-h">Data Element Concepts (${decs.length})</h4>
      <table class="data-table soa-dec-table">
        <thead><tr><th>Concept ID</th><th>Short Name</th><th>Data Type</th></tr></thead>
        <tbody>${decs.map(d => `
          <tr>
            <td><code>${escapeHtml(d.conceptId || '')}</code></td>
            <td>${escapeHtml(d.shortName || d.name || '')}</td>
            <td>${escapeHtml(d.dataType || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : ''}
  `;
}

function renderSpecCandidate(specId, payload, isSelected, defaultOpen) {
  const cls = `soa-spec-candidate${isSelected ? ' selected' : ''}${defaultOpen ? ' open' : ''}`;
  const title = payload?.shortName || specId;
  const domain = payload?.domain ? ` <span class="soa-badge soa-badge-blue">${escapeHtml(payload.domain)}</span>` : '';
  const selectedBadge = isSelected ? ` <span class="soa-badge soa-badge-green">selected</span>` : '';
  let body;
  if (!payload) {
    body = `<div class="soa-drillin-note">No cached payload for <code>${escapeHtml(specId)}</code>. Run the enrichment script to populate it.</div>`;
  } else {
    // CDISC Library returns variables under `variables`; older responses used
    // `datasetSpecializationVariables`. Accept either.
    const vars = payload.variables || payload.datasetSpecializationVariables || [];
    body = vars.length ? `
      <table class="data-table soa-var-table">
        <thead><tr><th>Variable</th><th>Role</th><th>Type</th><th>Codelist</th><th>Assigned Value</th><th>Flags</th></tr></thead>
        <tbody>${vars.map(v => `
          <tr>
            <td><code>${escapeHtml(v.name || '')}</code></td>
            <td>${escapeHtml(v.role || '')}</td>
            <td>${renderVarType(v)}</td>
            <td>${renderCodelist(v)}</td>
            <td>${renderAssigned(v)}</td>
            <td>${renderVarFlags(v)}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : `<div class="soa-drillin-note">No variables in payload.</div>`;
  }
  return `
    <div class="${cls}">
      <div class="soa-spec-accordion-header">
        <div>
          <code class="soa-spec-id">${escapeHtml(specId)}</code>
          <span class="soa-spec-title"> &mdash; ${escapeHtml(title)}</span>
          ${domain}${selectedBadge}
        </div>
        <span class="soa-chevron">&#x25BE;</span>
      </div>
      <div class="soa-spec-accordion-body">${body}</div>
    </div>
  `;
}

function renderVarType(v) {
  if (!v.dataType) return '';
  // Combine length + significantDigits compactly: integer(3), float(8.3)
  const len = v.length;
  const sig = v.significantDigits;
  let suffix = '';
  if (len != null && sig != null) suffix = `(${len}.${sig})`;
  else if (len != null) suffix = `(${len})`;
  return `<span class="soa-vartype">${escapeHtml(v.dataType)}</span>${suffix ? `<span class="soa-subtle"> ${escapeHtml(suffix)}</span>` : ''}`;
}

function renderCodelist(v) {
  const cl = v.codelist;
  if (!cl) return '';
  const sub = cl.submissionValue ? `<code>${escapeHtml(cl.submissionValue)}</code>` : '';
  const cid = cl.conceptId ? `<span class="soa-subtle">${escapeHtml(cl.conceptId)}</span>` : '';
  return [sub, cid].filter(Boolean).join(' ');
}

function renderAssigned(v) {
  if (v.assignedTerm?.value) {
    const cid = v.assignedTerm.conceptId ? ` <span class="soa-subtle">${escapeHtml(v.assignedTerm.conceptId)}</span>` : '';
    return `<span class="soa-assigned">${escapeHtml(v.assignedTerm.value)}</span>${cid}`;
  }
  if (v.mandatoryValue === true) return `<span class="soa-subtle">required</span>`;
  if (v.valueList?.length) return `<span class="soa-def">${v.valueList.map(escapeHtml).join(', ')}</span>`;
  if (v.subsetCodelist) return `<code>${escapeHtml(v.subsetCodelist)}</code>`;
  return '';
}

function renderVarFlags(v) {
  const flags = [];
  if (v.mandatoryVariable) flags.push('<span class="soa-flag soa-flag-req" title="Mandatory variable">Req</span>');
  if (v.vlmTarget) flags.push('<span class="soa-flag soa-flag-vlm" title="Value-level metadata target">VLM</span>');
  if (v.isNonStandard) flags.push('<span class="soa-flag soa-flag-nstd" title="Non-standard variable">NStd</span>');
  if (v.originType) flags.push(`<span class="soa-flag soa-flag-origin" title="Origin: ${escapeHtml(v.originType)}">${escapeHtml(originShort(v.originType))}</span>`);
  return flags.join(' ');
}

function originShort(origin) {
  // Short single-char origin marker
  const map = { 'Collected': 'C', 'Assigned': 'A', 'Derived': 'D', 'Protocol': 'P' };
  return map[origin] || origin.slice(0, 3);
}

function extractCCode(ref) {
  if (!ref) return null;
  const m = ref.match(/biomedicalconcepts\/(C\d+)/);
  return m ? m[1] : null;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
