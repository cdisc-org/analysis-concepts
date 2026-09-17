import { appState, navigateTo, switchStudy } from '../app.js';
import { clearLoadedDatasets } from '../utils/webr-engine.js';
import { setActiveStudy } from '../data-loader.js';

export function renderStudySelect(container) {
  const studies = appState.studies;

  container.innerHTML = `
    <div class="hero-banner">
      <div class="hero-title">AC/DC Framework</div>
      <div class="hero-subtitle">Select a study to begin building your electronic Statistical Analysis Plan</div>
    </div>

    <h2 style="margin-bottom:20px; font-size:18px;">Available Studies</h2>

    <div class="study-grid">
      ${studies.map((study, i) => renderStudyCard(study, i)).join('')}
    </div>
  `;

  container.querySelectorAll('.study-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.index, 10);
      // Park the outgoing study's workspace and restore this one's. Specs and
      // results are keyed by USDM endpoint id, and every study has an
      // "Endpoint_1" — swapping workspaces is what keeps one study's results
      // from rendering under another's endpoint of the same id.
      switchStudy(idx);
      // Datasets are the exception: they live in one R global environment under
      // bare names (dm, adsl), so two studies cannot hold theirs simultaneously.
      // Drop them rather than pretend the new study's DM is loaded.
      appState.loadedDatasets = [];
      clearLoadedDatasets().catch(err =>
        console.warn('[study-select] could not clear loaded datasets', err));
      // Update rawUsdm and usdmIndex for the selected study
      setActiveStudy(appState, idx);
      navigateTo(2);
    });
  });
}

function renderStudyCard(study, index) {
  const primaryTA = study.therapeuticAreas.find(t => t.system !== 'SPONSOR') || study.therapeuticAreas[0];
  const totalEndpoints = study.objectives.reduce((sum, o) => sum + o.endpoints.length, 0);
  const sponsorId = study.identifiers[0]?.text || '';
  const title = study.displayName || study.name;

  return `
    <div class="card card-clickable study-card" data-index="${index}">
      <div class="card-header">
        <div>
          <div class="card-title">${title}</div>
          <div class="card-subtitle">${sponsorId}</div>
        </div>
      </div>

      <div class="study-card-meta">
        <span class="badge badge-blue">${study.phase}</span>
        ${primaryTA ? `<span class="badge badge-teal">${primaryTA.decode}</span>` : ''}
      </div>

      <p style="margin-top:12px; font-size:12px; color:var(--cdisc-text-secondary); line-height:1.5;">
        ${truncate(study.rationale, 150)}
      </p>

      <div class="study-card-stats">
        <div class="stat-item">
          <div class="stat-value">${study.arms.length}</div>
          <div class="stat-label">Arms</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${study.objectives.length}</div>
          <div class="stat-label">Objectives</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${totalEndpoints}</div>
          <div class="stat-label">Endpoints</div>
        </div>
      </div>
    </div>
  `;
}

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}
