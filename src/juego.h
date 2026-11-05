// Lo que el nucleo del juego (main.c) ofrece hacia afuera.
// web.c lo usa para conectar el navegador; otro frontend podria usarlo igual.
#ifndef JUEGO_H
#define JUEGO_H

#include "entidad.h"
#include "mecanicas/enemigos.h"
#include "mecanicas/ovejas.h"
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
// El dia de hoy en el calendario lunar. `luminosidad` es la que va a usar el
// laberinto de noche (a menor luminosidad, menos visibilidad).
const FechaLunar *juego_fecha(void);
const Laberinto *juego_laberinto(void);

// Una caja solida sobre el piso (una roca grande), en pixeles del mundo.
// Devuelve su numero (-1 si ya no entran mas); juego_quitar_obstaculo la saca.
int juego_agregar_obstaculo(float x, float y, float ancho, float alto);
void juego_quitar_obstaculo(int i);

// Para probar: multiplica la velocidad del reloj (1 = normal). No acelera el
// movimiento, solo el paso de los dias.
void juego_velocidad_tiempo(float factor);

// Para probar: pasa un dia del calendario, o va directo al dia t. No toca el
// reloj, y al recargar la partida la fecha vuelve a salir del reloj.
void juego_calendario_avanzar_dia(void);
void juego_calendario_fijar(int t);

// Para probar: lleva el reloj a poco antes de que las puertas empiecen a
// cerrarse (hasta 15 s), a velocidad normal, y pone al jugador frente a la
// puerta de arriba.
void juego_prueba_puertas(void);

// El jugador tira la lanza hacia (dx, dy) con `fuerza` (0..1, lo que cargo
// la barra): llega mas lejos cuanto mas la cargo (ver enemigos_lanza; con
// `probar` solo dice que pasaria). Devuelve el hueco del enemigo que mato (-1:
// ninguno); juego_lanza_impacto() dice donde le dio y juego_lanza_cae()
// donde quedo la lanza.
int juego_lanzar(float dx, float dy, float fuerza, int probar);
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
const Ovejas *juego_ovejas(void);

// Cuantas veces pego solo el jugador (un enemigo se le acerco mucho). Sube
// en uno con cada golpe; la direccion de ese golpe queda en su dir.
int juego_auto_ataques(void);

// El enemigo al que el jugador le pega solo ahora (-1: ninguno).
int juego_auto_objetivo(void);

// Carga un progreso guardado: nivel, experiencia y mejoras (jugador_cargar).
void juego_cargar_progreso(int nivel, int experiencia, const int mejoras[MEJORA_CANTIDAD]);

// Retoma una partida guardada (llamar justo despues de juego_iniciar con la
// misma semilla): adelanta el reloj hasta `reloj_ms` de juego, haciendo crecer
// el laberinto en cada expansion como si se hubiera jugado (mismo laberinto),
// y pone al jugador en (x, y).
void juego_cargar_partida(float reloj_ms, float x, float y);

// Si el jugador tiene un escudo en la mano (lo dice el navegador, que lleva
// el equipo): cubierto puede caminar despacio.
void juego_escudo(int si);

// Si el jugador tiene puesta una armadura (lo dice el navegador, que lleva el
// equipo): sin ella un golpe lo mata.
void juego_armadura(int si);

// Lleva al jugador a (x, y): un santuario despierto.
void juego_teletransportar(float x, float y);

// Gasta un punto de nivel en una mejora (MejoraId). Devuelve 1 si la compro.
int juego_mejorar(int mejora);

// Le devuelve vida al jugador (una pocion), sin pasarse del maximo.
void juego_curar(int vida);
void juego_reiniciar(void);

// 1 durante la tregua (el dia pleno del primer dia): los enemigos no entran
// a la plaza, el jugador junta recursos y se prepara.
int juego_tregua(void);

// Cuantas veces lo quemo la lava (sube en uno con cada quemadura).
int juego_quemaduras(void);

// Jefes ya vencidos (bits 1 << Zona): para guardar la partida y cargarla
// (despues de juego_iniciar).
int juego_jefes_vencidos(void);
void juego_cargar_jefes_vencidos(int vencidos);
// Hogueras rotas (bit k: la ronda k), para guardar la partida y cargarla.
int juego_hogueras_apagadas(void);
void juego_cargar_hogueras(int apagadas);

#endif
