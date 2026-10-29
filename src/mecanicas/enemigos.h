// Enemigos de nivel 1 (concept/Mecanicas.md, "Personalidad del nivel 1"):
// tontos y con miedo. Sin ver al jugador dan vueltas al azar. Cuando lo ven
// no van derecho: se le acercan de costado, dando vueltas largas, y si se
// les acerca mucho escapan. Pero quieren matarlo: juntan coraje mientras lo
// miran (mas rapido si el jugador esta distraido o de espaldas) y cuando
// alcanza, se le tiran encima, pegan una vez y vuelven a escapar.
//
// Hay tres clases de enemigo, segun con quien andan:
//   - Sueltos: deambulan solos. Tiran para la plaza y, adentro, dan vueltas.
//     Los que quedan muy lejos reaparecen cerca del jugador (fuera de su
//     vista), asi que mientras camina se van renovando.
//   - Manadas: 3 o 4 que andan juntos. El primero manda (caza: tira para
//     donde esta el jugador) y los otros lo siguen. Si uno ve al jugador,
//     acecha toda la manada.
//   - Rondas: grupos quietos en un lugar fijo, parados en circulo, charlando
//     (uno habla y los demas lo miran) y alguno baila en el medio. Estan
//     distraidos: ven poco. Si uno ve al jugador o lo lastiman, se alerta la
//     ronda entera. Cuando se calman vuelven a su lugar a seguir charlando.
//
// Y arbustos (arbustos.h): el jugador escondido en uno no se ve.
#ifndef ENEMIGOS_H
#define ENEMIGOS_H

#include "../entidad.h"
#include "arbustos.h"
#include "jugador.h"
#include "laberinto.h"

#define ENEMIGOS_MAX 96
#define RONDAS_MAX 8   // rondas (grupos charlando)
#define RONDA_MAX 6    // enemigos por ronda, como mucho
#define MANADAS_MAX 6
#define MANADA_MAX 4   // enemigos por manada, como mucho

// Contra que cara de un muro lo clavo una lanza (solo las que el juego
// muestra: la de adelante y los costados). El enemigo mira hacia el tiro.
typedef enum clavado {
  CLAVADO_NO,
  CLAVADO_FRENTE, // contra la cara de adelante: mira a la camara
  CLAVADO_IZQ,    // contra el costado izquierdo de un muro: mira a la izquierda
  CLAVADO_DER     // contra el costado derecho: mira a la derecha
} Clavado;

// Lo que tiene ganas de hacer.
typedef enum animo {
  ANIMO_DEAMBULA, // no ve al jugador: camina al azar (o vuelve a su ronda)
  ANIMO_ACECHA,   // lo ve: lo rodea a distancia, juntando coraje
  ANIMO_ATACA,    // se le tira encima
  ANIMO_HUYE,     // se asusto (le pegaron, pego, o el jugador se acerco)
  ANIMO_CHARLA    // en su ronda, charlando y distraido
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
  Clavado clavado;     // muerto clavado a un muro por una lanza
  float reaparece_ms;  // > 0 mientras el hueco espera a otro enemigo
  // Con quien anda (-1: con nadie). Se mantiene aunque muera y reaparezca.
  int ronda;           // indice en Enemigos.rondas
  int asiento;         // su lugar en el circulo de la ronda
  int manada;          // indice en Enemigos.manadas
  // En la ronda
  float baile_ms;      // > 0 mientras baila en el medio
  Direccion ajuste;    // se acomoda un poco en su lugar (se balancea)
  float ajuste_ms;     // hasta que se vuelve a acomodar
} Enemigo;

// Un grupo charlando en circulo alrededor de `centro`.
typedef struct ronda {
  Direccion centro;
  int miembros[RONDA_MAX]; // huecos de la lista
  int cant;
  int habla;      // hueco del que habla ahora (-1: silencio)
  float turno_ms; // cuanto le queda al turno (o al silencio)
  float baile_ms; // hasta que alguno se ponga a bailar
} Ronda;

// Una manada: el primero vivo de `miembros` es el que manda.
typedef struct manada {
  int miembros[MANADA_MAX];
  int cant;
} Manada;

typedef struct enemigos {
  Enemigo lista[ENEMIGOS_MAX];
  unsigned int azar;
  Direccion plaza; // centro de la plaza, hacia donde tiran al deambular
  int atacando;    // cuantos se estan tirando encima del jugador ahora
  Ronda rondas[RONDAS_MAX];
  int cant_rondas;
  Manada manadas[MANADAS_MAX];
  int cant_manadas;
  Arbustos arbustos;
  int arbusto_jugador; // en que arbusto esta el jugador (-1: en ninguno)
  float delatado_ms;   // > 0: pego desde un arbusto y se lo ve igual
} Enemigos;

// Pone las rondas y los arbustos, y reparte a los sueltos alrededor de
// `jugador`, a una distancia en la que no los ve.
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

// Una lanza tirada desde `desde` hacia `hacia` (unitario): vuela derecho
// hasta `alcance` pixeles o hasta un muro, y mata al primer vivo que cruza.
// Lo arrastra en el sentido del tiro (por su eje mas largo) hasta el primer
// muro: si es la cara de adelante o un costado lo deja clavado ahi; si no
// llega a un muro o seria la cara de atras (que no se ve), cae muerto donde
// estaba. Deja en `cae` donde queda la lanza en el piso (a los pies del que
// mato, o donde termino el vuelo). Devuelve el hueco del que mato, o -1.
int enemigos_lanza(Enemigos *e, const Laberinto *lab, Direccion desde, Direccion hacia, float alcance,
                   Direccion *cae);

// Le sacan la lanza al enemigo `i` clavado: se cae y desaparece como
// cualquier muerto.
void enemigos_desclavar(Enemigos *e, int i);

// El vivo mas cercano a `pies`, si esta a `radio` pixeles o menos: devuelve 1
// y deja en `hacia` la direccion (unitaria) para mirarlo. 0 si no hay.
int enemigos_mas_cercano(const Enemigos *e, Direccion pies, float radio, Direccion *hacia);

// El jugador ataco: si estaba en un arbusto, se lo ve un ratito.
void enemigos_delatar(Enemigos *e);

// 1 si el jugador esta escondido en un arbusto (y no se delato).
int enemigos_jugador_escondido(const Enemigos *e);

// Con quien anda el enemigo `i`: el indice de su ronda (0..RONDAS_MAX-1),
// RONDAS_MAX + el de su manada, o -1 si anda solo.
int enemigos_grupo(const Enemigos *e, int i);

// 1 si el enemigo `i` esta hablando en su ronda.
int enemigos_habla(const Enemigos *e, int i);

#endif
