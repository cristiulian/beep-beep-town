# Beep Beep Town

A 3D driving game in the browser starring a Toyota RAV4 (three.js + TypeScript + Vite). Nobody can lose; crashes just bounce.

```sh
npm install
npm run dev      # play at http://localhost:5173 (reachable from a tablet on the same Wi-Fi)
npm run build    # static site in dist/, host anywhere
```

## Things to do
- **Stars**: collect them around town, in the countryside and in mid-air over jumps (see the minimap).
- **Big Jump** on the north road, plus a **Stunt Park** south-east of the centre. Over 1.1 s of air earns a star.
- **Traffic lights** at every town crossing. Stop on red and wait for green to earn a star.
- **Gas station**: fuel runs down as you drive. Stop at the pumps to fill up. An empty tank means slow puttering.
- **Farm and countryside**: hills, cows, pigs and sheep that run from the car (honk at them!), and a duck pond to splash through.
- **Garage (🎨)**: paint body, roof and wheels in real RAV4 colours (Lunar Rock, Ruby Flare, Blueprint…) or fun ones.
- **Car wash**: drive through it for a surprise colour.

Controls: arrow keys / WASD, Space to honk. Touch screens get on-screen pedals.

## Code map
- `src/car.ts` – the RAV4 model (built from code) and driving physics (hills, jumps, collisions)
- `src/terrain.ts` – hills, pond, ramps, ground height
- `src/world.ts` – roads, houses, trees, gas station, car wash, farm, stars
- `src/traffic.ts`, `src/animals.ts`, `src/sound.ts` (all sounds are synthesized)
- `tools/car-preview.html` – the car from four angles, for working on the model

In the browser console, `game.sim(seconds, throttle, steer)` runs the game at a fixed 60 fps (used for testing).
