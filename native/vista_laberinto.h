// El laberinto visto desde arriba en diagonal, igual que maze-renderer.ts:
// el piso, y los muros como bloques bajos cuya tapa se inclina alejandose
// del centro de la pantalla. Un muro a la derecha de la camara muestra su
// lado izquierdo, uno a la izquierda su lado derecho, y todos su frente.
//
// El piso va debajo de todo. Los muros (una forma por FILA de celdas, porque
// toda la fila comparte profundidad) y las hojas de las puertas se ordenan
// junto con el personaje por la Y de los pies: eso lo hace main.c.
#ifndef NATIVO_VISTA_LABERINTO_H
#define NATIVO_VISTA_LABERINTO_H

#include "mecanicas/laberinto.h"
#include "plugins/renderer2d/renderer2d.h"

#define WALL_HEIGHT 72 // px: ~1.2 veces el alto del personaje

#define VARIANTES_MAX 8

typedef struct {
  Textura2D atlas;        // maze_tiles.png + tiles de transicion + sombra
  int tile;               // px por tile (32)
  Rect2D piso[VARIANTES_MAX], adoquin[VARIANTES_MAX], pasto[VARIANTES_MAX], bosque[VARIANTES_MAX];
  int n_piso, n_adoquin, n_pasto, n_bosque;
  Rect2D mezcla[4][4];    // [nivel de bosque][variante]
  Rect2D sombra;          // degradado al pie de un muro

  unsigned char *plaza;   // LAB_TILES * LAB_TILES, 1 = celda de la plaza
  float bosque_x, bosque_y, bosque_radio;

  float camara_x;         // x de mundo del centro de la vista: las tapas se alejan de ahi
} VistaLaberinto;

// `ruta_tiles`: maze_tiles sin extension. La plaza se busca desde
// (spawn_x, spawn_y) caminando el piso sin cruzar puertas.
int vista_iniciar(VistaLaberinto *v, const Renderer2D *r, const char *ruta_tiles,
                  const Laberinto *lab, float spawn_x, float spawn_y);

// `vista`: el rectangulo visible del mundo, en px.
void vista_piso(VistaLaberinto *v, const Renderer2D *r, const Laberinto *lab, Rect2D vista);

// Filas de muros que tocan la vista (incluye las de abajo, cuyas tapas
// suben hasta ella) y sus columnas.
void vista_celdas(Rect2D vista, int *c0, int *c1, int *r0, int *r1);

void vista_fila_muros(const VistaLaberinto *v, const Renderer2D *r, const Laberinto *lab,
                      int fila, int c0, int c1);
void vista_hoja_puerta(const VistaLaberinto *v, const Renderer2D *r, RectPx hoja);

#endif
