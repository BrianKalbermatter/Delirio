// Arbustos, como los de League of Legends: el jugador que se mete adentro
// queda escondido. Los enemigos no lo ven salvo que esten pegados a el o
// metidos en el mismo arbusto. Pegar desde adentro lo delata un ratito.
// No chocan: se camina a traves de ellos.
//
// Aca solo vive la lista y la pregunta "en que arbusto esta este punto".
// Donde se ponen lo decide enemigos.c (al lado de cada ronda, y algunos
// sueltos por la plaza y los pasillos).
#ifndef ARBUSTOS_H
#define ARBUSTOS_H

#include "../entidad.h"

#define ARBUSTOS_MAX 48

typedef struct arbusto {
  Direccion centro; // en pixeles del mundo
  float radio;
} Arbusto;

typedef struct arbustos {
  Arbusto lista[ARBUSTOS_MAX];
  int cant;
} Arbustos;

// Agrega uno. Devuelve 0 si ya no entran mas.
int arbustos_agregar(Arbustos *a, Direccion centro, float radio);

// En que arbusto esta `pos` (su indice), o -1 si en ninguno.
int arbustos_en(const Arbustos *a, Direccion pos);

// 1 si un arbusto nuevo en `centro` con `radio` quedaria encimado con otro
// (con `margen` pixeles de aire entre los dos).
int arbustos_encima(const Arbustos *a, Direccion centro, float radio, float margen);

#endif
