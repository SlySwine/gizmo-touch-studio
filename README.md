# Gizmo · Touch Studio & Dream Realms

[Live playground](https://slyswine.github.io/gizmo-touch-studio/) · [Deployment runs](https://github.com/SlySwine/gizmo-touch-studio/actions/workflows/pages.yml)

Three.js playground for Michael's actual Astra character. Static, self-contained, with no CDN dependency or analytics. Only the sound on/off preference is stored locally. Serve `dist` over HTTP; no build is required.

```sh
python3 -m http.server 8764 --directory dist
```

Open http://localhost:8764. Select Poke, Slap, Pull, Brush, or Turn; press/drag directly on Gizmo. Drag his hat in any tool, or select Turn, to rotate him. Hovering the visible hat shows a hand cursor. Background dragging in other tools and right-click dragging do nothing. Rotation stops on release. Slap reveals a floating 10–100% power slider without resizing the character; tap Gizmo once for a broad ripple, a power-sensitive smack and a surprised “Oh!”. Reset clears deformation, grooming, and orientation and restores 55% slap power. Keyboard: 1/2/3/4/5 selects a tool, R resets, M toggles sound; focus the canvas and use Space to poke (or slap in Slap mode), or arrows to use the selected tool. The power slider keeps its native keyboard controls. System reduced-motion preference suppresses idle breathing.

## Five dream realms

Play enters the adventure; Studio returns to close-up grooming. Both views share one Gizmo mesh and live grooming buffers. Hair, expressions and tool settings carry across. Each realm has its own remembered mission and a different challenge:

| Realm | Mission | Challenge |
| --- | --- | --- |
| Starlight Garden | Wake the dream engine | Charge resonators by passing through them with momentum |
| Luminous Tides | Free the jellyfish guardian | Break its locks with a forceful impact or strong slap-assisted collision |
| Prism Vault | Restore the light path | Activate marked mirror relays in order, including a return journey |
| Stormbloom | Stabilize the storm | Energize stabilizers within the time window while navigating hazards |
| Astral Clockwork | Deliver the dream core | Carry fragile cargo through the mechanisms and recover it after a hit |

Moving platforms, currents, pulsing hazards and physical gates participate in the simulation. Progress opens the exit; collecting decorative stars is not a completion condition. Launch previews use the movement simulation. Recovery returns Gizmo to the last safe landing; the escort core must be picked up again when dropped. Timer and mechanism time pause with the realm, including held aiming.

The compact interface keeps the world picker, mission progress, timer when relevant, shared tools and Gizmo’s comments. Tool order is Poke, Slap, Pull, Brush, Turn in both views; shortcuts1–5 follow that order. Pull back and release to launch opposite the pull. Slap power changes distance and impact; pokes give smaller hops. Brush and Turn hold Gizmo until release. Arrow keys aim in Pull mode, Space launches, Escape cancels, and R returns to the last safe landing. Studio Reset clears the groom as before.

Each realm remembers its progress while visiting another realm or the studio. Restart affects only the current realm. All realms are available to explore immediately; completion is tracked separately. Routes are `#studio` and `#garden/<realm-slug>`; `#garden` opens the first realm. Browser Back follows view and realm changes. Progress and hairstyles last for the current page session.

`garden-model.js` contains simulation and progression without browser dependencies. `garden-world.js` owns scenery, mechanisms and effects. `garden.js` joins the model, camera and interface. `garden-assets.js` loads the shared Blender dream kit and HDR environment once; `garden-renderer.js` applies restrained HDR bloom only in the game. Run `node scripts/test-garden.mjs` for mission, collision, recovery and trajectory checks.

The magical asset kit is reproducible with `tools/build_dream_assets.py` in a fresh Blender session. It contains a medusa bell with radial anatomy, layered lotus petals, beveled crystals, mirror mechanisms, celestial rings, gates and a suspended dream engine. It never opens the original Astra scene. Asset provenance is in [ASSET-CREDITS.md](ASSET-CREDITS.md). Surfaces use real-time physical materials and atmospheric lighting; these remain browser rendering approximations, not offline path tracing.

## Voice and hair light

A separate pale-lavender spotlight sits above and behind Gizmo, softened to 75% of the initial preview strength. Its matching shader contribution catches the actual bent and groomed strand directions, adding fine highlights while retaining the dim front and electric-blue/deep-violet rims. The browser hair lighting approximates fiber scattering without shadow-map sampling. A contact height field baked from the actual hat triangles compresses and sweeps the fur under the brim, with a soft pressure zone around its edge; this is a real-time contact approximation, not a full strand collision solver.

Gizmo’s nonverbal voice is synthesized locally with Web Audio: short grunts, a slap followed by a surprised “Oh!”, a rising pull groan, a release sigh, warm, gently pulsing grooming purrs, and occasional three-part giggles on repeated pokes. Brushing produces only the pleased hum, with no noise layer or giggles. No recorded voice, audio download, music or idle playback is used. Sound starts on a user interaction. The speaker button or M mutes it and remembers that choice. The grooming hum briefly lingers after a stroke, then gently fades. Cancellation, mute, blur and hidden-page events promptly fade the sounds; a watchdog and bounded voice count prevent stuck tones. Browsers without Web Audio retain the playground.

## GitHub deployment

This public repository is the source for Gizmo’s public GitHub Pages deployment. Pushes to `main` validate the JavaScript, linked assets and GLB model, then publish the `dist/` directory. Pull requests run validation without publishing. The `github-pages` environment permits the `main` branch only. The Actions workflow uses GitHub’s short-lived deployment identity; no personal token or additional deployment secret belongs in this repository.

Run `node scripts/validate-site.mjs` before pushing. To republish the current commit, run the **Validate and deploy Gizmo** workflow manually. To roll back, revert the unwanted commit on `main`; that new commit deploys automatically.

The original ChatGPT Site remains a separate publication and does not receive these GitHub pushes. Make future changes in this GitHub repository. The imported Git history preserves all seven prior Site versions.

## Model fidelity

`dist/assets/gizmo.glb` is an optimized export of the actual revised Astra Blender scene, frame 1, with the approved lower/viewer-left bowler and all four native eye expression morphs. The body has 10,001 vertices and 19,998 triangles. The complete 652 KB GLB has 16,126 vertices and 31,912 triangles. No source Blender scene or render output was modified.

The browser uses two layers of procedural tapered fur strands (145,000 long fibers plus 435,000 short undercoat fibers on desktop; 85,000 long plus 255,000 short fibers for coarse pointers), replacing the much heavier Blender hair system. Geometry/silhouette, eyes and hat derive from the actual model, while fur, lighting, shadow and soft-body dynamics are real-time approximations. Brush reveals a floating 10–100% size slider, with 50% preserving the original radius. The cursor follows the selected surface footprint; individual swept segments retain fine stroke corners. Brush size survives tool changes and resets to 50% on Reset. Brush strokes persist until reset or page reload. This is a responsive spring simulation, not Blender/Cycles rendering or a full cloth solver.

## Implementation

Three.js 0.180.0 is vendored under `dist/vendor` with its MIT license. The GLTF loader's relative utility import is adjusted for the flattened vendor directory. Six bounded Gaussian spring fields deform the body and eyes; the same field deforms the GPU fur. The coat combines long guard hairs with independently sampled short pile with varied heights (.027–.080 units). Indexed ribbons use six vertices for long fibers and four for short ones, reducing the cost of the dense second layer. Generated body UVs give any exposed base a fine fleece grain. Subtle gravity along the surface softens the long tips. The background and surrounding surfaces use deep purple. Both translucent ground layers use background depth so they never tint the character, even when a pull extends below the floor. The undercoat comes closer around both the pupils and brows. A per-strand clearance check keeps crossing hairs behind the black facial surfaces. Only pupil meshes receive the Blink morph; brows retain their other expressions. Hat compression follows the actual tilted brim geometry and its spring attachment, without shaving off the under-hat coat. The web hat sits an additional 0.32 units toward viewer-left and 0.16 units lower, with its attachment point and fur mask shifted together. Pokes trigger a quick flinch, widened startled eyes and gaze toward the touch; repeated pokes build a skeptical response, pulls produce alarm, and brushing produces a pleased expression. Native eye morphs are blended with small additional reactive eye transforms. Reset clears the reaction history. Brush strokes update per-strand tangent directions once per frame. Fur follows local spring velocity and deliberate turning velocity. Electric-blue and deep-violet point lights sit behind him at mid-body height; the fur shader adds world-space backlight scattering and tip-weighted silhouette lighting, while matching scene lights illuminate the body and hat. The front fur illumination is reduced to 38% of the prior level (about 1.4 stops), with dimmer hemisphere, key and fill lights to keep the colored edges distinct. Poke depth is 0.78 units; pull extends to 2.65 units with broader falloff, bounded release momentum, pronounced underdamped overshoot and soft-body squash. Turning uses a separate torso pivot with persistent yaw and bounded pitch; idle motion, body physics, background gestures and release momentum do not change orientation. Hat picking uses the nearest body-or-hat intersection to respect occlusion. Pointer capture, pointerup/cancel/lost capture, blur, visibility, tool switching and resize release active gestures. Slaps launch opposing broad spring impulses; the power control changes impulse strength, impact volume and the pitch, length and intensity of his surprised “Oh!”. Lower spring damping extends the jiggle, while a signed squash spring gives a visible compression and rebound. A shared 3.1-unit node displacement budget bounds the combined body, eye and fur field through repeated impacts. Deformation is integrated in substeps.

Native browser WebMCP, when present, exposes selecting the five visible tools and resetting the same state. Unsupported browsers use the normal UI without error.
