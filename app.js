(() => {
  'use strict';
  const C = window.Carnet531;
  const KEY = '531powerbuilding-v1'; // Keep the original storage location for upgrades.
  const UIKEY = '531powerbuilding-ui-v3';
  const $ = id => document.getElementById(id);
  const fmt = value => value.toLocaleString('fr-CA', {maximumFractionDigits: 1});
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const EXTRAS = {
    squat: ['Barbell row', 'Gainage'], bench: ['Bench prise serrée', 'Barbell row'],
    deadlift: ['Farmer carry', 'Gainage'], front: ['Barbell row ou pull-ups'], ohp: ['Barbell row ou pull-ups']
  };
  const readJSON = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  let db, originalData, protectedData = false, loadMessage = '';
  try {
    originalData = localStorage.getItem(KEY);
    db = originalData ? C.normalize(JSON.parse(originalData), readJSON('531powerbuilding-checks-v1', {})) : C.fresh();
  } catch {
    db = C.fresh();
    protectedData = Boolean(originalData);
    loadMessage = protectedData ? 'Données locales illisibles : exporte-les avant de réimporter une sauvegarde. Elles sont conservées.' : 'Stockage indisponible : exporte ton JSON avant de fermer.';
  }
  let ui = readJSON(UIKEY, null);
  const legacyUI = !ui ? readJSON('531powerbuilding-ui-v2', {}) : null;
  ui = ui && typeof ui === 'object' ? ui : {};
  let cy = db.cycles.some(cycle => cycle.id === (ui.cy ?? legacyUI?.cy)) ? (ui.cy ?? legacyUI.cy) : db.cycles.at(-1).id;
  let selected = Array.isArray(ui.selected) ? [...new Set(ui.selected.filter(C.isLift))] : [];
  if (legacyUI && C.LEGACY_DAYS[legacyUI.day]) {
    selected = [...C.LEGACY_DAYS[legacyUI.day]];
    if (legacyUI.repsActual !== '' && legacyUI.repsActual != null) {
      const id = selected[0], block = C.isBlock(legacyUI.b) ? legacyUI.b : 0;
      db.movementDrafts[C.key(cy, block, id)] = C.cleanDraft({...C.getDraft(db, cy, block, id), actualReps: legacyUI.repsActual});
    }
  }
  $('note').value = ui.note ?? legacyUI?.note ?? '';
  ui.tab = ui.tab ?? legacyUI?.tab ?? 'train';

  const current = () => db.cycles.find(cycle => cycle.id === cy);
  const blockFor = id => C.nextBlock(db, cy, id);
  const selections = () => selected.map(id => ({id, block: blockFor(id)}));

  function saveUI() {
    try { localStorage.setItem(UIKEY, JSON.stringify({cy, selected, note: $('note').value, tab: ui.tab})); }
    catch { $('status').textContent = 'Stockage indisponible : exporte ton JSON avant de fermer.'; }
  }

  function writeData(value = db, replaceProtected = false) {
    if (protectedData && !replaceProtected) {
      $('status').textContent = loadMessage;
      return false;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
      return true;
    } catch {
      $('status').textContent = 'Enregistrement impossible : stockage indisponible ou plein. Exporte ton JSON avant de fermer.';
      return false;
    }
  }

  function updateDraft(id, changes, redraw = true) {
    const block = blockFor(id);
    db.movementDrafts[C.key(cy, block, id)] = C.cleanDraft({...C.getDraft(db, cy, block, id), ...changes});
    writeData();
    if (redraw) drawMoves();
  }

  function drawProgress() {
    selected = selected.filter(id => blockFor(id) !== null);
    $('cycle').innerHTML = db.cycles.map(cycle => `<option value="${cycle.id}">#${cycle.id}</option>`).join('');
    $('cycle').value = cy;
    $('progress').innerHTML = `<table class="progress" aria-label="Progression par mouvement"><thead><tr><th scope="col">Mouvement</th>${[0, 1, 2].map(block => `<th scope="col">${'ABC'[block]}</th>`).join('')}</tr></thead><tbody>${C.LIFTS.map(([id, name]) => {
      const done = C.completedBlocks(db, cy, id), next = C.nextBlock(db, cy, id), chosen = selected.includes(id);
      return `<tr><td><button class="movement ${chosen ? 'active' : ''}" data-toggle="${id}" aria-pressed="${chosen}" ${next === null ? 'disabled' : ''}>${chosen ? '✓ ' : ''}${name}${next === null ? '<br><small>Terminé</small>' : ''}</button></td>${[0, 1, 2].map(block => {
        const state = done.has(block) ? 'enregistré' : next === block ? 'prochain à faire' : 'à faire';
        return `<td><span class="block-state ${done.has(block) ? 'done' : ''} ${next === block ? 'next-block' : ''}" aria-label="${name}, bloc ${'ABC'[block]}, ${state}">${'ABC'[block]}${done.has(block) ? ' ✓' : ''}</span></td>`;
      }).join('')}</tr>`;
    }).join('')}</tbody></table>`;
    const left = C.remaining(db, cy);
    $('cycleProgress').textContent = left.length ? `${15 - left.length}/15 blocs enregistrés · chaque mouvement avance séparément.` : '15/15 blocs enregistrés · cycle terminé. Tu peux créer le prochain dans TM / cycles.';
  }

  function drawMoves() {
    $('save').disabled = !selected.length;
    $('save').textContent = selected.length ? `Séance terminée · ${selected.length} mouvement${selected.length > 1 ? 's' : ''} ✓` : 'Sélectionne un mouvement';
    $('extrasCard').classList.toggle('hidden', !selected.length);
    $('extras').textContent = [...new Set(selected.flatMap(id => EXTRAS[id]))].join(' · ');
    $('moves').innerHTML = !selected.length ? '<p class="empty">Choisis les mouvements que tu fais aujourd’hui dans le tableau.</p>' : selected.map(id => {
      const block = blockFor(id), draft = C.getDraft(db, cy, block, id), tm = Number(current().tms[id]) || 0;
      const pct = C.WEIGHTS[block][draft.style === 'ssl' ? 1 : 0];
      return `<article class="card"><div class="flex"><h2>${C.label(id)}</h2><span class="pill">TM ${tm ? fmt(tm) : '—'} kg</span></div>
        <div class="flex work-label"><span class="pill" data-current-block="${id}">Bloc ${'ABC'[block]} · ${Math.round(C.WEIGHTS[block][2] * 100)} % · automatique</span><button data-remove="${id}" aria-label="Retirer ${C.label(id)} de cette séance">Retirer</button></div>
        ${tm ? `<div class="main">${C.WEIGHTS[block].map(p => `<div><strong>${fmt(C.round(tm * p))}</strong><small>kg · 5 reps · ${Math.round(p * 100)} %</small></div>`).join('')}</div>` : '<p class="warn">Entre d’abord ton TM dans l’onglet TM / cycles.</p>'}
        <label class="field" for="actual-${id}">Reps de la dernière série principale (facultatif)</label><input id="actual-${id}" data-actual="${id}" type="number" min="0" max="30" step="1" placeholder="5" value="${draft.actualReps}">
        <div class="flex work-label"><strong>Travail supplémentaire</strong><span class="metric">5 × ${draft.reps}${tm ? ' à ' + fmt(C.round(tm * pct)) + ' kg' : ''}</span></div>
        <div class="seg">${['fsl', 'ssl'].map(style => `<button data-style-id="${id}" data-style="${style}" class="${draft.style === style ? 'active' : ''}" aria-pressed="${draft.style === style}">${style.toUpperCase()}</button>`).join('')}</div>
        <div class="seg">${[5, 8, 10].map(reps => `<button data-reps-id="${id}" data-reps="${reps}" class="${draft.reps === reps ? 'active' : ''}" aria-pressed="${draft.reps === reps}">${reps} reps</button>`).join('')}</div>
        <div class="setlabel">Séries terminées · ${draft.completed.filter(Boolean).length}/5</div><div class="setchecks">${draft.completed.map((checked, index) => `<button class="setcheck ${checked ? 'done' : ''}" data-check-id="${id}" data-set="${index}" aria-pressed="${checked}" aria-label="${C.label(id)}, série supplémentaire ${index + 1}, ${checked ? 'terminée' : 'à faire'}">${checked ? '✓' : index + 1}</button>`).join('')}</div>
      </article>`;
    }).join('');
  }

  function drawTM() {
    $('tms').innerHTML = C.LIFTS.map(([id, name, increment]) => {
      const tm = Number(current().tms[id]) || 0, inc = db.settings.incs[id] ?? increment;
      return `<div class="item flex"><div><strong>${name}</strong><br><small>Prochain : ${tm ? fmt(tm + inc) + ' kg' : '—'}</small></div><input data-tm="${id}" aria-label="TM ${name} en kg" type="number" min="0" step="2.5" value="${tm || ''}" placeholder="TM"></div>`;
    }).join('');
    const left = C.remaining(db, cy);
    $('remaining').textContent = left.length ? 'Blocs restants : ' + C.LIFTS.map(([id, name]) => {
      const missing = left.filter(item => item.id === id).map(item => 'ABC'[item.block]);
      return missing.length ? `${name} (${missing.join(', ')})` : '';
    }).filter(Boolean).join(' · ') + '.' : 'Tous les mouvements ont terminé leurs blocs A, B et C.';
  }

  function drawHistory() {
    $('history').innerHTML = db.sessions.length ? [...db.sessions].reverse().slice(0, 30).map(session => {
      const title = session.movements.map(m => `${C.label(m.id)} · ${'ABC'[m.block ?? session.block]}`).join(' + ');
      const details = session.movements.map(m => {
        const supp = m.supplementary;
        const actual = m.main?.[2]?.actualReps;
        return `${C.label(m.id)}${supp ? ' ' + String(supp.style).toUpperCase() + ' ' + supp.count + '×' + supp.reps : ''}${actual != null ? ' · dernière série : ' + actual + ' reps' : ''}`;
      }).join(' / ');
      return `<div class="item history">${esc(session.date)} · Cycle ${session.cycle} · ${esc(title)}<br><small>${esc(details)}${session.notes ? ' · ' + esc(session.notes) : ''}</small></div>`;
    }).join('') : 'Aucune séance enregistrée.';
  }

  function render() { drawProgress(); drawMoves(); drawTM(); drawHistory(); }
  function tabs(which) {
    ui.tab = which;
    for (const [section, button] of [['train', 'tabTrain'], ['tm', 'tabTM'], ['data', 'tabData']]) {
      $(section).classList.toggle('hidden', section !== which);
      $(button).classList.toggle('active', section === which);
      $(button).setAttribute('aria-pressed', String(section === which));
    }
    saveUI();
  }
  function toggleMovement(id) {
    if (blockFor(id) === null) return;
    if (selected.includes(id)) selected = selected.filter(item => item !== id);
    else selected.push(id);
    saveUI(); drawProgress(); drawMoves();
  }

  for (const [button, section] of [['tabTrain', 'train'], ['tabTM', 'tm'], ['tabData', 'data']]) $(button).onclick = () => tabs(section);
  $('cycle').onchange = event => {
    cy = Number(event.target.value); selected = []; $('note').value = '';
    saveUI(); render();
  };
  $('progress').onclick = event => {
    const button = event.target.closest('button');
    if (button?.dataset.toggle) toggleMovement(button.dataset.toggle);
  };
  $('moves').onclick = event => {
    const button = event.target.closest('button');
    if (!button) return;
    const data = button.dataset;
    if (data.remove) toggleMovement(data.remove);
    if (data.styleId) updateDraft(data.styleId, {style: data.style});
    if (data.repsId) updateDraft(data.repsId, {reps: Number(data.reps)});
    if (data.checkId) {
      const draft = C.getDraft(db, cy, blockFor(data.checkId), data.checkId);
      draft.completed[Number(data.set)] = !draft.completed[Number(data.set)];
      updateDraft(data.checkId, {completed: draft.completed});
    }
  };
  $('moves').oninput = event => {
    if (event.target.dataset.actual) updateDraft(event.target.dataset.actual, {actualReps: event.target.value}, false);
  };
  $('note').addEventListener('input', saveUI);
  document.addEventListener('visibilitychange', saveUI);
  window.addEventListener('pagehide', saveUI);
  $('tms').onchange = event => {
    const input = event.target, id = input.dataset.tm;
    if (!id) return;
    if (!input.reportValidity()) return;
    current().tms[id] = Math.max(0, Number(input.value) || 0);
    writeData(); render();
  };

  $('save').onclick = () => {
    if (!selected.length) return;
    if ([...$('moves').querySelectorAll('input')].some(input => !input.reportValidity())) return;
    const items = selections();
    let session;
    try { session = C.buildSession(db, cy, items, $('note').value); }
    catch (error) { alert(error.message); tabs('tm'); return; }
    const candidate = {...db, sessions: [...db.sessions, session], movementDrafts: {...db.movementDrafts}};
    for (const {id, block} of items) delete candidate.movementDrafts[C.key(cy, block, id)];
    if (!writeData(candidate)) return;
    db = candidate;
    selected = []; $('note').value = '';
    $('status').textContent = `Séance enregistrée · ${session.movements.map(m => C.label(m.id) + ' ' + 'ABC'[m.block]).join(' + ')} · ${session.date}`;
    render(); saveUI(); window.scrollTo(0, 0);
  };

  $('next').onclick = () => {
    let cycle;
    try { cycle = C.createNextCycle(db, cy); } catch (error) { alert(error.message); return; }
    const left = C.remaining(db, cy);
    const warning = left.length ? `Il reste ${left.length} bloc(s) incomplet(s) dans ce cycle. Ils resteront accessibles dans l’ancien cycle. ` : '';
    if (!confirm(warning + 'Créer le prochain cycle avec les augmentations de TM ?')) return;
    const candidate = {...db, cycles: [...db.cycles, cycle]};
    if (!writeData(candidate)) return;
    db = candidate; cy = cycle.id; selected = []; $('note').value = '';
    $('status').textContent = `Cycle ${cy} créé. Choisis les mouvements de ta séance.`;
    render(); tabs('train');
  };
  $('export').onclick = () => {
    const data = protectedData ? originalData : JSON.stringify(db, null, 2);
    const link = document.createElement('a'), url = URL.createObjectURL(new Blob([data], {type: 'application/json'}));
    link.href = url; link.download = `carnet-531-${C.localDate()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = async event => {
    const input = event.target, file = input.files[0];
    if (!file) return;
    try {
      const candidate = C.normalize(JSON.parse(await file.text()));
      if (!confirm('Remplacer les données locales par le JSON importé ?')) return;
      if (!writeData(candidate, true)) return;
      db = candidate; protectedData = false; cy = db.cycles.at(-1).id; selected = []; $('note').value = '';
      $('status').textContent = 'Sauvegarde importée. Historique et progression restaurés.';
      render(); tabs('train');
    } catch (error) { alert(error.message); }
    finally { input.value = ''; }
  };

  // Preserve a raw v1 backup once; session records themselves remain unchanged in v2.
  if (originalData && !protectedData) {
    try {
      if (JSON.parse(originalData).schema === 'ca.carnet531.v1' && !localStorage.getItem('531powerbuilding-backup-v1')) {
        localStorage.setItem('531powerbuilding-backup-v1', originalData);
      }
    } catch { /* The original database is still retained if the write below fails. */ }
  }
  render(); tabs(['train', 'tm', 'data'].includes(ui.tab) ? ui.tab : 'train'); writeData();
  if (loadMessage) $('status').textContent = loadMessage;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {
      $('status').textContent = 'Cache hors ligne indisponible. Les données restent sur cet appareil ; exporte ton JSON régulièrement.';
    }));
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true; saveUI(); location.reload();
    });
  }
})();
