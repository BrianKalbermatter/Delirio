#include "json.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Descenso recursivo: cada funcion lee UN valor desde *p y deja *p justo
// despues de el. Un error devuelve NULL y se corta todo.
typedef struct { const char *p; } Lector;

static void saltar_blancos(Lector *l) {
  while (isspace((unsigned char)*l->p)) l->p++;
}

static Json *nuevo(JsonTipo tipo) {
  Json *j = calloc(1, sizeof *j);
  if (j) j->tipo = tipo;
  return j;
}

static Json *leer_valor(Lector *l);

// Un texto entre comillas. Los escapes \n, \" y \\ se resuelven; \uXXXX se
// deja como '?' (ningun atlas lo usa).
static char *leer_texto_crudo(Lector *l) {
  if (*l->p != '"') return NULL;
  l->p++;
  const char *ini = l->p;
  size_t largo = 0;
  while (*l->p && *l->p != '"') {
    if (*l->p == '\\' && l->p[1]) l->p++;
    l->p++;
    largo++;
  }
  if (*l->p != '"') return NULL;
  char *s = malloc(largo + 1);
  if (!s) return NULL;
  size_t n = 0;
  for (const char *q = ini; q < l->p; q++) {
    if (*q == '\\') {
      q++;
      switch (*q) {
        case 'n': s[n++] = '\n'; break;
        case 't': s[n++] = '\t'; break;
        case 'u': s[n++] = '?'; q += 4; break;
        default: s[n++] = *q; break;
      }
    } else {
      s[n++] = *q;
    }
  }
  s[n] = '\0';
  l->p++;
  return s;
}

// Lee los hijos de un arreglo ([v, v]) o de un objeto ({"k": v}).
static Json *leer_contenedor(Lector *l, JsonTipo tipo, char cierre) {
  Json *j = nuevo(tipo);
  if (!j) return NULL;
  l->p++;
  Json **cola = &j->hijos;
  saltar_blancos(l);
  if (*l->p == cierre) { l->p++; return j; }
  for (;;) {
    char *clave = NULL;
    saltar_blancos(l);
    if (tipo == JSON_OBJETO) {
      clave = leer_texto_crudo(l);
      saltar_blancos(l);
      if (!clave || *l->p != ':') { free(clave); json_liberar(j); return NULL; }
      l->p++;
    }
    Json *hijo = leer_valor(l);
    if (!hijo) { free(clave); json_liberar(j); return NULL; }
    hijo->clave = clave;
    *cola = hijo;
    cola = &hijo->siguiente;
    j->cantidad++;
    saltar_blancos(l);
    if (*l->p == ',') { l->p++; continue; }
    if (*l->p == cierre) { l->p++; return j; }
    json_liberar(j);
    return NULL;
  }
}

static Json *leer_valor(Lector *l) {
  saltar_blancos(l);
  char c = *l->p;
  if (c == '{') return leer_contenedor(l, JSON_OBJETO, '}');
  if (c == '[') return leer_contenedor(l, JSON_ARREGLO, ']');
  if (c == '"') {
    Json *j = nuevo(JSON_TEXTO);
    if (j && !(j->texto = leer_texto_crudo(l))) { free(j); return NULL; }
    return j;
  }
  if (strncmp(l->p, "true", 4) == 0 || strncmp(l->p, "false", 5) == 0) {
    Json *j = nuevo(JSON_BOOL);
    if (j) j->numero = (c == 't');
    l->p += (c == 't') ? 4 : 5;
    return j;
  }
  if (strncmp(l->p, "null", 4) == 0) {
    l->p += 4;
    return nuevo(JSON_NULO);
  }
  char *fin = NULL;
  double n = strtod(l->p, &fin);
  if (fin == l->p) return NULL;
  l->p = fin;
  Json *j = nuevo(JSON_NUMERO);
  if (j) j->numero = n;
  return j;
}

Json *json_leer_archivo(const char *ruta) {
  FILE *f = fopen(ruta, "rb");
  if (!f) return NULL;
  fseek(f, 0, SEEK_END);
  long largo = ftell(f);
  fseek(f, 0, SEEK_SET);
  char *texto = malloc((size_t)largo + 1);
  if (!texto) { fclose(f); return NULL; }
  size_t leidos = fread(texto, 1, (size_t)largo, f);
  fclose(f);
  texto[leidos] = '\0';

  Lector l = { texto };
  Json *j = leer_valor(&l);
  free(texto);
  return j;
}

void json_liberar(Json *j) {
  while (j) {
    Json *sig = j->siguiente;
    json_liberar(j->hijos);
    free(j->texto);
    free(j->clave);
    free(j);
    j = sig;
  }
}

const Json *json_campo(const Json *o, const char *clave) {
  if (!o || o->tipo != JSON_OBJETO) return NULL;
  for (const Json *h = o->hijos; h; h = h->siguiente)
    if (h->clave && strcmp(h->clave, clave) == 0) return h;
  return NULL;
}

const Json *json_indice(const Json *a, int i) {
  if (!a || (a->tipo != JSON_ARREGLO && a->tipo != JSON_OBJETO) || i < 0) return NULL;
  const Json *h = a->hijos;
  while (h && i-- > 0) h = h->siguiente;
  return h;
}

double json_numero(const Json *j, double si_falta) {
  return (j && (j->tipo == JSON_NUMERO || j->tipo == JSON_BOOL)) ? j->numero : si_falta;
}

const char *json_texto(const Json *j) {
  return (j && j->tipo == JSON_TEXTO) ? j->texto : NULL;
}
