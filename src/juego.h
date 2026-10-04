// Lo que el nucleo del juego (main.c) ofrece hacia afuera.
// web.c lo usa para conectar el navegador; otro frontend podria usarlo igual.
#ifndef JUEGO_H
#define JUEGO_H

#include "entidad.h"
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

// Para probar: multiplica la velocidad del reloj (1 = normal). No acelera el
// movimiento, solo el paso de los dias.
void juego_velocidad_tiempo(float factor);

// Para probar: lleva el reloj a poco antes de que las puertas empiecen a
// cerrarse (hasta 15 s), a velocidad normal, y pone al jugador frente a la
// puerta de arriba.
void juego_prueba_puertas(void);

// Medusa de prueba (los ataques del jugador le pegan)
const Entity *juego_medusa(void);
void juego_reiniciar(void);

#endif
