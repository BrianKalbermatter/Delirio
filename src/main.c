// main.c: el LLAMADOR del juego.
//
// No implementa mecanicas: guarda el estado del juego y, en cada paso,
// llama a cada mecanica en orden. Las mecanicas viven en mecanicas/:
//   mecanica.c           -> el reloj: dia, tarde, noche, cuando se expande el laberinto
//   laberinto.c          -> el laberinto: generacion aleatoria, expansion y choques
//   jugador.c            -> jugadores principales: habilidades y movimiento
//   movimiento_mouse.c   -> caminar hacia donde se hizo click
//   movimiento_teclado.c -> WASD (sin usar por ahora)
//   combate.c            -> atacar
//   ia_enemigos.c        -> IA de enemigos nivel 1
//
// Los tipos compartidos (Entity, Direccion, Estado...) estan en entidad.h.
// E => Enemigo
// P => Personaje Principal

#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#include "juego.h"
#include "mecanicas/combate.h"
#include "mecanicas/ia_enemigos.h"
#include "mecanicas/jugador.h"
#include "mecanicas/laberinto.h"
#include "mecanicas/mecanica.h"

// ########################################################
// Estado del juego
static Laberinto laberinto;
static Jugador jugador;
static Entity medusa;
static Reloj reloj;
static float velocidad_tiempo = 1.0f; // para probar: acelera solo el reloj

// ########################################################
// Llamadas a las mecanicas

void juego_iniciar(unsigned int semilla){
  laberinto_iniciar(&laberinto, semilla);
  printf("Laberinto con semilla %u\n", semilla);

  Entity base = {.vidaMAX = 100, .vida = 100, .danio = 15, .items = mochila_personaje};
  base.posicion = laberinto_aparicion(&laberinto);
  base.estados = QUIETO;
  jugador_iniciar(&jugador, "Personaje_2", HABILIDADES_BASE, base);
  medusa = (Entity){.vidaMAX = 40, .vida = 40, .danio = 8};
  reloj_iniciar(&reloj);
}

void juego_ir_a(float x, float y){
  jugador_ir_a(&jugador, (Direccion){x, y});
}

void juego_usar_habilidad(int habilidad){
  if (!jugador_usar(&jugador, habilidad)) return; // recargando
  // Los ataques le pegan a la medusa de prueba
  if (habilidad_es_ataque(habilidad)) atacar(&jugador.entidad, &medusa);
}

void juego_mantener_habilidad(int habilidad, int apretada){
  jugador_mantener(&jugador, habilidad, apretada);
}

void juego_actualizar(float dt_ms){
  // 1. El tiempo
  int eventos = reloj_avanzar(&reloj, dt_ms * velocidad_tiempo);
  if (eventos & EVENTO_NUEVO_DIA)   printf("Amanece el dia %d\n", reloj.dia);
  if (eventos & EVENTO_ANOCHECER)   printf("Cae la noche del dia %d\n", reloj.dia);
  if (eventos & EVENTO_CAMBIO_FASE) printf("Ahora es %s\n", reloj_nombre_fase(reloj.fase));
  if (eventos & EVENTO_EXPANSION){
    if (laberinto_expandir(&laberinto)) printf("El laberinto crece (expansion %d)\n", reloj.expansiones);
    else printf("El laberinto ya no puede crecer mas\n");
  }

  // 2. Las puertas de la plaza: abiertas de dia, cerradas de noche, y se
  //    cierran de a poco. No esperan a nadie: el que no llego, pasa la noche
  //    afuera. Si una hoja alcanza a alguien en el medio, lo aplasta.
  float antes = laberinto.apertura;
  laberinto_apertura(&laberinto, reloj_apertura_puertas(&reloj));
  if (antes == 1.0f && laberinto.apertura < 1.0f) printf("Las puertas se empiezan a cerrar\n");
  if (antes > 0.0f && laberinto.apertura == 0.0f) printf("Las puertas se cerraron\n");
  if (antes == 0.0f && laberinto.apertura > 0.0f) printf("Las puertas se abren\n");
  if (laberinto_aplasta(&laberinto, jugador.entidad.posicion)){
    printf("La puerta te aplasto\n");
    jugador_morir(&jugador, laberinto_aparicion(&laberinto)); // reaparece en la base
  }

  // 3. El jugador: habilidades y movimiento, chocando con el laberinto
  jugador_actualizar(&jugador, &laberinto, dt_ms);
}

const Entity *juego_jugador(void){ return &jugador.entidad; }
const Jugador *juego_jugador_completo(void){ return &jugador; }
int juego_hay_destino(void){ return jugador.hay_destino; }
Direccion juego_destino(void){ return jugador.destino; }
const Reloj *juego_reloj(void){ return &reloj; }
const Laberinto *juego_laberinto(void){ return &laberinto; }

void juego_velocidad_tiempo(float factor){ velocidad_tiempo = factor; }

void juego_prueba_puertas(void){
  // Hasta 15 s antes del cierre, o lo que entre en la tarde (con tiempos de prueba es menos)
  float margen = DURACION_TARDE_MS - CIERRE_PUERTAS_MS;
  float antes = margen < 15000.0f ? margen : 15000.0f;
  reloj_saltar_a_cierre(&reloj, antes);
  velocidad_tiempo = 1.0f;
  jugador.entidad.posicion = laberinto_frente_a_puerta(&laberinto, 0, 120.0f);
  jugador.entidad.dir = (Direccion){0, -1}; // mirando a la puerta
  jugador.hay_destino = 0;
  printf("Prueba: las puertas se empiezan a cerrar en %.0f s\n", antes / 1000.0f);
}

const Entity *juego_medusa(void){ return &medusa; }

void juego_reiniciar(void){
  medusa.vida = medusa.vidaMAX;
  jugador.entidad.vida = jugador.entidad.vidaMAX;
}

// ########################################################
// Hoja de ruta

// Carga de sprite del laberinto
// Expansion de del laberinto, despues de la 3ra Oleada de enemigos

// Colocar los muros
// minimapa -> Lo que vas dibujando el jugador

// El problema del laberinto que encontre de que sea aleatorio, puede quedar mucho espacio sin poder pisar el jugador en el laberinto.

// CRAFTEOS:
//

// MADERA -> ARBOLES
// PIEDRA -> PIEDRAS, ROCAS, PIEDRITAS
// PALOS -> MADERA
// ORO -> MOUSTRUOS
// DIAMANTE -> MOUSTRUOS
// TERRACOTA -> COMO LA PIEDRAS ESTAN POR AHI
// HESMERALDA -> MOUSTRUOS

// ########################################################

int main(void){
  srand(time(NULL)); // Como el rand del ia_enemigos(); no es exactamente random, son numeros siempre generados igual se usa esta libreria, como la hora cambia siempre se usa para que sean semillas aleatorias, como en minecraft
  for (int i=0; i < 5; i++){
      int ia = ia_enemigos();
      printf("vuelta %d\n", ia);
  }
}
