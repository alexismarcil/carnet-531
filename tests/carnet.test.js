'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../carnet.js');

function ready() {
  const db = C.fresh();
  db.cycles[0].tms = {squat: 150, bench: 100, deadlift: 180, front: 110, ohp: 60};
  return db;
}
function legacy() {
  const db = ready();
  db.schema = 'ca.carnet531.v1';
  delete db.movementDrafts;
  db.plans['1-0-3-front'] = {draft: {front: {style: 'ssl', reps: 8}}};
  db.plans['1-0-3-ohp'] = {draft: {ohp: {style: 'fsl', reps: 10}}};
  db.sessions.push({id: 'old', cycle: 1, block: 0, day: 3, date: '2026-10-30', notes: 'Séance conservée',
    movements: [{id: 'front', tm: 110}, {id: 'ohp', tm: 60}]});
  return db;
}

test('migration preserves original paired sessions, cycles and plans verbatim', () => {
  const before = legacy(), snapshot = JSON.stringify(before);
  const db = C.normalize(before);
  assert.equal(db.schema, 'ca.carnet531.v2');
  assert.deepEqual(db.sessions, before.sessions);
  assert.deepEqual(db.cycles, before.cycles);
  assert.deepEqual(db.plans, before.plans);
  assert.equal(JSON.stringify(before), snapshot);
  assert.deepEqual([...C.completedBlocks(db, 1, 'front')], [0]);
  assert.deepEqual([...C.completedBlocks(db, 1, 'ohp')], [0]);
  assert.equal(C.nextBlock(db, 1, 'front'), 1);
  assert.equal(C.nextBlock(db, 1, 'bench'), 0);
});

test('migration attaches old FSL/SSL and checks to each movement separately', () => {
  const db = C.normalize(legacy(), {'1-0-3-front': [true, false, true], '1-0-3-ohp': [false, true]});
  assert.deepEqual(C.getDraft(db, 1, 0, 'front'), {style: 'ssl', reps: 8, completed: [true, false, true, false, false], actualReps: ''});
  assert.deepEqual(C.getDraft(db, 1, 0, 'ohp'), {style: 'fsl', reps: 10, completed: [false, true, false, false, false], actualReps: ''});
  assert.deepEqual(C.getDraft(db, 1, 1, 'front').completed, [false, false, false, false, false]);
});

test('front squat alone advances only front squat, not OHP', () => {
  const db = ready();
  db.sessions.push(C.buildSession(db, 1, [{id: 'front', block: 0}], 'Solo'));
  assert.deepEqual(db.sessions[0].movements.map(m => m.id), ['front']);
  assert.equal(C.nextBlock(db, 1, 'front'), 1);
  assert.equal(C.nextBlock(db, 1, 'ohp'), 0);
  assert.equal(C.remaining(db, 1).length, 14);
});

test('grouped movements can use different blocks and per-movement overrides', () => {
  const db = ready();
  db.movementDrafts['1-1-squat'] = {style: 'ssl', reps: 8, completed: [true, false, true], actualReps: '7'};
  db.movementDrafts['1-0-bench'] = {style: 'fsl', reps: 10, completed: [false, true], actualReps: '0'};
  const session = C.buildSession(db, 1, [{id: 'squat', block: 1}, {id: 'bench', block: 0}], 'Ensemble');
  const [squat, bench] = session.movements;
  assert.equal(squat.block, 1);
  assert.equal(bench.block, 0);
  assert.deepEqual(squat.main.map(s => s.weight), [105, 120, 135]);
  assert.equal(squat.supplementary.weight, 120);
  assert.equal(bench.supplementary.weight, 65);
  assert.equal(squat.main[2].actualReps, 7);
  assert.equal(bench.main[2].actualReps, 0);
  assert.equal(bench.main[1].actualReps, null);
  assert.equal(squat.supplementary.reps, 8);
  assert.equal(bench.supplementary.reps, 10);
  db.sessions.push(session);
  assert.deepEqual([...C.completedBlocks(db, 1, 'squat')], [1]);
  assert.deepEqual([...C.completedBlocks(db, 1, 'bench')], [0]);
  assert.equal(C.nextBlock(db, 1, 'squat'), 0); // Fill skipped A before C.
});

test('saving never assumes unchecked sets or unspecified repetitions were completed', () => {
  const session = C.buildSession(ready(), 1, [{id: 'ohp', block: 2}], '');
  const movement = session.movements[0];
  assert.equal(movement.supplementary.completionAssumed, false);
  assert.deepEqual(movement.supplementary.sets.map(s => s.completed), [false, false, false, false, false]);
  assert.deepEqual(movement.main.map(s => s.actualReps), [null, null, null]);
});

test('progress counts unique movement/block pairs, independent of sessions and repeats', () => {
  const db = ready();
  for (let block = 0; block < 3; block++) db.sessions.push(C.buildSession(db, 1, C.LIFTS.map(([id]) => ({id, block})), ''));
  db.sessions.push(C.buildSession(db, 1, [{id: 'bench', block: 0}], 'Repeat'));
  assert.equal(C.remaining(db, 1).length, 0);
  for (const [id] of C.LIFTS) assert.equal(C.nextBlock(db, 1, id), null);
  assert.equal(db.cycles.length, 1); // Never auto-create a cycle.
});

test('JSON round trip retains mixed-block history, drafts and old session records', () => {
  const db = C.normalize(legacy());
  db.movementDrafts['1-1-front'] = {style: 'ssl', reps: 8, completed: [true, true, false, false, false], actualReps: '6'};
  db.sessions.push(C.buildSession(db, 1, [{id: 'bench', block: 2}, {id: 'ohp', block: 1}], 'Mixed'));
  const restored = C.normalize(JSON.parse(JSON.stringify(db)), {'1-1-3-front': [false]});
  assert.deepEqual(restored, db);
  assert.equal(C.getDraft(restored, 1, 1, 'front').actualReps, '6');
  assert.deepEqual(C.getDraft(restored, 1, 1, 'front').completed, [true, true, false, false, false]);
});

test('v1 import does not pick up checks from an unrelated local database', () => {
  const db = C.normalize(legacy());
  assert.deepEqual(C.getDraft(db, 1, 0, 'front').completed, [false, false, false, false, false]);
});

test('new cycle increments all configured TMs and keeps progress separate', () => {
  const db = ready();
  db.cycles[0].tms.ohp = 0;
  db.settings.incs.bench = 0;
  db.sessions.push(C.buildSession(db, 1, [{id: 'front', block: 0}], ''));
  const next = C.createNextCycle(db, 1);
  assert.deepEqual(next.tms, {squat: 155, bench: 100, deadlift: 185, front: 115, ohp: 0});
  db.cycles.push(next);
  assert.equal(C.remaining(db, 2).length, 15);
  assert.equal(C.remaining(db, 1).length, 14);
  assert.throws(() => C.createNextCycle(db, 1), /dernier cycle/);
});

test('session validation rejects missing TMs, empty/duplicate/invalid movements and blocks', () => {
  const db = C.fresh();
  assert.throws(() => C.buildSession(db, 1, [{id: 'ohp', block: 0}], ''), /TM manquant/);
  assert.throws(() => C.buildSession(db, 1, [], ''), /invalide/);
  assert.throws(() => C.buildSession(db, 1, [{id: 'squat', block: 0}, {id: 'squat', block: 1}], ''), /invalide/);
  assert.throws(() => C.buildSession(db, 1, [{id: 'squat', block: 3}], ''), /invalide/);
  assert.throws(() => C.buildSession(db, 1, [{id: 'unknown', block: 0}], ''), /invalide/);
});

test('import validation rejects malformed data before replacing anything', () => {
  for (const value of [null, {}, {...ready(), schema: 'unknown'}, {...ready(), sessions: [null]},
    {...ready(), cycles: []}, {...ready(), cycles: [{id: 1, tms: {bench: 'oops'}}]},
    {...ready(), sessions: [{cycle: 1, movements: [{id: 'bench', block: 9}]}]}]) {
    assert.equal(C.valid(value), false);
    assert.throws(() => C.normalize(value), /invalide/);
  }
});

test('drafts do not leak between movements, blocks or cycles', () => {
  const db = ready();
  db.movementDrafts['1-0-bench'] = {style: 'ssl', reps: 10, completed: [true], actualReps: '9'};
  for (const [cycle, block, id] of [[1, 1, 'bench'], [1, 0, 'ohp'], [2, 0, 'bench']]) {
    assert.deepEqual(C.getDraft(db, cycle, block, id), {style: 'fsl', reps: 5, completed: [false, false, false, false, false], actualReps: ''});
  }
  assert.equal(C.getDraft(db, 1, 0, 'bench').actualReps, '9');
});
