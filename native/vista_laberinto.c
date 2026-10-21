#include "vista_laberinto.h"

#include "json.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Cuanto se inclina una tapa hacia afuera, por px de distancia al centro.
#define SPLAY 0.1f
// Paleta Mushroom (art/maze_tiles.py), igual que en maze-renderer.ts.
#define WALL_TOP   RGB2(0x78, 0x8a, 0x87)
#define WALL_RIM   RGB2(0xa9, 0xb2, 0xa2) // borde iluminado del frente de la tapa
#define WALL_FRONT RGB2(0x57, 0x60, 0x69)
#define WALL_SIDE  RGB2(0x44, 0x38, 0x46)
#define WALL_FOOT  RGB2(0x2e, 0x22, 0x2f) // banda oscura donde la cara toca el piso
#define EDGE_COLOR RGB2(0x2e, 0x22, 0x2f)
#define GATE_FRONT RGB2(0x2e, 0x22, 0x2f)
#define GATE_BAR   RGB2(0x78, 0x8a, 0x87)
#define GATE_BAR_STEP 8                   // px entre barrotes
#define GATE_TOP   RGB2(0x7a, 0x30, 0x45)
#define GATE_RIM   RGB2(0x99, 0x3d, 0x41)
#define VOID_COLOR RGB2(0x00, 0x00, 0x00) // piso bajo los muros: nunca se ve
#define FLOOR_SHADOW 14                   // px de sombra al pie de un muro
#define SHADOW_ALPHA 0.6f
#define FOREST_BLEND 8                    // tiles en los que el bosque se funde en pasto
#define FOREST_REACH 0.45f                // parte del ancho de la plaza que cubre el bosque
static const float BLEND_SHARES[4] = { 0.2f, 0.4f, 0.6f, 0.8f };
#define BLEND_VARIANTS 4

// ── Ruido determinista por celda ─────────────────────────────
// Mismas cuentas que hash() y valueNoise() del cliente web, bit a bit: la
// multiplicacion de enteros sin signo de C da la vuelta en 2^32 igual que
// Math.imul, asi que cada celda elige el mismo tile en los dos clientes.
static uint32_t hash(int col, int fila) {
  uint32_t h = ((uint32_t)col * 73856093u) ^ ((uint32_t)fila * 19349663u);
  h = (h ^ (h >> 13)) * 1274126177u;
  return h ^ (h >> 16);
}

static float suave(float t) { return t * t * (3 - 2 * t); }

static float ruido(float x, float y) {
  int x0 = (int)floorf(x), y0 = (int)floorf(y);
  float fx = suave(x - (float)x0), fy = suave(y - (float)y0);
#define V(cx, cy) ((float)(hash((cx) + 1000, (cy) + 1000) % 1000) / 1000.0f)
  float arriba = V(x0, y0) * (1 - fx) + V(x0 + 1, y0) * fx;
  float abajo = V(x0, y0 + 1) * (1 - fx) + V(x0 + 1, y0 + 1) * fx;
#undef V
  return arriba * (1 - fy) + abajo * fy;
}

// ── Atlas ────────────────────────────────────────────────────

// Los tiles de maze_tiles.json por nombre: floor_0, floor_1... en el orden
// del archivo (el mismo que usa el cliente web para elegir variantes).
static void juntar(const Json *frames, const char *prefijo, Rect2D *out, int *n) {
  size_t largo = strlen(prefijo);
  *n = 0;
  for (const Json *f = frames ? frames->hijos : NULL; f && *n < VARIANTES_MAX; f = f->siguiente) {
    if (!f->clave || strncmp(f->clave, prefijo, largo) != 0) continue;
    out[(*n)++] = (Rect2D){
      (float)json_numero(json_campo(f, "x"), 0), (float)json_numero(json_campo(f, "y"), 0),
      (float)json_numero(json_campo(f, "w"), 0), (float)json_numero(json_campo(f, "h"), 0),
    };
  }
}

// a sobre b con su alfa (lo que hace drawImage del canvas).
static uint32_t sobre(uint32_t a, uint32_t b) {
  float aa = (float)(a >> 24) / 255.0f, ab = (float)(b >> 24) / 255.0f;
  float ao = aa + ab * (1 - aa);
  if (ao <= 0) return 0;
  uint32_t out = (uint32_t)lroundf(ao * 255.0f) << 24;
  for (int s = 0; s <= 16; s += 8) {
    float ca = (float)((a >> s) & 0xFF), cb = (float)((b >> s) & 0xFF);
    out |= (uint32_t)lroundf((ca * aa + cb * ab * (1 - aa)) / ao) << s;
  }
  return out;
}

// Arma UNA textura con todo lo que dibuja el piso: maze_tiles, abajo los
// tiles de transicion pasto->bosque, y abajo de esos la sombra. Una textura
// = un solo lote para todo el piso.
//
// Transicion: por cada nivel de bosque, pasto con bosque encima solo donde
// un ruido por pixel queda debajo del nivel. El ruido va en bloques de 2x2,
// como los tiles, asi la mezcla se lee como pixel art.
static int armar_atlas(VistaLaberinto *v, const Renderer2D *r, const char *ruta_png) {
  int w = 0, h = 0, t = v->tile;
  uint32_t *base = r->imagen_cargar(ruta_png, &w, &h);
  if (!base) return 1;
  int alto = h + 4 * t + t;
  int ancho = w > BLEND_VARIANTS * t ? w : BLEND_VARIANTS * t;
  uint32_t *pix = calloc((size_t)ancho * (size_t)alto, 4);
  if (!pix) { r->imagen_liberar(base); return 1; }
  for (int y = 0; y < h; y++) memcpy(pix + (size_t)y * ancho, base + (size_t)y * w, (size_t)w * 4);

  for (int nivel = 0; nivel < 4; nivel++) {
    for (int i = 0; i < BLEND_VARIANTS; i++) {
      Rect2D g = v->pasto[i % v->n_pasto];
      Rect2D f = v->bosque[(i + nivel) % v->n_bosque];
      int ox = i * t, oy = h + nivel * t;
      for (int y = 0; y < t; y++) {
        for (int x = 0; x < t; x++) {
          uint32_t pg = base[((int)g.y + y) * w + (int)g.x + x];
          uint32_t pf = base[((int)f.y + y) * w + (int)f.x + x];
          float n = (float)(hash((x >> 1) + i * 97, (y >> 1) + nivel * 89) % 1000) / 1000.0f;
          pix[(size_t)(oy + y) * ancho + ox + x] = n < BLEND_SHARES[nivel] ? sobre(pf, pg) : pg;
        }
      }
      v->mezcla[nivel][i] = (Rect2D){ (float)ox, (float)oy, (float)t, (float)t };
    }
  }

  // Sombra: oscura contra el muro, nada FLOOR_SHADOW px mas abajo. Cada
  // fila toma el valor del degradado en el centro de su pixel.
  int sy = h + 4 * t;
  for (int y = 0; y < FLOOR_SHADOW; y++) {
    uint32_t a = (uint32_t)lroundf(255.0f * SHADOW_ALPHA * (1.0f - ((float)y + 0.5f) / FLOOR_SHADOW));
    for (int x = 0; x < t; x++) pix[(size_t)(sy + y) * ancho + x] = ARGB(a, 8, 6, 12);
  }
  v->sombra = (Rect2D){ 0, (float)sy, (float)t, FLOOR_SHADOW };

  v->atlas = r->textura_desde_pixeles(pix, ancho, alto);
  free(pix);
  r->imagen_liberar(base);
  return v->atlas == TEXTURA2D_NULA;
}

// ── Plaza ────────────────────────────────────────────────────

// La plaza se encuentra caminando el piso desde el spawn sin cruzar una
// puerta: las puertas son su unica salida. Su esquina de arriba a la
// derecha es un bosque oscuro.
static void buscar_plaza(VistaLaberinto *v, const Laberinto *lab, float sx, float sy) {
  int n = LAB_TILES;
  v->plaza = calloc((size_t)n * (size_t)n, 1);
  int *pila = malloc((size_t)n * (size_t)n * sizeof *pila);
  if (!v->plaza || !pila) { free(pila); return; }
  int c0 = (int)floorf(sx / (float)v->tile), f0 = (int)floorf(sy / (float)v->tile);
  int max_c = c0, min_c = c0, min_f = f0, tope = 0;
  v->plaza[f0 * n + c0] = 1;
  pila[tope++] = f0 * n + c0;
  while (tope > 0) {
    int k = pila[--tope], c = k % n, f = k / n;
    const int vec[4][2] = { { c + 1, f }, { c - 1, f }, { c, f + 1 }, { c, f - 1 } };
    for (int i = 0; i < 4; i++) {
      int nc = vec[i][0], nf = vec[i][1];
      if (laberinto_es_muro(lab, nc, nf) || laberinto_es_puerta(lab, nc, nf)) continue;
      if (v->plaza[nf * n + nc]) continue;
      v->plaza[nf * n + nc] = 1;
      pila[tope++] = nf * n + nc;
      if (nc > max_c) max_c = nc;
      if (nc < min_c) min_c = nc;
      if (nf < min_f) min_f = nf;
    }
  }
  free(pila);
  v->bosque_x = (float)((max_c + 1) * v->tile);
  v->bosque_y = (float)(min_f * v->tile);
  v->bosque_radio = (float)((max_c + 1 - min_c) * v->tile) * FOREST_REACH;
}

int vista_iniciar(VistaLaberinto *v, const Renderer2D *r, const char *ruta_tiles,
                  const Laberinto *lab, float spawn_x, float spawn_y) {
  memset(v, 0, sizeof *v);
  char ruta[512];
  snprintf(ruta, sizeof ruta, "%s.json", ruta_tiles);
  Json *datos = json_leer_archivo(ruta);
  if (!datos) {
    fprintf(stderr, "[laberinto] no pude leer %s\n", ruta);
    return 1;
  }
  v->tile = (int)json_numero(json_campo(datos, "tileSize"), LAB_TILE);
  const Json *frames = json_campo(datos, "frames");
  juntar(frames, "floor_", v->piso, &v->n_piso);
  juntar(frames, "paving_", v->adoquin, &v->n_adoquin);
  juntar(frames, "grass_", v->pasto, &v->n_pasto);
  juntar(frames, "forest_", v->bosque, &v->n_bosque);
  json_liberar(datos);
  if (!v->n_piso || !v->n_adoquin || !v->n_pasto || !v->n_bosque) {
    fprintf(stderr, "[laberinto] faltan tiles en %s\n", ruta);
    return 1;
  }
  snprintf(ruta, sizeof ruta, "%s.png", ruta_tiles);
  if (armar_atlas(v, r, ruta)) return 1;
  buscar_plaza(v, lab, spawn_x, spawn_y);
  return v->plaza == NULL;
}

// ── Piso ─────────────────────────────────────────────────────

static Rect2D elegir(const Rect2D *variantes, int n, int col, int fila) {
  return variantes[hash(col, fila) % (uint32_t)n];
}

// La plaza es pasto, con un piso de musgo oscuro bajo su bosque. El borde
// del bosque se corre con un ruido, y se funde en el pasto con los tiles de
// transicion.
static Rect2D tile_plaza(const VistaLaberinto *v, int col, int fila) {
  float t = (float)v->tile;
  float ragged = (ruido((float)col / 4, (float)fila / 4) - 0.5f) * 3 * t;
  float cx = (float)col * t + t / 2, cy = (float)fila * t + t / 2;
  float prof = v->bosque_radio - hypotf(cx - v->bosque_x, cy - v->bosque_y) + ragged;
  float parte = 0.5f + prof / (FOREST_BLEND * t);
  parte = parte < 0 ? 0 : parte > 1 ? 1 : parte;
  int paso = (int)floorf(parte * 5 + 0.5f); // Math.round
  if (paso <= 0) return elegir(v->pasto, v->n_pasto, col, fila);
  if (paso > 4) return elegir(v->bosque, v->n_bosque, col, fila);
  return v->mezcla[paso - 1][hash(col, fila) % BLEND_VARIANTS];
}

// Afuera: tierra, con manchas irregulares de adoquin viejo. Una puerta
// deja un umbral de adoquin.
static Rect2D tile_piso(const VistaLaberinto *v, const Laberinto *lab, int col, int fila) {
  if (laberinto_es_puerta(lab, col, fila)) return v->adoquin[hash(col, fila) % 4 % (uint32_t)v->n_adoquin];
  if (v->plaza[fila * LAB_TILES + col]) return tile_plaza(v, col, fila);
  int adoquin = ruido((float)col / 6, (float)fila / 6) > 0.62f;
  if (adoquin && hash(col, fila) % 100 < 85) return v->adoquin[hash(col, fila) % 4 % (uint32_t)v->n_adoquin];
  return elegir(v->piso, v->n_piso, col, fila);
}

void vista_celdas(Rect2D vista, int *c0, int *c1, int *r0, int *r1) {
  int t = LAB_TILE, extra = (WALL_HEIGHT + t - 1) / t;
  *c0 = (int)fmaxf(0, floorf(vista.x / t));
  *c1 = (int)fminf(LAB_TILES - 1, floorf((vista.x + vista.w) / t));
  *r0 = (int)fmaxf(0, floorf(vista.y / t));
  *r1 = (int)fminf(LAB_TILES - 1, floorf((vista.y + vista.h) / t) + extra);
}

void vista_piso(VistaLaberinto *v, const Renderer2D *r, const Laberinto *lab, Rect2D vista) {
  v->camara_x = vista.x + vista.w / 2;
  float t = (float)v->tile;
  int c0 = (int)fmaxf(0, floorf(vista.x / t)), c1 = (int)fminf(LAB_TILES - 1, floorf((vista.x + vista.w) / t));
  int r0 = (int)fmaxf(0, floorf(vista.y / t)), r1 = (int)fminf(LAB_TILES - 1, floorf((vista.y + vista.h) / t));
  for (int fila = r0; fila <= r1; fila++) {
    for (int col = c0; col <= c1; col++) {
      Rect2D d = { (float)col * t, (float)fila * t, t, t };
      if (laberinto_es_muro(lab, col, fila)) {
        r->rect(d, VOID_COLOR);
        continue;
      }
      r->sprite(v->atlas, tile_piso(v, lab, col, fila), d, BLANCO2, 0);
      if (laberinto_es_muro(lab, col, fila - 1))
        r->sprite(v->atlas, v->sombra, (Rect2D){ d.x, d.y, t, FLOOR_SHADOW }, BLANCO2, 0);
    }
  }
}

// ── Muros y puertas ──────────────────────────────────────────

// Donde se dibuja la tapa de un muro que esta en la x de mundo `x`.
static float inclinar(const VistaLaberinto *v, float x) {
  return roundf(x + (x - v->camara_x) * SPLAY);
}

static void cuad(const Renderer2D *r, float x0, float y0, float x1, float y1,
                 float x2, float y2, float x3, float y3, uint32_t color) {
  V2 p[4] = { { x0, y0 }, { x1, y1 }, { x2, y2 }, { x3, y3 } };
  uint32_t c[4] = { color, color, color, color };
  r->cuad(p, c);
}

static void rect(const Renderer2D *r, float x, float y, float w, float h, uint32_t color) {
  r->rect((Rect2D){ x, y, w, h }, color);
}

// Una cara se ve solo donde el piso de adelante del muro esta abierto.
static int tiene_frente(const Laberinto *lab, int col, int fila) {
  return fila + 1 < LAB_TILES && !laberinto_es_muro(lab, col, fila + 1);
}

// Los muros de una fila, de a tramos de celdas muro seguidas: el lado que
// mira a la camara, el frente donde el piso de adelante esta abierto, y la
// tapa con su borde donde da a espacio abierto.
void vista_fila_muros(const VistaLaberinto *v, const Renderer2D *r, const Laberinto *lab,
                      int fila, int c0, int c1) {
  float t = (float)v->tile, h = WALL_HEIGHT;
  float atras = (float)fila * t, pie = atras + t;
  for (int col = c0; col <= c1; col++) {
    if (!laberinto_es_muro(lab, col, fila)) continue;
    int primera = col;
    while (col < c1 && laberinto_es_muro(lab, col + 1, fila)) col++;
    float x0 = (float)primera * t, x1 = (float)(col + 1) * t;
    float tapa0 = inclinar(v, x0), tapa1 = inclinar(v, x1);
    int abierto_izq = !laberinto_es_muro(lab, primera - 1, fila);
    int abierto_der = !laberinto_es_muro(lab, col + 1, fila);

    if (abierto_izq && tapa0 > x0) cuad(r, x0, atras, x0, pie, tapa0, pie - h, tapa0, atras - h, WALL_SIDE);
    if (abierto_der && tapa1 < x1) cuad(r, x1, atras, x1, pie, tapa1, pie - h, tapa1, atras - h, WALL_SIDE);

    for (int c = primera; c <= col; c++) {
      if (!tiene_frente(lab, c, fila)) continue;
      int inicio = c;
      while (c < col && tiene_frente(lab, c + 1, fila)) c++;
      float f0 = (float)inicio * t, f1 = (float)(c + 1) * t;
      float l0 = inclinar(v, f0), l1 = inclinar(v, f1);
      cuad(r, f0, pie, f1, pie, l1, pie - h, l0, pie - h, WALL_FRONT);
      rect(r, f0, pie - 3, f1 - f0, 3, WALL_FOOT);
      rect(r, l0, pie - h, l1 - l0, 2, WALL_RIM);
    }

    rect(r, tapa0, atras - h, tapa1 - tapa0, t, WALL_TOP);
    for (int c = primera; c <= col; c++) {
      if (laberinto_es_muro(lab, c, fila - 1)) continue;
      float l0 = inclinar(v, (float)c * t);
      rect(r, l0, atras - h, inclinar(v, (float)(c + 1) * t) - l0, 1, EDGE_COLOR);
    }
    if (abierto_izq) rect(r, tapa0, atras - h, 1, t, EDGE_COLOR);
    if (abierto_der) rect(r, tapa1 - 1, atras - h, 1, t, EDGE_COLOR);
  }
}

// Una hoja de puerta como un bloque bajo de su tamano exacto (se deslizan,
// asi que no son tiles enteros): barrotes de hierro adelante, madera arriba.
void vista_hoja_puerta(const VistaLaberinto *v, const Renderer2D *r, RectPx hoja) {
  if (hoja.ancho <= 0.5f || hoja.alto <= 0.5f) return;
  float h = WALL_HEIGHT;
  float x0 = roundf(hoja.x), x1 = roundf(hoja.x + hoja.ancho);
  float atras = roundf(hoja.y), pie = roundf(hoja.y + hoja.alto);
  float tapa0 = inclinar(v, x0), tapa1 = inclinar(v, x1);

  if (tapa0 > x0) cuad(r, x0, atras, x0, pie, tapa0, pie - h, tapa0, atras - h, WALL_SIDE);
  if (tapa1 < x1) cuad(r, x1, atras, x1, pie, tapa1, pie - h, tapa1, atras - h, WALL_SIDE);
  cuad(r, x0, pie, x1, pie, tapa1, pie - h, tapa0, pie - h, GATE_FRONT);
  // Barrotes en posiciones fijas del mundo: no se deslizan con la hoja.
  for (float x = ceilf(x0 / GATE_BAR_STEP) * GATE_BAR_STEP + 2; x < x1 - 1; x += GATE_BAR_STEP) {
    float arriba = inclinar(v, x);
    cuad(r, x, pie, x + 2, pie, arriba + 2, pie - h, arriba, pie - h, GATE_BAR);
  }
  float ancho = tapa1 - tapa0, alto = pie - atras;
  rect(r, tapa0, atras - h, ancho, alto, GATE_TOP);
  rect(r, tapa0, pie - h - 2, ancho, 2, GATE_RIM);
  // Contorno de 1 px por dentro (stroke con alignment 1 en Pixi).
  rect(r, tapa0, atras - h, ancho, 1, EDGE_COLOR);
  rect(r, tapa0, atras - h + alto - 1, ancho, 1, EDGE_COLOR);
  rect(r, tapa0, atras - h, 1, alto, EDGE_COLOR);
  rect(r, tapa0 + ancho - 1, atras - h, 1, alto, EDGE_COLOR);
}
