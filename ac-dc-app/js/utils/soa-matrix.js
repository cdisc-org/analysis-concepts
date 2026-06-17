/**
 * Build the Schedule-of-Activities matrix from a USDM study.
 *
 * Inputs:
 *   - rawUsdm: the raw USDM JSON (we read the instance-level fields the parser strips).
 *
 * Output:
 *   {
 *     encounters:          [{ id, name, label }...],   // in main-timeline order
 *     activities:          [{ id, name, label, biomedicalConceptIds, _onMain }...],
 *     offMainActivityIds:  [activity ids that never appear on the main timeline],
 *     cells:               Map<activityId, Set<encounterId>>,
 *     mainTimelineId:      string | null,
 *     isScheduled:         (activityId, encounterId) => boolean
 *   }
 *
 * Ordering is derived from the USDM chain fields:
 *   - Encounters by walking the main-timeline `instances` via `defaultConditionId`
 *     from the head (the instance no other targets).
 *   - Activities by walking `previousId`/`nextId`.
 */
export function buildSoaMatrix(rawUsdm) {
  const design = rawUsdm?.study?.versions?.[0]?.studyDesigns?.[0];
  if (!design) {
    return emptyMatrix();
  }

  const encounterById = new Map((design.encounters || []).map(e => [e.id, e]));
  const activityById  = new Map((design.activities || []).map(a => [a.id, a]));
  const epochById     = new Map((design.epochs || []).map(e => [e.id, e]));

  const mainTimeline = (design.scheduleTimelines || []).find(t => t.mainTimeline === true);
  if (!mainTimeline) {
    return emptyMatrix();
  }

  // --- Order encounters by walking the instance chain ---
  const instances = mainTimeline.instances || [];
  const orderedInstances = walkChain(
    instances,
    (i) => i.id,
    (i) => i.defaultConditionId
  );

  // --- Compute canonical Study-Day offsets via the Timing graph ---
  // USDM semantics in this file (per CDISC Pilot examples):
  //   relativeFromScheduledInstanceId  = the timed visit (subject)
  //   relativeToScheduledInstanceId    = the anchor
  //   type.decode ∈ {Before, After, Fixed Reference}
  //   value       = ISO 8601 duration (e.g. P2W, P1D)
  // A single "Fixed Reference" self-loop declares Day 1; all other visits anchor
  // to that point (directly or transitively). We BFS from Day-1 and propagate.
  const { offsetByInstance, anchorInstanceId } = computeStudyDayOffsets(mainTimeline);
  const anchorInstance = instances.find(i => i.id === anchorInstanceId);
  const anchorEncounterId = anchorInstance?.encounterId || null;
  const anchorEncounterLabel = anchorEncounterId
    ? (encounterById.get(anchorEncounterId)?.label || encounterById.get(anchorEncounterId)?.name || '')
    : '';

  // --- Build encounter ordering + per-encounter offsets + epoch assignment ---
  const encountersOrdered = [];
  const seenEncounterIds = new Set();
  const encounterOffset = new Map();   // encounterId -> { day, week, windowDays, windowLabel, isAnchor }
  const encounterEpoch = new Map();    // encounterId -> epochId
  for (const inst of orderedInstances) {
    const encId = inst.encounterId;
    if (!encId || seenEncounterIds.has(encId)) continue;
    const enc = encounterById.get(encId);
    if (!enc) continue;
    seenEncounterIds.add(encId);
    encountersOrdered.push({
      id: enc.id,
      name: enc.name || enc.label || enc.id,
      label: enc.label || enc.name || enc.id
    });
    if (inst.epochId) encounterEpoch.set(encId, inst.epochId);
    const off = offsetByInstance.get(inst.id);
    if (off) {
      const day = off.day;
      encounterOffset.set(encId, {
        day,
        week: dayToStudyWeek(day),
        windowDays: off.windowDays || 0,
        windowLabel: off.windowLabel || '',
        isAnchor: inst.id === anchorInstanceId
      });
    }
  }

  // --- Build epoch groups: sequential spans of encounters that share an epoch ---
  const epochOrdered = walkChain(
    design.epochs || [],
    (e) => e.id,
    (e) => e.nextId,
    (e) => e.previousId
  ).map(e => ({ id: e.id, label: e.label || e.name || e.id }));
  const epochGroups = [];
  let current = null;
  for (const enc of encountersOrdered) {
    const epId = encounterEpoch.get(enc.id) || null;
    if (!current || current.epochId !== epId) {
      current = { epochId: epId, label: epId ? (epochById.get(epId)?.label || epochById.get(epId)?.name || epId) : '', span: 0 };
      epochGroups.push(current);
    }
    current.span++;
  }

  // --- Build activity -> encounters mapping from instances ---
  const cells = new Map();
  for (const inst of orderedInstances) {
    const encId = inst.encounterId;
    if (!encId) continue;
    for (const actId of (inst.activityIds || [])) {
      if (!cells.has(actId)) cells.set(actId, new Set());
      cells.get(actId).add(encId);
    }
  }

  // --- Order activities by previousId/nextId walk; include off-main activities at the end ---
  const activitiesRaw = design.activities || [];
  const orderedActivities = walkChain(
    activitiesRaw,
    (a) => a.id,
    (a) => a.nextId,
    (a) => a.previousId
  );

  const offMainActivityIds = [];
  const activitiesOut = orderedActivities.map(a => {
    const onMain = cells.has(a.id);
    if (!onMain) offMainActivityIds.push(a.id);
    return {
      id: a.id,
      name: a.name || a.label || a.id,
      label: a.label || a.name || a.id,
      biomedicalConceptIds: a.biomedicalConceptIds || [],
      _onMain: onMain
    };
  });

  return {
    encounters: encountersOrdered,
    activities: activitiesOut,
    offMainActivityIds,
    cells,
    mainTimelineId: mainTimeline.id,
    encounterOffset,
    anchorEncounterId,
    anchorEncounterLabel,
    epochGroups,
    epochsOrdered: epochOrdered,
    isScheduled: (actId, encId) => cells.get(actId)?.has(encId) === true
  };
}

function emptyMatrix() {
  return {
    encounters: [],
    activities: [],
    offMainActivityIds: [],
    cells: new Map(),
    mainTimelineId: null,
    encounterOffset: new Map(),
    anchorEncounterId: null,
    anchorEncounterLabel: '',
    epochGroups: [],
    epochsOrdered: [],
    isScheduled: () => false
  };
}

/**
 * Walk the USDM Timing graph from the `Fixed Reference` self-loop (the study
 * anchor, typically Baseline = Day 1) and propagate signed day offsets to every
 * reachable scheduled instance.
 *
 * Returns:
 *   offsetByInstance: Map<instanceId, { day, windowDays, windowLabel }>
 *   anchorInstanceId: the instance declared as Fixed Reference (or best-guess fallback).
 */
function computeStudyDayOffsets(mainTimeline) {
  const timings = mainTimeline.timings || [];
  const edgesFromSubject = new Map();   // subjectId -> [{ anchor, signedDays, windowDays, windowLabel }]
  let anchorInstanceId = null;
  for (const t of timings) {
    const subject = t.relativeFromScheduledInstanceId;
    const anchor  = t.relativeToScheduledInstanceId;
    if (!subject || !anchor) continue;
    const type = (t.type?.decode || '').toLowerCase();
    if (type.includes('fixed') && subject === anchor) {
      anchorInstanceId = subject;
      continue;
    }
    const days = isoDurationToDays(t.value);
    if (days === null) continue;
    const signedDays = type === 'before' ? -days : days;
    const windowDays = Math.max(
      isoDurationToDays(t.windowUpper) || 0,
      isoDurationToDays(t.windowLower) || 0
    );
    if (!edgesFromSubject.has(subject)) edgesFromSubject.set(subject, []);
    edgesFromSubject.get(subject).push({ anchor, signedDays, windowDays, windowLabel: t.windowLabel || '' });
  }
  // Fallback anchor: the most-referenced anchor instance
  if (!anchorInstanceId) {
    const counts = new Map();
    for (const es of edgesFromSubject.values())
      for (const e of es) counts.set(e.anchor, (counts.get(e.anchor) || 0) + 1);
    anchorInstanceId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  const offsetByInstance = new Map();
  if (!anchorInstanceId) return { offsetByInstance, anchorInstanceId: null };
  offsetByInstance.set(anchorInstanceId, { day: 1, windowDays: 0, windowLabel: '' });
  // BFS by repeatedly expanding any subject whose anchor is already known.
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const [subject, edges] of edgesFromSubject) {
      if (offsetByInstance.has(subject)) continue;
      for (const e of edges) {
        const base = offsetByInstance.get(e.anchor);
        if (!base) continue;
        offsetByInstance.set(subject, {
          day: base.day + e.signedDays,
          windowDays: e.windowDays,
          windowLabel: e.windowLabel
        });
        progressed = true;
        break;
      }
    }
  }
  return { offsetByInstance, anchorInstanceId };
}

/**
 * Parse an ISO 8601 duration string (days precision) into integer days.
 * Returns null for unparseable input.
 */
function isoDurationToDays(v) {
  if (!v || typeof v !== 'string') return null;
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, w, d] = m;
  return (parseInt(y || '0') * 365) + (parseInt(mo || '0') * 30) + (parseInt(w || '0') * 7) + parseInt(d || '0');
}

/**
 * Day 1 = Week 0 by convention (CDISC Study Day). Return null for Day 0
 * (which is undefined in Study Day arithmetic — Day -1 is the day before Day 1).
 */
function dayToStudyWeek(day) {
  if (day == null) return null;
  if (day === 0) return null;
  // Collapse to integer weeks when the day lands on a week boundary
  if (day >= 1 && (day - 1) % 7 === 0) return (day - 1) / 7;
  if (day < 0 && (-day) % 7 === 0) return day / 7; // e.g. Day -7 → Week -1
  return null;
}

/**
 * Order a list of chained nodes by following the successor pointer from the head.
 * Head = node not pointed to by any other node's successor.
 * Falls back to input order if the chain is broken or has no head.
 *
 * @param nodes      Array of objects
 * @param idFn       node -> id
 * @param nextFn     node -> id of successor (or null)
 * @param prevFn     optional node -> id of predecessor (used to detect head)
 */
function walkChain(nodes, idFn, nextFn, prevFn) {
  if (!nodes.length) return [];
  const byId = new Map(nodes.map(n => [idFn(n), n]));
  const pointedTo = new Set();
  for (const n of nodes) {
    const nx = nextFn(n);
    if (nx) pointedTo.add(nx);
  }
  const heads = nodes.filter(n => prevFn ? !prevFn(n) : !pointedTo.has(idFn(n)));
  const start = heads[0] || nodes[0];
  const out = [];
  const visited = new Set();
  let cur = start;
  while (cur && !visited.has(idFn(cur))) {
    visited.add(idFn(cur));
    out.push(cur);
    const nx = nextFn(cur);
    cur = nx ? byId.get(nx) : null;
  }
  // Append any unvisited nodes (broken chain) in input order
  for (const n of nodes) {
    if (!visited.has(idFn(n))) out.push(n);
  }
  return out;
}
