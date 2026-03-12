/**
 * Reusable drag-and-drop utilities for the SmartPhrase builder.
 */

/**
 * Make an element draggable with a data payload.
 */
export function makeDraggable(element, data) {
  element.setAttribute('draggable', 'true');

  element.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'copyMove';
    element.classList.add('dragging');
  });

  element.addEventListener('dragend', () => {
    element.classList.remove('dragging');
  });
}

/**
 * Make an element a drop target.
 * @param {HTMLElement} element - The drop zone element
 * @param {Function} onDrop - Callback receiving the dropped data
 */
export function makeDropTarget(element, onDrop) {
  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    element.classList.add('drag-over');
  });

  element.addEventListener('dragleave', (e) => {
    // Only remove class if we're actually leaving the element
    if (!element.contains(e.relatedTarget)) {
      element.classList.remove('drag-over');
    }
  });

  element.addEventListener('drop', (e) => {
    e.preventDefault();
    element.classList.remove('drag-over');

    let data;
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json'));
    } catch {
      data = e.dataTransfer.getData('text/plain');
    }

    if (data) onDrop(data, e);
  });
}
