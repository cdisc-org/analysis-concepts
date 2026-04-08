/**
 * WebR (in-browser R via WASM) engine module.
 * Provides lazy initialization, XPT file loading, R code execution,
 * and data extraction for the AC/DC analysis pipeline.
 */

/** @type {object|null} Cached WebR instance */
let webRInstance = null;

/** @type {boolean} */
let initialized = false;

/** @type {Map<string, {name: string, nrow: number, ncol: number, columns: string[]}>} */
const loadedDatasets = new Map();

/**
 * Lazy-initialize a WebR singleton instance.
 * Loads WebR from CDN, creates the instance, and installs required R packages.
 *
 * @param {function} [onProgress] - Callback receiving status messages during init
 * @returns {Promise<object>} The WebR instance
 */
export async function initWebR(onProgress) {
  if (webRInstance) return webRInstance;

  const progress = typeof onProgress === 'function' ? onProgress : () => {};

  try {
    progress('Loading WebR runtime from CDN...');
    const { WebR } = await import('https://webr.r-wasm.org/latest/webr.mjs');

    progress('Creating WebR instance...');
    const webR = new WebR({ channelType: 'automatic' });
    await webR.init();

    progress('Installing R package: haven (XPT file support)...');
    await webR.installPackages(['haven']);

    progress('Installing R package: emmeans (LS means)...');
    await webR.installPackages(['emmeans']);

    progress('Installing R package: car (Type III SS)...');
    await webR.installPackages(['car']);

    progress('Loading jsonlite for data exchange...');
    await webR.evalR('library(jsonlite)');

    progress('WebR is ready.');
    webRInstance = webR;
    initialized = true;
    return webR;
  } catch (err) {
    initialized = false;
    webRInstance = null;
    throw new Error(`WebR initialization failed: ${err.message}`);
  }
}

/**
 * Load an XPT file into the R environment.
 *
 * @param {ArrayBuffer} arrayBuffer - Raw bytes of the XPT file
 * @param {string} datasetName - Name for the dataset (e.g. "ADSL")
 * @returns {Promise<{name: string, nrow: number, ncol: number, columns: string[]}>}
 */
export async function loadXptFile(arrayBuffer, datasetName) {
  const webR = await ensureInitialized();
  const rName = datasetName.toLowerCase();
  const tmpPath = `/tmp/${rName}.xpt`;

  // Write bytes to the virtual filesystem
  const uint8 = new Uint8Array(arrayBuffer);
  await webR.FS.writeFile(tmpPath, uint8);

  // Read XPT and assign to global environment
  await webR.evalR(`${rName} <- haven::read_xpt("${tmpPath}")`);

  // Extract metadata
  const metaResult = await webR.evalR(`
    jsonlite::toJSON(list(
      nrow = nrow(${rName}),
      ncol = ncol(${rName}),
      columns = colnames(${rName})
    ), auto_unbox = TRUE)
  `);
  const metaJSON = await metaResult.toString();
  const meta = JSON.parse(metaJSON);

  const info = {
    name: rName,
    nrow: meta.nrow,
    ncol: meta.ncol,
    columns: Array.isArray(meta.columns) ? meta.columns : [meta.columns]
  };

  loadedDatasets.set(rName, info);
  return info;
}

/**
 * Execute an R code string and return the result.
 *
 * @param {string} code - R code to evaluate
 * @returns {Promise<{success: boolean, result?: object, error?: string}>}
 */
export async function executeR(code) {
  try {
    const webR = await ensureInitialized();
    const shelter = await new webR.Shelter();
    try {
      const result = await shelter.evalR(code);
      const jsResult = await result.toJs();
      return { success: true, result: jsResult };
    } finally {
      shelter.purge();
    }
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Extract an R data.frame as a JS array of objects.
 *
 * @param {string} rVarName - Name of the R variable holding the data.frame
 * @returns {Promise<object[]>} Array of row objects
 */
export async function getDataFrameAsJSON(rVarName) {
  const webR = await ensureInitialized();
  const result = await webR.evalR(
    `jsonlite::toJSON(${rVarName}, dataframe = "rows")`
  );
  const jsonString = await result.toString();
  return JSON.parse(jsonString);
}

/**
 * Check if WebR has been initialized and is ready.
 *
 * @returns {boolean}
 */
export function isInitialized() {
  return initialized && webRInstance !== null;
}

/**
 * Return metadata for all loaded datasets.
 *
 * @returns {{name: string, nrow: number, ncol: number, columns: string[]}[]}
 */
export function getLoadedDatasets() {
  return Array.from(loadedDatasets.values());
}

/**
 * Load the AC/DC R engine script into the WebR environment.
 * Fetches acdc_engine.R and sources it so acdc_execute() is available.
 *
 * @returns {Promise<void>}
 */
export async function loadEngine() {
  const webR = await ensureInitialized();

  // Fetch the engine R script (cache-bust for development)
  const response = await fetch(`./r/acdc_engine.R?v=${Date.now()}`);
  if (!response.ok) throw new Error(`Failed to fetch acdc_engine.R: ${response.status}`);
  const engineCode = await response.text();

  // Source it into the R environment
  await webR.evalR(engineCode);
}

/**
 * Set an R variable from a JSON string.
 *
 * @param {string} varName   - R variable name to assign
 * @param {string} jsonString - JSON string to assign as the variable value
 * @returns {Promise<void>}
 */
export async function setJsonVariable(varName, jsonString) {
  const webR = await ensureInitialized();
  // Write JSON to virtual filesystem to avoid string escaping issues
  const tmpPath = `/tmp/${varName}.json`;
  const encoder = new TextEncoder();
  await webR.FS.writeFile(tmpPath, encoder.encode(jsonString));
  await webR.evalR(`${varName} <- paste(readLines("${tmpPath}", warn = FALSE), collapse = "\\n")`);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Ensure WebR is initialized, throwing a clear error if not.
 * @returns {Promise<object>}
 */
async function ensureInitialized() {
  if (webRInstance) return webRInstance;
  throw new Error(
    'WebR is not initialized. Call initWebR() before using the engine.'
  );
}
