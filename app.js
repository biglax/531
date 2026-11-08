import * as E from './engine.js';

const KEY = '531_v2';
const LEGACY = '531_forever_state';

let state = null;
let screen = 'today';
let currentLift = 'squat';
let timer = { end: 0, iv: null, on: false, total: 0 };

const view = () => document.getElementById('view');
const sheetRoot = () => document.getElementById('sheetRoot');

/* ------------------------------------------------------------------ state */

function blank() {
  const lifts = {};
  E.LIFTS.forEach((l) => (lifts[l] = { tm: 0, oneRm: 0 }));
  return {
    v: 2,
    block: { n: 1, phase: 'leader1', week: 1 },
    lifts,
    cfg: { tmPct: 0.85, supplemental: 'fsl', anchorStyle: '351', rest: 180 },
    logs: {},
    loads: {},
    cond: {},
    createdAt: Date.now(),
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 2) return s;
    }
  } catch (e) {}
  return null;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
}

/* --------------------------------------------------------------- helpers */

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function keyFor(lift) {
  return E.sessionKey(state.block.n, state.block.phase, state.block.week, lift);
}

function logFor(lift) {
  const k = keyFor(lift);
  if (!state.logs[k]) state.logs[k] = { sets: {}, assist: {}, amrap: null, t: 0 };
  return state.logs[k];
}

function allEntries() {
  const out = [];
  for (const [k, v] of Object.entries(state.logs)) {
    if (!v || !v.amrap || !v.amrap.reps) continue;
    const m = k.match(/^b(\d+):([a-z0-9]+):w(\d+):(.+)$/);
    if (!m) continue;
    out.push({
      key: k,
      block: +m[1],
      phase: m[2],
      week: +m[3],
      lift: m[4],
      reps: v.amrap.reps,
      weight: v.amrap.weight,
      e1rm: v.amrap.e1rm,
      t: v.t || 0,
      pr: false,
    });
  }
  out.sort((a, b) => b.t - a.t);
  return out;
}

function prMap() {
  const best = {};
  for (const e of allEntries()) {
    if (!best[e.lift] || e.e1rm > best[e.lift].e1rm) best[e.lift] = e;
  }
  return best;
}

function railIndex() {
  const b = state.block;
  let i = 0;
  for (const p of E.SEQUENCE) {
    if (p.phase === b.phase) return i + (p.weeks > 1 ? b.week - 1 : 0);
    i += p.weeks;
  }
  return 0;
}

function railHtml() {
  const idx = railIndex();
  return `<div class="rail">${Array.from({ length: 11 }, (_, i) => {
    const cls = i < idx ? 'done' : i === idx ? 'now' : '';
    return `<span class="${cls}"></span>`;
  }).join('')}</div>`;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), 2200);
}

function openSheet(html) {
  sheetRoot().innerHTML = `<div class="scrim" data-act="scrim"><div class="sheet">${html}</div></div>`;
  sheetRoot().style.display = 'block';
}

function closeSheet() {
  sheetRoot().innerHTML = '';
  sheetRoot().style.display = 'none';
}

/* ---------------------------------------------------------------- setup */

function setupHtml() {
  const cells = E.LIFTS.map(
    (l) => `<div class="tm-cell"><label>${E.LABEL[l]} 1RM</label>
      <input type="number" id="rm_${l}" inputmode="decimal" placeholder="0" /></div>`
  ).join('');
  return `
    <div class="top"><div class="top-inner"><div>
      <div class="eyebrow">5/3/1 Forever</div>
      <h1 class="phase-title">Set your<br>training maxes</h1>
      <div class="phase-sub">Enter a real 1RM, not a wish. TM is 85% of it.</div>
    </div></div></div>
    <div class="panel" style="margin-top:22px">
      <div class="tm-grid">${cells}</div>
      <div class="field" style="margin-top:14px">
        <label>Training max percentage</label>
        <select id="setupPct">
          <option value="0.85" selected>85% · Forever recommended</option>
          <option value="0.9">90% · original</option>
        </select>
      </div>
      <button class="btn accent" data-act="setup-generate" style="margin-top:6px">Generate training maxes</button>
      <p style="color:var(--dim);font-size:11px;margin:12px 0 0;line-height:1.5">
        You can change any training max later. Starting too light is always the better mistake.
      </p>
    </div>
    <p class="foot">JIM WENDLER · 5/3/1 FOREVER</p>
  `;
}

function generateFromSetup() {
  const pct = parseFloat(document.getElementById('setupPct').value);
  let any = false;
  E.LIFTS.forEach((l) => {
    const v = parseFloat(document.getElementById('rm_' + l).value) || 0;
    state.lifts[l].oneRm = v;
    state.lifts[l].tm = v > 0 ? E.round(v * pct) : 0;
    if (v > 0) any = true;
  });
  if (!any) {
    toast('Enter at least one 1RM');
    return;
  }
  state.cfg.tmPct = pct;
  save();
  screen = 'today';
  render();
}

function migrateLegacy(legacy) {
  const cycle = legacy.cycle || 1;
  let phase = 'leader1';
  if (legacy.config && legacy.config.phase === 'anchor') phase = 'anchor';
  else if (cycle >= 3) phase = 'anchor';
  else if (cycle === 2) phase = 'leader2';

  const map = { bbb_60: 'bbb60', bbb_50: 'bbb50', bbb_40: 'bbb50' };
  const supp = (legacy.config && legacy.config.supplemental) || 'fsl';

  openSheet(`
    <h3>Import your old program</h3>
    <p>The old app saved training maxes but not where you were in the block. Tell me where you are and I will pick it up from there.</p>
    <div class="field"><label>Phase</label>
      <select id="migPhase">
        ${E.SEQUENCE.map((p) => `<option value="${p.phase}" ${p.phase === phase ? 'selected' : ''}>${p.label}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Week</label>
      <select id="migWeek">
        <option value="1" selected>Week 1</option>
        <option value="2">Week 2</option>
        <option value="3">Week 3</option>
      </select>
    </div>
    <div class="panel" style="margin:0 0 8px;background:var(--s2)">
      ${E.LIFTS.map((l) => `<div class="row"><span class="k">${E.LABEL[l]}</span><span class="v">${E.fmt((legacy.tm && legacy.tm[l]) || 0)} kg</span></div>`).join('')}
    </div>
    <div class="btn-row">
      <button class="btn ghost" data-act="close-sheet">Skip</button>
      <button class="btn accent" data-act="migrate">Import</button>
    </div>
  `);

  sheetRoot().dataset.legacy = JSON.stringify({
    tm: legacy.tm || {},
    true1RM: legacy.true1RM || {},
    supp: map[supp] || supp,
    tmPct: (legacy.config && legacy.config.tmPercentage) || 0.85,
  });
}

function applyMigration() {
  const raw = sheetRoot().dataset.legacy;
  if (!raw) return;
  const d = JSON.parse(raw);
  E.LIFTS.forEach((l) => {
    state.lifts[l].tm = d.tm[l] || 0;
    state.lifts[l].oneRm = d.true1RM[l] || 0;
  });
  state.cfg.tmPct = d.tmPct || 0.85;
  state.cfg.supplemental = d.supp || 'fsl';
  state.block.phase = document.getElementById('migPhase').value;
  state.block.week = parseInt(document.getElementById('migWeek').value, 10) || 1;
  const info = E.phaseInfo(state.block.phase);
  if (state.block.week > info.weeks) state.block.week = info.weeks;
  localStorage.removeItem(LEGACY);
  save();
  closeSheet();
  screen = 'today';
  render();
  toast('Program imported');
}

/* ------------------------------------------------------------------- nav */

function navHtml() {
  const items = [
    ['today', 'Today'],
    ['block', 'Block'],
    ['log', 'Log'],
    ['settings', 'Setup'],
  ];
  return `<nav class="nav"><div class="nav-inner">${items
    .map(([k, label]) => `<button class="${screen === k ? 'on' : ''}" data-act="nav" data-screen="${k}">${label}</button>`)
    .join('')}</div></nav>`;
}

/* ----------------------------------------------------------------- today */

function phaseLabel() {
  const info = E.phaseInfo(state.block.phase);
  return info.label;
}

function todayHtml() {
  const b = state.block;
  const info = E.phaseInfo(b.phase);
  const isTest = info.kind === 'test';
  const isDeload = info.kind === 'deload';
  const lift = currentLift;
  const tm = state.lifts[lift].tm;

  if (!tm) return `<div class="wrap">${emptyLift()}</div>`;

  const sets = E.mainSets(b.phase, b.week, tm, state.cfg);
  const supp = E.supplemental(b.phase, b.week, tm, state.cfg);
  const assist = E.assistanceFor(b.phase, lift, state.cfg);
  const log = logFor(lift);

  const hitCount = sets.filter((_, i) => log.sets[i]).length;
  const pctDone = Math.round((hitCount / sets.length) * 100);

  const liftDone = (l) => {
    const k = E.sessionKey(b.n, b.phase, b.week, l);
    const v = state.logs[k];
    if (!v) return false;
    const s = E.mainSets(b.phase, b.week, state.lifts[l].tm, state.cfg);
    return s.every((_, i) => v.sets[i]);
  };

  return `
  <div class="wrap">
    <div class="top">
      <div class="top-inner">
        <div>
          <div class="eyebrow">Block ${b.n} · ${info.short}</div>
          <h1 class="phase-title">${phaseLabel()}</h1>
          <div class="phase-sub">${info.weeks > 1 ? `Week ${b.week} of ${info.weeks}` : 'One week'}${isTest ? ' · test at 100%' : ''}</div>
        </div>
        <div class="block-tag">TM ${E.fmt(tm)}</div>
      </div>
      ${railHtml()}
      <div class="days">
        ${E.LIFTS.map(
          (l) => `<button class="chip ${l === lift ? 'on' : ''} ${liftDone(l) ? 'done' : ''}" data-act="lift" data-lift="${l}">${E.LABEL[l]}</button>`
        ).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div>
          <h2 class="lift-name">${E.LABEL[lift]}</h2>
          <div class="tm-note">TM ${E.fmt(tm)} kg</div>
        </div>
        <div class="tm-note">${hitCount}/${sets.length}</div>
      </div>
      <div class="progress"><i style="width:${pctDone}%"></i></div>

      ${E.warmup(tm).length ? `<details class="warm">
        <summary>Warm-up</summary>
        <div class="warm-rows">${E.warmup(tm).map((w) => `<span><i>${Math.round(w.pct * 100)}%</i> ${E.fmt(w.weight)} kg × ${w.reps}</span>`).join('')}</div>
      </details>` : ''}

      <div class="section-label">Main work <b>${isTest ? '70 / 80 / 90 / TM' : ''}</b></div>
      ${sets.map((s, i) => setRow(s, i, log, lift)).join('')}

      ${supp ? `
        <div class="section-label">Supplemental <b>${supp.name}</b></div>
        <div class="supp">
          <div class="supp-top">
            <span class="supp-name">${supp.sets} × ${supp.reps}</span>
            <span class="supp-load">${E.fmt(supp.weight)} kg</span>
          </div>
          <div class="supp-note">${Math.round(supp.pct * 100)}% of TM. ${supp.note}</div>
        </div>` : ''}

      <div class="section-label">Assistance <b>${isTest || isDeload ? 'optional' : E.phaseInfo(b.phase).kind === 'anchor' ? '50-100 each' : '25-50 each'}</b></div>
      <div class="assist">
        <div class="assist-note">${E.assistanceNote(b.phase, state.cfg)}</div>
        ${assist.map((a) => assistBlock(a, lift)).join('')}
      </div>
    </div>

    ${conditioningHtml()}

    ${isTest ? testSummaryHtml() : `
      <button class="btn" data-act="finish" style="margin-top:16px">Finish week</button>
      <p class="foot" style="margin-top:12px">${nextLine()}</p>
    `}
  </div>
  ${navHtml()}`;
}

function emptyLift() {
  return `<div class="top"><div class="top-inner"><div>
    <div class="eyebrow">Block ${state.block.n}</div>
    <h1 class="phase-title">No training max</h1>
    <div class="phase-sub">Set one in Setup to see this day.</div>
  </div></div></div>
  <button class="btn accent" data-act="nav" data-screen="settings" style="margin-top:20px">Open setup</button>`;
}

function setRow(s, i, log, lift) {
  const hit = !!log.sets[i];
  const isTest = E.phaseInfo(state.block.phase).kind === 'test' && i === 3;
  const a = s.amrap || isTest;
  const logged = a && log.amrap && log.amrap.weight === s.weight ? log.amrap : null;

  let right = `<span class="r">${s.reps}${s.amrap ? '' : ''}</span>`;
  if (a) {
    right = `<span class="reps-box">
      <label>reps</label>
      <input type="number" inputmode="numeric" data-act="amrap" data-lift="${lift}" data-weight="${s.weight}"
        value="${logged ? logged.reps : ''}" placeholder="${isTest ? E.tmTestTarget(state.cfg.tmPct) : s.reps.replace('+', '')}" />
    </span>`;
  }

  return `<div class="set ${a ? 'amrap' : ''} ${hit ? 'hit' : ''}" data-act="set" data-idx="${i}" role="button" tabindex="0">
    <span class="pct">${Math.round(s.pct * 100)}%</span>
    <span class="w">${E.fmt(s.weight)}<small>kg</small></span>
    <span class="set-right">${right}<span class="tick"></span></span>
  </div>
  ${logged && logged.e1rm ? `<div class="set-note">
      ${logged.reps} reps · e1RM ${E.fmt(Math.round(logged.e1rm * 2) / 2)} kg ${logged.pr ? '<span class="pr-badge">PR</span>' : ''}
    </div>` : ''}`;
}

function assistBlock(a, lift) {
  return `<div class="assist-block">
    <div class="assist-cat-head"><span>${a.label}</span><b>${a.total} reps · ${a.range}</b></div>
    ${a.movements.map((m, i) => assistMove(a, m, i, lift)).join('')}
  </div>`;
}

function assistMove(a, m, i, lift) {
  const k = `${lift}:${a.cat}:${i}`;
  const legacy = i === 0 ? state.loads[`${lift}:${a.cat}`] : null;
  const last = state.loads[k] || legacy || {};
  return `<div class="assist-move">
    <div class="assist-head">
      <span class="assist-name">${esc(m.name)}</span>
      <span class="assist-presc">${m.sets} × ${m.reps}</span>
    </div>
    <div class="assist-inputs">
      <input type="number" inputmode="decimal" data-act="load" data-lift="${lift}" data-cat="${a.cat}" data-idx="${i}" data-field="kg"
        value="${last.kg || ''}" placeholder="kg" />
      <input type="number" inputmode="numeric" data-act="load" data-lift="${lift}" data-cat="${a.cat}" data-idx="${i}" data-field="reps"
        value="${last.reps || ''}" placeholder="reps" />
      <span class="hint">${last.kg ? `last ${last.kg}×${last.reps}` : ''}</span>
    </div>
  </div>`;
}

function conditioningHtml() {
  const k = `b${state.block.n}:w${state.block.week}`;
  const marks = state.cond[k] || [false, false, false];
  const done = marks.filter(Boolean).length;
  return `
    <div class="section-label">Conditioning <b>${done}/3 this week</b></div>
    <div class="cond">
      ${E.CONDITIONING.map(
        (c, i) => `<button class="cond-row ${marks[i] ? 'hit' : ''}" data-act="cond" data-idx="${i}">
          <span class="cond-tick"></span>
          <span class="cond-body"><b>${c.label}</b><small>${c.detail}</small></span>
        </button>`
      ).join('')}
    </div>
    <p class="cond-note">Two easy sessions are the floor. The hard one only if recovery is good. Aim 8-10k steps daily.</p>`;
}

function testSummaryHtml() {
  const rows = E.LIFTS.map((l) => {
    const info = testResult(l);
    if (!info.logged) return `<div class="row"><span class="k">${E.LABEL[l]}<small>${E.fmt(state.lifts[l].tm)} kg · need ${info.target}</small></span><span class="v" style="color:var(--dim)">—</span></div>`;
    return `<div class="row"><span class="k">${E.LABEL[l]}<small>${E.fmt(state.lifts[l].tm)} kg · got ${info.reps}</small></span><span class="v" style="color:${info.pass ? 'var(--ok)' : 'var(--accent)'}">${info.pass ? 'PASS' : 'FAIL'}</span></div>`;
  }).join('');

  const complete = E.LIFTS.every((l) => testResult(l).logged);

  return `
    <div class="panel">
      <div class="section-label" style="padding:0 0 10px">TM test <b>5 reps @ 85% · 3 reps @ 90%</b></div>
      ${rows}
      <p style="font-size:12px;color:var(--dim);line-height:1.5;margin:12px 0 0">
        Pass keeps the training max and adds 5 kg lower / 2.5 kg upper. Fail recalibrates it down.
      </p>
      <button class="btn accent" data-act="apply-test" ${complete ? '' : 'disabled'} style="margin-top:14px">Apply and start next block</button>
    </div>`;
}

function testResult(lift) {
  const k = E.sessionKey(state.block.n, state.block.phase, state.block.week, lift);
  const v = state.logs[k];
  const target = E.tmTestTarget(state.cfg.tmPct);
  const reps = v && v.amrap ? v.amrap.reps : 0;
  return { logged: !!reps, reps, target, pass: reps >= target };
}

function nextLine() {
  const a = E.advance(state.block, state.cfg);
  const info = E.phaseInfo(state.block.phase);
  if (a.phase !== state.block.phase) {
    return `Next: ${E.phaseInfo(a.phase).label}, week 1.${a.gained ? ' Training maxes go up.' : ''}`;
  }
  return `Next: week ${a.week} of ${info.weeks}.`;
}

/* ----------------------------------------------------------------- block */

function blockHtml() {
  const b = state.block;
  const info = E.phaseInfo(b.phase);
  const idx = railIndex();

  const slots = [];
  let n = 0;
  for (const p of E.SEQUENCE) {
    for (let w = 1; w <= p.weeks; w++) {
      slots.push({ p, w, i: n++ });
    }
  }

  return `<div class="wrap">
    <div class="top"><div class="top-inner"><div>
      <div class="eyebrow">Block ${b.n}</div>
      <h1 class="phase-title">${phaseLabel()}</h1>
      <div class="phase-sub">${info.weeks > 1 ? `Week ${b.week} of ${info.weeks}` : 'One week'}</div>
    </div><div class="block-tag">${E.LIFTS.reduce((s, l) => s + state.lifts[l].tm, 0) > 0 ? 'ACTIVE' : 'SETUP'}</div></div>
    ${railHtml()}</div>

    <div class="h2">Training maxes</div>
    <div class="tm-grid">
      ${E.LIFTS.map(
        (l) => `<div class="tm-cell"><label>${E.LABEL[l]}</label>
          <input type="number" inputmode="decimal" data-act="tm" data-lift="${l}" value="${E.fmt(state.lifts[l].tm)}" /></div>`
      ).join('')}
    </div>

    <div class="h2">The block</div>
    <div class="panel" style="padding:6px 16px">
      ${slots.map((s) => {
        const now = s.i === idx;
        const done = s.i < idx;
        return `<div class="row" style="opacity:${done ? 0.4 : 1}">
          <span class="k" style="color:${now ? 'var(--accent)' : 'inherit'};font-weight:${now ? 700 : 400}">${s.p.label}${s.p.weeks > 1 ? ` · week ${s.w}` : ''}</span>
          <span class="v" style="font-size:11px;color:var(--dim)">${done ? 'done' : now ? 'you are here' : ''}</span>
        </div>`;
      }).join('')}
    </div>

    <div class="h2">This week</div>
    <div class="panel">
      <p style="margin:0;font-size:13px;color:var(--muted);line-height:1.55">${nextLine()}</p>
      ${info.kind === 'test' ? '' : `<button class="btn ghost" data-act="finish" style="margin-top:14px">Finish week</button>`}
    </div>

    <p class="foot">LEADER ×2 · DELOAD · ANCHOR · TEST</p>
  </div>${navHtml()}`;
}

/* ------------------------------------------------------------------- log */

function logHtml() {
  const prs = prMap();
  const entries = allEntries();
  const best = Object.values(prs);

  return `<div class="wrap">
    <div class="top"><div class="top-inner"><div>
      <div class="eyebrow">Training log</div>
      <h1 class="phase-title">Records</h1>
      <div class="phase-sub">${entries.length} logged sets</div>
    </div></div></div>

    <div class="h2">Best estimated 1RM</div>
    <div class="panel" style="padding:6px 16px">
      ${best.length ? E.LIFTS.map((l) => {
        const b = prs[l];
        return `<div class="pr-row"><span class="lift">${E.LABEL[l]}</span>
          <span class="val">${b ? E.fmt(Math.round(b.e1rm * 2) / 2) : '—'}<small> kg</small></span></div>`;
      }).join('') : `<div class="empty">Log an AMRAP set and your records appear here.</div>`}
    </div>

    <div class="h2">Recent</div>
    ${entries.length ? `<div class="hist">${entries.slice(0, 40).map((e) => {
      const isPr = prs[e.lift] && prs[e.lift].key === e.key;
      return `<div class="hist-row">
        <div class="hist-top">
          <span class="hist-lift">${E.LABEL[e.lift]} ${isPr ? '<span class="pr-badge">PR</span>' : ''}</span>
          <span class="hist-date">${e.t ? new Date(e.t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''}</span>
        </div>
        <div class="hist-detail">${E.phaseInfo(e.phase).label} w${e.week} · ${E.fmt(e.weight)} kg × ${e.reps} · e1RM ${E.fmt(Math.round(e.e1rm * 2) / 2)}</div>
      </div>`;
    }).join('')}</div>` : `<div class="empty">Nothing logged yet.</div>`}

    <div class="h2">Backup</div>
    <div class="btn-row" style="margin-top:0">
      <button class="btn ghost" data-act="export">Export</button>
      <button class="btn ghost" data-act="import">Import</button>
    </div>
    <input type="file" id="importFile" accept="application/json" style="display:none" />
  </div>${navHtml()}`;
}

/* -------------------------------------------------------------- settings */

function settingsHtml() {
  const c = state.cfg;
  return `<div class="wrap">
    <div class="top"><div class="top-inner"><div>
      <div class="eyebrow">Setup</div>
      <h1 class="phase-title">Program</h1>
      <div class="phase-sub">Block ${state.block.n} · ${phaseLabel()}</div>
    </div></div></div>

    <div class="h2">Main work</div>
    <div class="panel">
      <div class="row"><span class="k">Anchor style<small>3/5/1 is the standard anchor</small></span>
        <select data-act="cfg" data-key="anchorStyle">
          <option value="351" ${c.anchorStyle === '351' ? 'selected' : ''}>3/5/1</option>
          <option value="531" ${c.anchorStyle === '531' ? 'selected' : ''}>5/3/1</option>
        </select>
      </div>
      <div class="row"><span class="k">Supplemental<small>Leader volume template</small></span>
        <select data-act="cfg" data-key="supplemental">
          ${[
            ['fsl', 'FSL 5×5'],
            ['ssl', 'SSL 5×5'],
            ['bbs', 'BBS 10×5'],
            ['bbb50', 'BBB 5×10 @ 50%'],
            ['bbb60', 'BBB 5×10 @ 60%'],
            ['bbb_fsl', 'BBB 5×10 @ FSL'],
            ['none', 'None'],
          ].map(([v, t]) => `<option value="${v}" ${c.supplemental === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="row"><span class="k">Training max %<small>Used when recalibrating</small></span>
        <select data-act="cfg" data-key="tmPct">
          <option value="0.85" ${c.tmPct === 0.85 ? 'selected' : ''}>85%</option>
          <option value="0.9" ${c.tmPct === 0.9 ? 'selected' : ''}>90%</option>
        </select>
      </div>
      <div class="row"><span class="k">Rest timer<small>Starts when you tick a set</small></span>
        <select data-act="cfg" data-key="rest">
          ${[90, 120, 150, 180, 240, 300].map((v) => `<option value="${v}" ${+c.rest === v ? 'selected' : ''}>${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="h2">Data</div>
    <div class="panel">
      <div class="row"><span class="k">Export<small>JSON backup of everything</small></span>
        <button class="btn ghost" style="width:110px;min-height:42px" data-act="export">Save</button></div>
      <div class="row"><span class="k">Import<small>Restore a backup</small></span>
        <button class="btn ghost" style="width:110px;min-height:42px" data-act="import">Load</button></div>
      <div class="row"><span class="k">Reset<small>Wipes all data on this device</small></span>
        <button class="btn danger" style="width:110px;min-height:42px" data-act="reset">Wipe</button></div>
    </div>
    <input type="file" id="importFile" accept="application/json" style="display:none" />

    <div class="h2">Method</div>
    <div class="panel">
      <p style="margin:0;font-size:12px;color:var(--muted);line-height:1.6">
        Leader 1, Leader 2, deload, Anchor, TM test. Leaders are 5s PRO with volume supplemental and 25-50 assistance reps per category.
        The Anchor is 3/5/1 with PR sets on weeks 1 and 3 and 50-100 assistance reps. Training maxes go up 5 kg lower / 2.5 kg upper
        after each Leader and after a passed TM test. Conditioning runs 2-3 sessions a week alongside the lifting.
      </p>
    </div>
    <p class="foot">5/3/1 FOREVER · v2</p>
  </div>${navHtml()}`;
}

/* ------------------------------------------------------------------ render */

function render(keepScroll) {
  const y = keepScroll ? window.scrollY : 0;
  if (!state) state = blank();
  const hasTM = E.LIFTS.some((l) => state.lifts[l].tm > 0);

  if (!hasTM) {
    view().innerHTML = setupHtml();
  } else {
    if (screen === 'today') view().innerHTML = todayHtml();
    else if (screen === 'block') view().innerHTML = blockHtml();
    else if (screen === 'log') view().innerHTML = logHtml();
    else view().innerHTML = settingsHtml();
  }
  window.scrollTo(0, y);
}

/* ---------------------------------------------------------------- actions */

function toggleSet(idx) {
  const lift = currentLift;
  const log = logFor(lift);
  log.sets[idx] = !log.sets[idx];
  if (log.sets[idx]) {
    startTimer(+state.cfg.rest);
  }
  save();
  render(true);
}

function setAmrap(lift, weight, reps) {
  reps = parseInt(reps, 10);
  if (!reps || reps < 1) return;
  const log = logFor(lift);
  const e = E.e1rm(weight, reps);
  const prevBest = prMap()[lift];
  const wasPr = !prevBest || e > prevBest.e1rm;
  log.amrap = { reps, weight, e1rm: Math.round(e * 10) / 10, pr: wasPr };
  log.t = Date.now();
  const sets = E.mainSets(state.block.phase, state.block.week, state.lifts[lift].tm, state.cfg);
  const idx = sets.findIndex((s) => s.weight === weight && (s.amrap || E.phaseInfo(state.block.phase).kind === 'test'));
  if (idx >= 0) log.sets[idx] = true;
  save();
  render(true);
  if (wasPr) toast('PR · e1RM ' + E.fmt(Math.round(e * 2) / 2) + ' kg');
}

function finishWeek() {
  const b = state.block;
  const a = E.advance(b, state.cfg);
  const info = E.phaseInfo(b.phase);

  const title = info.weeks > 1 && b.week < info.weeks
    ? `Finish week ${b.week}?`
    : `${info.label} complete`;

  openSheet(`
    <h3>${title}</h3>
    <p>${a.note || `Moving to week ${a.week}.`}</p>
    <div class="btn-row">
      <button class="btn ghost" data-act="close-sheet">Not yet</button>
      <button class="btn accent" data-act="confirm-finish">Confirm</button>
    </div>
  `);
}

function confirmFinish() {
  const b = state.block;
  const a = E.advance(b, state.cfg);

  if (a.gained) {
    if (b.phase === 'leader1' || b.phase === 'deload') {
      E.LIFTS.forEach((l) => {
        if (state.lifts[l].tm > 0) {
          state.lifts[l].tm = E.round(state.lifts[l].tm + E.INCREMENT[l]);
        }
      });
    }
  }

  state.block.phase = a.phase;
  state.block.week = a.week;
  state.block.n = a.n;
  currentLift = 'squat';
  save();
  closeSheet();
  screen = 'today';
  render();
  toast(a.note || 'Week complete');
}

function applyTest() {
  const results = E.LIFTS.map((l) => ({ l, ...testResult(l) }));
  if (results.some((r) => !r.logged)) return;

  const changes = results.map((r) => {
    const cur = state.lifts[r.l].tm;
    if (r.pass) return { l: r.l, from: cur, to: E.round(cur + E.INCREMENT[r.l]), pass: true };
    const rec = E.recalibrate(cur, r.reps, state.cfg.tmPct);
    return { l: r.l, from: cur, to: rec ? rec.tm : E.round(cur * 0.9), pass: false, oneRm: rec ? rec.oneRm : null };
  });

  openSheet(`
    <h3>Apply results</h3>
    <p>Pass adds 5 kg lower / 2.5 kg upper. Fail resets the max to a weight you can hit for the target reps.</p>
    <div class="panel" style="margin:0 0 10px;background:var(--s2)">
      ${changes.map((c) => `<div class="row"><span class="k">${E.LABEL[c.l]}<small style="color:${c.pass ? 'var(--ok)' : 'var(--accent)'}">${c.pass ? 'pass' : 'fail'}</small></span>
        <span class="v">${E.fmt(c.from)} → ${E.fmt(c.to)}</span></div>`).join('')}
    </div>
    <div class="btn-row">
      <button class="btn ghost" data-act="close-sheet">Cancel</button>
      <button class="btn accent" data-act="confirm-test">Start new block</button>
    </div>
  `);

  sheetRoot().dataset.changes = JSON.stringify(changes);
}

function confirmTest() {
  const changes = JSON.parse(sheetRoot().dataset.changes || '[]');
  changes.forEach((c) => {
    state.lifts[c.l].tm = c.to;
    if (c.oneRm) state.lifts[c.l].oneRm = c.oneRm;
  });
  state.block.n += 1;
  state.block.phase = 'leader1';
  state.block.week = 1;
  currentLift = 'squat';
  save();
  closeSheet();
  screen = 'today';
  render();
  toast('Block ' + state.block.n + ' started');
}

/* ----------------------------------------------------------------- export */

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `531-forever-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Backup downloaded');
}

function importData() {
  document.getElementById('importFile').click();
}

/* ------------------------------------------------------------------ timer */

function startTimer(secs) {
  if (!secs) return;
  timer.end = Date.now() + secs * 1000;
  timer.total = secs;
  timer.on = true;
  const bar = document.getElementById('timer');
  bar.classList.add('on');
  bar.classList.remove('done');
  tickTimer();
  clearInterval(timer.iv);
  timer.iv = setInterval(tickTimer, 250);
}

function tickTimer() {
  const bar = document.getElementById('timer');
  if (!timer.on) {
    bar.classList.remove('on');
    clearInterval(timer.iv);
    return;
  }
  const left = Math.max(0, Math.ceil((timer.end - Date.now()) / 1000));
  const m = Math.floor(left / 60);
  const s = String(left % 60).padStart(2, '0');
  const t = document.getElementById('tTime');
  if (t) t.textContent = `${m}:${s}`;
  const pct = 100 - Math.min(100, (left / timer.total) * 100);
  const fill = document.getElementById('tFill');
  if (fill) fill.style.width = pct + '%';

  if (left <= 0) {
    timer.on = false;
    bar.classList.add('done');
    const label = document.getElementById('tLabel');
    if (label) label.textContent = 'Rest done';
    beep();
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
    clearInterval(timer.iv);
    setTimeout(() => bar.classList.remove('on'), 4000);
  }
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 760;
    g.gain.value = 0.06;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 320);
  } catch (e) {}
}

/* ------------------------------------------------------------------ events */

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;

  if (act === 'nav') {
    screen = t.dataset.screen;
    render();
    return;
  }
  if (act === 'lift') {
    currentLift = t.dataset.lift;
    render(true);
    return;
  }
  if (act === 'set') {
    if (e.target.closest('input, select, button')) return;
    toggleSet(+t.dataset.idx);
    return;
  }
  if (act === 'cond') {
    const k = `b${state.block.n}:w${state.block.week}`;
    state.cond[k] = state.cond[k] || [false, false, false];
    const i = +t.dataset.idx;
    state.cond[k][i] = !state.cond[k][i];
    save();
    render(true);
    return;
  }
  if (act === 'finish') {
    finishWeek();
    return;
  }
  if (act === 'setup-generate') {
    generateFromSetup();
    return;
  }
  if (act === 'migrate') {
    applyMigration();
    return;
  }
  if (act === 'confirm-finish') {
    confirmFinish();
    return;
  }
  if (act === 'apply-test') {
    applyTest();
    return;
  }
  if (act === 'confirm-test') {
    confirmTest();
    return;
  }
  if (act === 'close-sheet') {
    closeSheet();
    return;
  }
  if (act === 'scrim') {
    if (e.target.classList.contains('scrim')) closeSheet();
    return;
  }
  if (act === 'export') {
    exportData();
    return;
  }
  if (act === 'import') {
    importData();
    return;
  }
  if (act === 'rest-stop') {
    timer.on = false;
    document.getElementById('timer').classList.remove('on');
    clearInterval(timer.iv);
    return;
  }
  if (act === 'reset') {
    openSheet(`
      <h3>Wipe everything?</h3>
      <p>Training maxes, logs and records on this device. Export first if you are not sure.</p>
      <div class="btn-row">
        <button class="btn ghost" data-act="close-sheet">Keep</button>
        <button class="btn accent" data-act="confirm-reset">Wipe</button>
      </div>`);
    return;
  }
  if (act === 'confirm-reset') {
    localStorage.removeItem(KEY);
    state = blank();
    closeSheet();
    screen = 'today';
    render();
    return;
  }
});

document.addEventListener('change', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;

  if (act === 'amrap') {
    setAmrap(t.dataset.lift, parseFloat(t.dataset.weight), t.value);
    return;
  }
  if (act === 'load') {
    const k = `${t.dataset.lift}:${t.dataset.cat}:${t.dataset.idx}`;
    state.loads[k] = state.loads[k] || {};
    state.loads[k][t.dataset.field] = t.value;
    save();
    return;
  }
  if (act === 'tm') {
    state.lifts[t.dataset.lift].tm = E.round(parseFloat(t.value) || 0);
    save();
    render(true);
    return;
  }
  if (act === 'cfg') {
    const k = t.dataset.key;
    state.cfg[k] = k === 'rest' ? +t.value : k === 'tmPct' ? parseFloat(t.value) : t.value;
    save();
    render(true);
    return;
  }
  if (t.id === 'importFile') {
    const file = t.files && t.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = JSON.parse(reader.result);
        if (!s || s.v !== 2) throw new Error('bad');
        state = s;
        save();
        render();
        toast('Backup restored');
      } catch (err) {
        toast('That file did not load');
      }
    };
    reader.readAsText(file);
    return;
  }
});

/* -------------------------------------------------------------------- init */

function migrateLoads() {
  const out = {};
  for (const [k, v] of Object.entries(state.loads || {})) {
    out[k.split(':').length === 2 ? `${k}:0` : k] = v;
  }
  state.loads = out;
  save();
}

function init() {
  state = load();
  if (state) {
    state.cond = state.cond || {};
    migrateLoads();
  }
  if (state) {
    render();
    return;
  }

  state = blank();
  const legacy = localStorage.getItem(LEGACY);
  if (legacy) {
    try {
      render();
      migrateLegacy(JSON.parse(legacy));
      return;
    } catch (e) {}
  }
  render();
}

init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
