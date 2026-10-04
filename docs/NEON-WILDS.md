# Neon Wilds

The new world replaces the rejected floating-platform game. It starts from the approved Studio rather than layering a third game onto the previous mission code. The old prototype remains on `codex/starlight-garden` at commit `18f0798`.

## Player journey

Gizmo arrives at an atrium with three colored routes. The map can track any district; the nearby action says exactly what it will do. There is no prerequisite order and mistakes do not erase earned progress.

- In the Lucent Conservatory, recruit three wandering jellyfish and lead them home together. They follow while the player explores. They wait if left far behind; recovery or reload reunites active followers.
- In the Prism Arcade, rotate the two prisms to guide the visible beam into its receiver. Each turn immediately changes the light path. Solved routing remains lit.
- In the Pulse Foundry, match the blue/circle and gold/triangle cells to their sockets. The machine asks for three taps during broad glowing windows. Misses preserve earlier beats and installed cells.
- All three restored districts power the Aurora Spire. Climb its real ramp and release the aurora. Exploration continues after the finale.
- Six hidden echoes reward curiosity. Two sit on optional raised gardens, reachable through ramps or a low hop. Every pair increases hop height slightly; wisps accompany Gizmo. The bonus cannot bypass the locked Spire.

## Implementation seams

The pure model owns movement, collision, jump/ground state, interactions, quests, checkpoints and save sanitation. Both rendering and tests consume the same snapshots and events. The camera module owns placement and wall obstruction, including an overhead fallback beside close walls. The scene owns original Blender geometry, live puzzle mechanisms and atmosphere. The character module owns the actual Astra mesh and a fur approximation suited to a wider world view.

`world.json` supplies the same coordinates to the Blender generator and model. CI compares its hash against the export report. The model uses explicit solid boxes and continuous ramp/deck surfaces; decorative plants and light effects remain pass-through. Camera proxies follow the same solid layout. The Studio runs in the parent page, retaining its original groomed fibers and sharing a sampled outer coat with the game iframe.

## Recovery and limits

A local versioned save retains progress, carried cells, followers and secrets. Invalid fields are rejected or clamped and unsafe positions recover to authored checkpoints. Returning to safety preserves cargo and progress. A fresh journey first stores a backup; Previous journey swaps between them. Backup write failure keeps the current journey unchanged.

Desktop Chrome and Chrome touch emulation are the local browser targets. Real mobile devices, Safari, gamepads and screen-reader-only completion have not been verified. Camera overhead changes are intentionally immediate when necessary to keep Gizmo visible. This is a compact, forgiving exploration puzzle, with no combat, inventory economy or multiplayer. It is not an assertion of exhaustive testing or commercial-game depth.

No analytics, remote save service, CDN dependencies or paid assets are used. The public production site only updates after an approved merge to main.
