// Smoke test: serves the production build, plays a few seconds of the game in headless Chrome
// and fails on console errors, broken driving, a missing fuel guide or a draw-call regression.
import { preview } from 'vite';
import { chromium } from 'playwright';

const MAX_DRAW_CALLS = 800; // was ~1500 before the performance pass; now ~300-550

const server = await preview({ preview: { port: 4173, strictPort: true } });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures.push(msg);
};

try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.game, null, { timeout: 30000 });

  const drive = await page.evaluate(() => window.game.sim(3, 1, 0));
  check(drive.pos[2] > 20, `car drives forward (z=${drive.pos[2]})`);

  const jump = await page.evaluate(() => {
    const g = window.game;
    g.car.position.set(0, 0, 60);
    g.car.heading = 0;
    g.car.speed = 21;
    return g.sim(3, 1, 0);
  });
  check(jump.maxAir > 0.4, `big jump gets air (${jump.maxAir}s)`);

  const guide = await page.evaluate(() => {
    const g = window.game;
    g.setFuel(0.1);
    g.car.position.set(90, 0, 0);
    g.sim(0.2);
    return { visible: g.guide.mesh.visible, length: g.guide.length };
  });
  check(guide.visible && guide.length > 100 && guide.length < 160, `fuel guide shows a sensible route (${Math.round(guide.length)} m)`);

  const calls = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = window.game.renderer;
        r.info.autoReset = false;
        r.info.reset();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(r.info.render.calls)));
      }),
  );
  check(calls > 0 && calls < MAX_DRAW_CALLS, `draw calls per frame under budget (${calls} < ${MAX_DRAW_CALLS})`);

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke checks passed');
