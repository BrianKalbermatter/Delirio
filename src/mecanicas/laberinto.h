// Mecanica del laberinto: generacion aleatoria, expansion y choques.
//
// El laberinto es una grilla de CELDAS. Cada celda es un pasillo cuadrado de
// LAB_PASILLO tiles, separado de sus vecinas por muros de LAB_MURO tiles.
// Abrir un paso entre dos celdas = sacar el muro que las separa.
//
// Se genera con backtracking recursivo (DFS): da un laberinto donde TODAS las
// celdas se pueden alcanzar, asi no queda espacio sin poder pisar.
//
// En el centro hay una PLAZA: un cuadrado grande y abierto, donde aparece el
// jugador, con una entrada en cada uno de sus 4 lados. Es la unica forma de
// entrar al laberinto, que la rodea. Desde cada entrada sale un pasillo
// RECTO de LAB_RECTO celdas, sin aberturas a los costados, que termina en una
// T: recien ahi empiezan los caminos. Cada entrada tiene una PUERTA de dos
// hojas que se cierran de a poco desde los costados hacia el centro: el hueco
// se achica pixel a pixel. Las hojas chocan como muros, y si alcanzan a
// alguien en el medio, lo aplastan.
//
// Crece sin mover lo que ya existe: el mundo entero (LAB_MAX_CELDAS por lado)
// esta reservado desde el principio, todo muro. El laberinto empieza como un
// anillo alrededor de la plaza y cada expansion talla otro anillo por afuera.
//
// La semilla permite repetir el mismo laberinto para pruebas.
//
// ZONAS DE LOS JEFES: la semilla elige donde va cada una, pero siempre siguen
// el mismo orden de dificultad, de la plaza hacia afuera:
//   - MEDUSAS (templo de Zeus): en una esquina del laberinto inicial, cerca de
//     la plaza: es la primera y la mas facil de encontrar.
//   - POSEIDON (Aquiles, el centauro): en la esquina opuesta, a media
//     distancia (aparece con las primeras expansiones).
//   - MINOTAURO (Hades): una GUARIDA abierta en el borde exterior del mundo,
//     en uno de los lados que no tocan la esquina de Poseidon. Es la SALIDA:
//     tiene una sola puerta, hacia el laberinto, y se talla recien cuando el
//     laberinto crecio hasta cubrirla (las ultimas expansiones). Se genere
//     como se genere el resto, el final siempre es la puerta del Minotauro.
// Por ahora las zonas solo cambian el suelo (laberinto_influencia): cuanto
// mas cerca del jefe, mas se nota. Los muros, las estructuras y los jefes
// vienen despues.
//
// EL HUECO: un pozo en la plaza, al lado de donde aparece el jugador. Hay uno
// solo y esta siempre en el mismo lugar. No se puede cruzar, ni saltando: su
// forma son filas de obstaculos, asi que choca como cualquier otro.
#ifndef LABERINTO_H
#define LABERINTO_H

#include "../entidad.h"

#define LAB_TILE 32          // pixeles por tile (igual que el arte)
#define LAB_PASILLO 8        // ancho de los pasillos, en tiles (256 px)
#define LAB_MURO 3           // grosor de los muros, en tiles
#define LAB_CELDA (LAB_PASILLO + LAB_MURO)
#define LAB_PLAZA 10         // celdas por lado de la plaza central
#define LAB_ANILLO_INICIAL 6 // celdas de laberinto alrededor de la plaza al empezar
#define LAB_RECTO 5          // largo del pasillo recto de cada entrada (menor que el anillo inicial)
#define LAB_ANILLO 2         // celdas que agrega cada expansion de cada lado
#define LAB_EXPANSIONES 7    // la primera al empezar y una por anochecer, 6 dias
#define LAB_INICIAL (LAB_PLAZA + 2 * LAB_ANILLO_INICIAL) // celdas por lado al empezar
#define LAB_MAX_CELDAS (LAB_INICIAL + 2 * LAB_ANILLO * LAB_EXPANSIONES) // tamanio final
#define LAB_TILES (LAB_MAX_CELDAS * LAB_CELDA + LAB_MURO) // tiles por lado del mundo
#define LAB_MAX_OBSTACULOS 2048 // cajas solidas sobre el piso (rocas grandes)
// Guarida del Minotauro: un salon abierto de celdas, pegado al borde del mundo.
#define LAB_GUARIDA_ANCHO 6  // celdas a lo largo del borde
#define LAB_GUARIDA_FONDO 4  // celdas hacia adentro (las 2 ultimas expansiones)
#define LAB_HADES_ALCANCE 9.0f // celdas desde la guarida en que el suelo ya se oscurece
#define LAB_ARENA 4          // celdas por lado de las arenas (Medusas, Poseidon): menos que la plaza
#define LAB_LAVA_HUECO 2     // tiles de lava entre piedra y piedra en la guarida (un salto)
#define LAB_MAX_PIEDRAS 12   // plataformas de la guarida (entrada, piedras e isla)
#define LAB_MAX_CHARCOS 160  // charcos de lava en los pasillos cerca de la guarida

// Zonas del suelo (el orden de la dificultad).
typedef enum zona {
  ZONA_LABERINTO = 0, // arena comun
  ZONA_MEDUSAS,       // templo de Zeus
  ZONA_POSEIDON,      // Aquiles, el centauro de Poseidon
  ZONA_MINOTAURO,     // Hades
  ZONA_CANTIDAD
} Zona; // cajas solidas sobre el piso (troncos de arboles)

// Rectangulo de tiles (el hueco de una puerta).
typedef struct rect_tiles {
  int col, fila, ancho, alto;
} RectTiles;

// Rectangulo en pixeles (una hoja de puerta).
typedef struct rect_px {
  float x, y, ancho, alto;
} RectPx;

// Una sala de jefe (arena o guarida), en celdas.
typedef struct sala {
  int c, f, ancho, alto;
  int tallada; // 1 cuando el laberinto ya la cubre y se puede entrar
} Sala;

// Un rectangulo de la guarida medido desde su puerta, en tiles: u a lo
// largo del borde del mundo, v hacia el fondo (0 = junto a la puerta).
typedef struct rect_local {
  int u, v, ancho, fondo;
} RectLocal;

// Un charco de lava: centro en tiles y radio (el borde es irregular).
typedef struct charco {
  int col, fila;
  float radio;
} Charco;

typedef struct laberinto {
  unsigned char muro[LAB_TILES][LAB_TILES];                  // [fila][col] 1 = muro, 0 = piso
  unsigned char abierta[LAB_MAX_CELDAS][LAB_MAX_CELDAS];     // [fila][col] celda ya tallada
  int c_min, c_max, f_min, f_max;                            // celdas activas (inclusive)
  unsigned int azar;                                         // estado del generador aleatorio
  RectTiles puertas[4];                                      // arriba, abajo, izquierda, derecha
  RectPx obstaculos[LAB_MAX_OBSTACULOS];                     // chocan como muros
  int cant_obstaculos;
  int obs_primero[LAB_MAX_CELDAS][LAB_MAX_CELDAS];           // por celda: primer obstaculo (-1: ninguno)
  int obs_siguiente[LAB_MAX_OBSTACULOS];                     // el siguiente de la misma celda
  float apertura;                                            // 1 = abiertas, 0 = cerradas
  // Zonas de los jefes (ver arriba)
  Sala salas[ZONA_CANTIDAD];                                 // por Zona (la de ZONA_LABERINTO no se usa)
  RectTiles entradas[ZONA_CANTIDAD][2];                      // los dos huecos de cada arena
  RectTiles puerta_minotauro;                                // la salida: hueco hacia la guarida
  RectTiles guarida_tiles;                                   // el piso de la guarida
  int guarida_lado;                                          // 0 arriba, 1 abajo, 2 izquierda, 3 derecha
  RectLocal piedras[LAB_MAX_PIEDRAS];                        // donde no hay lava en la guarida
  int cant_piedras;
  RectTiles isla;                                            // la ultima piedra: donde pelea el Minotauro
  Charco charcos[LAB_MAX_CHARCOS];
  int cant_charcos;
  int version;                                               // sube en cada cambio
} Laberinto;

void laberinto_iniciar(Laberinto *lab, unsigned int semilla);

// Agrega un anillo de celdas alrededor de todo el laberinto.
// Devuelve 1 si crecio, 0 si ya esta al maximo.
int laberinto_expandir(Laberinto *lab);

int laberinto_es_muro(const Laberinto *lab, int col, int fila);

// Cuanto estan abiertas las 4 puertas: 1 = del todo, 0 = cerradas.
void laberinto_apertura(Laberinto *lab, float apertura);

// Agrega una caja solida en pixeles (una roca grande): los pies chocan con
// ella como con un muro. Devuelve su numero, o -1 si ya no hay lugar.
int laberinto_agregar_obstaculo(Laberinto *lab, RectPx caja);

// Quita el obstaculo `i` (el numero que devolvio laberinto_agregar_obstaculo):
// una roca rota ya no choca. Su lugar queda para otro.
void laberinto_quitar_obstaculo(Laberinto *lab, int i);

// 1 si la caja (en pixeles) se superpone con algun obstaculo.
int laberinto_toca_obstaculo(const Laberinto *lab, RectPx caja);

// 1 si el tile es parte del hueco de una puerta.
int laberinto_es_puerta(const Laberinto *lab, int col, int fila);

// 1 si el tile es parte del hueco de la puerta del Minotauro (ya tallada).
int laberinto_es_puerta_minotauro(const Laberinto *lab, int col, int fila);

// Las 2 hojas de la puerta `i` (0..3), en pixeles, con la apertura actual.
// Cada hoja sale de un costado del hueco; abierta del todo miden 0.
void laberinto_hojas(const Laberinto *lab, int i, RectPx hojas[2]);

// Un punto adentro de la plaza, frente a la puerta `i` (0 arriba, 1 abajo,
// 2 izquierda, 3 derecha), a `distancia` pixeles de ella.
Direccion laberinto_frente_a_puerta(const Laberinto *lab, int i, float distancia);

// 1 si alguna hoja de puerta esta encima de los pies en `pos` (aplastado).
int laberinto_aplasta(const Laberinto *lab, Direccion pos);

// Cuanto pesa la zona `zona` en el suelo del tile (col, fila): 1 = de lleno,
// 0 = nada. Va bajando de a poco al alejarse, para que el suelo avise si el
// jefe esta cerca.
float laberinto_influencia(const Laberinto *lab, Zona zona, int col, int fila);

// La zona que mas pesa en el tile (ZONA_LABERINTO si ninguna).
Zona laberinto_zona(const Laberinto *lab, int col, int fila, float *influencia);

// Centro de la guarida del Minotauro, en pixeles.
Direccion laberinto_guarida(const Laberinto *lab);

// El piso de la sala del jefe de `zona`, en pixeles.
RectPx laberinto_sala_px(const Laberinto *lab, Zona zona);

// La isla del fondo de la guarida (donde pelea el Minotauro), en pixeles.
RectPx laberinto_isla_px(const Laberinto *lab);

// La sala de jefe ya tallada en la que cae el tile (ZONA_LABERINTO si ninguna).
Zona laberinto_sala(const Laberinto *lab, int col, int fila);

// LAVA: la guarida del Minotauro entera (salvo las piedras del parkour) y
// charcos en los pasillos cerca. No frena: quema al que la pisa sin saltar.
int laberinto_es_lava(const Laberinto *lab, int col, int fila);
int laberinto_pisa_lava(const Laberinto *lab, Direccion pies);

// El dibujo del hueco, en pixeles del mundo.
RectPx laberinto_hueco_px(const Laberinto *lab);

// 1 si la caja (en pixeles) toca la parte solida del hueco.
int laberinto_toca_hueco(const Laberinto *lab, RectPx caja);

// 1 si los pies en `pies` no chocan con nada (muro, puerta, obstaculo).
int laberinto_libre(const Laberinto *lab, Direccion pies);

// Centro de la plaza: donde aparece el jugador.
Direccion laberinto_aparicion(const Laberinto *lab);

// Mueve `pos` (los pies de una entidad) dx, dy pixeles chocando con los muros.
// Un eje por vez: contra un muro en diagonal, se desliza.
// Devuelve cuantos pixeles se movio de verdad.
float laberinto_mover(const Laberinto *lab, Direccion *pos, float dx, float dy);

#endif
