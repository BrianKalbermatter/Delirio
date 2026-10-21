#include "hoja.h"

#include "json.h"
#include "personaje.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int hoja_cargar(Hoja *h, const Renderer2D *r, const char *ruta_base) {
  char ruta[512];
  memset(h, 0, sizeof *h);

  snprintf(ruta, sizeof ruta, "%s.json", ruta_base);
  Json *datos = json_leer_archivo(ruta);
  if (!datos) {
    fprintf(stderr, "[hoja] no pude leer %s\n", ruta);
    return 1;
  }
  const Json *cuadros = json_campo(datos, "frames");
  const Json *tags = json_campo(json_campo(datos, "meta"), "frameTags");
  h->n_cuadros = cuadros ? cuadros->cantidad : 0;
  h->n_anims = tags ? tags->cantidad : 0;
  h->cuadros = calloc((size_t)(h->n_cuadros ? h->n_cuadros : 1), sizeof *h->cuadros);
  h->anims = calloc((size_t)(h->n_anims ? h->n_anims : 1), sizeof *h->anims);

  for (int i = 0; i < h->n_cuadros; i++) {
    const Json *c = json_indice(cuadros, i);
    const Json *f = json_campo(c, "frame");
    h->cuadros[i].origen = (Rect2D){
      (float)json_numero(json_campo(f, "x"), 0), (float)json_numero(json_campo(f, "y"), 0),
      (float)json_numero(json_campo(f, "w"), 0), (float)json_numero(json_campo(f, "h"), 0),
    };
    h->cuadros[i].duracion_ms = (int)json_numero(json_campo(c, "duration"), 100);
  }
  for (int i = 0; i < h->n_anims; i++) {
    const Json *t = json_indice(tags, i);
    const char *nombre = json_texto(json_campo(t, "name"));
    snprintf(h->anims[i].nombre, sizeof h->anims[i].nombre, "%s", nombre ? nombre : "");
    h->anims[i].desde = (int)json_numero(json_campo(t, "from"), 0);
    h->anims[i].hasta = (int)json_numero(json_campo(t, "to"), 0);
  }
  json_liberar(datos);

  snprintf(ruta, sizeof ruta, "%s.png", ruta_base);
  h->textura = r->textura_cargar(ruta);
  return h->textura == TEXTURA2D_NULA;
}

const Animacion *hoja_animacion(const Hoja *h, const char *tag) {
  for (int i = 0; i < h->n_anims; i++)
    if (strcmp(h->anims[i].nombre, tag) == 0) return &h->anims[i];
  return NULL;
}

// El tag sin el sufijo de direccion: "walk_down_left" -> largo de "walk".
// Se prueban las direcciones mas largas primero, asi "down_left" gana a
// "left".
static size_t largo_movimiento(const char *tag) {
  size_t largo = strlen(tag), mejor = 0;
  for (int i = 0; i < DIRECCIONES; i++) {
    size_t d = strlen(direccion_nombre(i));
    if (d > mejor && largo > d && tag[largo - d - 1] == '_' &&
        strcmp(tag + largo - d, direccion_nombre(i)) == 0)
      mejor = d;
  }
  return mejor ? largo - mejor - 1 : largo;
}

static int mismo_movimiento(const char *a, const char *b) {
  size_t la = largo_movimiento(a), lb = largo_movimiento(b);
  return la == lb && strncmp(a, b, la) == 0;
}

void animador_tocar(Animador *a, const char *tag, int repetir) {
  a->repetir = repetir;
  if (a->anim && strcmp(a->anim->nombre, tag) == 0) return;
  const Animacion *nueva = hoja_animacion(a->hoja, tag);
  if (!nueva) {
    fprintf(stderr, "[hoja] falta la animacion %s\n", tag);
    return;
  }
  if (!a->anim || !mismo_movimiento(a->anim->nombre, tag)) {
    a->cuadro = 0;
    a->reloj_ms = 0;
  }
  a->anim = nueva;
}

void animador_avanzar(Animador *a, float dt_ms, int reversa) {
  if (!a->anim) return;
  int n = a->anim->hasta - a->anim->desde + 1;
  if (n <= 0) return;
  int paso = reversa ? n - 1 : 1;
  a->cuadro %= n;
  a->reloj_ms += dt_ms;
  for (;;) {
    int dur = a->hoja->cuadros[a->anim->desde + a->cuadro].duracion_ms;
    if (dur <= 0 || a->reloj_ms < (float)dur) break;
    int ultimo = reversa ? a->cuadro == 0 : a->cuadro == n - 1;
    if (!a->repetir && ultimo) {
      a->reloj_ms = 0;
      break;
    }
    a->reloj_ms -= (float)dur;
    a->cuadro = (a->cuadro + paso) % n;
  }
}

const Cuadro *animador_cuadro(const Animador *a) {
  if (!a->anim) return NULL;
  int n = a->anim->hasta - a->anim->desde + 1;
  if (n <= 0) return NULL;
  return &a->hoja->cuadros[a->anim->desde + a->cuadro % n];
}
