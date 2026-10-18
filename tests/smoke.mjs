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

  const traffic = await page.evaluate(() => {
    const g = window.game;
    g.car.position.set(115, 0, -110); // park the player out of town
    g.sim(120);
    return { cars: g.city.cars.length, ...g.city.stats };
  });
  check(traffic.cars === 10, `10 town cars (${traffic.cars})`);
  check(traffic.metres > 3000 && traffic.tripsDone > 10, `traffic keeps moving (${Math.round(traffic.metres)} m, ${traffic.tripsDone} trips)`);
  check(traffic.redLightsRun === 0, `town cars stop for red lights (${traffic.redLightsRun} run)`);
  check(traffic.overlaps === 0, `town cars never drive into each other (${traffic.overlaps})`);
  check(traffic.longestWait < 45, `no traffic jams (longest wait ${traffic.longestWait.toFixed(1)}s)`);

  const garage = await page.evaluate(() => {
    const g = window.game;
    // Drive off the main road into the garage bay and stop.
    g.car.position.set(2.5, 0, 44);
    g.car.heading = Math.PI / 2;
    g.car.speed = 0;
    g.sim(1.6, 1);
    g.sim(2.5, -1);
    return { atShop: g.atShop };
  });
  check(garage.atShop, 'stopping in the garage bay opens the car picker');
  await page.click('.car-card[data-car=bus]');
  await page.click('#drive-btn');
  const swapped = await page.evaluate(() => {
    const g = window.game;
    const r = g.sim(3, 1);
    return { id: g.car.def.id, speed: r.speed, x: r.pos[0] };
  });
  check(swapped.id === 'bus' && swapped.speed > 5 && swapped.x < 10, `swapped to the school bus and drove out (${swapped.id}, x=${swapped.x})`);

  const cutOff = await page.evaluate(() => {
    const g = window.game;
    const pick = () => g.city.cars.find((c) => c.s < c.hop.straight - 25 && c.speed > 7 && c.angryCooldown <= 0);
    let c = pick();
    for (let k = 0; !c && k < 40; k++) {
      g.sim(0.5);
      c = pick();
    }
    if (!c) return { found: false };
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    // Swerve across its lane 7 m in front of it.
    g.car.position.set(c.obj.position.x + fx * 7 - fz * 5, 0, c.obj.position.z + fz * 7 + fx * 5);
    g.car.heading = c.heading + Math.PI / 2;
    g.car.speed = 8;
    const before = g.city.stats.cutOffs;
    let flashed = false;
    for (let i = 0; i < 40; i++) {
      g.sim(1 / 30, 1);
      flashed ||= c.flash > 0;
    }
    return { found: true, cut: g.city.stats.cutOffs - before, flashed };
  });
  check(cutOff.found && cutOff.cut === 1 && cutOff.flashed, `a car you cut off honks and flashes (${JSON.stringify(cutOff)})`);

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
