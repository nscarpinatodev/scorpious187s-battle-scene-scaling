# Scorpious187's Battle Scene Scaling

Mark a scene as a scaled battlefield and control which combat distances scale with it.

Built for **Foundry VTT v13** and **dnd5e 5.x** (verified against 5.2.5).

---

## The idea

On a dragon-battle map, one grid unit represents far more than five feet. Set the
scene's grid distance to 20 ft and every distance in the game shrinks relative to
the map: a 20 ft burst covers a quarter of its usual ground, a 30 ft move barely
leaves the token's own space.

Sometimes that is what you want. Rarely is it what you want for *everything*.

This module lets you choose per category:

```
ground covered = (base distance x multiplier) / scene grid distance
```

With a 20 ft grid distance, a x4 multiplier, and a 20 ft burst:

```
(20 x 4) / 20 = 20 ft of map   — exactly the footprint it has on a normal scene
```

Leave movement disabled and a 30 ft speed covers a quarter of its usual ground.
The dragon owns the battlefield; the party cannot simply walk across it. That
asymmetry is the point — it is the one thing changing the grid distance alone
cannot give you.

The net effect: the scene keeps **true-scale measurement** — the ruler honestly
reports the lair as 400 ft across — while the categories you choose keep their
normal tabletop **geometry**. No combination of scene settings gives you both.

## Scaled scenes must be gridless

On a rescaled *square* grid, a 30 ft move lands on 1.5 squares. Tokens snap
wrong, counting squares stops working, and templates render as chunky
square-snapped approximations of what they should be.

Gridless fixes all of it. Movement is measured continuously, so a 30 ft move is
exactly 30 ft. Templates render as true geometry — which matters enormously when
a x4 circle on a coarse grid would otherwise be a polygon.

Gridless does **not** change the underlying ratio; movement is still
proportionally shorter unless you scale it. It makes that exact and usable rather
than broken.

The module warns (but does not block) if a profile is assigned to a scene that
still has a grid.

## Why not just change the grid distance?

Because that scales *everything* uniformly. If uniform scaling is what you want,
you do not need this module — set `Grid Distance` and stop. This module exists
for when areas, ranges, and movement should scale differently from one another.

## Setup

1. **Configure profiles** — Settings → Module Settings → *Scaling Profiles*.
   Ships with Dragon Battle (x4), Kaiju (x10), and Space Combat (x20).
2. **Create the scene** — Scenes sidebar → *Scaled Scene*. Pick a profile and the
   wizard sets gridless and the derived grid distance in one step, so the scene's
   scale and its profile cannot disagree.

To convert a scene you already have, right-click it in the Scenes sidebar →
*Convert to Scaled Scene*. It confirms first and shows the before/after grid
distance, since converting reinterprets every distance already on the scene.
Tokens do not move — their positions are stored in pixels.

### Auto vs Fixed multipliers

Profiles default to **Auto**, which derives the multiplier from the scene's own
grid distance divided by the baseline (5 ft by default, 1.5 for meters). Auto
means the grid distance and the multiplier are a single number rather than two
that must be kept in agreement — change the grid, and the scaling follows.

Use **Fixed** only when you want to scale on a scene whose grid you are leaving
at its normal distance.

A per-scene **Multiplier Override** beats both, for the one-off scene that does
not deserve its own profile.

## What works in 0.1.0

| Feature | Status |
| --- | --- |
| Scaling profiles + scene assignment | **Working** |
| Scaled Scene wizard (create & convert) | **Working** |
| Spell & AoE areas | **Working** |
| Attack & spell ranges | **Working** (needs libWrapper) |
| Melee reach | **Working** (needs libWrapper) |
| Movement speed | **Working** (needs libWrapper) |
| Token vision & light | **Working** (needs libWrapper) |

All five categories are implemented. Only spell/AoE areas work without
libWrapper; the rest have no hook and must intercept prepared data.

### How range scaling works

There is no hook for this. Core dnd5e **does not enforce attack range at all** —
`range.value` is a display label — and enforcement comes from midi-qol, whose
public `MidiQOL.checkActivityRange` is a bundled copy of its internal binding, so
wrapping it never sees Midi's own workflow calls.

The one place every consumer agrees on is the prepared data.
`RangeField.prepareData` resolves `range.value` and builds the display labels in
one pass, and dnd5e invokes it as `RangeField.prepareData.call(this, …)` — a
property lookup on the class at each call, which libWrapper can intercept. One
wrap therefore covers Midi's range check, chat cards, and item sheets together.

`reach` scales under **Melee Reach**; `value` and `long` scale under **Attack &
Spell Ranges**. Melee weapons carry their distance in `reach` and ranged ones in
`value`, so the two categories separate cleanly.

**Known limitation.** Derived data is client-global, not per-scene, so scaling
resolves against the scene you are *viewing*. Open an actor sheet while looking
at a scaled scene and its ranges read scaled even if that token stands elsewhere.
Midi's checks are unaffected — those run on the scene the attack happens on — but
sheet display can mislead. Fixing it properly would need per-token derived data,
which dnd5e does not support.

Because derived data is cached, the module re-prepares actors when the scene
changes, when a scaled scene's profile or grid is edited, and when profiles are
saved. `game.modules.get("scorpious187s-battle-scene-scaling").api.refresh()`
forces it by hand if something looks stale.

### Movement

`AttributesFields.prepareMovement` resolves every speed formula and applies
reductions (exhaustion, encumbrance) in one pass, and is called through the same
interceptable `.call` pattern.

Scaling happens *after* that, deliberately. A 10 ft exhaustion penalty is a
distance like any other and should scale with everything else: 30 − 10 = 20, then
×4 = 80. Scaling first and reducing after would leave the penalty at unscaled
size and quietly change the maths.

### Token vision & light

The line here is between distances belonging to the **creature** and distances
belonging to the **scene**:

- Darkvision, blindsight, and a torch the creature carries are creature
  properties. They arrive on a scaled scene still expressed in normal-scale feet,
  so they scale.
- Ambient lights, walls, and scene darkness were placed by you *on* the scaled
  scene, already at its scale. Scaling those would double up, so they are left
  alone.

Only token sight range, token-emitted light, and detection-mode ranges are
touched. A sight range of `0` means "unlimited" in Foundry and is deliberately
skipped.

This intercepts `TokenDocument#prepareBaseData`, which is what makes it
non-destructive — values are recomputed in memory on every prepare and never
written back to the database. Unlike actor-derived data, a TokenDocument knows
which scene it belongs to, so tokens on other scenes are never mis-scaled.

## Building a local release

```powershell
.\build.ps1              # build at the current version
.\build.ps1 -Version 0.2.0   # stamp a new version, then build
```

Produces `dist\scorpious187s-battle-scene-scaling-v<version>.zip` with
`module.json` at the archive root, plus a loose `module.json` for manifest
installs. Unzip on the server into:

```
<FoundryData>\Data\modules\scorpious187s-battle-scene-scaling\
```

## Notes

- `scorpious187s-lib` is **optional**. The module uses the family logger when the
  library is present and falls back to its own when it is not, so the test server
  does not need it.
- No actor or item data is ever modified. Scale is resolved per scene at the
  moment it is needed, so uninstalling leaves nothing behind in the world.
- v14 is explicitly out of scope for now; `compatibility.verified` is pinned to 13.
