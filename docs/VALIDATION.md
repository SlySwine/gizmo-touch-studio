# Neon Wilds validation

This records the bounded audit of the sanctuary polish preview. It does not establish exhaustive testing or uncoached discovery by a child.

## Repository checks

`node --test scripts/test-neon-*.mjs` passes **54 tests**: 34 model, three camera, two audio lifecycle and 15 journey-storage tests. `node scripts/validate-site.mjs` checks JavaScript syntax, 42 local references, both self-contained GLBs, Studio toolbar order and the shared Blender/model layout hash. `git diff --check` passes.

Model coverage includes all six quest orders, every echo, ordinary movement, collision and bounds, ramps and deck edges, safe checkpoints, recovery with cargo/followers, save sanitation and older version-one saves. Charged flight predictions match actual unsteered releases near walls, bounds, gates and raised surfaces at 30, 60, 120 and 144 Hz. Holding a charge keeps the world clock and companions moving. Repeated input stress exercises 12,000 mixed-movement frames and 6,000 charged-flight/cancel frames. Visible Spire seals prevent charge-assisted progression skips.

Both transport routes run in both directions; early/late step-off, reload during a ride and safe recovery preserve progress. The lift rises clear of its terrace wall before moving across. Tests cover the conditional prism crossing, all three route petals, the garden interaction and optional airborne chimes. Audio tests verify suspended contexts disconnect current and scheduled voices, avoiding stale sounds on resume. These do not verify audible quality.

## Replay follow-up

The visible header Restart and finale Play Again controls share an accessible confirmation. **29 isolated browser checks pass** for confirm/cancel, keyboard and Escape focus return, repeated replay, reload, map restore, failed backup/active-save writes, actual Studio grooming and mute retention, and touch layouts at 393×852, 320×640 and 844×390. The touch target is at least 44 pixels high. No runtime or missing-asset failures remained. The finale test uses an isolated fixture derived from an earned completed journey, placed at its final interaction; it is not claimed as another full playthrough. Michael’s browser/profile and save were never used by this QA.

Fifteen storage tests cover every partial quest state, repeated blank resets, older/malformed saves, both backup and active-save failures, blocked rollback, interrupted transaction recovery and untouched preferences. A useful previous journey survives repeated replay. A pending journal is recovered before startup reads and ordinary autosaves. Test-harness startup/dialog waits were corrected after early attempts; the final browser pass waits for the actual ready/close events.

[Play Again at the finale](previews/neon-play-again.png) · [Restart on touch](previews/neon-restart-touch.png)

## Browser play and visual review

Isolated installed Chrome sessions used ordinary keyboard, pointer and touch-emulated inputs. Read-only state observations verified outcomes. No playthrough teleported Gizmo or injected quest completion. Authored route knowledge was used.

| Pass | Checks passed | Scope |
| --- | ---: | --- |
| Fresh touch journey | 30 | All three missions, ferry, prism crossing, lift in both directions, garden, Spire finale, partial/completion reloads and predicted landing |
| Desktop mission segments | 15 + 13 | Jellyfish escort and prisms with their routes; separate fresh Engine segment with wrong socket, mistimed pulse, live clock during charge and two-way lift |
| Controls | 31 | Repeated charge/release, Escape, blur, map, reload, outside-button release, touch cancel, two-thumb aiming, resize, boundaries and recovery |
| Desktop exploration | 14 | Continued an exact save earned by touch play; all six echoes, four chimes/Moontrail, early/late ferry step-off and completion reload |
| Studio bridge and backup | 21 | Actual brush transfer, reset, two-way sound preference, hidden simulation pause, history, position retention, new journey/restore and injected storage quota failure |
| Final targeted regression | 11 | Portrait introduction/charge, world time during hold, foliage camera, automatic ferry view, manual camera override, restart/restore transient state |
| Isolated character | 11 | 12,000 animation steps, repeated squash/release/cancel, finite poses at 20/60/144 Hz, hat/body clearance, preserved grooming and shader/runtime errors |

The first desktop route stopped after its 15 passing observations because its scripted waypoint intersected a real obstacle. The driver was corrected; a separate fresh Engine segment covered the remaining desktop controls. This is not described as one uninterrupted desktop completion. Earlier exploration attempts similarly exposed route-driver tolerance errors. The initial Studio check read grooming before the asynchronous frame handoff; the final regression waits for the accepted groom revision. The final completed sessions had no runtime or missing-asset errors.

Numeric camera checks alone missed foreground foliage hiding Gizmo. Fresh pixel review verified the taller camera obstruction envelopes keep him visible. Other review fixes included a cropped portrait bounce demonstration, camera framing with too much empty floor, nursery clipping, ride companion overlap, a weak garden payoff, stale introduction after restore, old audio tails after suspension and leftover ferry camera state. Automatic arrival framing was separately tested without manual camera input.

Actual final browser views:

- [Sanctuary and blooming garden](previews/neon-sanctuary.png)
- [Automatic jellyfish-ferry arrival](previews/neon-ferry.png)
- [Fresh portrait introduction](previews/neon-touch.png)

Detailed reports, routes, failed driver attempts and additional screenshots remain in the authoring workspace's `qa` directory. Earlier Studio-only regression passed 41 checks; this polish pass leaves its interaction implementation unchanged and repeats the 21 integration/backup checks above.

## Limits

Physical phones, older hardware, Safari, Firefox, gamepads and screen-reader-only completion remain unverified. Touch results are Chrome emulation. Headless audio lifecycle was tested; sound was not assessed by listening. The game uses the actual Astra mesh with a lower-cost fur approximation, not the Blender render's full hair system. The new static Blender world is 9,525,132 bytes, 273,484 triangles and 21 material batches before dynamic props.

The next useful acceptance test is an uncoached session with the intended players to assess clue clarity and pacing. This remains a draft preview. The live Studio and production deployment are unchanged until approval and merge.
