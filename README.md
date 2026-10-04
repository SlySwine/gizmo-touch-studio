# Gizmo · Touch Studio

[Live playground](https://slyswine.github.io/gizmo-touch-studio/) · [Deployment runs](https://github.com/SlySwine/gizmo-touch-studio/actions/workflows/pages.yml)

Three.js playground for Michael's actual Astra character. Static, self-contained, with no CDN dependency or analytics. Only the sound on/off preference is stored locally. Serve `dist` over HTTP; no build is required.

```sh
python3 -m http.server 8764 --directory dist
```

Open http://localhost:8764. Select Poke, Pull, Brush, Turn, or Slap; press/drag directly on Gizmo. Drag his hat in any tool, or select Turn, to rotate him. Hovering the visible hat shows a hand cursor. Background dragging in other tools and right-click dragging do nothing. Rotation stops on release. Slap reveals a floating 10–100% power slider without resizing the character; tap Gizmo once for a broad ripple, a power-sensitive smack and a surprised “Oh!”. Reset clears deformation, grooming, and orientation and restores 55% slap power. Keyboard: 1/2/3/4/5 selects a tool, R resets, M toggles sound; focus the canvas and use Space to poke (or slap in Slap mode), or arrows to use the selected tool. The power slider keeps its native keyboard controls. System reduced-motion preference suppresses idle breathing.

## Voice and hair light

A separate pale-lavender spotlight sits above and behind Gizmo, softened to 75% of the initial preview strength. Its matching shader contribution catches the actual bent and groomed strand directions, adding fine highlights while retaining the dim front and electric-blue/deep-violet rims. The browser hair lighting approximates fiber scattering without shadow-map sampling.

Gizmo’s nonverbal voice is synthesized locally with Web Audio: short grunts, a slap followed by a surprised “Oh!”, a rising pull groan, a release sigh, warm, gently pulsing grooming purrs, and occasional three-part giggles on repeated pokes. Brushing produces only the pleased hum, with no noise layer or giggles. No recorded voice, audio download, music or idle playback is used. Sound starts on a user interaction. The speaker button or M mutes it and remembers that choice. The grooming hum briefly lingers after a stroke, then gently fades. Cancellation, mute, blur and hidden-page events promptly fade the sounds; a watchdog and bounded voice count prevent stuck tones. Browsers without Web Audio retain the playground.

## GitHub deployment

This public repository is the source for Gizmo’s public GitHub Pages deployment. Pushes to `main` validate the JavaScript, linked assets and GLB model, then publish the `dist/` directory. Pull requests run validation without publishing. The `github-pages` environment permits the `main` branch only. The Actions workflow uses GitHub’s short-lived deployment identity; no personal token or additional deployment secret belongs in this repository.

Run `node scripts/validate-site.mjs` before pushing. To republish the current commit, run the **Validate and deploy Gizmo** workflow manually. To roll back, revert the unwanted commit on `main`; that new commit deploys automatically.

The original ChatGPT Site remains a separate publication and does not receive these GitHub pushes. Make future changes in this GitHub repository. The imported Git history preserves all seven prior Site versions.

## Model fidelity

`dist/assets/gizmo.glb` is an optimized export of the actual revised Astra Blender scene, frame 1, with the approved lower/viewer-left bowler and all four native eye expression morphs. The body has 10,001 vertices and 19,998 triangles. The complete 652 KB GLB has 16,126 vertices and 31,912 triangles. No source Blender scene or render output was modified.

The browser uses procedural tapered fur strands (145,000 on desktop; 85,000 for coarse pointers), replacing the much heavier Blender hair system. Geometry/silhouette, eyes and hat derive from the actual model, while fur, lighting, shadow and soft-body dynamics are real-time approximations. Brush strokes persist until reset or page reload. This is a responsive spring simulation, not Blender/Cycles rendering or a full cloth solver.

## Implementation

Three.js 0.180.0 is vendored under `dist/vendor` with its MIT license. The GLTF loader's relative utility import is adjusted for the flattened vendor directory. Six bounded Gaussian spring fields deform the body and eyes; the same field deforms the GPU fur. The coat combines dense pile with longer guard hairs, now approximately 1.8× longer and 1.4× thicker than the first dense-fur revision. Subtle gravity along the surface softens the long tips. The background and surrounding surfaces use deep purple. The eye and hat fur masks keep the longer coat clear of facial details and the brim. The web hat sits an additional 0.32 units toward viewer-left and 0.16 units lower, with its attachment point and fur mask shifted together. Pokes trigger a quick flinch, widened startled eyes and gaze toward the touch; repeated pokes build a skeptical response, pulls produce alarm, and brushing produces a pleased expression. Native eye morphs are blended with small additional reactive eye transforms. Reset clears the reaction history. Brush strokes update per-strand tangent directions once per frame. Fur follows local spring velocity and deliberate turning velocity. Electric-blue and deep-violet point lights sit behind him at mid-body height; the fur shader adds world-space backlight scattering and tip-weighted silhouette lighting, while matching scene lights illuminate the body and hat. The front fur illumination is reduced to 38% of the prior level (about 1.4 stops), with dimmer hemisphere, key and fill lights to keep the colored edges distinct. Poke depth is 0.78 units; pull extends to 2.65 units with broader falloff, bounded release momentum, pronounced underdamped overshoot and soft-body squash. Turning uses a separate torso pivot with persistent yaw and bounded pitch; idle motion, body physics, background gestures and release momentum do not change orientation. Hat picking uses the nearest body-or-hat intersection to respect occlusion. Pointer capture, pointerup/cancel/lost capture, blur, visibility, tool switching and resize release active gestures. Slaps launch opposing broad spring impulses; the power control changes impulse strength, impact volume and the pitch, length and intensity of his surprised “Oh!”. Lower spring damping extends the jiggle, while a signed squash spring gives a visible compression and rebound. A shared 3.1-unit node displacement budget bounds the combined body, eye and fur field through repeated impacts. Deformation is integrated in substeps.

Native browser WebMCP, when present, exposes selecting the five visible tools and resetting the same state. Unsupported browsers use the normal UI without error.
