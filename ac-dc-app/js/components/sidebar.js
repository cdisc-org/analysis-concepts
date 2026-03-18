import { appState, STEPS, navigateTo } from '../app.js';

function canNavigateToStep(step) {
  if (step === 1) return true;
  if (step === 2) return appState.selectedStudyIndex !== null;
  if (step === 3) return appState.selectedEndpoints.length > 0;
  // Step 4: at least one endpoint has conceptCategory set
  if (step === 4) {
    return appState.selectedEndpoints.some(epId =>
      appState.endpointSpecs?.[epId]?.conceptCategory
    );
  }
  // Step 5: at least one endpoint has selectedTransformationOid set
  if (step === 5) {
    return appState.selectedEndpoints.some(epId =>
      appState.endpointSpecs?.[epId]?.selectedTransformationOid
    );
  }
  // Step 6: at least one endpoint has complete analysis spec
  if (step === 6) {
    return appState.selectedEndpoints.some(epId =>
      appState.endpointSpecs?.[epId]?.selectedTransformationOid
    );
  }
  // Step 7: always reachable once step 6 is
  if (step === 7) {
    return canNavigateToStep(6);
  }
  return false;
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
      <div class="step-number" style="background:var(--cdisc-light-blue);color:var(--cdisc-blue);font-size:14px;">&#9881;</div>
      <div>
        <div class="step-label">Configuration</div>
        <div class="step-sublabel">Variable mappings</div>
      </div>
    </div>
  `;

  sidebar.querySelectorAll('.step-item:not(.disabled)').forEach(item => {
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
