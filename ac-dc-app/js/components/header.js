export function renderHeader() {
  const header = document.getElementById('app-header');
  header.innerHTML = `
    <div class="header-logo">
      <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" fill="rgba(255,255,255,0.15)"/>
        <path d="M8 18 L14 12 L14 16 L22 16 L22 12 L28 18 L22 24 L22 20 L14 20 L14 24 Z" fill="white" opacity="0.9"/>
        <circle cx="10" cy="10" r="3" fill="rgba(255,255,255,0.4)"/>
        <circle cx="26" cy="26" r="3" fill="rgba(255,255,255,0.4)"/>
      </svg>
      <span>AC/DC Framework</span>
    </div>
    <div class="header-center">
      <h1>Analysis Concepts / Derivation Concepts</h1>
    </div>
    <div class="header-badge">360i Phase 2</div>
  `;
}
