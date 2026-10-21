// Lector de JSON minimo: lo justo para los atlas que exporta Aseprite y
// maze_tiles.json. Arma un arbol de nodos en memoria y se consulta por
// clave o por indice. No escribe JSON ni valida mas de lo necesario.
#ifndef NATIVO_JSON_H
#define NATIVO_JSON_H

typedef enum { JSON_NULO, JSON_BOOL, JSON_NUMERO, JSON_TEXTO, JSON_ARREGLO, JSON_OBJETO } JsonTipo;

typedef struct json Json;
struct json {
  JsonTipo tipo;
  double numero;      // JSON_NUMERO y JSON_BOOL (1/0)
  char *texto;        // JSON_TEXTO
  char *clave;        // nombre del campo, si el padre es un objeto
  Json *hijos;        // arreglo u objeto: primer hijo
  Json *siguiente;    // hermano
  int cantidad;       // arreglo u objeto: cuantos hijos
};

// Lee el archivo entero. NULL si no existe o no es JSON valido.
Json *json_leer_archivo(const char *ruta);
void json_liberar(Json *j);

const Json *json_campo(const Json *objeto, const char *clave);  // NULL si no esta
const Json *json_indice(const Json *arreglo, int i);
double json_numero(const Json *j, double si_falta);
const char *json_texto(const Json *j); // NULL si no es texto

#endif
