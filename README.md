# Delirio

Survival game in a maze that grows, inspired by *Maze Runner*. Top-down pixel
art in the browser. Design notes: [`concept/Mecanicas.md`](concept/Mecanicas.md).

## ▶ [Play in your browser](https://briankalbermatter.github.io/Delirio/)

Link: **https://briankalbermatter.github.io/Delirio/**

Nothing to download: one click and you are in. Click **Play**, then walk
with **W A S D** (controls below). The build is updated on every push to `main`; if you
still see the old one, reload with **Ctrl + Shift + R**.

Your game is kept in your browser: reload the page and you go on where you
left off, in the same maze (see [Saving](#saving)).
Days last 6 real minutes and nights 16 (press **F** to speed up the clock).

## Controls

| Input | Action |
|---|---|
| W A S D | Walk |
| Mouse | Aim: the character always looks at the cursor |
| Shift (hold) | Run |
| Space | Jump · again in the air: double jump (once learned in Skills) |
| Right click (hold) | With the spear in the right hand: wind up and aim at the cursor while the bar under your feet charges; release to throw it (the fuller the bar, the further it flies). Without it: block |
| V | Parry |
| C | Support |
| R | Punch the ground: dirt flies and the screen shakes |
| E | Pick up the branch, weapon, torch or spear at your feet |
| Drag a slot onto another · onto the map | Move it there (same items stack, others swap) · drop it where the cursor is (within reach) |
| — | Attacks have no key: next to an enemy you swing at it on your own |
| 1-9 or click a slot | Select an inventory slot |
| Double click a slot | Use it: drink a potion, open the map book, hold a weapon or the torch |
| Drag a slot onto a body square | Put it there (helmet, armor, pants, right or left hand) |
| Right click a slot · a body square | Drop it on the floor · take it off |
| X | Drop one item of the selected slot |
| Drag items into the crafting grid · click the result | Craft (Inventory tab, under the player) |
| **+** in the Skills tab | Spend a level point |
| Click a tab | Side panel: Technical, Inventory, Skills |
| `` ` `` | Map book (left click draws, right click erases) |
| Esc | Pause menu (also **New game**: a new maze from the base, keeping level and skills) |

Testing keys: **F** speeds up the clock, **G** makes the gates start closing,
**T** restarts the game.

## The square

You wake up in the square, the open meadow in the middle of the maze. It is
the same in every game; only the maze around it changes with the seed.

- **Grass tufts** (the hand-drawn Gramilla sprite) dot the meadow, in the
  same places every game. They are scenery: you walk through them.
- **The dark forest floor** covers the top-right corner, ready for trees.

Past the gates, the maze floor is pale yellow sand dotted with pebbles,
with patches of old stone paving, between low
walls seen in perspective: their sides lean away from the middle of the
screen, and any wall in front of you opens a round window so you never get
lost behind it.

## Your character and the inventory

You play Brian's Personaje_3 (masked, with a strap across the black tunic),
drawn in the 8 directions. Near the start lie an **axe** and a **torch**.
The **spear** is crafted: pick up three fallen **branches** around the big
tree and lay them on a diagonal in the crafting grid (Inventory tab, under
the player). Pick things up with **E**: the axe and the torch go to the
inventory (16 slots, in the **Inventory** tab of the side panel); double
click one, or drag it onto a hand, to hold it. The right hand swings, the
left one carries. The torch burns with an animated flame and lights up much
more around you, by night and by day. Potions give back 30 life.

### The spear

The spear always goes straight to your right hand, the throwing one. Hold
the **right button**: your character winds up far back and turns to the
cursor while a bar under your feet charges. Let go and it throws, as far as
the bar charged: a full bar reaches all the way (it turns gold), a quick
tap drops it a few steps ahead. Nothing cuts a throw short: keys pressed
meanwhile wait for it to end.

The spear flies straight and kills the first enemy in its way, then carries
it on to where its flight ends. If that is the front or a side of a wall,
the enemy stays **pinned to it**, bleeding, the wall cracked around the
spearhead. Otherwise it drops dead where it was hit. The spear sticks in the
ground where it ends up, pointing the way you threw it, and you have to go
and pick it up again; pulling it out of a pinned body drops the body.

## Enemies

Out in the maze roam the level 1 enemies, Brian's **Espartano1**: spartans
with a bronze helmet, a blue crest and a blue cape, a bit taller than you.
Dumb and scared, but they want you dead. Without seeing you they wander at random.
Once they see you they keep their distance and circle you the long way
round, running off if you come close, while they work up the nerve. Turn
your back on them or get busy swinging and they gather courage faster. When
they have enough they rush in, hit once and flee again. Blocking or jumping
dodges their hit; punch the ground (**R**) to hurt every one around you and
scare the rest. Your life is the thick bar over your head (see below); each
hit spills some of your blood on the floor. They die one of
three bloody ways, by where they face: knocked back, slumped over on their
side or face down, with a pool of blood growing under the body.

Fewer of them roam now, but not alone: some **hunt in packs** of 3 or 4
that follow a leader towards you, and some stand in **chatting circles**
in the square and the maze, talking in turns (a speech bubble over the one
speaking) while one dances in the middle. Chatting, they barely look around,
so you can sneak up on them; but if one spots you or gets hit, the whole
circle comes for you. Once they calm down they walk back and pick up the
chat again. A pack goes after you together too.

You never attack with a key: get an enemy close and your character **swings
at it on its own**, once a second, one enemy at a time. The one it is after
has a **white ring** on the floor around it; it sticks to that one while it
lives and stays near, then moves on to the next.

**Bushes**, like League of Legends' brush, grow next to every circle and
here and there in the square and the corridors. Walk in and you turn
see-through: enemies cannot see you unless they bump right into you or
stand in the same bush. Attacking from a bush gives you away for a second.
Enemies hiding in a bush you are not in are not shown either.

## Life, levels and skills

A thick bar follows you over your head: your **life** (green, red when under
a third, with the life just lost fading out in pale), your **level** in the
gold square beside it and, under it, the **experience** to the next one.
Every enemy you kill gives 25 experience (by hand, with the spear or
punching the ground); level 1 needs 100, level 2 needs 200, and so on.

Levelling up heals you fully and gives a **point**. Points are spent
whenever you like, away from the fight, in the **Skills** tab of the side
panel, with the **+** next to each one:

| Skill | Effect | Max |
|---|---|---|
| Life | +15 max life | 10 |
| Mobility | +8% walk, run and jump speed | 5 |
| Double jump | Space again in the air jumps once more | 1 |

## Crafting

Under the player in the **Inventory** tab is a 3x3 crafting grid. Drag items
into its squares (one per square; right click takes one back). When they make
a recipe's shape (anywhere in the grid, also mirrored) the result shows to
the right: click it and a bar fills while it is made (right click stops it).
Then the items are used up and the result goes to the inventory.

| Result | Shape | Time |
|---|---|---|
| Spear | 3 branches on a diagonal | 4 s |
| Torch | a branch on top of another | 3 s |
| Axe | 2 enemy swords side by side, 2 branches under one of them | 5 s |

## Saving

Everything is kept in your browser (localStorage), per character, so each
browser has its own game:

- **Level, experience and skills**, as soon as they change.
- **Where you left off**, every couple of seconds and when the page closes:
  the maze (its seed and the time of day, so it grows back the same), where
  you stand, what you carry, wear and have in the crafting grid, and what
  lies on the floor.

Enemies start over around the base, and anything being crafted is called
off (its items stay in the grid). **New game** in the pause menu starts a new
maze from the base, keeping your level and skills. Clearing the site's data
wipes it all.

## Effects

Walking and running kick up a little dust behind the feet, yours and the
enemies'.

## Art

The maze tiles are generated by scripts in [`art/`](art), and the grass tuft is
read from its Aseprite file and recoloured to the square's greens.

| What | Source | How to rebuild |
|---|---|---|
| Maze tiles (sand floor with pebbles, grass, walls, gates) | `art/maze_tiles.py` | `python3 art/maze_tiles.py client/public/assets` |
| Inventory icons for items whose sprite does not read at slot size (the spear) | `art/iconos.py` | `python3 art/iconos.py` |
| Grass tuft, big and small (recoloured) | `Gramilla.aseprite` + `art/gramilla.py` | `python3 art/gramilla.py <Gramilla.aseprite> client/public/sprites` |
| Sample tree (layers Sombra, Tronco, Copa, Pasto) and loose sticks | `art/arbol.py` + `art/arbol_aseprite.lua` | Layers with `python3 art/arbol.py client/public/sprites <layers_dir>`, then `Aseprite -b --script-param dir=<layers_dir> --script-param out=<arbol_muestra.aseprite> --script-param sticks=<palitos.png> --script arbol_aseprite.lua`. After retouching: `Aseprite -b arbol_muestra.aseprite --save-as client/public/sprites/arbol.png` |
| Big tree from line art (layers Sombra, Tronco, Copa, Hojas; tags `idle`, `chop`) | `Arboles/Arbol1.aseprite` + `art/pintar_arbol.py` + `art/animar_arbol.py` + `art/arbol_animado_aseprite.lua` | Export the line art to PNG, `python3 art/animar_arbol.py <line_art.png> <dir>`, then `Aseprite -b --script-param dir=<dir> --script-param out=<Arbol1_pintado.aseprite> --script arbol_animado_aseprite.lua`; sheets with `bash client/scripts/export-sprites.sh` |
| Gramilla, tufts and twigs around the big tree's foot (run after `gramilla.py`) | `art/pasto_arbol.py` | `python3 art/pasto_arbol.py client/public/sprites` |
| Branches around the big tree | `art/plaza_deco.py` + `art/frames_aseprite.lua` → `sprites/Plaza/Ramas.aseprite` | `python3 art/plaza_deco.py <dir>`, then `Aseprite -b --script-param dir=<dir>/ramas --script-param out=Ramas.aseprite --script frames_aseprite.lua`; sheet with `bash client/scripts/export-sprites.sh` |
| Wind on Brian's flowers (tag `viento`) | `art/flores_viento.py` + `art/frames_aseprite.lua` → `sprites/Laberinto/Terreno/{Flores,Flores2}_viento.aseprite` (his `Flores` and `Flores2` stay untouched) | `python3 art/flores_viento.py <Terreno dir> <dir>`, then per folder `Aseprite -b --script-param dir=<dir>/<name> --script-param out=<name>_viento.aseprite --script-param tag=viento --script frames_aseprite.lua`; sheets with `bash client/scripts/export-sprites.sh` |
| Bushes to hide in (3 variants, tags `viento_0..2`; the first frame of each is the bush at rest) | `art/arbusto.py` (placeholder, to repaint) | `python3 art/arbusto.py client/public/sprites` |
| Wind on the big tree (its `idle` tag) | `art/arbol_viento.lua` → `sprites/Arboles/Arbol1_pintado.aseprite` (rebuilds the wind from the first frame; rerun after retouching it) | `Aseprite -b --script-param file=Arbol1_pintado.aseprite --script arbol_viento.lua`, then `bash client/scripts/export-sprites.sh` |
| Shadow under the big tree | `art/sombra_arbol.py` → `client/public/sprites/sombra_arbol.png` | `python3 art/sombra_arbol.py client/public/sprites` |
| Player (Personaje_3, every animation in 8 directions, the spear throw), its weapons in either hand, slam dirt; the weapons as items (lying, held, icon; the spear also flying and stuck in the ground, in 16 directions) | `art/personaje_3.py` + `art/personaje_3_build.py` + `art/armas.py` (weapons: `WEAPONS`) | `bash art/armas_build.sh` (also writes `Personaje_3_Anim.aseprite`). Its sheets are packed (`armas.write_packed_sheet`: each frame cut to its pixels, repeats stored once) to keep them small on the GPU |
| Enemy (Espartano1: idle/walk/run in 8 directions, roll, three deaths, pinned to a wall) | `Espartano1.aseprite` + `art/espartano.py` (built on `personaje_3.py`, blood from `art/enemigo1.py`) | `python3 art/espartano.py <dir>`, then `Aseprite -b --script-param dir=<dir> --script-param out=Espartano1_Anim.aseprite --script-param body=Espartano --script art/bicho_aseprite.lua`; sheet with `bash client/scripts/export-sprites.sh` |
| Old enemy (Enemigo1, not used now) | `art/enemigo1.py` | Same as Espartano1, with `body=Enemigo` |
| Torch fire | `art/antorcha_fuego.py` | `python3 art/antorcha_fuego.py` |
| Aseprite sprites to sheets | `client/scripts/export-sprites.sh` | `bash client/scripts/export-sprites.sh` |
