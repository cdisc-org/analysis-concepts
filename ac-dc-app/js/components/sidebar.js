import { appState, STEPS, navigateTo } from '../app.js';

function canNavigateToStep(step) {
  // All steps are freely navigable
  return true;
}

function getStepState(step) {
  const current = appState.currentStep;
  if (step.num === current) return 'active';
  if (step.num < current) return 'completed';
  if (!canNavigateToStep(step.num)) return 'disabled';
  return '';
}

export function renderSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  sidebar.innerHTML = `
    <div class="sidebar-title">Workflow Steps</div>
    <ul class="step-list">
      ${STEPS.map(step => {
        const state = getStepState(step);
        const checkmark = state === 'completed' ? '&#10003;' : step.icon;
        return `
          <li class="step-item ${state}" data-step="${step.num}">
            <div class="step-number">${checkmark}</div>
            <div>
              <div class="step-label">${step.label}</div>
              <div class="step-sublabel">${step.sublabel}</div>
            </div>
          </li>`;
      }).join('')}
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

  sidebar.querySelectorAll('.step-item').forEach(item => {
    item.addEventListener('click', () => {
      navigateTo(parseInt(item.dataset.step, 10));
    });
  });

  sidebar.querySelector('#sidebar-config-trigger')?.addEventListener('click', async () => {
    const { toggleConfigPanel, renderConfigPanel } = await import('../views/study-config.js');
    toggleConfigPanel();
    renderConfigPanel();
  });
}
