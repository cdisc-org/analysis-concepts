import { appState, navigateTo } from '../app.js';
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
      ${renderComingSoonCard()}
    </div>
  `;

  container.querySelectorAll('.study-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.index, 10);
      appState.selectedStudyIndex = idx;
      appState.selectedStudy = appState.studies[idx];
      appState.selectedEndpoints = [];
      appState.esapAnalyses = {};
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
        ${study.isSoaEnriched ? `<span class="badge badge-soa" title="This study carries the SDTM-specialization USDM extension — ready for the Protocol SoA / Detailed SoA views.">SoA-ready</span>` : ''}
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

function renderComingSoonCard() {
  return `
    <div class="card coming-soon">
      <div class="card-header">
        <div>
          <div class="card-title">Breast Cancer Study</div>
          <div class="card-subtitle">Oncology USDM study</div>
        </div>
      </div>
      <div class="study-card-meta">
        <span class="badge badge-blue">TBD</span>
      </div>
      <p style="margin-top:12px; font-size:12px; color:var(--cdisc-text-secondary);">
        A breast cancer study will be available in a future update.
      </p>
      <div class="study-card-stats">
        <div class="stat-item"><div class="stat-value">-</div><div class="stat-label">Arms</div></div>
        <div class="stat-item"><div class="stat-value">-</div><div class="stat-label">Objectives</div></div>
        <div class="stat-item"><div class="stat-value">-</div><div class="stat-label">Endpoints</div></div>
      </div>
    </div>
  `;
}

function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}
