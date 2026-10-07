# Neon Wilds

The new world replaces the rejected floating-platform game. It starts from the approved Studio rather than layering a third game onto the previous mission code. The old prototype remains on `codex/starlight-garden` at commit `18f0798`.

## Player journey

Gizmo arrives in a planted atrium enclosed by continuous sanctuary walls and outer terraces. The central avenue, district courts and raised side routes share an architectural base. Canopies, arcade vaults and the foundry have grounded supports. Quiet paving and inset details leave the strongest light for destinations and interactions.

Luma accompanies Gizmo and demonstrates nearby actions with transparent echoes, pointing and movement. The demonstration does not complete a puzzle or move the actual creature. Selecting a quest repeats its visual guidance. The nearby action says exactly what it will do. There is no prerequisite quest order and mistakes do not erase earned progress.

Tap Bounce or Space for a small hop; hold and release for a directional leap. Gizmo compresses while the world continues moving. An arc and landing footprint come from the same collision simulation as his flight. The camera aims a stationary leap; movement input chooses the direction while charging and gently steers after launch. Cancellation, recovery, menus and leaving the page discard the charge. The prediction describes an unsteered flight, so corrections after release can change the landing.

- In the Lucent Conservatory, recruit three wandering jellyfish and lead them home together. They follow while the player explores. They wait if left far behind; recovery or reload reunites active followers.
- In the Prism Arcade, rotate the two prisms to guide the visible beam into its receiver. Each turn immediately changes the light path. Solved routing remains lit.
- In the Pulse Foundry, match the blue/circle and gold/triangle cells to their sockets. The machine asks for three taps during broad glowing windows. Misses preserve earlier beats and installed cells.
- All three restored districts power the Aurora Spire. Climb its real ramp and release the aurora. Exploration continues after the finale.
- Six hidden echoes reward curiosity. Two sit on optional raised gardens, reachable through ramps or a low hop. Every pair increases hop height slightly; wisps accompany Gizmo. The bonus cannot bypass the locked Spire.
- Restoring the Conservatory invites a jellyfish ride to the west overlook. Prism light forms a solid crossing over an inset canal. The awakened Foundry powers a lift to the east terrace. These routes reconnect to the sanctuary and each opens a moonpetal in the Atrium. Visiting all three makes the moon garden ready to bloom through a final nearby interaction.
- Four optional aerial chimes reward controlled bouncing. The arrival chime is within view of the starting route; later chimes sit along the newly restored paths. Finding all four earns a Moontrail.

## Implementation seams

The pure model owns movement, collision, charge and predicted flight, transport paths, interactions, quests, checkpoints and save sanitation. Both rendering and tests consume the same snapshots and events. The camera module owns placement and wall obstruction, including an overhead fallback beside close walls. The scene owns original Blender geometry, live puzzle mechanisms and atmosphere. Focused presentation modules own Luma, charge previews and traversal rewards. The character module owns the actual Astra mesh and a fur approximation suited to a wider world view. The audio module creates quiet local movement and discovery sounds.

`world.json` supplies the same coordinates to the Blender generator and model. CI compares its hash against the export report. The model uses explicit solid boxes and continuous ramp/deck surfaces; decorative plants and light effects remain pass-through. Camera proxies follow the same solid layout. The Studio runs in the parent page, retaining its original groomed fibers and sharing a sampled outer coat with the game iframe.

## Recovery and limits

A local versioned save retains progress, carried cells, followers, secrets, visited routes, chimes and the moon garden. Earlier version-one saves remain compatible. Reloading during a ride returns to its departure dock; a held charge is never resumed unexpectedly. Invalid fields are rejected or clamped and unsafe positions recover to authored checkpoints. Returning to safety preserves cargo and progress. Restart in the header, Restart quests in the map, and Play Again at the finale share one confirmation. Cancel returns to the originating screen. Confirm starts the quests again at the Atrium while preserving hairstyle and preferences. Previous journey restores the retained adventure; repeated empty replays keep the useful backup. A small recovery journal protects both game-save slots if writes fail or are interrupted. Startup and autosave repair a pending transaction before continuing.

Desktop Chrome and Chrome touch emulation are the local browser targets. Real mobile devices, Safari, gamepads and screen-reader-only completion have not been verified. Camera overhead changes are intentionally immediate when necessary to keep Gizmo visible. This is a compact, forgiving exploration puzzle, with no combat, inventory economy or multiplayer. It is not an assertion of exhaustive testing or commercial-game depth.

The outer Studio page uses free aggregate Cloudflare Web Analytics with SPA measurement disabled; the game iframe has no analytics or custom event tracking. Player saves stay local. Game code and assets have no CDN dependency, remote save service or paid assets. The public production site only updates after an approved merge to main.

## Playtest note

Michael found the game easy to finish. Difficulty and pacing need a separate design discussion; the replay update does not expand or rebalance the game.
