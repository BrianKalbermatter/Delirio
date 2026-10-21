// Delirio nativo: el mismo nucleo en C que corre en el navegador, dibujado
// con el renderer 2D de VimMon (SDL_GPU) en vez de con PixiJS.
//
// El navegador habla con el nucleo por web.c; aca no hace falta el puente:
// se llama directo a juego.h. El orden de cada frame es el de main.ts:
//   entrada -> juego_actualizar -> personaje -> camara -> dibujar
//
//   ./build.sh && ./build/delirio
//   ./build/delirio --semilla 7 --captura /tmp/frame.bmp 2000
//     (simula 2000 ms con pasos fijos, guarda el frame y sale)
//   ./build/delirio --captura /tmp/f.bmp 20000 --ir 1600 -1600
//     (ademas camina hacia spawn + (1600, -1600) mientras simula)

#include "juego.h"
#include "hoja.h"
#include "personaje.h"
#include "vista_laberinto.h"
#include "plugins/renderer2d/renderer2d.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifndef RUTA_PUBLIC
#define RUTA_PUBLIC "../client/public"
#endif

#define TARGET_VIEW_HEIGHT 480 // px de arte que entran de alto, como en el navegador
#define FONDO RGB2(0x0d, 0x0b, 0x12)
// Filas vacias bajo los pies en el lienzo de personaje_3: se dibuja mas
// abajo para que los pies queden sobre la posicion.
#define PLAYER_FEET_PADDING 13
#define PLAYER_BODY_HEIGHT 62

// Lo que se ordena por profundidad: la Y de los pies, y para empates el
// tipo (DEPTH de depth.ts). double y no float: con el mundo de ~17.700 px
// un float no distingue y de y + 0.000001.
typedef enum { PROF_MURO = 0, PROF_PUERTA = 1, PROF_JUGADOR = 5 } TipoProf;
typedef struct {
  double y;
  TipoProf tipo;
  int dato;      // fila del muro, o indice de hoja (puerta * 2 + hoja)
} Dibujable;

static int comparar(const void *a, const void *b) {
  const Dibujable *x = a, *y = b;
  if (x->y != y->y) return x->y < y->y ? -1 : 1;
  return (int)x->tipo - (int)y->tipo;
}

typedef struct {
  const char *captura;
  int captura_ms;
  unsigned semilla;
  int ir;          // --ir dx dy: en la captura camina hacia spawn + (dx, dy)
  float ir_dx, ir_dy;
} Opciones;

static Opciones leer_opciones(int argc, char **argv) {
  Opciones o = { NULL, 0, (unsigned)time(NULL), 0, 0, 0 };
  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--semilla") == 0 && i + 1 < argc) {
      o.semilla = (unsigned)strtoul(argv[++i], NULL, 10);
    } else if (strcmp(argv[i], "--captura") == 0 && i + 1 < argc) {
      o.captura = argv[++i];
      if (i + 1 < argc && argv[i + 1][0] != '-') o.captura_ms = atoi(argv[++i]);
    } else if (strcmp(argv[i], "--ir") == 0 && i + 2 < argc) {
      o.ir = 1;
      o.ir_dx = strtof(argv[++i], NULL);
      o.ir_dy = strtof(argv[++i], NULL);
    }
  }
  return o;
}

static void dibujar_jugador(const Renderer2D *r, const Hoja *hoja, const Animador *a, const Personaje *p) {
  const Cuadro *c = animador_cuadro(a);
  if (!c) return;
  float pies = p->y + PLAYER_FEET_PADDING;
  // El ancla es el centro del cuadro, como placeFrame.
  Rect2D d = { roundf(p->x - c->origen.w / 2), roundf(pies - c->origen.h), c->origen.w, c->origen.h };
  r->sprite(hoja->textura, c->origen, d, BLANCO2, 0);
}

int main(int argc, char **argv) {
  Opciones op = leer_opciones(argc, argv);
  Renderer2D *r = &gpu2d_sdl_renderer2d;
  if (r->init("Delirio", 1280, 720, TARGET_VIEW_HEIGHT) != 0) return 1;

  juego_iniciar(op.semilla);
  printf("semilla %u\n", op.semilla);
  const Entity *j = juego_jugador();

  VistaLaberinto vista;
  Hoja hoja;
  if (vista_iniciar(&vista, r, RUTA_PUBLIC "/assets/maze_tiles", juego_laberinto(),
                    j->posicion.x, j->posicion.y) ||
      hoja_cargar(&hoja, r, RUTA_PUBLIC "/sprites/personaje_3")) {
    r->shutdown();
    return 1;
  }

  Personaje p;
  personaje_iniciar(&p, j->posicion.x, j->posicion.y);
  personaje_sincronizar(&p, j->posicion.x, j->posicion.y, 0, 0, j->estados, 0, 0, 0, 0, 0);
  Animador anim = { .hoja = &hoja };
  char tag[48];
  animador_tocar(&anim, personaje_tag(&p, tag, sizeof tag), 1);

  Camara cam = { .x = p.x, .y = p.y - PLAYER_BODY_HEIGHT / 2.0f };
  const float spawn_x = p.x, spawn_y = p.y;
  const float mundo = (float)(LAB_TILES * LAB_TILE);
  int corriendo = 0;
  uint32_t antes = r->ticks_ms();
  int simulado_ms = 0;
  static Dibujable lista[LAB_TILES + 16];

  while (!r->poll_quit() && !r->tecla(T2_ESCAPE)) {
    float dt;
    if (op.captura) {
      dt = 16;                         // pasos fijos: la captura sale igual siempre
    } else {
      uint32_t ahora = r->ticks_ms();
      dt = fminf((float)(ahora - antes), 100.0f); // una pausa larga no teletransporta
      antes = ahora;
    }
    float W = (float)r->ancho_interno(), H = (float)r->alto_interno();
    cam.ancho = W;
    cam.alto = H;

    // Entrada: mantener el clic camina hacia el cursor (estilo Diablo),
    // Shift corre. El cursor pasa de pixel del lienzo a pixel del mundo.
    float mx = 0, my = 0;
    r->mouse_pos(&mx, &my);
    float wx = mx + cam.x - W / 2, wy = my + cam.y - H / 2;
    int sobre = !op.captura && r->mouse_dentro();
    if (sobre && r->mouse_boton(M2_IZQ)) juego_ir_a(wx, wy);
    if (op.captura && op.ir) juego_ir_a(spawn_x + op.ir_dx, spawn_y + op.ir_dy);
    int quiere_correr = r->tecla(T2_SHIFT);
    if (quiere_correr != corriendo) {
      corriendo = quiere_correr;
      juego_mantener_habilidad(HAB_CORRER, corriendo);
    }

    juego_actualizar(dt);

    int estaba_muerto = p.movimiento == MOV_MUERTO;
    personaje_sincronizar(&p, j->posicion.x, j->posicion.y, j->dir.x, j->dir.y, j->estados, dt,
                          sobre, wx, wy, j->posicion.y - PLAYER_BODY_HEIGHT / 2.0f);
    if (estaba_muerto && p.movimiento != MOV_MUERTO) {
      cam.x = p.x; // reaparecio en la base: salta ahi en vez de deslizarse
      cam.y = p.y - PLAYER_BODY_HEIGHT / 2.0f;
    }
    int muerto = p.movimiento == MOV_MUERTO;
    animador_tocar(&anim, personaje_tag(&p, tag, sizeof tag), !muerto);
    animador_avanzar(&anim, dt, personaje_en_reversa(&p));

    camara_seguir(&cam, p.x, p.y - PLAYER_BODY_HEIGHT / 2.0f, p.mira, dt);
    camara_limitar(&cam, mundo, mundo, WALL_HEIGHT);

    // ── Dibujar ──
    r->frame_begin(FONDO);
    // Redondeado, como camera.apply: el pixel art no tolera medio pixel.
    r->camara(-roundf(W / 2 - cam.x), -roundf(H / 2 - cam.y));
    Rect2D vis = { cam.x - W / 2, cam.y - H / 2, W, H };
    const Laberinto *lab = juego_laberinto();
    vista_piso(&vista, r, lab, vis);

    int c0, c1, r0, r1, n = 0;
    vista_celdas(vis, &c0, &c1, &r0, &r1);
    for (int fila = r0; fila <= r1; fila++)
      lista[n++] = (Dibujable){ (double)((fila + 1) * LAB_TILE), PROF_MURO, fila };
    RectPx hojas[8];
    for (int i = 0; i < 4; i++) {
      laberinto_hojas(lab, i, &hojas[i * 2]);
      for (int k = 0; k < 2; k++) {
        RectPx h = hojas[i * 2 + k];
        if (h.ancho <= 0.5f || h.alto <= 0.5f) continue;
        lista[n++] = (Dibujable){ roundf(h.y + h.alto), PROF_PUERTA, i * 2 + k };
      }
    }
    lista[n++] = (Dibujable){ p.y, PROF_JUGADOR, 0 };
    qsort(lista, (size_t)n, sizeof lista[0], comparar);

    for (int i = 0; i < n; i++) {
      switch (lista[i].tipo) {
        case PROF_MURO: vista_fila_muros(&vista, r, lab, lista[i].dato, c0, c1); break;
        case PROF_PUERTA: vista_hoja_puerta(&vista, r, hojas[lista[i].dato]); break;
        case PROF_JUGADOR: dibujar_jugador(r, &hoja, &anim, &p); break;
      }
    }
    r->frame_end();

    if (op.captura) {
      simulado_ms += 16;
      if (simulado_ms >= op.captura_ms) {
        int fallo = gpu2d_sdl_capturar_bmp(op.captura);
        printf("lienzo %dx%d escala %d, jugador (%.0f, %.0f) -> %s\n", r->ancho_interno(),
               r->alto_interno(), r->escala(), p.x, p.y, fallo ? "fallo" : op.captura);
        break;
      }
    } else {
      r->delay_ms(1);
    }
  }
  r->shutdown();
  return 0;
}
