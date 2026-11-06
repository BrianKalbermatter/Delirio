// Enemigos de nivel 1 (concept/Mecanicas.md, "Personalidad del nivel 1"):
// tontos y con miedo. Sin ver al jugador dan vueltas al azar. Cuando lo ven
// no van derecho: se le acercan de costado, dando vueltas largas, y si se
// les acerca mucho escapan. Pero quieren matarlo: juntan coraje mientras lo
// miran (mas rapido si el jugador esta distraido o de espaldas) y cuando
// alcanza, se le tiran encima, pegan una vez y vuelven a escapar.
//
// LAS HOGUERAS: de ahi sale todo. Cada ronda baila alrededor de una hoguera,
// gritando para no escuchar el llanto de Zeus. Se la puede romper a golpes
// (y tiene vida de sobra): rota, en esa zona no aparece nadie mas. Cada
// expansion del laberinto enciende otra, mas afuera.
//
// Hay cuatro clases de enemigo (TipoEnemigo):
//   - Espartanos: los de nivel 1, los que bailan en las rondas.
//   - Fantasmas: flotan y no tienen miedo. Bailan en las hogueras embrujadas
//     y salen de cualquier hoguera a deambular. No se acercan: levantan el
//     brazo y le dejan caer algo encima; la sombra en el piso avisa donde.
//   - Espiritus: como los fantasmas, pero se quedan lejos y tiran sombras
//     (Enemigos.tiros).
//   - Esqueletos: se levantan de algunos espartanos muertos y caminan derecho
//     al jugador, despacio, sin asustarse. Algunos ya estaban ahi, tirados
//     como otra pila de huesos, y se levantan cuando el jugador pasa cerca.
//     De cerca se agachan y se le tiran encima; caen mal y tardan en pararse.
//   - La rueda: esqueleto grande que se levanta de los huesos del bosque oscuro
//     de la plaza (enemigos_huesos_bosque). Lento y duro. Se planta, levanta
//     el brazo y tira dos manotazos: despues se queda agitado, para devolverle.
//   - Aquiles, el centauro, baja la lanza y embiste en linea recta. Si no te
//     corres te lleva puesto; despues se queda agitado un rato.
//   - Medusa, jefa de su sala, tira flechas y mantiene la distancia, y las
//     meducitas la cuidan: tiran flechas y no salen de la sala mientras viva.
//
// Un golpe mata: sin armadura el jugador no aguanta ninguno, con armadura
// GOLPES_CON_ARMADURA. Cubierto con el escudo, las sombras rebotan y lastiman
// al enemigo mas cercano.
//
// Y segun con quien andan:
//   - Sueltos: los fantasmas y espiritus que salen de la hoguera mas cercana
//     al jugador (y lejos de su vista). Tiran para la plaza y, adentro, dan
//     vueltas, y si el jugador anda cerca lo buscan, hasta que lo pierden y
//     se olvidan un rato. De dia son pocos; a
//     medida que pasa la noche salen mas y mas seguido, cada dia un poco mas,
//     y al amanecer los que sobran vuelven al fuego. Cuanto mas tiempo pasa el
//     jugador en el laberinto, mas salen a buscarlo; en la plaza se le pasa.
//     Sin hogueras, ninguno.
//   - Paseantes: espiritus y espartanos que salen de una hoguera cualquiera y
//     andan por el laberinto a toda hora, sin buscar a nadie, hasta que ven al
//     jugador.
//   - Manadas: unos que andan juntos. El primero manda (caza: tira para donde
//     esta el jugador) y los otros lo siguen. Si uno ve al jugador, acecha
//     toda la manada.
//   - Rondas: pocos, dando vueltas alrededor de su hoguera, gritando de a uno.
//     Estan distraidos: ven poco. Si uno ve al jugador o lo lastiman (a el o a
//     la hoguera), se alerta la ronda entera. Cuando se calman vuelven a
//     bailar. Sin hoguera quedan sueltos, y el que muere no vuelve.
//
// Y arbustos (arbustos.h): el jugador escondido en uno no se ve.
//
// LA PLAZA: ningun enemigo nace ni reaparece adentro. Al principio (la
// tregua, ver enemigos_plaza_permitida) casi no entran: se frenan en las
// puertas y solo se cuelan unos pocos, asi el jugador junta recursos y se
// prepara con algun susto. Despues, mientras las puertas estan abiertas, los
// que deambulan van entrando.
//
// JEFES: uno por sala de jefe (laberinto.h), en los ultimos huecos de la
// lista. Por ahora son espartanos mas grandes (hasta que lleguen sus
// sprites). Aparecen cuando su sala se talla y esperan quietos; al entrar el
// jugador a la sala empieza el combate: lo persiguen sin salir de la sala
// (el Minotauro, sin salir de su isla), cargan el golpe un momento (se ve) y
// pegan fuerte. No se asustan ni escapan. Si el jugador se va de la sala un
// rato, vuelven a su lugar y se curan. Muertos no vuelven.
#ifndef ENEMIGOS_H
#define ENEMIGOS_H

#include "../entidad.h"
#include "arbustos.h"
#include "jugador.h"
#include "laberinto.h"

#define ENEMIGOS_MAX 208
#define RONDAS_MAX 20  // rondas (una por hoguera: entran en los bits de hogueras_apagadas)
#define RONDA_MAX 4    // enemigos por ronda, como mucho
#define MANADAS_MAX 6
#define MANADA_MAX 4   // enemigos por manada, como mucho
#define JEFES (ZONA_CANTIDAD - 1) // uno por sala (Medusas, Poseidon, Minotauro)
#define EXPERIENCIA_JEFE 250
#define EXPERIENCIA_HOGUERA 100
#define GOLPES_CON_ARMADURA 3 // los que aguanta con armadura; sin ella, uno
#define TIROS_MAX 16   // sombras y flechas en el aire a la vez
#define HUESOS_BOSQUE_MAX 32

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
  ANIMO_CHARLA    // en su ronda, bailando y gritando: distraido
} Animo;

// Que es. Una hoguera tambien va en la lista: asi le llegan los golpes, la
// lanza y el pegar solo como a cualquiera (no se mueve ni piensa).
typedef enum tipo_enemigo {
  ENEMIGO_ESPARTANO, ENEMIGO_FANTASMA, ENEMIGO_ESPIRITU, ENEMIGO_ESQUELETO, ENEMIGO_HOGUERA,
  ENEMIGO_MEDUSA,   // la jefa de su sala: tira flechas
  ENEMIGO_MEDUCITA, // las chicas de su sala: tiran flechas desde lejos
  ENEMIGO_RUEDA,    // el de la rueda: se levanta de los huesos del bosque de la plaza
  ENEMIGO_CENTAURO  // Aquiles, jefe de la sala de Poseidon: embiste con la lanza
} TipoEnemigo;

// Lo que lleva encima y suelta al morir, ademas de sus monedas. Pocas veces
// lleva algo (ver BOTIN_*_POR_100 en enemigos.c).
typedef enum botin {
  BOTIN_NADA, BOTIN_POCION, BOTIN_ESPADA, BOTIN_RAMA
} Botin;

// El arma que lleva en la mano (se ve), y que a veces suelta al morir
// (ver ARMA_*_POR_100 y ARMA_SUELTA_POR_100 en enemigos.c).
typedef enum arma_enemigo {
  ARMA_NINGUNA, ARMA_LANZA, ARMA_ANTORCHA, ARMA_HACHA
} ArmaEnemigo;

// Un ataque de los que se detienen a pegar: avisa, pega y queda abierto.
typedef enum fase_ataque {
  ATAQUE_NADA, ATAQUE_PREPARA, ATAQUE_PEGA, ATAQUE_RECUPERA
} FaseAtaque;

typedef struct enemigo {
  TipoEnemigo tipo;
  Entity entidad;      // posicion = los pies; dir = hacia donde se mueve
  Direccion mira;      // hacia donde mira (al jugador mientras acecha)
  Animo animo;
  int activo;          // 0: hueco libre en la lista (esperando reaparecer)
  float rumbo_ms;      // cuanto le queda al rumbo actual al deambular
  float animo_ms;      // tiempo en el animo actual
  float coraje;        // sube mientras acecha; al llegar a `valor` ataca
  float valor;         // cuanto coraje necesita este enemigo (cada uno distinto)
  int lado;            // +1 o -1: de que costado rodea al jugador
  int cazando;         // 1: suelto que va por los pasillos hacia el jugador
  float desinteres_ms; // > 0 despues de perderlo de vista: no lo busca
  int es_paseante;     // 1: anda por el laberinto sin buscar a nadie
  TipoEnemigo paseante; // y sale de la hoguera siendo esto
  int tirado;          // 1: esqueleto tirado como pila de huesos, esperando al jugador
  int guardia;         // 1: meducita, se queda en la sala de Medusa
  int de_bosque;       // 1: el de la rueda, vuelve de los huesos del bosque
  float golpeado_ms;   // > 0 justo despues de recibir un golpe (para el parpadeo)
  float muerto_ms;     // > 0 mientras esta MUERTO: cuenta hasta desaparecer
  Clavado clavado;     // muerto clavado a un muro por una lanza
  float reaparece_ms;  // > 0 mientras el hueco espera a otro enemigo
  // Con quien anda (-1: con nadie). Se mantiene aunque muera y reaparezca.
  int ronda;           // indice en Enemigos.rondas
  int asiento;         // su lugar en el circulo de la ronda
  int manada;          // indice en Enemigos.manadas
  float naciendo_ms;   // > 0 mientras aparece o se levanta: todavia no hace nada
  float tiro_ms;       // espiritu: hasta su proxima sombra; esqueleto: hasta su proximo ataque
  float lanzando_ms;   // > 0 mientras el espiritu prepara la sombra
  FaseAtaque fase;     // espartano, fantasma, esqueleto y rueda (enemigos.c, ATAQUE)
  float fase_ms;       // lo que le queda a la fase
  // Lo que suelta al morir (se elige al nacer)
  Botin botin;
  int monedas;         // 1 a 3
  ArmaEnemigo arma;
  int suelta_arma;     // 1: al morir deja el arma en el piso
  // Jefes (los demas tienen jefe = ZONA_LABERINTO)
  Zona jefe;           // de que sala es jefe
  int despierto;       // 1 peleando con el jugador
  float carga_ms;      // > 0 mientras carga el golpe (al llegar a 0, pega)
  float espera_ms;     // hasta que puede cargar otro golpe
  float afuera_ms;     // cuanto hace que el jugador salio de su sala
  float embiste_ms;    // > 0 mientras el centauro embiste
  Direccion embiste;   // para donde (y para donde salta el esqueleto)
  int embiste_pego;    // 1: ya le pego en esta embestida (o en este ataque)
} Enemigo;

// Un grupo bailando en circulo alrededor de la hoguera de `centro`.
typedef struct ronda {
  Direccion centro;
  int miembros[RONDA_MAX]; // huecos de la lista
  int cant;
  int hoguera;    // su hueco en la lista
  int embrujada;  // 1: la bailan fantasmas y espiritus; 0: espartanos
  int apagada;    // 1: rota. No vuelve nadie
  int obstaculo;  // la caja solida de la hoguera (-1: sin poner)
  int habla;      // hueco del que grita ahora (-1: toman aire)
  float turno_ms; // cuanto le queda al grito (o al silencio)
  float giro;     // angulo del circulo, en radianes
  float sentido;  // +1, -1 o 0: para donde gira ahora
  float paso_ms;  // hasta que cambie de sentido
} Ronda;

// Una sombra tirada por un espiritu, una flecha de medusa o lo que un fantasma
// deja caer: eso no vuela, baja sobre `posicion` y estalla al tocar el piso.
typedef struct tiro {
  int activo;
  int flecha;     // 1: flecha de medusa; 0: sombra de espiritu
  int rebotado;   // 1: volvio del escudo y ahora lastima enemigos
  int cae;        // 1: viene de arriba, tirado por un fantasma
  Direccion posicion, dir;
  float vuelo_ms; // cuanto le queda antes de deshacerse
} Tiro;

// Una manada: el primero vivo de `miembros` es el que manda.
typedef struct manada {
  int miembros[MANADA_MAX];
  int cant;
} Manada;

typedef struct enemigos {
  Enemigo lista[ENEMIGOS_MAX];
  unsigned int azar;
  unsigned int azar_hogueras; // aparte: al cargar se encienden las mismas en los mismos lugares
  Direccion plaza; // centro de la plaza, hacia donde tiran al deambular
  int atacando;    // cuantos se estan tirando encima del jugador ahora
  Ronda rondas[RONDAS_MAX];
  int cant_rondas;
  Manada manadas[MANADAS_MAX];
  int cant_manadas;
  Tiro tiros[TIROS_MAX];
  Direccion huesos_bosque[HUESOS_BOSQUE_MAX]; // de donde se levanta el de la rueda
  int cant_huesos_bosque;
  Arbustos arbustos;
  int arbusto_jugador; // en que arbusto esta el jugador (-1: en ninguno)
  float delatado_ms;   // > 0: pego desde un arbusto y se lo ve igual
  int muertos;         // cuantos mato el jugador en total (para su experiencia)
  int jefes_muertos;   // cuantos jefes mato (dan EXPERIENCIA_JEFE cada uno)
  int hogueras_rotas;  // cuantas rompio (dan EXPERIENCIA_HOGUERA cada una)
  int vencidos;        // bit (1 << zona) por cada jefe ya vencido: no vuelve
  int combate;         // hueco del jefe peleando con el jugador (-1: ninguno)
  int plaza_permitida; // 0 durante la tregua: casi no entran a la plaza
  int colados;         // cuantos se colaron a la plaza durante la tregua
  float noche;         // cuan vieja esta la noche (0..1, ver reloj_noche)
  int dia;             // que dia es: cada uno trae mas sueltos
  float salida_ms;     // hasta que salga otra tanda de una hoguera
  int tanda;           // de cuantos es la que viene
  int sueltos;         // cuantos andan ahora
  float laberinto_ms;  // cuanto lleva el jugador en el laberinto (baja en la plaza)
  // Pasos de celda en celda hasta el jugador (-1: no se llega), para que los
  // sueltos lo encuentren por los pasillos. Se traza cada tanto.
  short ruta[LAB_MAX_CELDAS][LAB_MAX_CELDAS];
  float ruta_ms;       // hasta que se trace de nuevo
} Enemigos;

// Pone las hogueras con sus rondas y los arbustos. Los sueltos van saliendo de
// las hogueras de a poco.
void enemigos_iniciar(Enemigos *e, const Laberinto *lab, Direccion jugador, unsigned int semilla);

// El laberinto acaba de crecer: enciende una hoguera en lo nuevo (si entra).
void enemigos_nueva_hoguera(Enemigos *e, const Laberinto *lab);

// Las hogueras encendidas son solidas y las rotas no: pone o quita sus cajas.
void enemigos_hogueras_solidas(Enemigos *e, Laberinto *lab);

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

// Una lanza tirada desde `desde` hacia `hacia`: vuela derecho hasta
// `alcance` pixeles o hasta un muro, y mata al primer vivo que cruza. Se lo
// lleva ensartado hasta donde termina el vuelo: si ahi la lanza da contra la
// cara de adelante de un muro o contra un costado, lo deja clavado; si no
// (sin muro, la cara de atras, una esquina, una puerta), cae muerto donde le
// dio. Deja en `impacto` donde le dio (o donde termino el vuelo) y en `cae`
// donde queda la lanza en el piso. Con `probar` solo dice que pasaria, sin
// tocar a nadie. Devuelve el hueco del que mato (o mataria), o -1.
int enemigos_lanza(Enemigos *e, const Laberinto *lab, Direccion desde, Direccion hacia, float alcance,
                   int probar, Direccion *impacto, Direccion *cae);

// Le sacan la lanza al enemigo `i` clavado: se cae y desaparece como
// cualquier muerto.
void enemigos_desclavar(Enemigos *e, int i);

// El vivo mas cercano a `pies`, si esta a `radio` pixeles o menos: devuelve
// su hueco y deja en `hacia` la direccion (unitaria) para mirarlo. -1 si no hay.
int enemigos_mas_cercano(const Enemigos *e, Direccion pies, float radio, Direccion *hacia);

// 1 si el enemigo `i` esta vivo.
int enemigos_vivo(const Enemigos *e, int i);

// Un golpe solo al enemigo `i` (como los del jugador: si sobrevive escapa y
// su grupo se alerta). Devuelve 1 si le pego.
int enemigos_golpe_a(Enemigos *e, int i, int danio);

// Lo que cae: a que altura va (1 arriba, 0 en el piso) y cuanto lleva de
// estallido (0 a 1, despues de tocar el piso).
float enemigos_tiro_altura(const Tiro *t);
float enemigos_tiro_estalla(const Tiro *t);

// El jugador ataco: si estaba en un arbusto, se lo ve un ratito.
void enemigos_delatar(Enemigos *e);

// 1 si el jugador esta escondido en un arbusto (y no se delato).
int enemigos_jugador_escondido(const Enemigos *e);

// Con quien anda el enemigo `i`: el indice de su ronda (0..RONDAS_MAX-1),
// RONDAS_MAX + el de su manada, o -1 si anda solo.
int enemigos_grupo(const Enemigos *e, int i);

// 1 si el enemigo `i` esta gritando en su ronda.
int enemigos_habla(const Enemigos *e, int i);

// De `pies` al borde del cuerpo del enemigo `i` (un jefe es grande).
float enemigos_distancia(const Enemigos *e, int i, Direccion pies);

// Cuanto mas grande que un espartano se dibuja el enemigo `i` (1 = normal).
float enemigos_escala(const Enemigos *e, int i);

// Que parte del golpe cargo el jefe `i` (0..1; 0 si no esta cargando).
float enemigos_carga(const Enemigos *e, int i);

// Si los enemigos pueden entrar a la plaza (0: tregua, se frenan en las puertas
// salvo unos pocos que se cuelan).
void enemigos_plaza_permitida(Enemigos *e, int si);

// Una pila de huesos en el bosque de la plaza (la pone el navegador, que sabe
// donde esta el bosque): de ahi se levanta el de la rueda.
void enemigos_hueso_bosque(Enemigos *e, Direccion lugar);

// Cuan vieja esta la noche (0..1) y que dia es: cuanto mas, mas enemigos salen
// de las hogueras.
void enemigos_noche(Enemigos *e, float noche, int dia);

// Jefes ya vencidos (bits 1 << Zona), para guardar la partida y cargarla.
void enemigos_cargar_vencidos(Enemigos *e, int vencidos);

// Hogueras rotas (bit k: la ronda k), para guardar la partida y cargarla.
int enemigos_hogueras_apagadas(const Enemigos *e);
void enemigos_cargar_hogueras(Enemigos *e, int apagadas);

#endif
