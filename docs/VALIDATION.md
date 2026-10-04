# Neon Wilds validation

This is a bounded audit of the preview, not a claim of exhaustive testing or evidence from an actual child.

## Automated model and camera checks

Run `node --test scripts/test-neon-*.mjs` (23 checks) and `node scripts/validate-site.mjs`.

Coverage includes all six quest orders through ordinary model movement, every secret, both raised garden ramps, jumps and deck edges, locked Spire protection, sliding collision, world bounds, safe checkpoints, save validation, recovery with cargo/followers, frame-rate consistency, close-wall camera recovery and 1,200 repeated orbit transitions. Independent review additionally fuzzed 1,000 malformed saves through 35,000 movement steps.

## Browser playthroughs

The authoring audit used isolated Chrome sessions and normal keyboard, pointer and touch inputs. Read-only state observations verified outcomes; the journeys did not teleport or inject completion.

| Pass | Checks | Coverage |
| --- | --- | --- |
| Desktop journey | 22 | Engine first, gold cell first, wrong socket, intentionally missed pulse, full group escort, mirror routing, ramp/finale, mid-quest and completion reloads |
| Controls and visual failures | 18 | Input cancellation, collisions, boundaries, recovery, hop, eight reviewed camera angles, touch, portrait and landscape |
| Touch journey | 19 | Different district order, all three quests/finale, every echo and raised garden, reload |
| Studio bridge and backups | 21 | Actual grooming transfer, reset, two-way sound preference, paused hidden simulation, round trip, history, restart/restore and storage quota failure |
| Final camera and focus regression | 8 | Default camera composition, pointer-button focus returning to movement, Space hopping without repeating actions, native Tab/Space button activation |
| Original Studio regression | 41 | Poke, Pull, Brush, hat/Turn behavior, cancellation, finite deformation and touch |

No runtime or missing-asset errors remained in these sessions. Images and detailed reports are retained in the authoring workspace's `qa` directory. Physical phones, older hardware, Safari, Firefox, gamepads and screen-reader-only completion remain unverified. Headless audio state was checked, not audible sound quality. The reviewer knew the layout and followed planned waypoints, so this establishes playability and recovery, not uncoached discovery or enjoyment.

## What the audit improved

The audit caught a wall camera that still clipped despite a passing distance metric, stale timing HUD fields, misleading cell guidance, keyboard focus loss after buttons, completed objectives remaining tracked, duplicate touch hints, and restart backup issues. Repairs were followed by targeted regression and visual retests. Close-wall camera now moves overhead to keep Gizmo visible. A successful backup is required before restarting, and Previous journey visibly restores it.

The game is a compact, forgiving exploration puzzle. The next useful playtest is an uncoached session with the intended players to assess pacing and clue clarity. The live Studio and production deployment remain unchanged until approval and merge.
