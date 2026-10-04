// Mecanica de los jugadores principales: habilidades y movimiento.
//
// Sirve para TODOS los personajes principales. Lo que cambia entre uno y otro
// es su tabla de habilidades (HabilidadDef): cuanto tarda en recargar cada una
// y cuanto dura. La logica es la misma para todos.
//
// Habilidades anotadas:
//   mochila:        1 => Ataque ligero
//                   2 => Habilidad de apollo para el equipo, para el propio personaje
//                   3 => Habilidad de parri
//                   4 => Ulti, habilidad especial
//   P_habilidades:  ataque_critico, ataque_largo, ataque_rapido, correr
//   teclas:         mouse -> Atacar y bloquear, SPACE -> Rol adelante, SHIFT -> Correr
//
// Por ahora no tienen sprites ni animaciones: solo tiempos (recarga y duracion)
// y los efectos que no necesitan dibujo (correr, rodar, bloquear).
#ifndef JUGADOR_H
#define JUGADOR_H

#include "../entidad.h"
#include "laberinto.h"

typedef enum habilidad_id {
  HAB_ATAQUE_LIGERO,
  HAB_ATAQUE_RAPIDO,
  HAB_ATAQUE_LARGO,
  HAB_ATAQUE_CRITICO,
  HAB_APOYO,
  HAB_PARRY,
  HAB_ULTI,
  HAB_BLOQUEAR,
  HAB_RODAR,
  HAB_CORRER,
  HAB_CANTIDAD // siempre al final: cuantas habilidades hay
} HabilidadId;

typedef enum tipo_habilidad {
  HAB_INSTANTANEA, // se usa una vez y entra en recarga (atacar, rodar, ulti...)
  HAB_MANTENIDA    // activa mientras se mantiene apretada (correr, bloquear)
} TipoHabilidad;

// Como es una habilidad para un personaje (sus numeros).
typedef struct habilidad_def {
  const char *nombre;
  TipoHabilidad tipo;
  float recarga_ms;  // tiempo hasta poder usarla de nuevo
  float duracion_ms; // cuanto dura activa una vez usada
} HabilidadDef;

// Como esta una habilidad ahora mismo.
typedef struct habilidad_estado {
  float recarga_ms; // > 0: todavia recargando
  float activa_ms;  // > 0: todavia activa
  int mantenida;    // para HAB_MANTENIDA: 1 mientras esta apretada
} HabilidadEstado;

typedef struct jugador {
  const char *nombre;
  Entity entidad;
  const HabilidadDef *habilidades; // la tabla de este personaje (HAB_CANTIDAD filas)
  HabilidadEstado estado[HAB_CANTIDAD];
  Direccion destino; // a donde camina (movimiento con mouse)
  int hay_destino;
  int muertes;
  int delirio;       // sube +1 con cada muerte (concept/Mecanicas.md)
} Jugador;

// Tabla del personaje principal de prueba. Cada personaje nuevo define la suya.
extern const HabilidadDef HABILIDADES_BASE[HAB_CANTIDAD];

#define MULTIPLICADOR_CORRER 1.6f
#define VELOCIDAD_RODAR 320.0f // pixeles por segundo

void jugador_iniciar(Jugador *j, const char *nombre, const HabilidadDef *habilidades, Entity base);

void jugador_ir_a(Jugador *j, Direccion destino);

// Usa una habilidad instantanea. Devuelve 1 si se activo, 0 si estaba recargando.
int jugador_usar(Jugador *j, HabilidadId h);

// Aprieta (1) o suelta (0) una habilidad mantenida.
void jugador_mantener(Jugador *j, HabilidadId h, int apretada);

int jugador_activa(const Jugador *j, HabilidadId h);
float jugador_recarga_restante(const Jugador *j, HabilidadId h);

// 1 si la habilidad es un ataque (para que main.c le pegue al enemigo).
int habilidad_es_ataque(HabilidadId h);

// Muere: suma delirio y reaparece en `base` con la vida llena.
void jugador_morir(Jugador *j, Direccion base);

// Un paso de juego: tiempos de las habilidades y movimiento (chocando con
// los muros de `lab`).
void jugador_actualizar(Jugador *j, const Laberinto *lab, float dt_ms);

#endif
