#include "arbustos.h"

static float distancia2(Direccion a, Direccion b){
  float dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

int arbustos_agregar(Arbustos *a, Direccion centro, float radio){
  if (a->cant >= ARBUSTOS_MAX) return 0;
  a->lista[a->cant++] = (Arbusto){centro, radio};
  return 1;
}

int arbustos_en(const Arbustos *a, Direccion pos){
  for (int i = 0; i < a->cant; i++){
    float r = a->lista[i].radio;
    if (distancia2(pos, a->lista[i].centro) <= r * r) return i;
  }
  return -1;
}

int arbustos_encima(const Arbustos *a, Direccion centro, float radio, float margen){
  for (int i = 0; i < a->cant; i++){
    float r = a->lista[i].radio + radio + margen;
    if (distancia2(centro, a->lista[i].centro) < r * r) return 1;
  }
  return 0;
}
