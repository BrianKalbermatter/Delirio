// Movimiento con el mouse, estilo Diablo: el click no mueve, da un DESTINO.
#ifndef MOVIMIENTO_MOUSE_H
#define MOVIMIENTO_MOUSE_H

#include "../entidad.h"
#include "laberinto.h"

#define VELOCIDAD_MOUSE 110.0f // pixeles por segundo, caminando

// Un paso hacia `destino` a `velocidad` (pixeles por segundo), chocando con
// los muros de `lab`. Cuando llega, o si queda trabado contra un muro, apaga
// *hay_destino y queda QUIETO.
// dt_ms = milisegundos desde el paso anterior: asi camina igual a 60 o a 144 fps.
void P_mover_hacia(Entity *p, Direccion destino, int *hay_destino, float velocidad, float dt_ms,
                   const Laberinto *lab);

#endif
