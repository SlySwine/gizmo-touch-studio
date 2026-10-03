# Gizmo · Touch Studio

Three.js playground for Michael's actual Astra character. Static, self-contained, with no CDN dependency, analytics, or storage. Serve `dist` over HTTP; no build is required.

```sh
python3 -m http.server 8764 --directory dist
```

Open http://localhost:8764. Select Poke, Pull, Brush, or Turn; press/drag directly on Gizmo. Dragging empty background also turns him. Reset clears deformation, grooming, orientation, and spin. Keyboard: 1/2/3/4 selects a tool, R resets; focus the canvas and use Space to poke or arrows to pull/brush/turn. System reduced-motion preference suppresses idle sway and release spin.

## Model fidelity

`dist/assets/gizmo.glb` is an optimized export of the actual revised Astra Blender scene, frame 1, with the approved lower/viewer-left bowler and all four native eye expression morphs. The body has 10,001 vertices and 19,998 triangles. The complete 652 KB GLB has 16,126 vertices and 31,912 triangles. No source Blender scene or render output was modified.

The browser uses procedural tapered fur strands (145,000 on desktop; 85,000 for coarse pointers), replacing the much heavier Blender hair system. Geometry/silhouette, eyes and hat derive from the actual model, while fur, lighting, shadow and soft-body dynamics are real-time approximations. Brush strokes persist until reset or page reload. This is a responsive spring simulation, not Blender/Cycles rendering or a full cloth solver.

## Implementation

Three.js 0.180.0 is vendored under `dist/vendor` with its MIT license. The GLTF loader's relative utility import is adjusted for the flattened vendor directory. Six bounded Gaussian spring fields deform the body and eyes; the same field deforms the GPU fur. The coat combines dense pile with longer guard hairs, now approximately 1.8× longer and 1.4× thicker than the first dense-fur revision. Subtle gravity along the surface softens the long tips. The background and surrounding surfaces use deep purple. The eye and hat fur masks keep the longer coat clear of facial details and the brim. Pokes trigger a quick flinch, widened startled eyes and gaze toward the touch; repeated pokes build a skeptical response, pulls produce alarm, and brushing produces a pleased expression. Native eye morphs are blended with small additional reactive eye transforms. Reset clears the reaction history. Brush strokes update per-strand tangent directions once per frame. Fur follows local spring velocity and turning momentum. Poke depth is 0.78 units; pull extends to 2.65 units with broader falloff, bounded release momentum, pronounced underdamped overshoot and whole-body wobble. Turning uses a separate torso pivot with persistent yaw, bounded pitch and decaying inertia. Pointer capture, pointerup/cancel/lost capture, blur, visibility, tool switching and resize release active gestures. Deformation is bounded and integrated in substeps.

Native browser WebMCP, when present, exposes selecting the four visible tools and resetting the same state. Unsupported browsers use the normal UI without error.
