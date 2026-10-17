# Beep Beep Town

A casual, no-fail 3D driving game for kids that runs in the browser (three.js + TypeScript + Vite).

```sh
npm install
npm run dev      # play at http://localhost:5173 (also reachable from a tablet on the same Wi-Fi)
npm run build    # static site in dist/, host anywhere
```

- **Drive:** arrow keys / WASD, Space to honk. On touch screens, big on-screen pedals appear.
- **Collect stars** around town; collect them all for a celebration and a new set.
- **Paint your car** in the 🎨 garage (body, roof, wheels). Choices are saved in the browser.
- **Car wash:** drive through it for a surprise colour.

Adding a car: build a model in `src/car.ts` with separate `body` / `roof` / `rims` materials and add it to `CARS`.
