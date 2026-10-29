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
//   ia_enemigos.c        -> IA de enemigos nivel 1 (el paso al azar)
//   enemigos.c           -> enemigos nivel 1 en el laberinto: miedo y coraje,
//                           rondas que charlan y manadas que cazan
//   arbustos.c           -> arbustos donde el jugador se esconde
//
// Los tipos compartidos (Entity, Direccion, Estado...) estan en entidad.h.
// E => Enemigo
// P => Personaje Principal

#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#include "juego.h"
#include "mecanicas/combate.h"
#include "mecanicas/enemigos.h"
#include "mecanicas/ia_enemigos.h"
#include "mecanicas/jugador.h"
#include "mecanicas/laberinto.h"
#include "mecanicas/mecanica.h"

// ########################################################
// Estado del juego
static Laberinto laberinto;
static Jugador jugador;
static Entity medusa;
static Enemigos enemigos;
static Reloj reloj;
static float velocidad_tiempo = 1.0f; // para probar: acelera solo el reloj

#define ALCANCE_GOLPE 46.0f     // hasta donde llega un golpe del jugador (pixeles)
#define RADIO_GOLPE_SUELO 70.0f
#define DANIO_GOLPE_SUELO 25
// Pega solo: si un enemigo vivo esta a esta distancia de sus pies, el
// jugador se da vuelta hacia el y le tira un ataque ligero. Un poco mas que
// ALCANCE_GOLPE, y ese golpe llega hasta aca (apunta justo al enemigo).
#define RADIO_AUTO_ATAQUE 56.0f

static int auto_ataques;          // cuantas veces pego solo (el navegador lo mira)

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
  enemigos_iniciar(&enemigos, &laberinto, base.posicion, semilla);
  reloj_iniciar(&reloj);
}

void juego_ir_a(float x, float y){
  jugador_ir_a(&jugador, (Direccion){x, y});
}

// Lo mismo que apretar la tecla, con el alcance del golpe.
static void usar_habilidad(int habilidad, float alcance){
  if (!jugador_usar(&jugador, habilidad)) return; // recargando
  // Los ataques le pegan a la medusa de prueba y a los enemigos de adelante
  if (habilidad_es_ataque(habilidad)){
    atacar(&jugador.entidad, &medusa);
    enemigos_golpe_jugador(&enemigos, &jugador, alcance, jugador.entidad.danio + jugador.entidad.items.damage);
  }
  // El golpe al suelo les pega a todos los de alrededor y asusta al resto
  if (habilidad == HAB_ULTI) enemigos_golpe_suelo(&enemigos, jugador.entidad.posicion, RADIO_GOLPE_SUELO, DANIO_GOLPE_SUELO);
  // Pegar desde un arbusto lo delata
  if (habilidad_es_ataque(habilidad) || habilidad == HAB_ULTI) enemigos_delatar(&enemigos);
}

void juego_usar_habilidad(int habilidad){
  usar_habilidad(habilidad, ALCANCE_GOLPE);
}

// Un enemigo muy cerca: se da vuelta hacia el y le pega (solo a enemigos).
// No toca el destino del mouse: sigue caminando despues del golpe.
static void auto_atacar(void){
  if (jugador_muerto(&jugador)) return;
  for (int h = HAB_ATAQUE_LIGERO; h <= HAB_ATAQUE_CRITICO; h++){
    if (jugador_activa(&jugador, h)) return; // ya esta pegando
  }
  if (jugador_activa(&jugador, HAB_SALTAR) || jugador_activa(&jugador, HAB_BLOQUEAR) || jugador_activa(&jugador, HAB_ULTI)) return;
  if (jugador_recarga_restante(&jugador, HAB_ATAQUE_LIGERO) > 0) return;
  Direccion hacia;
  if (!enemigos_mas_cercano(&enemigos, jugador.entidad.posicion, RADIO_AUTO_ATAQUE, &hacia)) return;
  jugador.entidad.dir = hacia;
  auto_ataques++;
  usar_habilidad(HAB_ATAQUE_LIGERO, RADIO_AUTO_ATAQUE);
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
  auto_atacar();

  // 4. Los enemigos: rodean al jugador y, cuando se animan, le pegan
  if (enemigos_actualizar(&enemigos, &laberinto, &jugador, dt_ms) > 0 && jugador.entidad.vida <= 0){
    printf("Te mataron los enemigos\n");
    jugador_morir(&jugador, laberinto_aparicion(&laberinto));
  }
}

const Entity *juego_jugador(void){ return &jugador.entidad; }
const Jugador *juego_jugador_completo(void){ return &jugador; }
int juego_hay_destino(void){ return jugador.hay_destino; }
Direccion juego_destino(void){ return jugador.destino; }
const Reloj *juego_reloj(void){ return &reloj; }
const Laberinto *juego_laberinto(void){ return &laberinto; }

int juego_agregar_obstaculo(float x, float y, float ancho, float alto){
  return laberinto_agregar_obstaculo(&laberinto, (RectPx){x, y, ancho, alto});
}

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

#define ALCANCE_LANZA 320.0f
static Direccion lanza_cae;

int juego_lanzar(float dx, float dy){
  lanza_cae = jugador.entidad.posicion;
  if (jugador_muerto(&jugador)) return -1;
  return enemigos_lanza(&enemigos, &laberinto, jugador.entidad.posicion, (Direccion){dx, dy}, ALCANCE_LANZA,
                        &lanza_cae);
}

Direccion juego_lanza_cae(void){ return lanza_cae; }

void juego_desclavar(int i){
  if (i >= 0 && i < ENEMIGOS_MAX) enemigos_desclavar(&enemigos, i);
}

const Entity *juego_medusa(void){ return &medusa; }
const Enemigos *juego_enemigos(void){ return &enemigos; }
int juego_auto_ataques(void){ return auto_ataques; }

void juego_curar(int vida){
  if (jugador_muerto(&jugador)) return;
  jugador.entidad.vida += vida;
  if (jugador.entidad.vida > jugador.entidad.vidaMAX) jugador.entidad.vida = jugador.entidad.vidaMAX;
}

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
