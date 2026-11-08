// 5/3/1 Forever engine. Pure functions, no DOM.
// Block structure: Leader 1 > Leader 2 > Deload > Anchor > TM Test > next block.

export const LIFTS = ['squat', 'bench', 'deadlift', 'press'];
export const LABEL = {
  squat: 'Squat',
  bench: 'Bench Press',
  deadlift: 'Deadlift',
  press: 'Overhead Press',
};
export const INCREMENT = { squat: 5, deadlift: 5, bench: 2.5, press: 2.5 };
export const ROUND = 2.5;

export const SEQUENCE = [
  { phase: 'leader1', kind: 'leader', weeks: 3, label: 'Leader 1', short: 'L1' },
  { phase: 'leader2', kind: 'leader', weeks: 3, label: 'Leader 2', short: 'L2' },
  { phase: 'deload', kind: 'deload', weeks: 1, label: 'Deload', short: 'DL' },
  { phase: 'anchor', kind: 'anchor', weeks: 3, label: 'Anchor', short: 'AN' },
  { phase: 'tmtest', kind: 'test', weeks: 1, label: 'TM Test', short: 'TM' },
];

export function phaseInfo(phase) {
  return SEQUENCE.find((s) => s.phase === phase) || SEQUENCE[0];
}

export function round(weight, inc = ROUND) {
  return Math.round((weight + Number.EPSILON) / inc) * inc;
}

export function fmt(n) {
  if (!isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

// Epley
export function e1rm(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

export function tmTestTarget(tmPct) {
  return tmPct >= 0.9 ? 3 : 5;
}

// Main work. Returns [{pct, weight, reps, amrap}]
export function mainSets(phase, week, tm, cfg) {
  const info = phaseInfo(phase);
  let pcts = [];
  let reps = [];
  let amrap = -1;

  if (info.kind === 'leader') {
    if (week === 1) pcts = [0.65, 0.75, 0.85];
    else if (week === 2) pcts = [0.7, 0.8, 0.9];
    else pcts = [0.75, 0.85, 0.95];
    reps = ['5', '5', '5'];
  } else if (info.kind === 'anchor') {
    if ((cfg.anchorStyle || '351') === '531') {
      if (week === 1) {
        pcts = [0.65, 0.75, 0.85];
        reps = ['5', '5', '5+'];
        amrap = 2;
      } else if (week === 2) {
        pcts = [0.7, 0.8, 0.9];
        reps = ['3', '3', '3'];
      } else {
        pcts = [0.75, 0.85, 0.95];
        reps = ['5', '3', '1+'];
        amrap = 2;
      }
    } else {
      // 3/5/1: PR sets weeks 1 and 3, week 2 is plain 5s
      if (week === 1) {
        pcts = [0.7, 0.8, 0.9];
        reps = ['3', '3', '3+'];
        amrap = 2;
      } else if (week === 2) {
        pcts = [0.65, 0.75, 0.85];
        reps = ['5', '5', '5'];
      } else {
        pcts = [0.75, 0.85, 0.95];
        reps = ['5', '3', '1+'];
        amrap = 2;
      }
    }
  } else if (info.kind === 'deload') {
    pcts = [0.7, 0.8, 0.9, 1.0];
    reps = ['5', '3-5', '1', '1'];
  } else {
    pcts = [0.7, 0.8, 0.9, 1.0];
    reps = ['5', '5', '5', '3-5'];
    amrap = 3;
  }

  return pcts.map((pct, i) => ({
    pct,
    weight: round(tm * pct),
    reps: reps[i],
    amrap: i === amrap,
  }));
}

// Supplemental. Returns {name, sets, reps, weight, pct, note} or null.
export function supplemental(phase, week, tm, cfg) {
  const info = phaseInfo(phase);
  if (info.kind !== 'leader' && info.kind !== 'anchor') return null;
  const scheme = cfg.supplemental || 'fsl';
  if (scheme === 'none') return null;

  const main = mainSets(phase, week, tm, cfg);
  const first = main[0].pct;
  const second = main[1].pct;

  const make = (name, sets, reps, pct, note) => ({
    name,
    sets,
    reps,
    pct,
    weight: round(tm * pct),
    note: note || '',
  });

  switch (scheme) {
    case 'fsl':
      return make('FSL', 5, 5, first, 'First set last. No grinding.');
    case 'ssl':
      return make('SSL', 5, 5, second, 'Second set last.');
    case 'bbs':
      return make('Boring But Strong', 10, 5, first, 'Ten crisp triples of five.');
    case 'bbb50':
      return make('BBB', 5, 10, 0.5, 'Boring But Big. Slow and strict.');
    case 'bbb60':
      return make('BBB', 5, 10, 0.6, 'Boring But Big at 60%.');
    case 'bbb_fsl':
      return make('BBB @ FSL', 5, 10, first, 'The hard one.');
    default:
      return make('FSL', 5, 5, first, '');
  }
}

// Leader picks: one movement per category, 25-50 total reps.
// perSide movements are counted per leg, so sets x reps x 2.
export const ASSIST = {
  squat: {
    push: { name: 'Lateral Raise', sets: 3, reps: 12 },
    pull: { name: 'Lat Pulldown', sets: 3, reps: 12 },
    singleleg: { name: 'DB Step-Up', sets: 2, reps: 10, perSide: true },
  },
  bench: {
    push: { name: 'Incline DB Press', sets: 3, reps: 12 },
    pull: { name: 'Seated Cable Row', sets: 3, reps: 12 },
    singleleg: { name: 'Hanging Leg Raise', sets: 3, reps: 12 },
  },
  deadlift: {
    push: { name: 'Dips', sets: 3, reps: 12 },
    pull: { name: 'Chin-Up', sets: 3, reps: 12 },
    singleleg: { name: 'Pallof Press', sets: 2, reps: 10, perSide: true },
  },
  press: {
    push: { name: 'Lateral Raise', sets: 3, reps: 12 },
    pull: { name: 'Biceps Curl', sets: 3, reps: 12 },
    singleleg: { name: 'Walking Lunge', sets: 2, reps: 10, perSide: true },
  },
};

// Anchor: the book allows one or two exercises per category for 50-100 total reps.
// Two movements, and unilateral work is counted per leg, so the totals stay honest.
const ANCHOR_PAIRS = {
  squat: {
    push: [{ name: 'Lateral Raise', sets: 3, reps: 15 }, { name: 'Triceps Pushdown', sets: 2, reps: 15 }],
    pull: [{ name: 'Lat Pulldown', sets: 3, reps: 15 }, { name: 'Face Pull', sets: 2, reps: 15 }],
    singleleg: [{ name: 'DB Step-Up', sets: 2, reps: 12, perSide: true }, { name: 'Weighted Cable Crunch', sets: 3, reps: 15 }],
  },
  bench: {
    push: [{ name: 'Incline DB Press', sets: 3, reps: 15 }, { name: 'Lateral Raise', sets: 2, reps: 15 }],
    pull: [{ name: 'Seated Cable Row', sets: 3, reps: 15 }, { name: 'Face Pull', sets: 2, reps: 15 }],
    singleleg: [{ name: 'Leg Curl', sets: 3, reps: 15 }, { name: 'Hanging Leg Raise', sets: 2, reps: 15 }],
  },
  deadlift: {
    push: [{ name: 'Dips', sets: 3, reps: 15 }, { name: 'Lateral Raise', sets: 2, reps: 15 }],
    pull: [{ name: 'Chin-Up', sets: 3, reps: 15 }, { name: 'Chest-Supported Row', sets: 2, reps: 15 }],
    singleleg: [{ name: 'Hanging Leg Raise', sets: 3, reps: 15 }, { name: 'Pallof Press', sets: 2, reps: 12, perSide: true }],
  },
  press: {
    push: [{ name: 'Lateral Raise', sets: 3, reps: 15 }, { name: 'Triceps Pushdown', sets: 2, reps: 15 }],
    pull: [{ name: 'Biceps Curl', sets: 3, reps: 15 }, { name: 'Chin-Up', sets: 2, reps: 15 }],
    singleleg: [{ name: 'Walking Lunge', sets: 2, reps: 12, perSide: true }, { name: 'Leg Curl', sets: 3, reps: 15 }],
  },
};

// Conditioning: Forever runs it alongside the lifting, 2-3 sessions a week.
// Frank's week is squat, bench, press, deads, with Wednesday and Saturday free
// in both possible layouts (squat Sunday or squat Monday). So both easy
// sessions sit on rest days and the hard one goes to Wednesday: furthest from a
// heavy day, and ahead of press, the lightest lift.
export const CONDITIONING = [
  { label: 'Wed · Easy 30 min', detail: 'Rest day. Bike or incline walk, nasal breathing.' },
  { label: 'Sat · Easy 30 min', detail: 'Rest day. Bike or incline walk, same easy pace.' },
  { label: 'Wed · Hard 10 min', detail: 'Rower or sled intervals. Only if recovery is good, never the day before squat.' },
];

// Daily step floor on a cut. The gap between 6.5k and 10k steps is worth about
// 0.2 kg a week on its own, which is more than both easy sessions combined.
export const STEP_FLOOR = 8000;
export const STEP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function assistanceFor(phase, lift, cfg) {
  const info = phaseInfo(phase);
  const anchor = info.kind === 'anchor';
  const bbb = ['bbb50', 'bbb60', 'bbb_fsl'].includes(cfg.supplemental);
  const lowCore = !anchor && bbb;

  const cats = [
    { cat: 'push', label: 'PUSH' },
    { cat: 'pull', label: 'PULL' },
    { cat: 'singleleg', label: 'SINGLE LEG / CORE' },
  ];

  return cats.map((c) => {
    let movements;
    if (anchor) {
      movements = ANCHOR_PAIRS[lift][c.cat].map((m) => ({ ...m }));
    } else if (lowCore && c.cat === 'singleleg') {
      movements = [{ ...ASSIST[lift].singleleg, sets: 1, reps: 10 }];
    } else {
      movements = [{ ...ASSIST[lift][c.cat] }];
    }

    const total = movements.reduce((n, m) => n + m.sets * m.reps * (m.perSide ? 2 : 1), 0);
    return {
      cat: c.cat,
      label: c.label,
      movements,
      total,
      range: anchor ? '50-100' : lowCore && c.cat === 'singleleg' ? '0-25' : '25-50',
    };
  });
}

// Guidance line per phase.
export function assistanceNote(phase, cfg) {
  const info = phaseInfo(phase);
  if (info.kind === 'anchor') return '50-100 total reps per category. Two movements, easy reps, RPE 7.';
  if (['bbb50', 'bbb60', 'bbb_fsl'].includes(cfg.supplemental)) {
    return '25-50 total reps per category. Single leg/core is optional at 0-25 with BBB.';
  }
  return '25-50 total reps per category. Controlled negatives, RPE 7-8.';
}

export function warmup(tm) {
  const bar = 20;
  return [
    { pct: 0.4, weight: Math.max(bar, round(tm * 0.4)), reps: '5' },
    { pct: 0.5, weight: Math.max(bar, round(tm * 0.5)), reps: '5' },
    { pct: 0.6, weight: Math.max(bar, round(tm * 0.6)), reps: '3' },
  ];
}

export function recalibrate(tm, reps, tmPct) {
  if (!reps || reps < 1) return null;
  const one = round(e1rm(tm, reps));
  return { oneRm: one, tm: round(one * tmPct) };
}

export function nextPhase(phase) {
  const i = SEQUENCE.findIndex((s) => s.phase === phase);
  return SEQUENCE[(i + 1) % SEQUENCE.length].phase;
}

// What happens when a week is finished. Returns the new block state plus a note.
export function advance(block, cfg, lifts) {
  const info = phaseInfo(block.phase);
  const out = { phase: block.phase, week: block.week, n: block.n, gained: false, note: '' };

  if (block.week < info.weeks) {
    out.week = block.week + 1;
    return out;
  }

  // End of a 3 week cycle (or a single week block)
  if (info.kind === 'leader' && block.phase === 'leader1') {
    out.phase = 'leader2';
    out.week = 1;
    out.gained = true;
    out.note = 'Leader 1 done. Training maxes up, next cycle is heavier.';
  } else if (info.kind === 'leader' && block.phase === 'leader2') {
    out.phase = 'deload';
    out.week = 1;
    out.note = 'Leaders done. Deload week, then the Anchor.';
  } else if (info.kind === 'deload') {
    out.phase = 'anchor';
    out.week = 1;
    out.gained = true;
    out.note = 'Deload done. Training maxes up for the Anchor.';
  } else if (info.kind === 'anchor') {
    out.phase = 'tmtest';
    out.week = 1;
    out.note = 'Anchor done. Test your training max before the next block.';
  } else {
    out.phase = 'leader1';
    out.week = 1;
    out.n = block.n + 1;
    out.note = 'New block. Back to 5s PRO.';
  }
  return out;
}

export function sessionKey(block, phase, week, lift) {
  return `b${block}:${phase}:w${week}:${lift}`;
}
