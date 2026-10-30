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
  [HAB_ULTI]           = {"Ulti",           HAB_INSTANTANEA,  30000.0f,   900.0f}, // golpe al suelo
  [HAB_BLOQUEAR]       = {"Bloquear",       HAB_MANTENIDA,        0.0f,     0.0f},
  [HAB_SALTAR]         = {"Saltar",         HAB_INSTANTANEA,    800.0f,   600.0f},
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
  j->nivel = 1;
  j->experiencia = 0;
  for (int m = 0; m < MEJORA_CANTIDAD; m++) j->mejoras[m] = 0;
  j->vida_base = base.vidaMAX;
  j->saltos = 0;
  j->salto_aire = 0;
  j->muerto_ms = 0;
}

int jugador_experiencia_nivel(int nivel){
  return 100 * nivel; // 4 enemigos para el nivel 2, 8 para el 3...
}

int jugador_ganar_experiencia(Jugador *j, int puntos){
  int subio = 0;
  j->experiencia += puntos;
  while (j->experiencia >= jugador_experiencia_nivel(j->nivel)){
    j->experiencia -= jugador_experiencia_nivel(j->nivel);
    j->nivel++;
    if (!jugador_muerto(j)) j->entidad.vida = j->entidad.vidaMAX;
    subio++;
    printf("%s sube al nivel %d\n", j->nombre, j->nivel);
  }
  return subio;
}

const int MEJORA_TOPE[MEJORA_CANTIDAD] = {
  [MEJORA_VIDA]        = 10,
  [MEJORA_MOVILIDAD]   = 5,
  [MEJORA_SALTO_DOBLE] = 1,
  [MEJORA_RECOLECCION] = 5,
};

static void aplicar_mejoras(Jugador *j){
  j->entidad.vidaMAX = j->vida_base + j->mejoras[MEJORA_VIDA] * VIDA_POR_MEJORA;
  if (j->entidad.vida > j->entidad.vidaMAX) j->entidad.vida = j->entidad.vidaMAX;
}

void jugador_cargar(Jugador *j, int nivel, int experiencia, const int mejoras[MEJORA_CANTIDAD]){
  j->nivel = nivel < 1 ? 1 : nivel;
  j->experiencia = 0;
  if (experiencia > 0) jugador_ganar_experiencia(j, experiencia); // por si no entra en el nivel
  for (int m = 0; m < MEJORA_CANTIDAD; m++) j->mejoras[m] = 0;
  for (int m = 0; m < MEJORA_CANTIDAD; m++){
    int quiere = mejoras[m] < MEJORA_TOPE[m] ? mejoras[m] : MEJORA_TOPE[m];
    while (j->mejoras[m] < quiere && jugador_puntos(j) > 0) j->mejoras[m]++;
  }
  aplicar_mejoras(j);
  j->entidad.vida = j->entidad.vidaMAX;
}

int jugador_puntos(const Jugador *j){
  int gastados = 0;
  for (int m = 0; m < MEJORA_CANTIDAD; m++) gastados += j->mejoras[m];
  return j->nivel - 1 - gastados;
}

int jugador_mejorar(Jugador *j, MejoraId m){
  if ((int)m < 0 || m >= MEJORA_CANTIDAD) return 0;
  if (jugador_puntos(j) <= 0 || j->mejoras[m] >= MEJORA_TOPE[m]) return 0;
  j->mejoras[m]++;
  int antes = j->entidad.vidaMAX;
  aplicar_mejoras(j);
  if (!jugador_muerto(j)) j->entidad.vida += j->entidad.vidaMAX - antes; // la vida nueva viene llena
  printf("%s mejora %d (ahora %d)\n", j->nombre, m, j->mejoras[m]);
  return 1;
}

// Lo que multiplica su velocidad la mejora de movilidad.
static float movilidad(const Jugador *j){
  return 1.0f + MOVILIDAD_POR_MEJORA * j->mejoras[MEJORA_MOVILIDAD];
}

void jugador_morir(Jugador *j, Direccion base){
  if (jugador_muerto(j)) return;
  j->muertes++;
  j->delirio++;
  j->muerto_ms = DURACION_MUERTE_MS;
  j->reaparicion = base;
  j->entidad.estados = MUERTO;
  j->hay_destino = 0;
  for (int h = 0; h < HAB_CANTIDAD; h++) j->estado[h] = (HabilidadEstado){0};
  printf("%s murio (muertes %d, delirio %d)\n", j->nombre, j->muertes, j->delirio);
}

int jugador_muerto(const Jugador *j){
  return j->muerto_ms > 0;
}

static void reaparecer(Jugador *j){
  j->entidad.vida = j->entidad.vidaMAX;
  j->entidad.posicion = j->reaparicion;
  j->entidad.estados = QUIETO;
  printf("%s reaparece en la base\n", j->nombre);
}

void jugador_ir_a(Jugador *j, Direccion destino){
  if (jugador_muerto(j)) return;
  j->destino = destino;
  j->hay_destino = 1;
}

int jugador_usar(Jugador *j, HabilidadId h){
  if ((int)h < 0 || h >= HAB_CANTIDAD || jugador_muerto(j)) return 0;
  const HabilidadDef *def = &j->habilidades[h];
  HabilidadEstado *est = &j->estado[h];
  // Salto doble: en el aire, una vez por salto, vuelve a saltar desde ahi
  if (h == HAB_SALTAR && jugador_activa(j, HAB_SALTAR)){
    if (!j->mejoras[MEJORA_SALTO_DOBLE] || j->salto_aire) return 0;
    j->salto_aire = 1;
    j->saltos++;
    est->recarga_ms = def->recarga_ms;
    est->activa_ms = def->duracion_ms;
    printf("%s salta en el aire\n", j->nombre);
    return 1;
  }
  if (def->tipo != HAB_INSTANTANEA || est->recarga_ms > 0) return 0;

  est->recarga_ms = def->recarga_ms;
  est->activa_ms = def->duracion_ms;
  printf("%s usa %s\n", j->nombre, def->nombre);

  // Saltar adelante: hacia donde mira, y deja de ir al destino del mouse
  if (h == HAB_SALTAR){
    j->hay_destino = 0;
    j->salto_aire = 0;
    j->saltos++;
  }
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
  // 0. Muerto: se queda donde cayo hasta que termina la animacion
  if (jugador_muerto(j)){
    descontar(&j->muerto_ms, dt_ms);
    if (!jugador_muerto(j)) reaparecer(j);
    return;
  }

  // 1. Tiempos de las habilidades
  for (int h = 0; h < HAB_CANTIDAD; h++){
    descontar(&j->estado[h].recarga_ms, dt_ms);
    descontar(&j->estado[h].activa_ms, dt_ms);
  }

  Entity *e = &j->entidad;

  // 2. Saltando: avanza hacia donde mira, sin control hasta caer
  if (jugador_activa(j, HAB_SALTAR)){
    float paso = VELOCIDAD_SALTO * movilidad(j) * dt_ms / 1000.0f;
    laberinto_mover(lab, &e->posicion, e->dir.x * paso, e->dir.y * paso);
    e->estados = CORRIENDO;
    return;
  }

  // 3. Bloqueando o golpeando el suelo (ulti): se planta en el lugar
  if (jugador_activa(j, HAB_BLOQUEAR) || jugador_activa(j, HAB_ULTI)){
    e->estados = QUIETO;
    return;
  }

  // 4. Caminar (o correr) hacia el destino del mouse
  int corre = jugador_activa(j, HAB_CORRER);
  float velocidad = VELOCIDAD_MOUSE * movilidad(j) * (corre ? MULTIPLICADOR_CORRER : 1.0f);
  P_mover_hacia(e, j->destino, &j->hay_destino, velocidad, dt_ms, lab);
  if (corre && e->estados == CAMINANDO) e->estados = CORRIENDO;
}
