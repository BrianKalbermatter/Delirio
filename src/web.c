// Browser bridge: exposes the game logic in main.c to JavaScript.
// The C <-> JS boundary only carries numbers, so every exported function
// takes and returns ints. Game state lives here, on the C side.

#include <emscripten/emscripten.h>
#include "main.c"

static P_personaje jugador = {.vidaMax = 100, .vida = 100, .atacarEnemigo = 15};
static E_medusa medusa = {.vidaMax = 40, .vida = 40, .atacarPersonaje = 8};

EMSCRIPTEN_KEEPALIVE
int web_atacar(void) {
  return atacar(&jugador, &medusa);
}

EMSCRIPTEN_KEEPALIVE
int web_medusa_vida(void) {
  return medusa.vida;
}

EMSCRIPTEN_KEEPALIVE
int web_medusa_vida_max(void) {
  return medusa.vidaMax;
}

EMSCRIPTEN_KEEPALIVE
void web_reset(void) {
  medusa.vida = medusa.vidaMax;
  jugador.vida = jugador.vidaMax;
}
