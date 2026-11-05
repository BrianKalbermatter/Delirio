// Ovejas salvajes: viven en la plaza, en manadas de hasta OVEJAS_POR_MANADA y
// algunas solas. Pastan y caminan un poco sin alejarse de su manada; si el
// jugador se acerca, salen corriendo, y con ella las de su manada que estan
// cerca. Corren mas rapido de lo que el jugador camina, pero menos de lo que
// corre. Chocan como todos, y no salen de la plaza.
#ifndef OVEJAS_H
#define OVEJAS_H

#include "../entidad.h"
#include "laberinto.h"

#define OVEJAS_MAX 32
#define OVEJAS_POR_MANADA 5

typedef enum estado_oveja {
  OVEJA_PASTA = 0,
  OVEJA_CAMINA,
  OVEJA_HUYE
} EstadoOveja;

typedef struct oveja {
  Direccion posicion; // los pies, en pixeles del mundo
  Direccion dir;      // para donde va (o miraba)
  EstadoOveja estado;
  float tiempo_ms;    // lo que le queda haciendo eso
  int manada;         // las que tienen el mismo numero andan juntas
} Oveja;

typedef struct ovejas {
  Oveja lista[OVEJAS_MAX];
  int cant;
  unsigned int azar;
} Ovejas;

// Las reparte por la plaza, lejos de donde aparece el jugador.
void ovejas_iniciar(Ovejas *o, const Laberinto *lab, unsigned int semilla);

void ovejas_actualizar(Ovejas *o, const Laberinto *lab, Direccion jugador, float dt_ms);

#endif
