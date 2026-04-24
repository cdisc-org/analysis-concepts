import { appState, STEPS, SOA_MENU, navigateTo, navigateToSoa } from '../app.js';

function canNavigateToStep(step) {
  // All steps are freely navigable
  return true;
}

function getStepState(step) {
  const current = appState.currentStep;
  const onSoaRoute = (location.hash || '').startsWith('#/soa/');
  if (onSoaRoute) return '';
  if (step.num === current) return 'active';
  if (step.num < current) return 'completed';
  if (!canNavigateToStep(step.num)) return 'disabled';
  return '';
}

export function renderSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const onSoaRoute = (location.hash || '').startsWith('#/soa/');
  const currentLayer = STEPS.find(s => s.num === appState.currentStep)?.layer || 'specification';

  let lastLayer = null;
  const stepItems = STEPS.map(step => {
    const state = getStepState(step);
    const checkmark = state === 'completed' ? '&#10003;' : step.icon;
    let header = '';
    if (step.layer !== lastLayer) {
      lastLayer = step.layer;
      const layerLabel = step.layer === 'specification' ? 'Specification Layer' : 'Execution Layer';
      const isActive = !onSoaRoute && step.layer === currentLayer;
      header = `<li class="sidebar-layer-header${isActive ? ' active' : ''}">${layerLabel}</li>`;
    }
    return `${header}
          <li class="step-item ${state}" data-step="${step.num}">
            <div class="step-number">${checkmark}</div>
            <div>
              <div class="step-label">${step.label}</div>
              <div class="step-sublabel">${step.sublabel}</div>
            </div>
          </li>`;
  }).join('');

  const soaItems = SOA_MENU.items.map(item => {
    const active = onSoaRoute && appState.soaView === item.view;
    return `
          <li class="step-item ${active ? 'active' : ''}" data-soa="${item.view}">
            <div class="step-number">${item.icon}</div>
            <div>
              <div class="step-label">${item.label}</div>
              <div class="step-sublabel">${item.sublabel}</div>
            </div>
          </li>`;
  }).join('');

  sidebar.innerHTML = `
    <div class="sidebar-title">Workflow Steps</div>
    <ul class="step-list">
      ${stepItems}
    </ul>
    <div class="sidebar-divider"></div>
    <div class="sidebar-title">${SOA_MENU.label}</div>
    <ul class="step-list">
      ${soaItems}
    </ul>
    <div class="sidebar-divider"></div>
    <div class="sidebar-config-trigger ${appState.configPanelOpen ? 'active' : ''}" id="sidebar-config-trigger">
      <div class="step-number" style="background:var(--cdisc-primary-light);color:var(--cdisc-primary);font-size:14px;">&#9881;</div>
      <div>
        <div class="step-label">Configuration</div>
        <div class="step-sublabel">Variable mappings</div>
      </div>
    </div>
  `;

  sidebar.querySelectorAll('[data-step]').forEach(item => {
    item.addEventListener('click', () => {
      navigateTo(parseInt(item.dataset.step, 10));
    });
  });

  sidebar.querySelectorAll('[data-soa]').forEach(item => {
    item.addEventListener('click', () => {
      navigateToSoa(item.dataset.soa);
    });
  });

  sidebar.querySelector('#sidebar-config-trigger')?.addEventListener('click', async () => {
    const { toggleConfigPanel, renderConfigPanel } = await import('../views/study-config.js');
    toggleConfigPanel();
    renderConfigPanel();
  });
}
