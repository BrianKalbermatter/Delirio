# Objetos del juego

Todos los objetos que existen hoy: cómo se consiguen, qué receta llevan y si ya funcionan en el juego.
Sale del código: `client/src/domain/items.ts`, `client/src/domain/crafting.ts`, `client/src/domain/level-items.ts` y `src/mecanicas/enemigos.c`.

**Regla:** todo se agarra con E, siempre. La única excepción son las monedas, que se agarran caminando encima.

**Estado:** ✅ funciona · ⚠️ se puede agarrar, pero todavía no sirve para nada propio · 🔒 falta algo para conseguirlo

## Recetas

Se arman en la grilla de 3×3 del inventario. La forma puede ir en cualquier lugar de la grilla y también espejada.
Una receta de nivel 2 necesita subir el **nivel de construcción** en la pestaña Skills (va de 1 a 5).

`R` = rama · `P` = piedrita · `E` = espada enemiga · `.` = vacío

| Objeto | Nivel | Tiempo | Materiales | Forma |
|---|---|---|---|---|
| Antorcha | 1 | 3 s | 2 ramas | `R` / `R` (vertical) |
| Lanza | 1 | 4 s | 3 ramas | `R..` / `.R.` / `..R` (diagonal) |
| Pico de piedra | 1 | 4 s | 3 piedritas + 2 ramas | `PPP` / `.R.` / `.R.` |
| Mesa de trabajo | 2 | 6 s | 4 ramas | `RR` / `RR` |
| Hacha | 2 | 5 s | 2 espadas enemigas + 2 ramas | `EE` / `.R` / `.R` |

## Armas y herramientas

Se llevan en la mano: doble clic en el inventario o arrastrándolas a una mano.

| Objeto | Cómo se consigue | Se agarra con | Para qué sirve | Estado |
|---|---|---|---|---|
| Lanza | Receta, o la suelta un enemigo | E (va directo a la mano derecha) | Mantener clic izquierdo para cargar y soltar para tirarla. Queda clavada y se recupera con E | ✅ |
| Hacha | Receta, o la suelta un enemigo | E | Golpear y talar árboles | ✅ |
| Pico de piedra | Solo receta | E | Golpear y romper rocas grandes, que dejan piedritas | ✅ |
| Antorcha | Receta, o la suelta un enemigo | E | Da luz alrededor, de día y de noche | ✅ |
| Escudo redondo | Hay uno solo, escondido lejos del inicio. No tiene receta | E | Cubrirse con clic derecho. Mejor en la mano izquierda. En la mano se ve más grande que en el suelo y el inventario | ✅ |

## Consumibles

Se usan con doble clic en el inventario.

| Objeto | Cómo se consigue | Se agarra con | Efecto | Estado |
|---|---|---|---|---|
| Pociones (6 formas: rombo, frasco, tubo U, retorta, cono, cubo) | Una de cada forma escondida lejos del inicio, o las suelta un enemigo | E | +30 de vida. Las 6 hacen lo mismo | ✅ |
| Granada | Arbustos de frutos (E) | E en el arbusto | +20 de vida | ✅ |
| Bayas | Arbustos de frutos (E) | E en el arbusto | −12 de vida (venenosas) | ✅ |
| Uvas | Arbustos de frutos (E) | E en el arbusto | −18 de vida (venenosas) | ✅ |

## Materiales

| Objeto | Cómo se consigue | Se agarra con | Para qué sirve | Estado |
|---|---|---|---|---|
| Rama | Tiradas en la plaza y en algunos pasillos, o la suelta un enemigo | E | Antorcha, lanza, pico, mesa y hacha | ✅ |
| Piedrita | Tiradas en la plaza y en los pasillos, o rompiendo rocas grandes | E | Pico de piedra | ✅ |
| Espada enemiga | Hay una escondida en el punto más lejano, o la suelta un enemigo | E | Solo para la receta del hacha. No se puede empuñar | ✅ |

## Otros

| Objeto | Cómo se consigue | Se agarra con | Para qué sirve | Estado |
|---|---|---|---|---|
| Libro de mapa | Lo suelta el primer santuario al despertarlo | E | Dibujar el laberinto. Se abre con la tecla `` ` `` o con doble clic | ✅ |
| Mesa de trabajo | Solo receta (nivel 2) | E | Doble clic la coloca adelante del personaje y queda fija. E al lado abre la grilla de crafteo | ✅ |
| Moneda | Los enemigos comunes sueltan de 1 a 3 al morir | Caminando encima (el imán la atrae) | Se guarda en el inventario. Todavía no se puede gastar en nada | ⚠️ |
| Brote verde | Crecen cerca de los árboles de la plaza | E | Plantarlos todavía no está hecho | ⚠️ |
| Brote naranja | Crecen cerca de los árboles de la plaza | E | Plantarlos todavía no está hecho | ⚠️ |
| Cofre común | Aparece cerca del inicio | No se agarra | Solo decorativo: no se abre | ⚠️ |

## Qué sueltan los enemigos comunes

Los especiales son distintos: fantasmas, espíritus y esqueletos sueltan 1 moneda y nada más. Los jefes y las hogueras siempre sueltan una poción y monedas.

| Cosa | Probabilidad |
|---|---|
| Monedas | Siempre, de 1 a 3 |
| Poción | 6 de cada 100 |
| Rama | 4 de cada 100 |
| Espada enemiga | 3 de cada 100 |
| Su arma en la mano | La lanza la lleva el 15 %, el hacha el 15 % y la antorcha el 10 %. De los que llevan arma, el 35 % la suelta al morir |

## Para revisar

- 🔒 **El escudo se puede perder para siempre:** hay uno solo, sin receta y sin que lo suelte ningún enemigo.
- 🔒 **El hacha por receta exige dos espadas enemigas:** salen en 3 de cada 100 enemigos, más la que está escondida. Puede tardar mucho, salvo que un enemigo suelte un hacha.
- **Equipo para el cuerpo:** existen los casilleros de cabeza, cuerpo y piernas, pero todavía no hay ningún objeto para ponerles.
- **Las ramas no salen de los árboles:** talar un árbol no da ramas.
- **Moneda, brotes y cofre:** todavía no tienen función propia.
