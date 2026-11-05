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

// ---------------------------------------------------------------------------
// Zonas de los jefes

#define ZONA_BORDE 2.5f   // celdas desde una arena hasta donde su suelo se nota
#define CHARCO_HADES 0.35f // desde esta influencia de Hades puede haber charcos de lava
#define CHARCO_POR_100 60  // % de esas celdas con un charco

// La sala (arena o guarida) en la que esta la celda, o ZONA_LABERINTO.
static Zona sala_de_celda(const Laberinto *lab, int c, int f){
  for (int z = ZONA_LABERINTO + 1; z < ZONA_CANTIDAD; z++){
    const Sala *s = &lab->salas[z];
    if (c >= s->c && c < s->c + s->ancho && f >= s->f && f < s->f + s->alto) return (Zona)z;
  }
  return ZONA_LABERINTO;
}

static int en_sala(const Laberinto *lab, int c, int f){
  return sala_de_celda(lab, c, f) != ZONA_LABERINTO;
}

// Una sala de `ancho` x `alto` celdas desde (c, f), reservada: el DFS no la
// toca, y sigue siendo muro hasta que se talla.
static void reservar_sala(Laberinto *lab, Zona z, int c, int f, int ancho, int alto){
  lab->salas[z] = (Sala){c, f, ancho, alto, 0};
  for (int ff = f; ff < f + alto; ff++)
    for (int cc = c; cc < c + ancho; cc++)
      lab->abierta[ff][cc] = 1;
}

// Una arena cuadrada de LAB_ARENA celdas centrada en (centro, centro) de
// celdas, con sus dos entradas en los lados que miran a la plaza (asi es
// facil llegar).
static void reservar_arena(Laberinto *lab, Zona z, float centro_c, float centro_f){
  int c = (int)(centro_c + 0.5f) - LAB_ARENA / 2;
  int f = (int)(centro_f + 0.5f) - LAB_ARENA / 2;
  reservar_sala(lab, z, c, f, LAB_ARENA, LAB_ARENA);
  int medio = LAB_ARENA / 2;
  int hacia_c = c < LAB_MAX_CELDAS / 2 ? 1 : -1; // hacia la plaza
  int hacia_f = f < LAB_MAX_CELDAS / 2 ? 1 : -1;
  int borde_c = hacia_c > 0 ? c + LAB_ARENA - 1 : c;
  int borde_f = hacia_f > 0 ? f + LAB_ARENA - 1 : f;
  lab->entradas[z][0] = muro_entre(borde_c, f + medio, borde_c + hacia_c, f + medio);
  lab->entradas[z][1] = muro_entre(c + medio, borde_f, c + medio, borde_f + hacia_f);
}

// Pasa un rectangulo de la guarida, medido desde la puerta (u a lo largo del
// borde, v hacia el fondo), a tiles del mundo.
static RectTiles guarida_a_tiles(const Laberinto *lab, RectLocal r){
  RectTiles g = lab->guarida_tiles;
  switch (lab->guarida_lado){
    case 0:  return (RectTiles){g.col + r.u, g.fila + g.alto - r.v - r.fondo, r.ancho, r.fondo}; // arriba: la puerta abajo
    case 1:  return (RectTiles){g.col + r.u, g.fila + r.v, r.ancho, r.fondo};                     // abajo: la puerta arriba
    case 2:  return (RectTiles){g.col + g.ancho - r.v - r.fondo, g.fila + r.u, r.fondo, r.ancho}; // izquierda: la puerta a la derecha
    default: return (RectTiles){g.col + r.v, g.fila + r.u, r.fondo, r.ancho};                     // derecha: la puerta a la izquierda
  }
}

// El parkour de la guarida: todo es lava salvo una plataforma junto a la
// puerta, unas piedras separadas por LAB_LAVA_HUECO tiles (hay que saltar de
// una a otra) y la isla del fondo, donde espera el Minotauro.
static void armar_parkour(Laberinto *lab, int puerta_u0){
  RectTiles g = lab->guarida_tiles;
  int largo = (lab->guarida_lado < 2) ? g.ancho : g.alto; // a lo largo del borde
  int fondo = (lab->guarida_lado < 2) ? g.alto : g.ancho; // hacia el fondo
  int medio = puerta_u0 + LAB_PASILLO / 2;

  RectLocal entrada = {puerta_u0 - 1, 0, LAB_PASILLO + 2, 3};
  int isla_ancho = 24, isla_fondo = 14;
  int isla_u = medio - isla_ancho / 2;
  if (isla_u < 1) isla_u = 1;
  if (isla_u + isla_ancho > largo - 1) isla_u = largo - 1 - isla_ancho;
  RectLocal isla = {isla_u, fondo - 1 - isla_fondo, isla_ancho, isla_fondo};

  lab->cant_piedras = 0;
  lab->piedras[lab->cant_piedras++] = entrada;
  // Entre la entrada y la isla: n piedras y n + 1 huecos de lava iguales
  int libre = isla.v - (entrada.v + entrada.fondo);
  int n = (libre - LAB_LAVA_HUECO) / (3 + LAB_LAVA_HUECO);
  if (n > LAB_MAX_PIEDRAS - 2) n = LAB_MAX_PIEDRAS - 2;
  int piedra_total = libre - LAB_LAVA_HUECO * (n + 1); // lo que miden todas las piedras juntas
  int v = entrada.v + entrada.fondo + LAB_LAVA_HUECO;
  int u = medio;
  for (int k = 0; k < n; k++){
    int prof = piedra_total / n + (k < piedra_total % n ? 1 : 0);
    // Zigzag suave: cada piedra se corre un poco, pero la linea derecha
    // desde el medio de la puerta siempre pasa bien por adentro
    u += azar_hasta(lab, 3) - 1;
    if (u < medio - 1) u = medio - 1;
    if (u > medio + 1) u = medio + 1;
    lab->piedras[lab->cant_piedras++] = (RectLocal){u - 3, v, 6, prof};
    v += prof + LAB_LAVA_HUECO;
  }
  lab->piedras[lab->cant_piedras++] = isla;
  lab->isla = guarida_a_tiles(lab, isla);
}

// Charcos de lava en los pasillos cerca de la guarida: en el medio de la
// celda y chicos, asi siempre se pueden rodear.
static void poner_charcos(Laberinto *lab){
  lab->cant_charcos = 0;
  for (int f = 0; f < LAB_MAX_CELDAS; f++)
    for (int c = 0; c < LAB_MAX_CELDAS; c++){
      if (en_sala(lab, c, f)) continue;
      int col = tile_de_celda(c) + LAB_PASILLO / 2, fila = tile_de_celda(f) + LAB_PASILLO / 2;
      if (laberinto_influencia(lab, ZONA_MINOTAURO, col, fila) < CHARCO_HADES) continue;
      if (azar_hasta(lab, 100) >= CHARCO_POR_100 || lab->cant_charcos >= LAB_MAX_CHARCOS) continue;
      lab->charcos[lab->cant_charcos++] = (Charco){
        col + azar_hasta(lab, 3) - 1, fila + azar_hasta(lab, 3) - 1, 1.2f + azar_hasta(lab, 9) / 10.0f};
    }
}

// Elige con la semilla donde va cada jefe (ver laberinto.h) y reserva sus
// salas antes de tallar el laberinto. Usa su propia secuencia de azar
// (sacada de la semilla), aparte de la de los pasillos.
static void ubicar_zonas(Laberinto *lab, unsigned int semilla){
  unsigned int azar_laberinto = lab->azar;
  lab->azar = (semilla ^ 0x5bd1e995u) ? (semilla ^ 0x5bd1e995u) : 1;
  int inicial_min = LAB_MAX_CELDAS / 2 - LAB_INICIAL / 2;
  // Medusas: en el medio de una esquina del anillo inicial (entre la plaza y el borde)
  float cerca = (inicial_min + plaza_desde()) / 2.0f;
  // Poseidon: en la esquina opuesta, donde se juntan las expansiones 1 y 2
  float media = inicial_min - LAB_ANILLO * 1.5f;

  int esquina = azar_hasta(lab, 4);
  int sx = (esquina & 1) ? 1 : -1, sy = (esquina & 2) ? 1 : -1; // esquina de las medusas
  reservar_arena(lab, ZONA_MEDUSAS, sx > 0 ? LAB_MAX_CELDAS - cerca : cerca, sy > 0 ? LAB_MAX_CELDAS - cerca : cerca);
  reservar_arena(lab, ZONA_POSEIDON, sx > 0 ? media : LAB_MAX_CELDAS - media, sy > 0 ? media : LAB_MAX_CELDAS - media);

  // Minotauro: en un lado que no toque la esquina de Poseidon (los del lado
  // de las medusas), lejos de las esquinas
  int a_lo_largo = LAB_GUARIDA_FONDO + azar_hasta(lab, LAB_MAX_CELDAS - 2 * LAB_GUARIDA_FONDO - LAB_GUARIDA_ANCHO + 1);
  int fondo_hasta = LAB_MAX_CELDAS - LAB_GUARIDA_FONDO; // primera celda de la guarida del lado de abajo / derecha
  int medio = LAB_GUARIDA_ANCHO / 2;
  if (azar_hasta(lab, 2)){ // lado de arriba o de abajo
    lab->guarida_lado = sy > 0 ? 1 : 0;
    reservar_sala(lab, ZONA_MINOTAURO, a_lo_largo, sy > 0 ? fondo_hasta : 0, LAB_GUARIDA_ANCHO, LAB_GUARIDA_FONDO);
    int c = a_lo_largo + medio;
    int f = sy > 0 ? fondo_hasta : LAB_GUARIDA_FONDO - 1; // celda de la guarida junto a la puerta
    lab->puerta_minotauro = muro_entre(c, f, c, f - sy);
  } else {                 // lado izquierdo o derecho
    lab->guarida_lado = sx > 0 ? 3 : 2;
    reservar_sala(lab, ZONA_MINOTAURO, sx > 0 ? fondo_hasta : 0, a_lo_largo, LAB_GUARIDA_FONDO, LAB_GUARIDA_ANCHO);
    int f = a_lo_largo + medio;
    int c = sx > 0 ? fondo_hasta : LAB_GUARIDA_FONDO - 1;
    lab->puerta_minotauro = muro_entre(c, f, c - sx, f);
  }
  const Sala *g = &lab->salas[ZONA_MINOTAURO];
  int col = tile_de_celda(g->c), fila = tile_de_celda(g->f);
  lab->guarida_tiles = (RectTiles){col, fila, g->ancho * LAB_CELDA - LAB_MURO, g->alto * LAB_CELDA - LAB_MURO};
  int puerta_u0 = medio * LAB_CELDA; // la puerta, medida a lo largo del borde desde la primera celda
  armar_parkour(lab, puerta_u0);
  poner_charcos(lab);
  lab->azar = azar_laberinto;
}

// Talla las salas que el laberinto ya cubre: un salon abierto, sin muros
// adentro, con sus entradas (la guarida, solo la puerta del Minotauro).
static void tallar_salas(Laberinto *lab){
  for (int z = ZONA_LABERINTO + 1; z < ZONA_CANTIDAD; z++){
    Sala *s = &lab->salas[z];
    if (s->tallada) continue;
    int c1 = s->c + s->ancho - 1, f1 = s->f + s->alto - 1;
    if (!dentro(lab, s->c, s->f) || !dentro(lab, c1, f1)) continue;
    int col = tile_de_celda(s->c), fila = tile_de_celda(s->f);
    tallar_rect(lab, col, fila, tile_de_celda(c1) + LAB_PASILLO - col, tile_de_celda(f1) + LAB_PASILLO - fila);
    if (z == ZONA_MINOTAURO) llenar_rect(lab, lab->puerta_minotauro, 0);
    else {
      llenar_rect(lab, lab->entradas[z][0], 0);
      llenar_rect(lab, lab->entradas[z][1], 0);
    }
    s->tallada = 1;
  }
}

// Talla las celdas activas que quedaron sin abrir (las salas cortan los
// anillos y alguna parte puede quedar suelta), cada una unida a una vecina
// ya abierta que no sea una sala.
static void tallar_sueltas(Laberinto *lab){
  int cambio = 1;
  while (cambio){
    cambio = 0;
    for (int f = lab->f_min; f <= lab->f_max; f++)
      for (int c = lab->c_min; c <= lab->c_max; c++){
        if (lab->abierta[f][c]) continue;
        for (int d = 0; d < 4; d++){
          int nc = c + DC[d], nf = f + DF[d];
          if (!dentro(lab, nc, nf) || !lab->abierta[nf][nc] || en_sala(lab, nc, nf)) continue;
          abrir_paso(lab, c, f, nc, nf);
          tallar_desde(lab, c, f);
          cambio = 1;
          break;
        }
      }
  }
}

// Centro del tile en celdas (la celda c va de c a c + 1).
static float celda_de_tile(int t){
  return (t + 0.5f - LAB_MURO - LAB_PASILLO / 2.0f) / LAB_CELDA + 0.5f;
}

// 1 a menos de `lleno`, 0 desde `borde`, y una curva suave entre medio.
static float desvanecer(float d, float lleno, float borde){
  if (d <= lleno) return 1.0f;
  if (d >= borde) return 0.0f;
  float t = 1.0f - (d - lleno) / (borde - lleno);
  return t * t * (3.0f - 2.0f * t);
}

float laberinto_influencia(const Laberinto *lab, Zona zona, int col, int fila){
  if (zona <= ZONA_LABERINTO || zona >= ZONA_CANTIDAD) return 0.0f;
  // Distancia (en celdas) a la sala del jefe: 0 adentro
  float c = celda_de_tile(col), f = celda_de_tile(fila);
  const Sala *s = &lab->salas[zona];
  float x0 = s->c, x1 = s->c + s->ancho, y0 = s->f, y1 = s->f + s->alto;
  float dx = c < x0 ? x0 - c : c > x1 ? c - x1 : 0;
  float dy = f < y0 ? y0 - f : f > y1 ? f - y1 : 0;
  return desvanecer(hypotf(dx, dy), 0.0f, zona == ZONA_MINOTAURO ? LAB_HADES_ALCANCE : ZONA_BORDE);
}

Zona laberinto_zona(const Laberinto *lab, int col, int fila, float *influencia){
  Zona mejor = ZONA_LABERINTO;
  float peso = 0.0f;
  for (int z = ZONA_LABERINTO + 1; z < ZONA_CANTIDAD; z++){
    float p = laberinto_influencia(lab, (Zona)z, col, fila);
    if (p > peso){
      peso = p;
      mejor = (Zona)z;
    }
  }
  if (influencia) *influencia = peso;
  return mejor;
}

static RectPx tiles_a_px(RectTiles r){
  return (RectPx){r.col * (float)LAB_TILE, r.fila * (float)LAB_TILE, r.ancho * (float)LAB_TILE, r.alto * (float)LAB_TILE};
}

RectPx laberinto_sala_px(const Laberinto *lab, Zona zona){
  const Sala *s = &lab->salas[zona];
  int col = tile_de_celda(s->c), fila = tile_de_celda(s->f);
  return tiles_a_px((RectTiles){col, fila, s->ancho * LAB_CELDA - LAB_MURO, s->alto * LAB_CELDA - LAB_MURO});
}

RectPx laberinto_isla_px(const Laberinto *lab){ return tiles_a_px(lab->isla); }

Direccion laberinto_guarida(const Laberinto *lab){
  RectPx r = laberinto_sala_px(lab, ZONA_MINOTAURO);
  return (Direccion){r.x + r.ancho / 2, r.y + r.alto / 2};
}

Zona laberinto_sala(const Laberinto *lab, int col, int fila){
  // La celda del tile, si el tile cae en su piso o en un muro de adentro de la sala
  int c = col / LAB_CELDA, f = fila / LAB_CELDA;
  Zona z = sala_de_celda(lab, c, f);
  if (z == ZONA_LABERINTO || !lab->salas[z].tallada || laberinto_es_muro(lab, col, fila)) return ZONA_LABERINTO;
  return z;
}

static int en_tiles(RectTiles r, int col, int fila){
  return col >= r.col && col < r.col + r.ancho && fila >= r.fila && fila < r.fila + r.alto;
}

int laberinto_es_lava(const Laberinto *lab, int col, int fila){
  if (laberinto_es_muro(lab, col, fila)) return 0;
  if (en_tiles(lab->guarida_tiles, col, fila)){
    for (int i = 0; i < lab->cant_piedras; i++)
      if (en_tiles(guarida_a_tiles(lab, lab->piedras[i]), col, fila)) return 0;
    return 1;
  }
  for (int i = 0; i < lab->cant_charcos; i++){
    const Charco *ch = &lab->charcos[i];
    float dx = col - ch->col, dy = fila - ch->fila;
    if (fabsf(dx) > 4 || fabsf(dy) > 4) continue;
    // Borde irregular: el radio cambia un poco con el angulo
    float borde = ch->radio + 0.45f * sinf(atan2f(dy, dx) * 3.0f + ch->col);
    if (dx * dx + dy * dy <= borde * borde) return 1;
  }
  return 0;
}

#define LAVA_PERDON 7.0f // px: con un pie en la piedra (o en el borde) no se quema

static int punto_lava(const Laberinto *lab, float x, float y){
  return laberinto_es_lava(lab, (int)floorf(x / LAB_TILE), (int)floorf(y / LAB_TILE));
}

int laberinto_pisa_lava(const Laberinto *lab, Direccion pies){
  // Las 4 esquinas de una caja chica en los pies (la de choque va de
  // y - PIES_ALTO a y): se quema solo si estan todas sobre la lava
  float izq = pies.x - LAVA_PERDON, der = pies.x + LAVA_PERDON;
  float arriba = pies.y - PIES_ALTO + 2, abajo = pies.y - 1;
  return punto_lava(lab, izq, arriba) && punto_lava(lab, der, arriba) &&
         punto_lava(lab, izq, abajo) && punto_lava(lab, der, abajo);
}

// El hueco: lo que no se puede pisar sale del dibujo (art/hueco.py), que se
// ve a LAB_HUECO_ESCALA. Cada fila va de un costado al otro, en pixeles del
// dibujo, y mide HUECO_ALTO_FILA.
#define LAB_HUECO_ESCALA 2
#define HUECO_ANCHO 95        // el dibujo
#define HUECO_ALTO 107
#define HUECO_ARRIBA 4        // donde empieza la primera fila
#define HUECO_ALTO_FILA 4
#define HUECO_DESDE_X -320.0f // su centro, desde la aparicion (el arbol esta a la derecha)
#define HUECO_DESDE_Y -20.0f

static const short HUECO_FILAS[][2] = {
  {41, 61}, {32, 64}, {27, 68}, {22, 73}, {17, 77}, {14, 81}, {13, 82}, {13, 83}, {12, 84},
  {11, 84}, {10, 85}, {9, 86},  {9, 86},  {10, 86}, {12, 85}, {13, 84}, {13, 85}, {11, 86},
  {11, 86}, {16, 81}, {19, 78}, {23, 75}, {26, 72}, {28, 69}, {31, 67}, {40, 56},
};
#define HUECO_CANT_FILAS ((int)(sizeof HUECO_FILAS / sizeof HUECO_FILAS[0]))

RectPx laberinto_hueco_px(const Laberinto *lab){
  Direccion base = laberinto_aparicion(lab);
  float ancho = HUECO_ANCHO * LAB_HUECO_ESCALA, alto = HUECO_ALTO * LAB_HUECO_ESCALA;
  return (RectPx){base.x + HUECO_DESDE_X - ancho / 2, base.y + HUECO_DESDE_Y - alto / 2, ancho, alto};
}

static RectPx hueco_fila(const Laberinto *lab, int i){
  RectPx dibujo = laberinto_hueco_px(lab);
  return (RectPx){dibujo.x + HUECO_FILAS[i][0] * LAB_HUECO_ESCALA,
                  dibujo.y + (HUECO_ARRIBA + i * HUECO_ALTO_FILA) * LAB_HUECO_ESCALA,
                  (HUECO_FILAS[i][1] - HUECO_FILAS[i][0]) * LAB_HUECO_ESCALA,
                  HUECO_ALTO_FILA * LAB_HUECO_ESCALA};
}

int laberinto_toca_hueco(const Laberinto *lab, RectPx caja){
  for (int i = 0; i < HUECO_CANT_FILAS; i++){
    RectPx o = hueco_fila(lab, i);
    if (caja.x < o.x + o.ancho && caja.x + caja.ancho > o.x && caja.y < o.y + o.alto && caja.y + caja.alto > o.y) return 1;
  }
  return 0;
}

void laberinto_iniciar(Laberinto *lab, unsigned int semilla){
  memset(lab->muro, 1, sizeof lab->muro);
  memset(lab->abierta, 0, sizeof lab->abierta);
  lab->azar = semilla ? semilla : 1; // xorshift no puede arrancar en 0
  lab->version = 0;
  lab->cant_obstaculos = 0;
  memset(lab->obs_primero, -1, sizeof lab->obs_primero);

  lab->c_min = lab->f_min = LAB_MAX_CELDAS / 2 - LAB_INICIAL / 2;
  lab->c_max = lab->f_max = lab->c_min + LAB_INICIAL - 1;

  tallar_plaza(lab);
  tallar_rectas(lab);
  ubicar_zonas(lab, semilla);
  // El laberinto: el resto del anillo alrededor de la plaza. Los pasillos
  // rectos lo cortan en partes, asi que se talla cada parte por separado
  // (cada una queda conectada por la T de los pasillos a sus costados).
  for (int f = lab->f_min; f <= lab->f_max; f++)
    for (int c = lab->c_min; c <= lab->c_max; c++)
      if (!lab->abierta[f][c]) tallar_desde(lab, c, f);
  tallar_sueltas(lab);
  tallar_salas(lab); // la arena de las medusas ya esta en el laberinto inicial
  for (int i = 0; i < HUECO_CANT_FILAS; i++) laberinto_agregar_obstaculo(lab, hueco_fila(lab, i));
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
  // (las de las salas no: tienen sus propias entradas)
  int n = 0;
#define BORDE(bc, bf, vc, vf) \
  if (!en_sala(lab, bc, bf) && !en_sala(lab, vc, vf)){ \
    borde_c[n] = bc; borde_f[n] = bf; viejo_c[n] = vc; viejo_f[n] = vf; n++; \
  }
  for (int c = viejo_c_min; c <= viejo_c_max; c++){
    BORDE(c, viejo_f_min - 1, c, viejo_f_min);
    BORDE(c, viejo_f_max + 1, c, viejo_f_max);
  }
  for (int f = viejo_f_min; f <= viejo_f_max; f++){
    BORDE(viejo_c_min - 1, f, viejo_c_min, f);
    BORDE(viejo_c_max + 1, f, viejo_c_max, f);
  }
#undef BORDE

  // Talla todo el anillo nuevo desde una de esas celdas, conectada al viejo
  int k = azar_hasta(lab, n);
  abrir_paso(lab, borde_c[k], borde_f[k], viejo_c[k], viejo_f[k]);
  tallar_desde(lab, borde_c[k], borde_f[k]);

  // Mas pasos entre el anillo nuevo y el viejo, asi hay varios caminos
  for (int extra = 0; extra < 3; extra++){
    k = azar_hasta(lab, n);
    abrir_paso(lab, borde_c[k], borde_f[k], viejo_c[k], viejo_f[k]);
  }

  tallar_sueltas(lab);
  tallar_salas(lab);
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

static int en_rect(RectTiles r, int col, int fila){ // (igual que en_tiles)
  return col >= r.col && col < r.col + r.ancho && fila >= r.fila && fila < r.fila + r.alto;
}

int laberinto_es_puerta(const Laberinto *lab, int col, int fila){
  for (int i = 0; i < 4; i++)
    if (en_rect(lab->puertas[i], col, fila)) return 1;
  return 0;
}

int laberinto_es_puerta_minotauro(const Laberinto *lab, int col, int fila){
  return lab->salas[ZONA_MINOTAURO].tallada && en_rect(lab->puerta_minotauro, col, fila);
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

// Los obstaculos se guardan por celda (la de su esquina de arriba a la
// izquierda), asi un choque mira solo los de alrededor y no todos.
#define OBS_CELDA_PX (LAB_CELDA * LAB_TILE)

static int celda_obs(float px){
  int c = (int)floorf(px / OBS_CELDA_PX);
  return c < 0 ? 0 : c >= LAB_MAX_CELDAS ? LAB_MAX_CELDAS - 1 : c;
}

int laberinto_agregar_obstaculo(Laberinto *lab, RectPx caja){
  if (lab->cant_obstaculos >= LAB_MAX_OBSTACULOS) return -1;
  // Uno ya quitado deja su lugar libre
  int i = lab->cant_obstaculos;
  for (int k = 0; k < lab->cant_obstaculos; k++)
    if (lab->obstaculos[k].ancho <= 0){ i = k; break; }
  if (i == lab->cant_obstaculos) lab->cant_obstaculos++;
  else {
    // Sacarlo de la lista de su celda vieja: se lo vuelve a poner abajo
    int *p = &lab->obs_primero[celda_obs(lab->obstaculos[i].y)][celda_obs(lab->obstaculos[i].x)];
    while (*p != i && *p >= 0) p = &lab->obs_siguiente[*p];
    if (*p == i) *p = lab->obs_siguiente[i];
  }
  lab->obstaculos[i] = caja;
  int *primero = &lab->obs_primero[celda_obs(caja.y)][celda_obs(caja.x)];
  lab->obs_siguiente[i] = *primero;
  *primero = i;
  return i;
}

void laberinto_quitar_obstaculo(Laberinto *lab, int i){
  if (i < 0 || i >= lab->cant_obstaculos) return;
  lab->obstaculos[i].ancho = lab->obstaculos[i].alto = 0; // queda en su lista, vacio
}

// 1 si una caja (en pixeles) se superpone con algun obstaculo
static int caja_toca_obstaculo(const Laberinto *lab, float izq, float arriba, float der, float abajo){
  if (lab->cant_obstaculos == 0) return 0;
  int c0 = celda_obs(izq) - 1, c1 = celda_obs(der);
  int f0 = celda_obs(arriba) - 1, f1 = celda_obs(abajo);
  for (int f = f0 < 0 ? 0 : f0; f <= f1; f++)
    for (int c = c0 < 0 ? 0 : c0; c <= c1; c++)
      for (int i = lab->obs_primero[f][c]; i >= 0; i = lab->obs_siguiente[i]){
        RectPx o = lab->obstaculos[i];
        if (o.ancho <= 0) continue;
        if (izq < o.x + o.ancho && der > o.x && arriba < o.y + o.alto && abajo > o.y) return 1;
      }
  return 0;
}

int laberinto_toca_obstaculo(const Laberinto *lab, RectPx caja){
  return caja_toca_obstaculo(lab, caja.x, caja.y, caja.x + caja.ancho, caja.y + caja.alto);
}

static int pies_chocan(const Laberinto *lab, float x, float y){
  float izq = x - PIES_MEDIO_ANCHO, arriba = y - PIES_ALTO, der = x + PIES_MEDIO_ANCHO;
  return caja_toca_muro(lab, izq, arriba, der, y) || caja_toca_hoja(lab, izq, arriba, der, y) ||
         caja_toca_obstaculo(lab, izq, arriba, der, y);
}

int laberinto_libre(const Laberinto *lab, Direccion pies){
  return !pies_chocan(lab, pies.x, pies.y);
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
  // Encimado a un obstaculo (una roca aparecio donde estaba parado): sale
  // caminando, sin chocar con los obstaculos hasta estar afuera
  float izq = pos->x - PIES_MEDIO_ANCHO, der = pos->x + PIES_MEDIO_ANCHO;
  if (caja_toca_obstaculo(lab, izq, pos->y - PIES_ALTO, der, pos->y)){
    if (!caja_toca_muro(lab, izq + dx, pos->y - PIES_ALTO, der + dx, pos->y)) pos->x += dx;
    if (!caja_toca_muro(lab, pos->x - PIES_MEDIO_ANCHO, pos->y + dy - PIES_ALTO, pos->x + PIES_MEDIO_ANCHO, pos->y + dy)) pos->y += dy;
    return sqrtf((pos->x - antes_x) * (pos->x - antes_x) + (pos->y - antes_y) * (pos->y - antes_y));
  }
  if (!pies_chocan(lab, pos->x + dx, pos->y)) pos->x += dx;
  if (!pies_chocan(lab, pos->x, pos->y + dy)) pos->y += dy;
  return sqrtf((pos->x - antes_x) * (pos->x - antes_x) + (pos->y - antes_y) * (pos->y - antes_y));
}
