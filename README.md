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
| Left click | With the axe in hand, next to a tree: chop it (hold it to keep swinging) |
| Left click (hold) | With the spear in the right hand: wind up and aim at the cursor while the bar under your feet charges; release to throw it (the fuller the bar, the further it flies) |
| Right click (hold) | Cover: blocks hits. With the shield in a hand you raise it and can walk, slowly; without it you stand still |
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
| Esc | Pause menu (also **New game**: starts over from zero: a new maze, level 1, no skills, nothing carried) |

Testing keys: **F** speeds up the clock, **G** makes the gates start closing,
**T** restarts the game.

## The square

You wake up in the square, the open meadow in the middle of the maze. It is
the same in every game; only the maze around it changes with the seed.

- **The meadow** covers the whole square, the same in every game: Brian's
  flower clumps and tall flowers swaying in the wind, his tall grass
  (Gramilla) and small flowers growing low under them, in patches with
  clearings between them. Only in the square: the maze will get its own
  plants. They are scenery: you walk through them.
- **Pebbles and fallen branches** lie all over the square (and a branch now
  and then in the corridors), so the first tools can be made right away.
- **The forest** covers the top-right corner: earth, moss and stones under a
  thick wood. It is dark because little light gets in and fog drifts through
  it, thicker the deeper you go, and you can still see what is on the ground.
- **Fruit bushes** of three sizes grow in the square and the corridors. Press
  E next to one to pick its fruit, and double click it in the inventory to eat
  it: the red pomegranates give life, the grapes and berries are poisonous.
  The fruit grows back in about a day. They are too small to hide in.
- **Wild sheep** graze in the square, in flocks of up to five and some on
  their own. Get close and they bolt, the whole flock at once: faster than you
  walk, slower than you run.
- **Old stumps** are scattered all over the square, no two alike: years of
  moss on the wood, with stones and tall grass grown around them. They are
  solid.
- **The pit** lies right next to the spawn: one, always in the same place. A
  cliff drops to a sunken floor nobody can reach: you cannot walk or jump
  across it, and a spear falls at its edge.

Past the gates, the maze floor is pale yellow sand dotted with pebbles,
with patches of old stone paving, between low
walls seen in perspective: their sides lean away from the middle of the
screen, and any wall in front of you opens a round window so you never get
lost behind it.

Trees grow all over the square, as many green as orange, in groves with
clearings between them and thicker in the dark corner; some have stones and
grass at the foot. Their trunks are solid, and a tree turns see-through while
you walk behind it. They grow in the same places in every game. Near some of
them lie **saplings** to pick up with E (planting them comes later). With the
**axe** in hand, left click next to a tree: three blows fell it, in a rain of
its leaves, and it stays down.

### The bosses' zones

Wherever the seed puts them, the bosses always keep the same order, from the
square outwards, and the floor tells you when one is near: it changes bit by
bit the closer you get (the walls stay as they are, for now).

- **The Medusas, temple of Zeus**: white marble slabs with gold seams. Their
  arena is a big open square (smaller than the meadow) in a corner of the
  first maze, close to the square, with two ways in, both facing the square.
- **Achilles, the centaur of Poseidon**: a sea-blue mosaic. Its arena is in
  the opposite corner, halfway out: it opens with the third growth.
- **The Minotaur, Hades**: dark basalt with embers in the cracks, and lava.
  Near his lair the corridors have small lava pools you can walk around. The
  lair is on the outer edge of the world and is **always the end of the
  maze**: a single door, opened by the last growth. Inside it is all lava:
  jump (Space) from stone to stone to reach his island. Stepping on lava
  without jumping burns you (-20 life) and puts you back where you last
  stood safe; with one foot on the stone you are fine.

**Boss fights.** Walking into a boss's room starts the fight on its own: the
boss wakes up and its name and life show at the bottom of the screen. For
now each boss is a bigger spartan in its own colour, until their own sprites
come. They chase you without leaving their room (the Minotaur, his island),
never run away, and before each blow they stop and flash, faster and faster:
that is the moment to step back, jump or cover with the shield. A spear
hurts them (-60) but does not kill them in one throw. Leave the room for a
few seconds and the boss goes back to its place, fully healed. Beaten, it
gives a lot of experience and is gone for good (it is kept in the save).

## Your character and the inventory

You play Brian's Personaje_3 (masked, with a strap across the black tunic),
drawn in the 8 directions. Near the start lie an **axe**, a **torch** and a
round **shield** (best in the left hand).
**Build level.** What you can craft depends on your build level, shown on
top of the recipe book beside the crafting grid (Inventory tab): every
recipe of your level with the shape to lay out, and, greyed, what the next
level unlocks. It starts at 1 (torch, spear, stone pickaxe) and goes up with
**Build** in the Skills tab, a level point each time, only while your own
level is above it: build level 2 needs level 2, build level 3 needs level 3.
Build level 2 unlocks the **workbench** (Brian's MesaDeTrabajo: four
branches in a square) and the axe. Double click the workbench in the
inventory to set it up in front of you; it stays there (also in the save),
and **E** next to it opens the crafting grid.

**Rocks** lie all over the maze (Brian's Roca1 and more shapes in its
colours): outcrops of one to three big rocks against the corners of the
corridors, always with room to walk around them, and **pebbles** scattered
around them and here and there. Pick pebbles up with **E**. Three pebbles
across the top of the crafting grid and two branches down the middle make a
**stone pickaxe** (Brian's PicoPiedra), like Minecraft's. Hold it (double
click it in the inventory) and press **E** at a big rock, or attack it: it
shakes and throws chips, and the second blow breaks it into 2 or 3 pebbles.
Broken rocks stay broken in the save. When the maze grows, the new corridors
get their rocks too.
The **spear** is crafted: pick up three fallen **branches** in the corner
of the square (the big tree is gone until its new sprites come) and lay them on a diagonal in the crafting grid (Inventory tab, under
the player). Pick things up with **E**: the axe and the torch go to the
inventory (16 slots, in the **Inventory** tab of the side panel); double
click one, or drag it onto a hand, to hold it. The right hand swings, the
left one carries. The torch burns with an animated flame and lights up much
more around you, by night and by day. Potions give back 30 life.

### The spear

The spear always goes straight to your right hand, the throwing one. Hold
the **left button**: your character winds up far back and turns to the
cursor while a bar under your feet charges. Let go and it throws, as far as
the bar charged: a full bar reaches all the way (it turns gold), a quick
tap drops it a few steps ahead. Nothing cuts a throw short: keys pressed
meanwhile wait for it to end. One thing at a time: you either cover (right
button) or throw, and while covering no other ability goes off.

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
out in the maze, talking in turns (a speech bubble over the one
speaking) while one dances in the middle. Chatting, they barely look around,
so you can sneak up on them; but if one spots you or gets hit, the whole
circle comes for you. Once they calm down they walk back and pick up the
chat again. A pack goes after you together too.

**The square is your base.** No enemy is ever born or comes back to life
inside it. On the first day (the truce, until dusk) none of them walks in
either: they stop at the gates, so you can gather your first resources and
get ready. From dusk on they wander in while the gates are open, and
whoever is inside when the gates close spends the night in there with you.

Some carry a weapon in hand, drawn like yours: a **spear**, an **axe** or a
**torch**. When one dies it drops 1 to 3 spinning **coins**, now and then
something it had on it (a potion, a branch, an enemy sword) and, sometimes,
its weapon. Coins and items you walk over glide to you once you are close
(further with the **Reach** skill).

You never attack with a key: get an enemy close and your character **swings
at it on its own**, once a second, one enemy at a time. The one it is after
has a **white ring** on the floor around it; it sticks to that one while it
lives and stays near, then moves on to the next.

**Bushes** to hide in are out for now, until there are new drawings
(`HAY_ARBUSTOS_GRANDES` in `src/mecanicas/enemigos.c`). They work like this:
like League of Legends' brush, grow next to every circle and
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

Levelling up takes a moment: yellow stars turn around you leaving a trail of
essence, closing in until it bursts in red, blue and yellow, and a slow,
colorless wave crosses the screen: only the image bends, harder the further it
gets, with ripples behind it and the view shaking (the HUD stays still). It heals you fully and gives a
**point**. Points are spent
whenever you like, away from the fight, in the **Skills** tab of the side
panel, with the **+** next to each one:

| Skill | Effect | Max |
|---|---|---|
| Life | +15 max life | 10 |
| Mobility | +8% walk, run and jump speed | 5 |
| Double jump | Space again in the air jumps once more | 1 |
| Reach | Coins and items you walk over glide to you from further away (40 px, +18 px a level) | 5 |

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

## The moon

Every dawn is a day of the lunar calendar: 6 months of 30 days, and then it
starts over. The months are Zeus, Deukos, Sfagianes, Lapatos, Dipsios and
Klareon. Days have names, not numbers: from the new moon, through the waxing
light and the full moon, to the countdown (*Faltan nueve lunas*...) and *Viejo
y nuevo*, the day one month ends and the next begins. The black-sailed ship
arrives on the last day of the Month of Zeus.

For now it is only the logic (`src/mecanicas/calendario.c`), shown in the debug
panel. `game.calendar()` gives the date, with the `luminosity` the maze will use
at night; the clock's sprite goes in `Hud.showMoonClock`. To see the 30 days of
a month and run the tests: `bash tests/calendario.sh [month, 0 to 5]`.

## Saving

Everything is kept in your browser (localStorage), per character, so each
browser has its own game:

- **Level, experience and skills**, as soon as they change.
- **Where you left off**, every couple of seconds and when the page closes:
  the maze (its seed and the time of day, so it grows back the same), where
  you stand, what you carry, wear and have in the crafting grid, and what
  lies on the floor.

Enemies start over around the base, and anything being crafted is called
off (its items stay in the grid). **New game** in the pause menu starts over from
zero: a new maze, level 1 with no experience, no skills (build level 1),
nothing carried, the bosses back. Clearing the site's data wipes it all too.

## Effects

Walking and running kick up a little dust behind the feet, yours and the
enemies'. A wall in front of you opens a round window around you; one in
front of an enemy or an item only fades a little around it, so you can tell
what hides behind it.

## Art

The maze tiles are generated by scripts in [`art/`](art), and the grass tuft is
read from its Aseprite file and recoloured to the square's greens.

| What | Source | How to rebuild |
|---|---|---|
| Small flowers of the meadow, in the colours of Brian's Flores and Flores2 | `art/florcitas.py` | `python3 art/florcitas.py client/public/sprites` |
| Rocks and pebbles in the colours of Brian's Roca1 (frame 0 of the rocks is his own) | `art/rocas.py` | Export `Plaza/Roca1.aseprite` to a PNG with Aseprite, then `python3 art/rocas.py <roca1.png> client/public/assets` |
| Stone pickaxe overlays (Brian's `Armas/PicoPiedra.aseprite`) | `art/armas.py` (`WEAPONS`, id `pico`) | `bash art/armas_build.sh` |
| Maze tiles (sand floor with pebbles, grass, walls, gates, boss zone floors) | `art/maze_tiles.py` | `python3 art/maze_tiles.py client/public/assets` |
| Inventory icons for items whose sprite does not read at slot size (the spear) | `art/iconos.py` | `python3 art/iconos.py` |
| Round shield (a weapon in `armas.WEAPONS`, held by the middle) | `art/escudo.py` → `sprites/Armas/Escudo_Redondo.aseprite` | `python3 art/escudo.py <escudo.png>`, `Aseprite -b <escudo.png> --save-as Escudo_Redondo.aseprite`, then `bash art/armas_build.sh` |
| Coin dropped by enemies (tag `spin`) | `art/moneda.py` | `python3 art/moneda.py` |
| Grass tuft, big and small (recoloured) | `Gramilla.aseprite` + `art/gramilla.py` | `python3 art/gramilla.py <Gramilla.aseprite> client/public/sprites` |
| Sample tree (layers Sombra, Tronco, Copa, Pasto) and loose sticks | `art/arbol.py` + `art/arbol_aseprite.lua` | Layers with `python3 art/arbol.py client/public/sprites <layers_dir>`, then `Aseprite -b --script-param dir=<layers_dir> --script-param out=<arbol_muestra.aseprite> --script-param sticks=<palitos.png> --script arbol_aseprite.lua`. After retouching: `Aseprite -b arbol_muestra.aseprite --save-as client/public/sprites/arbol.png` |
| Big tree from line art (layers Sombra, Tronco, Copa, Hojas; tags `idle`, `chop`) | `Arboles/Arbol1.aseprite` + `art/pintar_arbol.py` + `art/animar_arbol.py` + `art/arbol_animado_aseprite.lua` | Export the line art to PNG, `python3 art/animar_arbol.py <line_art.png> <dir>`, then `Aseprite -b --script-param dir=<dir> --script-param out=<Arbol1_pintado.aseprite> --script arbol_animado_aseprite.lua`; sheets with `bash client/scripts/export-sprites.sh` |
| Gramilla, tufts and twigs around the big tree's foot (run after `gramilla.py`) | `art/pasto_arbol.py` | `python3 art/pasto_arbol.py client/public/sprites` |
| Level up around the body (layers Atras, Frente; tags `rodea`, `estalla`) | `art/nivel_aura.py` + `art/nivel_aura_aseprite.lua` → `sprites/Efectos/NivelAura.aseprite` | `bash art/nivel_aura_build.sh` redraws it from zero; after retouching it in Aseprite, `bash art/nivel_aura_build.sh --export` |
| Trees of the square: green (layers Sombra, Arbol) | `art/arbol2_original.png` + `art/arbol2.py` + `art/arbol2_aseprite.lua` → `sprites/Arboles/Arbol2.aseprite` | `bash art/arbol2_build.sh` recovers it from the image; after retouching it in Aseprite, `bash art/arbol2_build.sh --export` |
| Trees of the square: orange, and the stones and tufts at their foot | `art/arbol3_original.png` + `art/arbol3.py` (needs scipy) + `art/arbol3_aseprite.lua` → `sprites/Arboles/Arbol3.aseprite`, `Arbol3_pie.aseprite` | `bash art/arbol3_build.sh`, or with `--export` after retouching |
| Saplings (2 frames, one per tree) | `art/retonos.py` + `art/retonos_aseprite.lua` → `sprites/Arboles/Retonos.aseprite` | `bash art/retonos_build.sh`, or with `--export` after retouching |
| Branches around the big tree | `art/plaza_deco.py` + `art/frames_aseprite.lua` → `sprites/Plaza/Ramas.aseprite` | `python3 art/plaza_deco.py <dir>`, then `Aseprite -b --script-param dir=<dir>/ramas --script-param out=Ramas.aseprite --script frames_aseprite.lua`; sheet with `bash client/scripts/export-sprites.sh` |
| Wind on Brian's flowers (tag `viento`) | `art/flores_viento.py` + `art/frames_aseprite.lua` → `sprites/Laberinto/Terreno/{Flores,Flores2}_viento.aseprite` (his `Flores` and `Flores2` stay untouched) | `python3 art/flores_viento.py <Terreno dir> <dir>`, then per folder `Aseprite -b --script-param dir=<dir>/<name> --script-param out=<name>_viento.aseprite --script-param tag=viento --script frames_aseprite.lua`; sheets with `bash client/scripts/export-sprites.sh` |
| The pit by the spawn | `art/hueco_original.png` + `art/hueco.py` (needs scipy) → `client/public/sprites/hueco.png`, and prints its collision rows for `src/mecanicas/laberinto.c` | `python3 art/hueco.py` |
| Fruit bushes (berries, grapes, pomegranates; with and without fruit, shown at 3 sizes) and the fruit as items | `art/arbustos_frutos_original.png` + `art/arbustos_frutos.py` (needs scipy) → `client/public/sprites/arbusto_frutos.{png,json}`, `client/public/assets/frutas.{png,json}` | `python3 art/arbustos_frutos.py` |
| Sheep (one drawing facing right; tags `pasta`, `camina`, `corre`) | `art/ovejas_original.png` + `art/ovejas.py` → `client/public/sprites/oveja.{png,json}` | `python3 art/ovejas.py` |
| Stumps (3, each at 3 ages) | `art/tocones_original.png` + `art/tocones.py` (needs scipy) → `client/public/sprites/tocones.{png,json}` | `python3 art/tocones.py` |
| Bushes to hide in (9, one frame each; the game only uses the 3 round ones) | `sprites/Plaza/Arbustos_original.png` + `art/arbustos.py` → `sprites/Plaza/Arbustos.aseprite` | `bash art/arbustos_build.sh`, or with `--export` after retouching |
| Wind on the big tree (its `idle` tag) | `art/arbol_viento.lua` → `sprites/Arboles/Arbol1_pintado.aseprite` (rebuilds the wind from the first frame; rerun after retouching it) | `Aseprite -b --script-param file=Arbol1_pintado.aseprite --script arbol_viento.lua`, then `bash client/scripts/export-sprites.sh` |
| Shadow under the big tree | `art/sombra_arbol.py` → `client/public/sprites/sombra_arbol.png` | `python3 art/sombra_arbol.py client/public/sprites` |
| Player (Personaje_3, every animation in 8 directions, the spear throw), its weapons in either hand, slam dirt; the weapons as items (lying, held, icon; the spear also flying and stuck in the ground, in 16 directions) | `art/personaje_3.py` + `art/personaje_3_build.py` + `art/armas.py` (weapons: `WEAPONS`) | `bash art/armas_build.sh` (also writes `Personaje_3_Anim.aseprite`). Its sheets are packed (`armas.write_packed_sheet`: each frame cut to its pixels, repeats stored once) to keep them small on the GPU |
| Enemy (Espartano1: idle/walk/run in 8 directions, roll, three deaths, pinned to a wall) | `Espartano1.aseprite` + `art/espartano.py` (built on `personaje_3.py`, blood from `art/enemigo1.py`) | `python3 art/espartano.py <dir>`, then `Aseprite -b --script-param dir=<dir> --script-param out=Espartano1_Anim.aseprite --script-param body=Espartano --script art/bicho_aseprite.lua`; sheet with `bash client/scripts/export-sprites.sh` |
| Old enemy (Enemigo1, not used now) | `art/enemigo1.py` | Same as Espartano1, with `body=Enemigo` |
| Torch fire | `art/antorcha_fuego.py` | `python3 art/antorcha_fuego.py` |
| Aseprite sprites to sheets | `client/scripts/export-sprites.sh` | `bash client/scripts/export-sprites.sh` |
