// Puente con el navegador: traduce las funciones del juego (juego.h) a
// funciones que JavaScript puede llamar. NO tiene logica ni estado propio:
// todo eso esta en main.c y en mecanicas/.
//
// Entre C y JavaScript solo viajan numeros (int y float) y textos (const char *).
//
// Cada cuadro, el navegador hace:
//   1. web_ir_a(x, y)          -> mientras el boton esta apretado: el punto del
//                                 MUNDO donde apunta el mouse
//   2. web_actualizar(dt_ms)   -> un paso de juego
//   3. web_jugador_*(), web_hab_*() y web_reloj_*()  -> para dibujar
// Y cuando se aprieta una tecla de habilidad: web_usar(h) o web_mantener(h, 0/1).

#include <emscripten/emscripten.h>

#include "juego.h"

EMSCRIPTEN_KEEPALIVE void web_iniciar(int semilla) { juego_iniciar((unsigned int)semilla); }
EMSCRIPTEN_KEEPALIVE void web_ir_a(float x, float y) { juego_ir_a(x, y); }
EMSCRIPTEN_KEEPALIVE void web_actualizar(float dt_ms) { juego_actualizar(dt_ms); }

// Habilidades: el numero es HabilidadId (mecanicas/jugador.h)
EMSCRIPTEN_KEEPALIVE void web_usar(int h) { juego_usar_habilidad(h); }
EMSCRIPTEN_KEEPALIVE void web_mantener(int h, int apretada) { juego_mantener_habilidad(h, apretada); }
EMSCRIPTEN_KEEPALIVE int web_hab_cantidad(void) { return HAB_CANTIDAD; }
EMSCRIPTEN_KEEPALIVE const char *web_hab_nombre(int h) {
  const Jugador *j = juego_jugador_completo();
  // Antes de web_iniciar el jugador no tiene tabla todavia (NULL)
  if (!j->habilidades || h < 0 || h >= HAB_CANTIDAD) return "?";
  return j->habilidades[h].nombre;
}
EMSCRIPTEN_KEEPALIVE int web_hab_activa(int h) { return jugador_activa(juego_jugador_completo(), h); }
EMSCRIPTEN_KEEPALIVE float web_hab_recarga(int h) { return jugador_recarga_restante(juego_jugador_completo(), h); }

// Jugador
EMSCRIPTEN_KEEPALIVE float web_jugador_x(void) { return juego_jugador()->posicion.x; }
EMSCRIPTEN_KEEPALIVE float web_jugador_y(void) { return juego_jugador()->posicion.y; }
EMSCRIPTEN_KEEPALIVE float web_jugador_dir_x(void) { return juego_jugador()->dir.x; }
EMSCRIPTEN_KEEPALIVE float web_jugador_dir_y(void) { return juego_jugador()->dir.y; }
EMSCRIPTEN_KEEPALIVE int web_jugador_estado(void) { return juego_jugador()->estados; }
EMSCRIPTEN_KEEPALIVE int web_jugador_muertes(void) { return juego_jugador_completo()->muertes; }
EMSCRIPTEN_KEEPALIVE int web_jugador_delirio(void) { return juego_jugador_completo()->delirio; }

// Destino (para verificar desde el navegador que el click llego a C)
EMSCRIPTEN_KEEPALIVE int web_hay_destino(void) { return juego_hay_destino(); }
EMSCRIPTEN_KEEPALIVE float web_destino_x(void) { return juego_destino().x; }
EMSCRIPTEN_KEEPALIVE float web_destino_y(void) { return juego_destino().y; }

// Laberinto: el navegador vuelve a leer la grilla cuando cambia la version
EMSCRIPTEN_KEEPALIVE int web_lab_version(void) { return juego_laberinto()->version; }
EMSCRIPTEN_KEEPALIVE int web_lab_tiles(void) { return LAB_TILES; }
EMSCRIPTEN_KEEPALIVE int web_lab_tile(void) { return LAB_TILE; }
EMSCRIPTEN_KEEPALIVE int web_lab_muro(int col, int fila) { return laberinto_es_muro(juego_laberinto(), col, fila); }
EMSCRIPTEN_KEEPALIVE int web_lab_puerta(int col, int fila) { return laberinto_es_puerta(juego_laberinto(), col, fila); }
EMSCRIPTEN_KEEPALIVE float web_lab_apertura(void) { return juego_laberinto()->apertura; }
// Hoja `hoja` (0..1) de la puerta `i` (0..3): dato 0 = x, 1 = y, 2 = ancho, 3 = alto (pixeles)
EMSCRIPTEN_KEEPALIVE float web_lab_hoja(int i, int hoja, int dato) {
  RectPx hojas[2];
  laberinto_hojas(juego_laberinto(), i, hojas);
  float valores[4] = {hojas[hoja].x, hojas[hoja].y, hojas[hoja].ancho, hojas[hoja].alto};
  return valores[dato];
}

// Reloj
EMSCRIPTEN_KEEPALIVE int web_reloj_dia(void) { return juego_reloj()->dia; }
EMSCRIPTEN_KEEPALIVE int web_reloj_fase(void) { return juego_reloj()->fase; }
EMSCRIPTEN_KEEPALIVE float web_reloj_restante_ms(void) { return reloj_restante_fase(juego_reloj()); }
EMSCRIPTEN_KEEPALIVE int web_reloj_expansiones(void) { return juego_reloj()->expansiones; }
EMSCRIPTEN_KEEPALIVE float web_reloj_proxima_expansion_ms(void) { return reloj_proxima_expansion(juego_reloj()); }
EMSCRIPTEN_KEEPALIVE float web_reloj_luz(void) { return reloj_luz(juego_reloj()); }
EMSCRIPTEN_KEEPALIVE void web_velocidad_tiempo(float factor) { juego_velocidad_tiempo(factor); }
EMSCRIPTEN_KEEPALIVE void web_prueba_puertas(void) { juego_prueba_puertas(); }
EMSCRIPTEN_KEEPALIVE int web_reloj_compuertas(void) { return reloj_compuertas_abiertas(juego_reloj()); }
EMSCRIPTEN_KEEPALIVE float web_reloj_cambio_compuertas_ms(void) { return reloj_proximo_cambio_compuertas(juego_reloj()); }

// Medusa de prueba (barra de vida arriba a la izquierda)
EMSCRIPTEN_KEEPALIVE int web_medusa_vida(void) { return juego_medusa()->vida; }
EMSCRIPTEN_KEEPALIVE int web_medusa_vida_max(void) { return juego_medusa()->vidaMAX; }
EMSCRIPTEN_KEEPALIVE void web_reset(void) { juego_reiniciar(); }
