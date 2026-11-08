# 5/3/1 Forever

A single-purpose training block tracker for Jim Wendler's *5/3/1 Forever* Leader/Anchor system.
Static site, no backend, no account. Everything lives in your browser.

Live: https://biglax.github.io/531/

## The block

Eleven weeks, then repeat:

- Leader 1, three weeks. 5's PRO main work, volume supplemental, 25-50 assistance reps per category.
- Leader 2, three weeks. Same, training maxes already up one step.
- Deload, one week. 7th Week Protocol.
- Anchor, three weeks. 3/5/1 with PR sets on weeks 1 and 3, 50-100 assistance reps per category.
- TM Test, one week. 5 reps at 85%, 3 reps at 90%.

Training maxes go up 5 kg on squat and deadlift, 2.5 kg on bench and press after Leader 1 and after the
deload. A passed TM test carries them into the next block.

## Rules the code enforces

- Main percentages: 65/75/85, 70/80/90, 75/85/95. No AMRAP during Leaders.
- Anchor 3/5/1: 70/80/90 x3+, 65/75/85 x5 (no PR), 75/85/95 x5/3/1+.
- Deload: 70x5, 80x3-5, 90x1, 100x1. No supplemental.
- TM test: 70x5, 80x5, 90x5, 100 x3-5. Pass threshold follows the TM percentage.
- Assistance: three categories every session, push, pull, single-leg or core. Leader 25-50 reps each,
  Anchor 50-100. With BBB, the Leader drops single-leg/core to 0-25.
- Anchor splits each category across two movements: 3x15 of the main-lift support movement, then 2x15 of
  the accessory one. 75 total reps per category. Leader stays on one movement at 3x12.
- Cut configuration: true single-leg work twice a week (step-ups on squat day, lunges on press day),
  biceps on press day, no extra machine leg volume. Step-ups and lunges stay at two sets, counted per leg.
- Conditioning 2-3 sessions a week: two easy 30 minute sessions plus one optional short hard session.
- Assistance is stable across cycles so it can actually be progressed.

## Files

- `engine.js` program math and block state machine. Pure functions, no DOM.
- `app.js` screens, logging, rest timer, persistence.
- `styles.css` phone-first dark UI.
- `selftest.html` 47 assertions against the engine. Open it after any change.
- `sw.js` + `manifest.webmanifest` offline and home screen install.

## Data

State lives in `localStorage` under `531_v2`. Export a JSON backup from Log or Setup before clearing
browser data. The first load imports training maxes from the old Gemini build.

## Notes

The previous version is preserved on the `legacy` branch and tagged `v1-gemini`.
