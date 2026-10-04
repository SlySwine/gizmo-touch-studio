# Dream realm asset credits

## Original geometry

`dist/assets/dream-kit.glb` was modeled in Blender for this playground. The reproducible generator is `tools/build_dream_assets.py`; `dist/assets/dream-kit-report.json` records groups, bounds and metrics. The seven groups are JellyBell, LotusPlatform, CrystalCluster, PrismRelay, Orrery, GateFrame and DreamEngine. This work is separate from the original Astra character and its Blender source.

## Lighting environment

[Qwantani Dusk 2 (Pure Sky)](https://polyhaven.com/a/qwantani_dusk_2_puresky), by Greg Zaal (photography) and Jarod Guest (processing), is used for reflection and ambient lighting. The 1024×512 Radiance HDR was downloaded unchanged from Poly Haven, which releases downloadable assets under [CC0](https://polyhaven.com/license). Its source and checksum are recorded in [`sources.json`](dist/assets/world-textures/sources.json).

The actual HDR pixels were decoded and inspected. Its lower hemisphere is an edited continuation of the sky. It is converted to a PMREM environment for the physical materials.

## Three.js

Three.js 0.180.0 and its GLTF/HDR loaders are vendored from the official r180 source. The official EffectComposer, RenderPass, Pass, ShaderPass, MaskPass, UnrealBloomPass, OutputPass, CopyShader, LuminosityHighPassShader and OutputShader are retained under `dist/vendor/postprocessing` and `dist/vendor/shaders`. All use the existing [MIT license](dist/vendor/THREE-LICENSE.txt). A small grading adjustment is applied in `garden-renderer.js`; upstream addon files are unchanged.
