// Hoja de sprites exportada por Aseprite (json-array + --list-tags) y el
// animador que dice que cuadro mostrar. Igual que sprite-sheet.ts y
// animator.ts del cliente web, para que se vea y se mueva igual.
#ifndef NATIVO_HOJA_H
#define NATIVO_HOJA_H

#include "plugins/renderer2d/renderer2d.h"

typedef struct {
  Rect2D origen;     // pedazo de la textura
  int duracion_ms;   // tiempo que se muestra, puesto en Aseprite
} Cuadro;

typedef struct {
  char nombre[32];   // tag: "walk_down_left", "death"...
  int desde, hasta;  // indices de cuadro, inclusive
} Animacion;

typedef struct {
  Textura2D textura;
  Cuadro *cuadros;
  int n_cuadros;
  Animacion *anims;
  int n_anims;
} Hoja;

// `ruta_base` sin extension: lee ruta_base.json y ruta_base.png.
int hoja_cargar(Hoja *h, const Renderer2D *r, const char *ruta_base);
const Animacion *hoja_animacion(const Hoja *h, const char *tag); // NULL si no esta

typedef struct {
  const Hoja *hoja;
  const Animacion *anim;
  int cuadro;        // indice dentro de la animacion
  float reloj_ms;    // tiempo en el cuadro actual
  int repetir;
} Animador;

// Cambia de animacion. Si solo cambia la direccion (walk_right ->
// walk_down_right) conserva la fase, asi girar caminando no reinicia el paso.
void animador_tocar(Animador *a, const char *tag, int repetir);
// `reversa`: recorre los cuadros al reves (caminar para atras).
void animador_avanzar(Animador *a, float dt_ms, int reversa);
const Cuadro *animador_cuadro(const Animador *a); // NULL sin animacion

#endif
