#include "movimiento_mouse.h"

#include <math.h>

void P_mover_hacia(Entity *p, Direccion destino, int *hay_destino, float velocidad, float dt_ms,
                   const Laberinto *lab){
  if (!*hay_destino){
    p->estados = QUIETO;
    return;
  }

  // 1. Vector desde la posicion hasta el destino
  float dx = destino.x - p->posicion.x;
  float dy = destino.y - p->posicion.y;

  // 2. Distancia
  float distancia = sqrtf(dx * dx + dy * dy);
  float paso = velocidad * dt_ms / 1000.0f;

  // 3. Llego: se compara contra el paso y no contra 0, si no se pasaria
  //    del destino y quedaria temblando encima del punto
  if (distancia <= paso){
    p->posicion = destino;
    *hay_destino = 0;
    p->estados = QUIETO;
    return; // p->dir queda como estaba: sigue mirando hacia donde caminaba
  }

  // 4. Normalizar (largo 1) y avanzar, chocando con los muros
  p->dir.x = dx / distancia;
  p->dir.y = dy / distancia;
  float movido = laberinto_mover(lab, &p->posicion, p->dir.x * paso, p->dir.y * paso);

  // 5. Trabado contra un muro (no avanzo casi nada): deja de intentar
  if (movido < paso * 0.1f){
    *hay_destino = 0;
    p->estados = QUIETO;
    return;
  }
  p->estados = CAMINANDO;
}
