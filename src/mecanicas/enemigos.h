// Enemigos de nivel 1 (concept/Mecanicas.md, "Personalidad del nivel 1"):
// tontos y con miedo. Sin ver al jugador dan vueltas al azar. Cuando lo ven
// no van derecho: se le acercan de costado, dando vueltas largas, y si se
// les acerca mucho escapan. Pero quieren matarlo: juntan coraje mientras lo
// miran (mas rapido si el jugador esta distraido o de espaldas) y cuando
// alcanza, se le tiran encima, pegan una vez y vuelven a escapar.
//
// Deambulando tiran para la plaza y, adentro, dan vueltas por ahi. Siempre
// hay muchos alrededor del jugador: los que quedan muy lejos reaparecen
// cerca suyo (fuera de su vista), asi que mientras camina se van renovando.
#ifndef ENEMIGOS_H
#define ENEMIGOS_H

#include "../entidad.h"
#include "jugador.h"
#include "laberinto.h"

#define ENEMIGOS_MAX 160

// Lo que tiene ganas de hacer.
typedef enum animo {
  ANIMO_DEAMBULA, // no ve al jugador: camina al azar
  ANIMO_ACECHA,   // lo ve: lo rodea a distancia, juntando coraje
  ANIMO_ATACA,    // se le tira encima
  ANIMO_HUYE      // se asusto (le pegaron, pego, o el jugador se acerco)
} Animo;

typedef struct enemigo {
  Entity entidad;      // posicion = los pies; dir = hacia donde se mueve
  Direccion mira;      // hacia donde mira (al jugador mientras acecha)
  Animo animo;
  int activo;          // 0: hueco libre en la lista (esperando reaparecer)
  float rumbo_ms;      // cuanto le queda al rumbo actual al deambular
  float animo_ms;      // tiempo en el animo actual
  float coraje;        // sube mientras acecha; al llegar a `valor` ataca
  float valor;         // cuanto coraje necesita este enemigo (cada uno distinto)
  int lado;            // +1 o -1: de que costado rodea al jugador
  float golpeado_ms;   // > 0 justo despues de recibir un golpe (para el parpadeo)
  float muerto_ms;     // > 0 mientras esta MUERTO: cuenta hasta desaparecer
  float reaparece_ms;  // > 0 mientras el hueco espera a otro enemigo
} Enemigo;

typedef struct enemigos {
  Enemigo lista[ENEMIGOS_MAX];
  unsigned int azar;
  Direccion plaza; // centro de la plaza, hacia donde tiran al deambular
  int atacando;    // cuantos se estan tirando encima del jugador ahora
} Enemigos;

// Los reparte alrededor de `jugador`, a una distancia en la que no los ve.
void enemigos_iniciar(Enemigos *e, const Laberinto *lab, Direccion jugador, unsigned int semilla);

// Un paso: cada uno decide que hacer y se mueve. Los que alcanzan al jugador
// le pegan (si no esta bloqueando ni en el aire). Devuelve el danio total que
// recibio el jugador en este paso.
int enemigos_actualizar(Enemigos *e, const Laberinto *lab, Jugador *j, float dt_ms);

// El jugador pega delante suyo: a los que esten a `alcance` pixeles de sus
// pies, del lado al que mira. Devuelve a cuantos les pego.
int enemigos_golpe_jugador(Enemigos *e, const Jugador *j, float alcance, int danio);

// Golpe al suelo: a todos los que esten a `radio` pixeles, y los que quedan
// vivos alrededor escapan del susto. Devuelve a cuantos les pego.
int enemigos_golpe_suelo(Enemigos *e, Direccion centro, float radio, int danio);

#endif
