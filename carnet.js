/* Shared data rules for the offline app and its regression tests. */
(function (root) {
  'use strict';
  const LIFTS = [
    ['squat', 'Back squat', 5], ['bench', 'Bench', 2.5],
    ['deadlift', 'Deadlift', 5], ['front', 'Front squat', 5], ['ohp', 'OHP', 2.5]
  ];
  const LEGACY_DAYS = [['squat'], ['bench'], ['deadlift'], ['front', 'ohp']];
  const WEIGHTS = [[.65, .75, .85], [.7, .8, .9], [.75, .85, .95]];
  const SCHEMA = 'ca.carnet531.v2';
  const isBlock = value => Number.isInteger(value) && value >= 0 && value <= 2;
  const isLift = id => LIFTS.some(lift => lift[0] === id);
  const key = (cycle, block, id) => `${cycle}-${block}-${id}`;
  const label = id => LIFTS.find(lift => lift[0] === id)?.[1] || id;
  const round = value => Math.round(value / 2.5) * 2.5;
  const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  function fresh() {
    return {
      schema: SCHEMA, createdAt: new Date().toISOString(),
      settings: {rounding: 2.5, incs: Object.fromEntries(LIFTS.map(([id, , inc]) => [id, inc]))},
      cycles: [{id: 1, createdAt: localDate(), tms: {squat: 150, bench: 0, deadlift: 0, front: 0, ohp: 0}}],
      plans: {}, movementDrafts: {}, sessions: []
    };
  }

  function valid(db) {
    if (!db || !['ca.carnet531.v1', SCHEMA].includes(db.schema) || !Array.isArray(db.cycles) || !db.cycles.length ||
        !Array.isArray(db.sessions) || !db.settings?.incs || typeof db.settings.incs !== 'object') return false;
    const ids = new Set();
    for (const cycle of db.cycles) {
      if (!cycle || !Number.isInteger(cycle.id) || cycle.id < 1 || ids.has(cycle.id) || !cycle.tms) return false;
      ids.add(cycle.id);
      for (const [id] of LIFTS) {
        if (cycle.tms[id] != null && (!Number.isFinite(cycle.tms[id]) || cycle.tms[id] < 0)) return false;
        if (db.settings.incs[id] != null && (!Number.isFinite(db.settings.incs[id]) || db.settings.incs[id] < 0)) return false;
      }
    }
    return db.sessions.every(session => session && typeof session === 'object' && ids.has(session.cycle) &&
      Array.isArray(session.movements) && session.movements.every(movement => movement && isLift(movement.id) &&
        isBlock(movement.block ?? session.block)));
  }

  function cleanDraft(draft = {}) {
    return {
      style: draft.style === 'ssl' ? 'ssl' : 'fsl',
      reps: [5, 8, 10].includes(draft.reps) ? draft.reps : 5,
      completed: Array.from({length: 5}, (_, i) => draft.completed?.[i] === true),
      actualReps: draft.actualReps !== '' && draft.actualReps != null && Number.isInteger(Number(draft.actualReps)) &&
        Number(draft.actualReps) >= 0 && Number(draft.actualReps) <= 30 ? String(draft.actualReps) : ''
    };
  }

  function normalize(value, legacyChecks = {}) {
    if (!valid(value)) throw new Error('Format JSON invalide : aucune donnée locale remplacée.');
    const db = JSON.parse(JSON.stringify(value));
    const drafts = {};
    if (db.schema === 'ca.carnet531.v1') {
      for (const cycle of db.cycles) for (let block = 0; block < 3; block++) {
        LEGACY_DAYS.forEach((lifts, day) => lifts.forEach(id => {
          const oldKey = `${cycle.id}-${block}-${day}-${id}`;
          const plan = db.plans?.[oldKey]?.draft?.[id];
          const checks = legacyChecks?.[oldKey];
          if (plan || checks) drafts[key(cycle.id, block, id)] = cleanDraft({...plan, completed: checks});
        }));
      }
    } else {
      for (const cycle of db.cycles) for (let block = 0; block < 3; block++) for (const [id] of LIFTS) {
        const draftKey = key(cycle.id, block, id);
        if (db.movementDrafts?.[draftKey]) drafts[draftKey] = cleanDraft(db.movementDrafts[draftKey]);
      }
    }
    db.schema = SCHEMA;
    db.movementDrafts = drafts;
    return db;
  }

  function completedBlocks(db, cycle, id) {
    const blocks = new Set();
    for (const session of db.sessions) {
      if (session.cycle !== cycle) continue;
      for (const movement of session.movements) {
        if (movement.id === id && isBlock(movement.block ?? session.block)) blocks.add(movement.block ?? session.block);
      }
    }
    return blocks;
  }

  function nextBlock(db, cycle, id) {
    const done = completedBlocks(db, cycle, id);
    return [0, 1, 2].find(block => !done.has(block)) ?? null;
  }

  function remaining(db, cycle) {
    return LIFTS.flatMap(([id]) => [0, 1, 2].filter(block => !completedBlocks(db, cycle, id).has(block)).map(block => ({id, block})));
  }

  function getDraft(db, cycle, block, id) {
    return cleanDraft(db.movementDrafts[key(cycle, block, id)]);
  }

  function buildSession(db, cycleId, selections, notes, now = new Date()) {
    const cycle = db.cycles.find(item => item.id === cycleId);
    if (!cycle || !selections.length || new Set(selections.map(item => item.id)).size !== selections.length ||
        selections.some(({id, block}) => !isLift(id) || !isBlock(block))) throw new Error('Sélection de mouvements invalide.');
    return {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`, date: localDate(now),
      recordedAt: now.toISOString(), cycle: cycleId, rpe: null, notes: notes || '',
      recordingMode: 'planned-unless-overridden',
      movements: selections.map(({id, block}) => {
        const tm = Number(cycle.tms[id]);
        if (!(tm > 0)) throw new Error(`TM manquant : ${label(id)}.`);
        const draft = getDraft(db, cycleId, block, id);
        const percent = WEIGHTS[block][draft.style === 'ssl' ? 1 : 0];
        return {
          id, block, tm,
          main: WEIGHTS[block].map((pct, index) => ({
            percent: pct, weight: round(tm * pct), targetReps: 5,
            actualReps: index === 2 && draft.actualReps !== '' ? Number(draft.actualReps) : null
          })),
          supplementary: {style: draft.style, percent, weight: round(tm * percent), count: 5, reps: draft.reps,
            sets: draft.completed.map((done, index) => ({number: index + 1, completed: done})), completionAssumed: false}
        };
      })
    };
  }

  function createNextCycle(db, cycleId) {
    if (db.cycles.at(-1).id !== cycleId) throw new Error('Sélectionne le dernier cycle.');
    const last = db.cycles.at(-1);
    return {
      id: Math.max(...db.cycles.map(cycle => cycle.id)) + 1, createdAt: localDate(),
      tms: Object.fromEntries(LIFTS.map(([id, , inc]) => [id, Number(last.tms[id]) ? Number(last.tms[id]) + (db.settings.incs[id] ?? inc) : 0]))
    };
  }

  const api = {LIFTS, LEGACY_DAYS, WEIGHTS, SCHEMA, isBlock, isLift, key, label, round, localDate,
    fresh, valid, normalize, cleanDraft, completedBlocks, nextBlock, remaining, getDraft, buildSession, createNextCycle};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Carnet531 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
