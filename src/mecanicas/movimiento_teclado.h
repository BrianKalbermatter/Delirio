// Movimiento con el teclado (WASD). Sin usar por ahora: el juego se mueve con
// el mouse (movimiento_mouse.h). Queda para cuando haga falta.
#ifndef MOVIMIENTO_TECLADO_H
#define MOVIMIENTO_TECLADO_H

#include "../entidad.h"

void P_movimiento_personaje(Entity *p, int teclas);

#endif
