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
#ifndef LABERINTO_H
#define LABERINTO_H

#include "../entidad.h"

#define LAB_TILE 32          // pixeles por tile (igual que el arte)
#define LAB_PASILLO 6        // ancho de los pasillos, en tiles
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
#define LAB_MAX_OBSTACULOS 512 // cajas solidas sobre el piso (troncos de arboles)

// Rectangulo de tiles (el hueco de una puerta).
typedef struct rect_tiles {
  int col, fila, ancho, alto;
} RectTiles;

// Rectangulo en pixeles (una hoja de puerta).
typedef struct rect_px {
  float x, y, ancho, alto;
} RectPx;

typedef struct laberinto {
  unsigned char muro[LAB_TILES][LAB_TILES];                  // [fila][col] 1 = muro, 0 = piso
  unsigned char abierta[LAB_MAX_CELDAS][LAB_MAX_CELDAS];     // [fila][col] celda ya tallada
  int c_min, c_max, f_min, f_max;                            // celdas activas (inclusive)
  unsigned int azar;                                         // estado del generador aleatorio
  RectTiles puertas[4];                                      // arriba, abajo, izquierda, derecha
  RectPx obstaculos[LAB_MAX_OBSTACULOS];                     // chocan como muros
  int cant_obstaculos;
  float apertura;                                            // 1 = abiertas, 0 = cerradas
  int version;                                               // sube en cada cambio
} Laberinto;

void laberinto_iniciar(Laberinto *lab, unsigned int semilla);

// Agrega un anillo de celdas alrededor de todo el laberinto.
// Devuelve 1 si crecio, 0 si ya esta al maximo.
int laberinto_expandir(Laberinto *lab);

int laberinto_es_muro(const Laberinto *lab, int col, int fila);

// Cuanto estan abiertas las 4 puertas: 1 = del todo, 0 = cerradas.
void laberinto_apertura(Laberinto *lab, float apertura);

// Agrega una caja solida en pixeles (un tronco): los pies chocan con ella
// como con un muro. Devuelve 0 si ya no hay lugar para otra.
int laberinto_agregar_obstaculo(Laberinto *lab, RectPx caja);

// 1 si el tile es parte del hueco de una puerta.
int laberinto_es_puerta(const Laberinto *lab, int col, int fila);

// Las 2 hojas de la puerta `i` (0..3), en pixeles, con la apertura actual.
// Cada hoja sale de un costado del hueco; abierta del todo miden 0.
void laberinto_hojas(const Laberinto *lab, int i, RectPx hojas[2]);

// Un punto adentro de la plaza, frente a la puerta `i` (0 arriba, 1 abajo,
// 2 izquierda, 3 derecha), a `distancia` pixeles de ella.
Direccion laberinto_frente_a_puerta(const Laberinto *lab, int i, float distancia);

// 1 si alguna hoja de puerta esta encima de los pies en `pos` (aplastado).
int laberinto_aplasta(const Laberinto *lab, Direccion pos);

// Centro de la plaza: donde aparece el jugador.
Direccion laberinto_aparicion(const Laberinto *lab);

// Mueve `pos` (los pies de una entidad) dx, dy pixeles chocando con los muros.
// Un eje por vez: contra un muro en diagonal, se desliza.
// Devuelve cuantos pixeles se movio de verdad.
float laberinto_mover(const Laberinto *lab, Direccion *pos, float dx, float dy);

#endif
