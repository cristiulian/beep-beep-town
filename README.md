# Beep Beep Town

A 3D driving game in the browser starring a Toyota RAV4 (three.js + TypeScript + Vite). Nobody can lose; crashes just bounce.

```sh
npm install
npm run dev      # play at http://localhost:5173 (reachable from a tablet on the same Wi-Fi)
npm run build    # static site in dist/, host anywhere
npm test         # smoke test of the build in headless Chrome (run after build)
```

## Hosting (free) and CI/CD
`.github/workflows/deploy.yml` runs on every push and pull request: typecheck, build, smoke test.
Pushes to `main` then deploy to GitHub Pages. One-time setup in the GitHub repo:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Things to do
- **Stars**: collect them around town, in the countryside and in mid-air over jumps (see the minimap).
- **Big Jump** on the north road, plus a **Stunt Park** south-east of the centre. Over 1.1 s of air earns a star.
- **Traffic lights** at every town crossing. Stop on red and wait for green to earn a star.
- **Gas station**: fuel runs down as you drive. Stop at the pumps to fill up. An empty tank means slow puttering.
- **Route guide**: when fuel is low, Forza-style blue chevrons on the road show the shortest way to the pumps (with distance at the top). Tap the fuel gauge to show or hide it any time.
- **Farm and countryside**: hills, cows, pigs and sheep that run from the car (honk at them!), and a duck pond to splash through.
- **Garage (🎨)**: paint body, roof and wheels in real RAV4 colours (Lunar Rock, Ruby Flare, Blueprint…) or fun ones.
- **Car wash**: drive through it for a surprise colour.

Controls: on-screen buttons on every device (hold ▲ to go, slide a thumb between ◀ ▶ to steer, 📯 to honk), or arrow keys / WASD and Space. The ⛶ button goes full screen where the browser allows it.

## Code map
- `src/car.ts` – the RAV4 model (built from code) and driving physics (hills, jumps, collisions)
- `src/terrain.ts` – hills, pond, ramps, ground height
- `src/world.ts` – roads, houses, trees, gas station, car wash, farm, stars
- `src/guide.ts` – road-network shortest path and the chevron guide line
- `src/traffic.ts`, `src/animals.ts`, `src/sound.ts` (all sounds are synthesized)
- `tools/car-preview.html` – the car from four angles, for working on the model

Performance: static parts are merged into a few meshes (`src/merge.ts`), the game is capped at 60 fps, and the render resolution adapts to how fast the device is.

In the browser console, `game.sim(seconds, throttle, steer)` runs the game at a fixed 60 fps (used for testing).
