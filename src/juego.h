// Lo que el nucleo del juego (main.c) ofrece hacia afuera.
// web.c lo usa para conectar el navegador; otro frontend podria usarlo igual.
#ifndef JUEGO_H
#define JUEGO_H

#include "entidad.h"
#include "mecanicas/enemigos.h"
#include "mecanicas/jugador.h"
#include "mecanicas/laberinto.h"
#include "mecanicas/mecanica.h"

// Genera el laberinto con `semilla` (la misma semilla, el mismo laberinto)
// y pone al jugador en su centro.
void juego_iniciar(unsigned int semilla);

// El jugador apunto con el mouse a (x, y) del mundo: caminar hasta ahi.
void juego_ir_a(float x, float y);

// Habilidades (HabilidadId en mecanicas/jugador.h).
void juego_usar_habilidad(int habilidad);                  // instantaneas
void juego_mantener_habilidad(int habilidad, int apretada); // mantenidas

// Un paso de juego: avanza el reloj y todas las mecanicas dt_ms milisegundos.
void juego_actualizar(float dt_ms);

// Estado para leer (y dibujar)
const Entity *juego_jugador(void);
const Jugador *juego_jugador_completo(void); // con sus habilidades
int juego_hay_destino(void);
Direccion juego_destino(void);
const Reloj *juego_reloj(void);
const Laberinto *juego_laberinto(void);

// Una caja solida sobre el piso (un tronco), en pixeles del mundo.
// Devuelve 0 si ya no entran mas.
int juego_agregar_obstaculo(float x, float y, float ancho, float alto);

// Para probar: multiplica la velocidad del reloj (1 = normal). No acelera el
// movimiento, solo el paso de los dias.
void juego_velocidad_tiempo(float factor);

// Para probar: lleva el reloj a poco antes de que las puertas empiecen a
// cerrarse (hasta 15 s), a velocidad normal, y pone al jugador frente a la
// puerta de arriba.
void juego_prueba_puertas(void);

// El jugador tira la lanza hacia (dx, dy) (ver enemigos_lanza; con `probar`
// solo dice que pasaria). Devuelve el hueco del enemigo que mato (-1:
// ninguno); juego_lanza_impacto() dice donde le dio y juego_lanza_cae()
// donde quedo la lanza.
int juego_lanzar(float dx, float dy, int probar);
Direccion juego_lanza_impacto(void);

// Mientras el jugador tira la lanza (de apuntar a terminar el tiro) no usa
// habilidades ni pega solo: el tiro no se corta.
void juego_lanzando(int si);
Direccion juego_lanza_cae(void);

// Le saca la lanza al enemigo `i` clavado a un muro (ver enemigos_desclavar).
void juego_desclavar(int i);

// Medusa de prueba (los ataques del jugador le pegan)
const Entity *juego_medusa(void);

// Enemigos de nivel 1 (mecanicas/enemigos.h)
const Enemigos *juego_enemigos(void);

// Cuantas veces pego solo el jugador (un enemigo se le acerco mucho). Sube
// en uno con cada golpe; la direccion de ese golpe queda en su dir.
int juego_auto_ataques(void);

// El enemigo al que el jugador le pega solo ahora (-1: ninguno).
int juego_auto_objetivo(void);

// Le devuelve vida al jugador (una pocion), sin pasarse del maximo.
void juego_curar(int vida);
void juego_reiniciar(void);

#endif
