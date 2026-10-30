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
//   teclas:         mouse -> Atacar y bloquear, SPACE -> Saltar adelante, SHIFT -> Correr
//
// Por ahora no tienen sprites ni animaciones: solo tiempos (recarga y duracion)
// y los efectos que no necesitan dibujo (correr, saltar, bloquear).
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
  HAB_SALTAR,
  HAB_CORRER,
  HAB_CANTIDAD // siempre al final: cuantas habilidades hay
} HabilidadId;

typedef enum tipo_habilidad {
  HAB_INSTANTANEA, // se usa una vez y entra en recarga (atacar, saltar, ulti...)
  HAB_MANTENIDA    // activa mientras se mantiene apretada (correr, bloquear)
} TipoHabilidad;

// Mejoras que se compran con los puntos de nivel (uno por nivel), en la
// pestania Skills. Cada una se puede subir hasta su tope (MEJORA_TOPE).
typedef enum mejora_id {
  MEJORA_VIDA,        // +VIDA_POR_MEJORA de vida maxima
  MEJORA_MOVILIDAD,   // +MOVILIDAD_POR_MEJORA de velocidad, caminando y saltando
  MEJORA_SALTO_DOBLE, // en el aire, Espacio otra vez salta de nuevo
  MEJORA_CANTIDAD
} MejoraId;

#define VIDA_POR_MEJORA 15
#define MOVILIDAD_POR_MEJORA 0.08f
extern const int MEJORA_TOPE[MEJORA_CANTIDAD];

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
  int nivel;         // empieza en 1
  int experiencia;   // la juntada en este nivel (ver jugador_experiencia_nivel)
  int mejoras[MEJORA_CANTIDAD]; // cuantas veces compro cada una
  int vida_base;     // la vida maxima sin mejoras
  int saltos;        // sube con cada salto, tambien el del aire (para animarlo)
  int salto_aire;    // 1 si ya uso el salto doble en este salto
  float muerto_ms;   // > 0 mientras esta muerto: cuenta hasta reaparecer
  Direccion reaparicion; // donde reaparece al terminar de morir
} Jugador;

// Tabla del personaje principal de prueba. Cada personaje nuevo define la suya.
extern const HabilidadDef HABILIDADES_BASE[HAB_CANTIDAD];

#define MULTIPLICADOR_CORRER 1.6f
#define VELOCIDAD_SALTO 170.0f // pixeles por segundo, hacia adelante en el aire
// Lo que dura la animacion de morir (death: 33 frames de 80 ms). Mientras
// tanto el jugador queda MUERTO en el lugar; despues reaparece en la base.
#define DURACION_MUERTE_MS 2640.0f

// Experiencia: cada enemigo muerto da EXPERIENCIA_ENEMIGO. Al juntar la del
// nivel sube uno, se cura del todo y gana un punto para una mejora.
#define EXPERIENCIA_ENEMIGO 25

void jugador_iniciar(Jugador *j, const char *nombre, const HabilidadDef *habilidades, Entity base);

// La experiencia que hace falta para pasar del nivel `nivel` al siguiente.
int jugador_experiencia_nivel(int nivel);

// Le suma `puntos` de experiencia. Devuelve cuantos niveles subio.
int jugador_ganar_experiencia(Jugador *j, int puntos);

// Lo pone en `nivel` con `experiencia` juntada y esas `mejoras` compradas
// (un progreso guardado), curado del todo. Las mejoras que no entran en los
// puntos del nivel o pasan su tope se descartan.
void jugador_cargar(Jugador *j, int nivel, int experiencia, const int mejoras[MEJORA_CANTIDAD]);

// Puntos sin gastar: uno por nivel despues del 1, menos las mejoras compradas.
int jugador_puntos(const Jugador *j);

// Gasta un punto en la mejora `m`. Devuelve 1 si la compro, 0 si no hay
// puntos o ya esta en su tope.
int jugador_mejorar(Jugador *j, MejoraId m);

void jugador_ir_a(Jugador *j, Direccion destino);

// Usa una habilidad instantanea. Devuelve 1 si se activo, 0 si estaba recargando.
int jugador_usar(Jugador *j, HabilidadId h);

// Aprieta (1) o suelta (0) una habilidad mantenida.
void jugador_mantener(Jugador *j, HabilidadId h, int apretada);

int jugador_activa(const Jugador *j, HabilidadId h);
float jugador_recarga_restante(const Jugador *j, HabilidadId h);

// 1 si la habilidad es un ataque (para que main.c le pegue al enemigo).
int habilidad_es_ataque(HabilidadId h);

// Muere, por la causa que sea (puerta, enemigo...): suma delirio y queda
// MUERTO DURACION_MUERTE_MS; despues reaparece en `base` con la vida llena.
// Si ya estaba muerto no hace nada.
void jugador_morir(Jugador *j, Direccion base);

int jugador_muerto(const Jugador *j);

// Un paso de juego: tiempos de las habilidades y movimiento (chocando con
// los muros de `lab`).
void jugador_actualizar(Jugador *j, const Laberinto *lab, float dt_ms);

#endif
