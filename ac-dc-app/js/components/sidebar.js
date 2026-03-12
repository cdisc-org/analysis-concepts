import { appState, STEPS, navigateTo } from '../app.js';

function canNavigateToStep(step) {
  if (step === 1) return true;
  if (step === 2) return appState.selectedStudyIndex !== null;
  if (step === 3) return appState.selectedEndpoints.length > 0;
  if (step === 4) return appState.currentEndpointId !== null;
  if (step === 5) return appState.matchedTransformations.length > 0;
  if (step === 6) return appState.selectedTransformation !== null;
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
  `;

  sidebar.querySelectorAll('.step-item:not(.disabled)').forEach(item => {
    item.addEventListener('click', () => {
      navigateTo(parseInt(item.dataset.step, 10));
    });
  });
}
