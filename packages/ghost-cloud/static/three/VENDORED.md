# Vendored Three.js

Three.js **r0.169.0**, vendored so the add-on has no runtime CDN
dependency (it must work offline).

- `three.module.js` — from `three@0.169.0/build/`
- `addons/` — the 6 example addons `ghost-cloud.js` imports plus their
  transitive deps, cherry-picked from `three@0.169.0/examples/jsm/`:
  - `controls/OrbitControls.js`
  - `postprocessing/{EffectComposer,Pass,ShaderPass,MaskPass,RenderPass,UnrealBloomPass,OutputPass}.js`
  - `shaders/{CopyShader,LuminosityHighPassShader,OutputShader}.js`
  - `environments/RoomEnvironment.js`

To re-vendor on a Three.js bump: `pnpm add -D three@<version>` in this
package, copy `build/three.module.js` + the addon files above
(preserving the subdir layout), then `pnpm remove three`. The import
graph is closed — verify with
`grep -rhoE "from ['\"][^'\"]+['\"]" addons/ | sort -u` (only `three`
+ the copied files should appear).
