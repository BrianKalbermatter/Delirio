#include "laberinto.h"

#include <math.h>
#include <string.h>

// Caja de choque: solo los pies tocan el piso (vista desde arriba).
#define PIES_MEDIO_ANCHO 12.0f
#define PIES_ALTO 12.0f

// Generador aleatorio propio (xorshift32): con la misma semilla, el mismo laberinto.
static unsigned int azar(Laberinto *lab){
  unsigned int x = lab->azar;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  lab->azar = x;
  return x;
}

static int azar_hasta(Laberinto *lab, int n){
  return (int)(azar(lab) % (unsigned int)n);
}

// Primer tile (columna o fila) del piso de una celda.
static int tile_de_celda(int c){
  return c * LAB_CELDA + LAB_MURO;
}

static void tallar_rect(Laberinto *lab, int col, int fila, int ancho, int alto){
  for (int f = fila; f < fila + alto; f++)
    for (int c = col; c < col + ancho; c++)
      lab->muro[f][c] = 0;
}

static void tallar_celda(Laberinto *lab, int c, int f){
  tallar_rect(lab, tile_de_celda(c), tile_de_celda(f), LAB_PASILLO, LAB_PASILLO);
  lab->abierta[f][c] = 1;
}

// Los tiles del muro que separa dos celdas vecinas.
static RectTiles muro_entre(int c1, int f1, int c2, int f2){
  if (c1 != c2){
    int c = c1 < c2 ? c1 : c2; // el muro esta a la derecha de la celda de la izquierda
    return (RectTiles){tile_de_celda(c) + LAB_PASILLO, tile_de_celda(f1), LAB_MURO, LAB_PASILLO};
  }
  int f = f1 < f2 ? f1 : f2; // el muro esta abajo de la celda de arriba
  return (RectTiles){tile_de_celda(c1), tile_de_celda(f) + LAB_PASILLO, LAB_PASILLO, LAB_MURO};
}

static void llenar_rect(Laberinto *lab, RectTiles r, unsigned char valor){
  for (int f = r.fila; f < r.fila + r.alto; f++)
    for (int c = r.col; c < r.col + r.ancho; c++)
      lab->muro[f][c] = valor;
}

// Saca el muro entre dos celdas vecinas.
static void abrir_paso(Laberinto *lab, int c1, int f1, int c2, int f2){
  llenar_rect(lab, muro_entre(c1, f1, c2, f2), 0);
}

static int dentro(const Laberinto *lab, int c, int f){
  return c >= lab->c_min && c <= lab->c_max && f >= lab->f_min && f <= lab->f_max;
}

static const int DC[4] = {1, -1, 0, 0};
static const int DF[4] = {0, 0, 1, -1};

// Backtracking recursivo (con pila propia, sin recursion): desde (c, f) talla
// todas las celdas activas que todavia no estan abiertas.
static void tallar_desde(Laberinto *lab, int c, int f){
  static int pila_c[LAB_MAX_CELDAS * LAB_MAX_CELDAS];
  static int pila_f[LAB_MAX_CELDAS * LAB_MAX_CELDAS];
  int tope = 0;

  tallar_celda(lab, c, f);
  pila_c[tope] = c;
  pila_f[tope] = f;
  tope++;

  while (tope > 0){
    int cc = pila_c[tope - 1];
    int ff = pila_f[tope - 1];

    // Vecinos todavia cerrados
    int opciones[4];
    int n = 0;
    for (int d = 0; d < 4; d++){
      int nc = cc + DC[d];
      int nf = ff + DF[d];
      if (dentro(lab, nc, nf) && !lab->abierta[nf][nc]) opciones[n++] = d;
    }

    if (n == 0){
      tope--; // callejon sin salida: volver atras
      continue;
    }

    int d = opciones[azar_hasta(lab, n)];
    int nc = cc + DC[d];
    int nf = ff + DF[d];
    abrir_paso(lab, cc, ff, nc, nf);
    tallar_celda(lab, nc, nf);
    pila_c[tope] = nc;
    pila_f[tope] = nf;
    tope++;
  }
}

// Primera y ultima celda de la plaza (por lado).
static int plaza_desde(void){ return LAB_MAX_CELDAS / 2 - LAB_PLAZA / 2; }
static int plaza_hasta(void){ return plaza_desde() + LAB_PLAZA - 1; }

// La plaza: las celdas del centro talladas como un solo cuadrado abierto
// (sin muros entre ellas), con una entrada con puerta en el medio de cada lado.
static void tallar_plaza(Laberinto *lab){
  int p0 = plaza_desde();
  int p1 = plaza_hasta();
  int medio = p0 + LAB_PLAZA / 2; // con LAB_PLAZA par, queda media celda corrida

  for (int f = p0; f <= p1; f++)
    for (int c = p0; c <= p1; c++)
      lab->abierta[f][c] = 1; // el DFS no las toca

  int desde = tile_de_celda(p0);
  int lado = tile_de_celda(p1) + LAB_PASILLO - desde;
  tallar_rect(lab, desde, desde, lado, lado);

  // Las 4 entradas, con su puerta (empiezan abiertas: el juego arranca de dia).
  // El hueco queda tallado; las hojas se resuelven aparte, al pixel.
  lab->puertas[0] = muro_entre(medio, p0, medio, p0 - 1); // arriba
  lab->puertas[1] = muro_entre(medio, p1, medio, p1 + 1); // abajo
  lab->puertas[2] = muro_entre(p0, medio, p0 - 1, medio); // izquierda
  lab->puertas[3] = muro_entre(p1, medio, p1 + 1, medio); // derecha
  for (int i = 0; i < 4; i++) llenar_rect(lab, lab->puertas[i], 0);
  lab->apertura = 1.0f;
}

// Desde cada puerta, un pasillo recto hacia afuera, sin aberturas a los
// costados, que termina en una T (izquierda y derecha).
static void tallar_rectas(Laberinto *lab){
  int p0 = plaza_desde();
  int p1 = plaza_hasta();
  int medio = p0 + LAB_PLAZA / 2;

  // Celda de la plaza junto a cada puerta (arriba, abajo, izquierda, derecha)
  // y hacia donde sale el pasillo
  int desde_c[4] = {medio, medio, p0, p1};
  int desde_f[4] = {p0, p1, medio, medio};
  int paso_c[4]  = {0, 0, -1, 1};
  int paso_f[4]  = {-1, 1, 0, 0};

  for (int i = 0; i < 4; i++){
    int c = desde_c[i];
    int f = desde_f[i];
    for (int k = 0; k < LAB_RECTO; k++){
      c += paso_c[i];
      f += paso_f[i];
      tallar_celda(lab, c, f); // queda abierta: el DFS no la toca ni le abre costados
      if (k > 0) abrir_paso(lab, c - paso_c[i], f - paso_f[i], c, f);
    }
    // La T al final: los dos costados (perpendicular al pasillo). Se abren los
    // dos para que todas las partes del anillo queden conectadas.
    abrir_paso(lab, c, f, c + paso_f[i], f + paso_c[i]);
    abrir_paso(lab, c, f, c - paso_f[i], f - paso_c[i]);
  }
}

void laberinto_iniciar(Laberinto *lab, unsigned int semilla){
  memset(lab->muro, 1, sizeof lab->muro);
  memset(lab->abierta, 0, sizeof lab->abierta);
  lab->azar = semilla ? semilla : 1; // xorshift no puede arrancar en 0
  lab->version = 0;
  lab->cant_obstaculos = 0;

  lab->c_min = lab->f_min = LAB_MAX_CELDAS / 2 - LAB_INICIAL / 2;
  lab->c_max = lab->f_max = lab->c_min + LAB_INICIAL - 1;

  tallar_plaza(lab);
  tallar_rectas(lab);
  // El laberinto: el resto del anillo alrededor de la plaza. Los pasillos
  // rectos lo cortan en partes, asi que se talla cada parte por separado
  // (cada una queda conectada por la T de los pasillos a sus costados).
  for (int f = lab->f_min; f <= lab->f_max; f++)
    for (int c = lab->c_min; c <= lab->c_max; c++)
      if (!lab->abierta[f][c]) tallar_desde(lab, c, f);
  lab->version++;
}

int laberinto_expandir(Laberinto *lab){
  if (lab->c_min - LAB_ANILLO < 0 || lab->c_max + LAB_ANILLO > LAB_MAX_CELDAS - 1) return 0;

  int viejo_c_min = lab->c_min, viejo_c_max = lab->c_max;
  int viejo_f_min = lab->f_min, viejo_f_max = lab->f_max;
  lab->c_min -= LAB_ANILLO;
  lab->c_max += LAB_ANILLO;
  lab->f_min -= LAB_ANILLO;
  lab->f_max += LAB_ANILLO;

  // Celdas nuevas pegadas al laberinto viejo: por ahi se conectan
  static int borde_c[4 * LAB_MAX_CELDAS], borde_f[4 * LAB_MAX_CELDAS];
  static int viejo_c[4 * LAB_MAX_CELDAS], viejo_f[4 * LAB_MAX_CELDAS];
  int n = 0;
  for (int c = viejo_c_min; c <= viejo_c_max; c++){
    borde_c[n] = c; borde_f[n] = viejo_f_min - 1; viejo_c[n] = c; viejo_f[n] = viejo_f_min; n++;
    borde_c[n] = c; borde_f[n] = viejo_f_max + 1; viejo_c[n] = c; viejo_f[n] = viejo_f_max; n++;
  }
  for (int f = viejo_f_min; f <= viejo_f_max; f++){
    borde_c[n] = viejo_c_min - 1; borde_f[n] = f; viejo_c[n] = viejo_c_min; viejo_f[n] = f; n++;
    borde_c[n] = viejo_c_max + 1; borde_f[n] = f; viejo_c[n] = viejo_c_max; viejo_f[n] = f; n++;
  }

  // Talla todo el anillo nuevo desde una de esas celdas, conectada al viejo
  int k = azar_hasta(lab, n);
  abrir_paso(lab, borde_c[k], borde_f[k], viejo_c[k], viejo_f[k]);
  tallar_desde(lab, borde_c[k], borde_f[k]);

  // Mas pasos entre el anillo nuevo y el viejo, asi hay varios caminos
  for (int extra = 0; extra < 3; extra++){
    k = azar_hasta(lab, n);
    abrir_paso(lab, borde_c[k], borde_f[k], viejo_c[k], viejo_f[k]);
  }

  lab->version++;
  return 1;
}

void laberinto_apertura(Laberinto *lab, float apertura){
  lab->apertura = apertura < 0 ? 0 : apertura > 1 ? 1 : apertura;
}

void laberinto_hojas(const Laberinto *lab, int i, RectPx hojas[2]){
  RectTiles r = lab->puertas[i];
  float x = r.col * LAB_TILE, y = r.fila * LAB_TILE;
  float ancho = r.ancho * LAB_TILE, alto = r.alto * LAB_TILE;
  float cerrado = 1.0f - lab->apertura;
  if (ancho > alto){ // hueco horizontal: las hojas corren de izquierda y derecha
    float largo = ancho * cerrado / 2;
    hojas[0] = (RectPx){x, y, largo, alto};
    hojas[1] = (RectPx){x + ancho - largo, y, largo, alto};
  } else {           // hueco vertical: las hojas corren de arriba y abajo
    float largo = alto * cerrado / 2;
    hojas[0] = (RectPx){x, y, ancho, largo};
    hojas[1] = (RectPx){x, y + alto - largo, ancho, largo};
  }
}

static int se_tocan(RectPx a, float izq, float arriba, float der, float abajo){
  return a.ancho > 0 && a.alto > 0 &&
         izq < a.x + a.ancho && der > a.x && arriba < a.y + a.alto && abajo > a.y;
}

// 1 si la caja (en pixeles) toca alguna hoja de puerta
static int caja_toca_hoja(const Laberinto *lab, float izq, float arriba, float der, float abajo){
  if (lab->apertura >= 1.0f) return 0;
  for (int i = 0; i < 4; i++){
    RectPx hojas[2];
    laberinto_hojas(lab, i, hojas);
    if (se_tocan(hojas[0], izq, arriba, der, abajo) || se_tocan(hojas[1], izq, arriba, der, abajo))
      return 1;
  }
  return 0;
}

static int en_rect(RectTiles r, int col, int fila){
  return col >= r.col && col < r.col + r.ancho && fila >= r.fila && fila < r.fila + r.alto;
}

int laberinto_es_puerta(const Laberinto *lab, int col, int fila){
  for (int i = 0; i < 4; i++)
    if (en_rect(lab->puertas[i], col, fila)) return 1;
  return 0;
}

int laberinto_es_muro(const Laberinto *lab, int col, int fila){
  if (col < 0 || fila < 0 || col >= LAB_TILES || fila >= LAB_TILES) return 1;
  return lab->muro[fila][col];
}

Direccion laberinto_aparicion(const Laberinto *lab){
  // El centro exacto del cuadrado de la plaza
  float desde = tile_de_celda(plaza_desde());
  float hasta = tile_de_celda(plaza_hasta()) + LAB_PASILLO;
  float centro = (desde + hasta) / 2.0f * LAB_TILE;
  (void)lab;
  return (Direccion){centro, centro};
}

// 1 si una caja (en pixeles) toca algun muro
static int caja_toca_muro(const Laberinto *lab, float izq, float arriba, float der, float abajo){
  int c0 = (int)floorf(izq / LAB_TILE);
  int c1 = (int)floorf((der - 1) / LAB_TILE);
  int f0 = (int)floorf(arriba / LAB_TILE);
  int f1 = (int)floorf((abajo - 1) / LAB_TILE);
  for (int f = f0; f <= f1; f++)
    for (int c = c0; c <= c1; c++)
      if (laberinto_es_muro(lab, c, f)) return 1;
  return 0;
}

int laberinto_agregar_obstaculo(Laberinto *lab, RectPx caja){
  if (lab->cant_obstaculos >= LAB_MAX_OBSTACULOS) return 0;
  lab->obstaculos[lab->cant_obstaculos++] = caja;
  return 1;
}

// 1 si una caja (en pixeles) se superpone con algun obstaculo
static int caja_toca_obstaculo(const Laberinto *lab, float izq, float arriba, float der, float abajo){
  for (int i = 0; i < lab->cant_obstaculos; i++){
    RectPx o = lab->obstaculos[i];
    if (izq < o.x + o.ancho && der > o.x && arriba < o.y + o.alto && abajo > o.y) return 1;
  }
  return 0;
}

static int pies_chocan(const Laberinto *lab, float x, float y){
  float izq = x - PIES_MEDIO_ANCHO, arriba = y - PIES_ALTO, der = x + PIES_MEDIO_ANCHO;
  return caja_toca_muro(lab, izq, arriba, der, y) || caja_toca_hoja(lab, izq, arriba, der, y) ||
         caja_toca_obstaculo(lab, izq, arriba, der, y);
}

Direccion laberinto_frente_a_puerta(const Laberinto *lab, int i, float distancia){
  RectTiles r = lab->puertas[i];
  float cx = (r.col + r.ancho / 2.0f) * LAB_TILE;
  float cy = (r.fila + r.alto / 2.0f) * LAB_TILE;
  float mitad_x = r.ancho * LAB_TILE / 2.0f, mitad_y = r.alto * LAB_TILE / 2.0f;
  switch (i){ // hacia adentro de la plaza
    case 0:  return (Direccion){cx, cy + mitad_y + distancia + PIES_ALTO};
    case 1:  return (Direccion){cx, cy - mitad_y - distancia};
    case 2:  return (Direccion){cx + mitad_x + distancia + PIES_MEDIO_ANCHO, cy};
    default: return (Direccion){cx - mitad_x - distancia - PIES_MEDIO_ANCHO, cy};
  }
}

int laberinto_aplasta(const Laberinto *lab, Direccion pos){
  return caja_toca_hoja(lab, pos.x - PIES_MEDIO_ANCHO, pos.y - PIES_ALTO, pos.x + PIES_MEDIO_ANCHO, pos.y);
}

float laberinto_mover(const Laberinto *lab, Direccion *pos, float dx, float dy){
  float antes_x = pos->x;
  float antes_y = pos->y;
  if (!pies_chocan(lab, pos->x + dx, pos->y)) pos->x += dx;
  if (!pies_chocan(lab, pos->x, pos->y + dy)) pos->y += dy;
  return sqrtf((pos->x - antes_x) * (pos->x - antes_x) + (pos->y - antes_y) * (pos->y - antes_y));
}
