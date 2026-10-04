#include "movimiento_teclado.h"

// Movilidad del personaje
// Puedo usar los bits como un interruptor
//    bit 0 = w, bit 1 = s, bit 2 = a, bit 3 = d
void P_movimiento_personaje(Entity *p ,int teclas){

  Direccion dir = {0, 0}; // x y
  p->dir.x = 0;
  p->dir.y = 0;

  if (teclas & KEY_W) dir.y -= 1;

  if (teclas & KEY_S) dir.y += 1;

  if (teclas & KEY_A) dir.x -= 1;

  if (teclas & KEY_D) dir.x += 1;

}
