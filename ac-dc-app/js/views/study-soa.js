/**
 * Protocol-flavor Schedule of Activities — rendered inside Step 2 (Study Overview)
 * as a tab. Operates purely on USDM-native data (epochs, encounters with timing
 * windows, activities, scheduled-activity-instance × marks) and the parsed
 * study's biomedicalConcepts. No SDTM specialization, no CDISC Library drill-in.
 */

import { buildSoaMatrix } from '../utils/soa-matrix.js';

/**
 * Render the Protocol SoA into `container`, using the supplied parsed study
 * and its raw USDM (the SoA matrix needs the raw USDM to walk the
 * encounter/activity instance chains).
 */
export function renderProtocolSoa(container, study, rawUsdm) {
  if (!study || !rawUsdm) {
    container.innerHTML = `<div class="card" style="padding:24px;"><p style="color:var(--cdisc-text-secondary);">No study selected.</p></div>`;
    return;
  }
  const matrix = buildSoaMatrix(rawUsdm);
  if (!matrix.activities.length || !matrix.encounters.length) {
    container.innerHTML = `<div class="card" style="padding:24px;"><p style="color:var(--cdisc-text-secondary);">This study does not define a Schedule of Activities (no encounters or activities found in USDM).</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="soa-header">
      <div>
        <div class="soa-subtitle">${matrix.activities.length} activities &middot; ${matrix.encounters.length} encounters
          ${matrix.offMainActivityIds.length ? ` &middot; <span class="soa-warn">${matrix.offMainActivityIds.length} off-main-timeline</span>` : ''}
        </div>
      </div>
      <div class="soa-toolbar">
        <div class="soa-search">
          <span class="soa-search-icon" aria-hidden="true">&#x1F50D;</span>
          <input type="search" id="soa-search" placeholder="Find activity or BC…" autocomplete="off" spellcheck="false">
          <button class="soa-search-clear hidden" id="soa-search-clear" aria-label="Clear search">&times;</button>
        </div>
        <div class="soa-match-count" id="soa-match-count"></div>
        <label class="soa-toggle"><input type="checkbox" id="soa-show-bcs" checked> Show BC sub-rows</label>
      </div>
    </div>
    <div class="soa-layout" id="soa-layout">
      <div class="soa-grid" id="soa-grid">${renderGrid(study, matrix, true, '').html}</div>
      <aside class="soa-drillin hidden" id="soa-drillin">
        <div class="soa-drillin-empty">Click a BC to inspect its definition.</div>
      </aside>
    </div>
  `;

  wireGridEvents(container, study, matrix);
}

// ---------- grid render ----------

function renderGrid(study, matrix, showBcs, query) {
  const bcById = new Map(study.biomedicalConcepts.map(bc => [bc.id, bc]));
  const encounters = matrix.encounters;
  const q = (query || '').trim().toLowerCase();

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
      const bMatches = !q || searchHit(bcHaystack(bc), q);
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

  // Epoch group row (above encounter names) — only when at least one labelled epoch exists
  const epochRow = (matrix.epochGroups && matrix.epochGroups.some(g => g.label)) ? `
      <tr class="soa-epoch-row">
        <th class="soa-rowhead soa-epoch-rowhead"></th>
        ${matrix.epochGroups.map(g => `<th class="soa-epoch-cell" colspan="${g.span}" title="${escapeHtml(g.label)}">${escapeHtml(g.label)}</th>`).join('')}
      </tr>` : '';

  // Encounter header with optional Study-Day / Week sub-line + ±window from USDM timings
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
    renderActivityRows(a, matrix, encounters, bcById, showBcs, q, activityVisible, bcVisible)
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

function renderActivityRows(activity, matrix, encounters, bcById, showBcs, q, activityVisible, bcVisible) {
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
    const cls = `soa-bc-row soa-bc-clickable${bcVis.matches && q ? ' soa-row-matched' : ''}`;
    return `
      <tr class="${cls}" data-bc-id="${bcId}">
        <td class="soa-rowhead"><span class="soa-bc-label">${highlight(escapeHtml(bc.name || bc.label || bc.id), q)}</span></td>
        ${cells}
      </tr>`;
  }).join('');
  return actRow + bcRows;
}

// ---------- search helpers ----------

function activityHaystack(activity) {
  return (activity.label || '').toLowerCase() + ' ' + (activity.name || '').toLowerCase();
}

function bcHaystack(bc) {
  const parts = [bc.name || '', bc.label || ''];
  if (Array.isArray(bc.synonyms)) parts.push(bc.synonyms.join(' '));
  for (const p of bc.properties || []) {
    parts.push(p.name || '', p.label || '');
    if (p.code?.standardCode?.decode) parts.push(p.code.standardCode.decode);
  }
  return parts.join(' ').toLowerCase();
}

function searchHit(haystack, query) {
  return haystack.indexOf(query) !== -1;
}

function highlight(html, q) {
  if (!q) return html;
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return html.replace(re, m => `<mark class="soa-hit">${m}</mark>`);
}

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
  if (!label) return '';
  const l = label.trim();
  const m = l.match(/^Screening\s*(\d+)/i);   if (m) return `Scr${m[1]}`;
  const w = l.match(/^Week\s*(\d+)/i);        if (w) return `Wk${w[1]}`;
  if (/^Baseline/i.test(l)) return 'Bsl';
  return l.length > 12 ? l.slice(0, 12) + '…' : l;
}

// ---------- interaction ----------

function wireGridEvents(container, study, matrix) {
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
    const result = renderGrid(study, matrix, showBcs.checked, search.value);
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

  container.addEventListener('click', (e) => {
    const row = e.target.closest('.soa-bc-clickable');
    if (!row) return;
    const bcId = row.dataset.bcId;
    if (!bcId) return;
    const bc = bcById.get(bcId);
    if (!bc) return;
    openDrillIn();
    drill.innerHTML = renderBcDrillIn(bc);
    drill.querySelector('.soa-drillin-close')?.addEventListener('click', closeDrillIn);
  });
}

// ---------- BC drill-in (local USDM data only) ----------

function renderBcDrillIn(bc) {
  const header = `
    <div class="soa-drillin-header">
      <div>
        <div class="soa-drillin-title">${escapeHtml(bc.name || bc.id)}</div>
        <div class="soa-drillin-subtitle">${escapeHtml(bc.label || bc.id)}</div>
      </div>
      <button class="soa-drillin-close" aria-label="Close">&times;</button>
    </div>`;

  const ref = bc.reference
    ? `<dt>Reference</dt><dd><a href="${escapeHtml(bc.reference)}" target="_blank" rel="noopener noreferrer"><code>${escapeHtml(bc.reference)}</code></a></dd>`
    : '';
  const synonyms = (bc.synonyms || []).length
    ? `<dt>Synonyms</dt><dd>${bc.synonyms.map(escapeHtml).join(', ')}</dd>`
    : '';

  const summary = `
    <dl class="soa-kv">
      <dt>Concept ID</dt><dd><code>${escapeHtml(bc.id)}</code></dd>
      ${synonyms}
      ${ref}
    </dl>`;

  const props = bc.properties || [];
  const propsTable = props.length ? `
    <h4 class="soa-section-h">Properties (${props.length})</h4>
    <table class="data-table soa-dec-table">
      <thead><tr><th>Property</th><th>Data type</th><th>Required</th><th>Standard code</th><th>Response set</th></tr></thead>
      <tbody>${props.map(p => `
        <tr>
          <td><div style="font-weight:600;">${escapeHtml(p.name || p.id || '')}</div>
              ${p.label && p.label !== p.name ? `<div class="soa-subtle">${escapeHtml(p.label)}</div>` : ''}</td>
          <td>${escapeHtml(p.datatype || '')}</td>
          <td>${p.isRequired ? '<span class="soa-flag soa-flag-req">Req</span>' : ''}</td>
          <td>${renderStandardCode(p.code?.standardCode)}</td>
          <td>${renderResponseCodes(p.responseCodes)}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<div class="soa-drillin-note">No properties declared on this BC.</div>`;

  return header + `<div class="soa-drillin-body">${summary}${propsTable}</div>`;
}

function renderStandardCode(code) {
  if (!code) return '';
  const sys = code.codeSystem ? `<span class="soa-subtle"> ${escapeHtml(code.codeSystem)}</span>` : '';
  const decode = code.decode ? ` ${escapeHtml(code.decode)}` : '';
  return `<code>${escapeHtml(code.code || '')}</code>${decode}${sys}`;
}

function renderResponseCodes(codes) {
  if (!codes || !codes.length) return '';
  const enabled = codes.filter(c => c.isEnabled !== false);
  if (!enabled.length) return '';
  return enabled.map(c => `<div><code>${escapeHtml(c.code || '')}</code> ${escapeHtml(c.decode || '')}</div>`).join('');
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
