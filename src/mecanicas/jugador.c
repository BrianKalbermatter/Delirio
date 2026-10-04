#include "jugador.h"

#include <stdio.h>

#include "movimiento_mouse.h"

// Numeros de prueba: se ajustan jugando.
//                                         nombre            tipo             recarga   duracion
const HabilidadDef HABILIDADES_BASE[HAB_CANTIDAD] = {
  [HAB_ATAQUE_LIGERO]  = {"Ataque ligero",  HAB_INSTANTANEA,    400.0f,   200.0f},
  [HAB_ATAQUE_RAPIDO]  = {"Ataque rapido",  HAB_INSTANTANEA,    250.0f,   120.0f},
  [HAB_ATAQUE_LARGO]   = {"Ataque largo",   HAB_INSTANTANEA,   1200.0f,   400.0f},
  [HAB_ATAQUE_CRITICO] = {"Ataque critico", HAB_INSTANTANEA,   3000.0f,   300.0f},
  [HAB_APOYO]          = {"Apoyo",          HAB_INSTANTANEA,  10000.0f,  3000.0f},
  [HAB_PARRY]          = {"Parry",          HAB_INSTANTANEA,   1500.0f,   250.0f},
  [HAB_ULTI]           = {"Ulti",           HAB_INSTANTANEA,  30000.0f,  2000.0f},
  [HAB_BLOQUEAR]       = {"Bloquear",       HAB_MANTENIDA,        0.0f,     0.0f},
  [HAB_RODAR]          = {"Rodar",          HAB_INSTANTANEA,    800.0f,   720.0f},
  [HAB_CORRER]         = {"Correr",         HAB_MANTENIDA,        0.0f,     0.0f},
};

void jugador_iniciar(Jugador *j, const char *nombre, const HabilidadDef *habilidades, Entity base){
  j->nombre = nombre;
  j->entidad = base;
  j->habilidades = habilidades;
  for (int h = 0; h < HAB_CANTIDAD; h++){
    j->estado[h] = (HabilidadEstado){0};
  }
  j->hay_destino = 0;
  j->muertes = 0;
  j->delirio = 0;
}

void jugador_morir(Jugador *j, Direccion base){
  j->muertes++;
  j->delirio++;
  j->entidad.vida = j->entidad.vidaMAX;
  j->entidad.posicion = base;
  j->entidad.estados = QUIETO;
  j->hay_destino = 0;
  for (int h = 0; h < HAB_CANTIDAD; h++) j->estado[h] = (HabilidadEstado){0};
  printf("%s murio (muertes %d, delirio %d)\n", j->nombre, j->muertes, j->delirio);
}

void jugador_ir_a(Jugador *j, Direccion destino){
  j->destino = destino;
  j->hay_destino = 1;
}

int jugador_usar(Jugador *j, HabilidadId h){
  if ((int)h < 0 || h >= HAB_CANTIDAD) return 0;
  const HabilidadDef *def = &j->habilidades[h];
  HabilidadEstado *est = &j->estado[h];
  if (def->tipo != HAB_INSTANTANEA || est->recarga_ms > 0) return 0;

  est->recarga_ms = def->recarga_ms;
  est->activa_ms = def->duracion_ms;
  printf("%s usa %s\n", j->nombre, def->nombre);

  // Rodar adelante: hacia donde mira, y deja de ir al destino del mouse
  if (h == HAB_RODAR) j->hay_destino = 0;
  return 1;
}

void jugador_mantener(Jugador *j, HabilidadId h, int apretada){
  if ((int)h < 0 || h >= HAB_CANTIDAD || j->habilidades[h].tipo != HAB_MANTENIDA) return;
  j->estado[h].mantenida = apretada;
}

int jugador_activa(const Jugador *j, HabilidadId h){
  const HabilidadEstado *est = &j->estado[h];
  return j->habilidades[h].tipo == HAB_MANTENIDA ? est->mantenida : est->activa_ms > 0;
}

float jugador_recarga_restante(const Jugador *j, HabilidadId h){
  return j->estado[h].recarga_ms;
}

int habilidad_es_ataque(HabilidadId h){
  return h == HAB_ATAQUE_LIGERO || h == HAB_ATAQUE_RAPIDO ||
         h == HAB_ATAQUE_LARGO || h == HAB_ATAQUE_CRITICO;
}

static void descontar(float *ms, float dt_ms){
  *ms = *ms > dt_ms ? *ms - dt_ms : 0;
}

void jugador_actualizar(Jugador *j, const Laberinto *lab, float dt_ms){
  // 1. Tiempos de las habilidades
  for (int h = 0; h < HAB_CANTIDAD; h++){
    descontar(&j->estado[h].recarga_ms, dt_ms);
    descontar(&j->estado[h].activa_ms, dt_ms);
  }

  Entity *e = &j->entidad;

  // 2. Rodando: avanza rapido hacia donde mira, sin control
  if (jugador_activa(j, HAB_RODAR)){
    float paso = VELOCIDAD_RODAR * dt_ms / 1000.0f;
    laberinto_mover(lab, &e->posicion, e->dir.x * paso, e->dir.y * paso);
    e->estados = CORRIENDO;
    return;
  }

  // 3. Bloqueando: se planta en el lugar
  if (jugador_activa(j, HAB_BLOQUEAR)){
    e->estados = QUIETO;
    return;
  }

  // 4. Caminar (o correr) hacia el destino del mouse
  int corre = jugador_activa(j, HAB_CORRER);
  float velocidad = VELOCIDAD_MOUSE * (corre ? MULTIPLICADOR_CORRER : 1.0f);
  P_mover_hacia(e, j->destino, &j->hay_destino, velocidad, dt_ms, lab);
  if (corre && e->estados == CAMINANDO) e->estados = CORRIENDO;
}
