#include "personaje.h"

#include "entidad.h"

#include <math.h>
#include <stdio.h>

static const char *NOMBRES[DIRECCIONES] = {
  "right", "down_right", "front", "down_left", "left", "up_left", "back", "up_right",
};

#define TURN_STEP_MS 60      // tiempo en cada direccion intermedia del giro
// Los giros cerrados (135 grados o mas) son un pivote: deja de dar pasos y
// rota en el lugar, mas lento, para que se lea el giro.
#define PIVOT_MIN_STEPS 3
#define PIVOT_STEP_MS 85
#define LOOK_DEAD_ZONE 16    // px: tan cerca del cuerpo el angulo salta con cada pixel
// Caminar alejandose de donde mira (mas de ~100 grados) pasa el ciclo al
// reves, asi los pies empujan para el lado correcto.
#define BACKWARDS_DOT -0.2f

#define LOOK_AHEAD_X 110     // px que la camara se adelanta hacia donde mira
#define LOOK_AHEAD_Y 60
#define SMOOTHING_MS 300
#define LEAD_SMOOTHING_MS 900

const char *direccion_nombre(int d) { return NOMBRES[(d % DIRECCIONES + DIRECCIONES) % DIRECCIONES]; }

int direccion_de_vector(float x, float y) {
  int i = (int)lroundf(atan2f(y, x) / ((float)M_PI / 4.0f));
  return (i + DIRECCIONES) % DIRECCIONES;
}

void direccion_vector(int d, float *x, float *y) {
  float a = (float)d * ((float)M_PI / 4.0f);
  *x = cosf(a);
  *y = sinf(a);
}

// Pasos que hacen falta para ir de una direccion a la otra (0..4).
static int distancia_giro(int de, int a) {
  int horario = (a - de + DIRECCIONES) % DIRECCIONES;
  return horario < DIRECCIONES - horario ? horario : DIRECCIONES - horario;
}

// Un paso hacia `a` por el camino mas corto. Media vuelta pasa por "front":
// gira hacia la camara en vez de mostrar la espalda.
static int paso_hacia(int de, int a) {
  int horario = (a - de + DIRECCIONES) % DIRECCIONES;
  if (horario == 0) return de;
  int paso;
  if (horario < DIRECCIONES / 2) paso = 1;
  else if (horario > DIRECCIONES / 2) paso = -1;
  else paso = (DIR_FRENTE - de + DIRECCIONES) % DIRECCIONES <= DIRECCIONES / 2 ? 1 : -1;
  return (de + paso + DIRECCIONES) % DIRECCIONES;
}

void personaje_iniciar(Personaje *p, float x, float y) {
  *p = (Personaje){ .x = x, .y = y, .mira = DIR_FRENTE, .mira_objetivo = DIR_FRENTE };
}

static void avanzar_giro(Personaje *p, float dt_ms) {
  if (p->mira == p->mira_objetivo) {
    p->reloj_giro_ms = 0;
    p->pivotando = 0;
    return;
  }
  float paso_ms = p->pivotando ? PIVOT_STEP_MS : TURN_STEP_MS;
  p->reloj_giro_ms += dt_ms;
  while (p->mira != p->mira_objetivo && p->reloj_giro_ms >= paso_ms) {
    p->reloj_giro_ms -= paso_ms;
    p->mira = paso_hacia(p->mira, p->mira_objetivo);
  }
  if (p->mira == p->mira_objetivo) p->pivotando = 0;
}

void personaje_sincronizar(Personaje *p, float x, float y, float dir_x, float dir_y,
                           int estado, float dt_ms, int mirar, float mx, float my, float desde_y) {
  p->x = x;
  p->y = y;
  p->mover_x = dir_x;
  p->mover_y = dir_y;
  switch (estado) {
    case CAMINANDO: p->movimiento = MOV_CAMINA; break;
    case CORRIENDO: p->movimiento = MOV_CORRE; break;
    case MUERTO: p->movimiento = MOV_MUERTO; break;
    default: p->movimiento = MOV_QUIETO; break; // QUIETO y ATACANDO
  }
  if (p->movimiento == MOV_MUERTO) {
    // Vuelve mirando a la camara, sin un giro a medias.
    p->mira = p->mira_objetivo = DIR_FRENTE;
    p->pivotando = 0;
    return;
  }
  int objetivo = -1;
  if (mirar) {
    float dx = mx - x, dy = my - desde_y;
    if (hypotf(dx, dy) > LOOK_DEAD_ZONE) objetivo = direccion_de_vector(dx, dy);
  } else if (dir_x != 0 || dir_y != 0) {
    objetivo = direccion_de_vector(dir_x, dir_y);
  }
  if (objetivo >= 0 && objetivo != p->mira_objetivo) {
    p->mira_objetivo = objetivo;
    if (distancia_giro(p->mira, objetivo) >= PIVOT_MIN_STEPS) p->pivotando = 1;
  }
  avanzar_giro(p, dt_ms);
}

const char *personaje_tag(const Personaje *p, char *buf, int largo) {
  static const char *MOV[] = { "idle", "walk", "run", "death" };
  if (p->movimiento == MOV_MUERTO) {
    snprintf(buf, (size_t)largo, "death");
    return buf;
  }
  // Durante el pivote se muestra quieto: las piernas no siguen dando pasos.
  Movimiento m = p->pivotando ? MOV_QUIETO : p->movimiento;
  snprintf(buf, (size_t)largo, "%s_%s", MOV[m], direccion_nombre(p->mira));
  return buf;
}

int personaje_en_reversa(const Personaje *p) {
  if (p->pivotando || p->movimiento == MOV_QUIETO || p->movimiento == MOV_MUERTO) return 0;
  float fx, fy;
  direccion_vector(p->mira, &fx, &fy);
  float largo = hypotf(p->mover_x, p->mover_y);
  if (largo == 0) return 0;
  return (fx * p->mover_x + fy * p->mover_y) / largo < BACKWARDS_DOT;
}

void camara_seguir(Camara *c, float x, float y, int mira, float dt_ms) {
  float dx, dy;
  direccion_vector(mira, &dx, &dy);
  // Suavizado exponencial: se siente igual a cualquier FPS.
  float t_ade = 1.0f - expf(-dt_ms / LEAD_SMOOTHING_MS);
  c->adelanto_x += (dx * LOOK_AHEAD_X - c->adelanto_x) * t_ade;
  c->adelanto_y += (dy * LOOK_AHEAD_Y - c->adelanto_y) * t_ade;
  float t = 1.0f - expf(-dt_ms / SMOOTHING_MS);
  c->x += (x + c->adelanto_x - c->x) * t;
  c->y += (y + c->adelanto_y - c->y) * t;
}

static float limitar(float v, float lo, float hi) { return v < lo ? lo : v > hi ? hi : v; }

void camara_limitar(Camara *c, float ancho_mundo, float alto_mundo, float sobre_arriba) {
  c->x = limitar(c->x, c->ancho / 2, ancho_mundo - c->ancho / 2);
  c->y = limitar(c->y, c->alto / 2 - sobre_arriba, alto_mundo - c->alto / 2);
}
