// main.c: el LLAMADOR del juego.
//
// No implementa mecanicas: guarda el estado del juego y, en cada paso,
// llama a cada mecanica en orden. Las mecanicas viven en mecanicas/:
//   mecanica.c           -> el reloj: dia, tarde, noche, cuando se expande el laberinto
//   calendario.c         -> el calendario lunar: meses, nombres de los dias, la luna, el barco
//   laberinto.c          -> el laberinto: generacion aleatoria, expansion y choques
//   jugador.c            -> jugadores principales: habilidades y movimiento
//   movimiento_mouse.c   -> caminar hacia donde se hizo click
//   movimiento_teclado.c -> WASD (sin usar por ahora)
//   combate.c            -> atacar
//   ia_enemigos.c        -> IA de enemigos nivel 1 (el paso al azar)
//   enemigos.c           -> enemigos nivel 1 en el laberinto: miedo y coraje,
//                           rondas que charlan y manadas que cazan
//   arbustos.c           -> arbustos donde el jugador se esconde
//   ovejas.c             -> ovejas salvajes en la plaza: pastan y huyen del jugador
//
// Los tipos compartidos (Entity, Direccion, Estado...) estan en entidad.h.
// E => Enemigo
// P => Personaje Principal

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#include "juego.h"
#include "mecanicas/combate.h"
#include "mecanicas/enemigos.h"
#include "mecanicas/ia_enemigos.h"
#include "mecanicas/jugador.h"
#include "mecanicas/ovejas.h"
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
#define RADIO_AUTO_ATAQUE 56.0f // elige al que se acerca a esto, y le pega si esta a esto
#define AUTO_SUELTA 90.0f       // lo deja de seguir si se aleja mas que esto
#define AUTO_RITMO_MS 1000.0f   // un golpe solo cada tanto, sea al que sea

static int auto_ataques;          // cuantas veces pego solo (el navegador lo mira)
static int lanzando;              // tirando la lanza: nada lo interrumpe
static int auto_objetivo = -1;    // el enemigo al que le pega solo (-1: ninguno)
static float auto_espera_ms;      // hasta que puede pegar solo de nuevo
static int muertos_cobrados;      // enemigos muertos ya pasados a experiencia
static int jefes_cobrados;        // jefes muertos ya pasados a experiencia
static int hogueras_cobradas;     // hogueras rotas ya pasadas a experiencia
static Ovejas ovejas;
static Direccion pie_seguro;      // donde piso por ultima vez sin lava (vuelve ahi si se quema)
static int quemaduras;            // sube cada vez que la lava lo quema (el navegador lo mira)

#define DANIO_LAVA 20

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
  enemigos_hogueras_solidas(&enemigos, &laberinto);
  ovejas_iniciar(&ovejas, &laberinto, semilla);
  muertos_cobrados = 0;
  jefes_cobrados = 0;
  hogueras_cobradas = 0;
  pie_seguro = base.posicion;
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
  // Una cosa a la vez: tirando la lanza o cubriendose no usa otra habilidad
  if (lanzando || jugador_activa(&jugador, HAB_BLOQUEAR)) return;
  usar_habilidad(habilidad, ALCANCE_GOLPE);
}

// El jugador pega solo, nunca con una tecla: a un enemigo a la vez. Elige
// al que se le acerca y lo sigue mientras viva y no se aleje mas que
// AUTO_SUELTA. Cada AUTO_RITMO_MS, si lo tiene al alcance, se da vuelta hacia
// el y le pega solo a el. El ritmo no vuelve a empezar al cambiar de
// enemigo: el que llega cuando ya puede pegar recibe el golpe enseguida. No
// toca el destino: sigue caminando despues del golpe.
static void auto_atacar(float dt_ms){
  if (auto_espera_ms > 0) auto_espera_ms -= dt_ms;
  if (jugador_muerto(&jugador) || lanzando){
    auto_objetivo = -1;
    return;
  }
  Direccion pies = jugador.entidad.posicion;
  float d = 0;
  if (auto_objetivo >= 0){
    d = enemigos_distancia(&enemigos, auto_objetivo, pies); // hasta el borde del cuerpo (un jefe es grande)
    if (!enemigos_vivo(&enemigos, auto_objetivo) || d > AUTO_SUELTA) auto_objetivo = -1;
  }
  if (auto_objetivo < 0){
    Direccion hacia;
    auto_objetivo = enemigos_mas_cercano(&enemigos, pies, RADIO_AUTO_ATAQUE, &hacia);
    if (auto_objetivo < 0) return;
    d = enemigos_distancia(&enemigos, auto_objetivo, pies);
  }
  if (auto_espera_ms > 0 || d > RADIO_AUTO_ATAQUE) return;
  for (int h = HAB_ATAQUE_LIGERO; h <= HAB_ATAQUE_CRITICO; h++){
    if (jugador_activa(&jugador, h)) return; // ya esta pegando
  }
  if (jugador_activa(&jugador, HAB_SALTAR) || jugador_activa(&jugador, HAB_BLOQUEAR) || jugador_activa(&jugador, HAB_ULTI)) return;
  Direccion p = enemigos.lista[auto_objetivo].entidad.posicion;
  Direccion hacia = {p.x - pies.x, p.y - pies.y};
  float largo = sqrtf(hacia.x * hacia.x + hacia.y * hacia.y);
  if (!jugador_usar(&jugador, HAB_ATAQUE_LIGERO)) return; // recargando: en el proximo paso
  if (largo > 0) jugador.entidad.dir = (Direccion){hacia.x / largo, hacia.y / largo};
  auto_ataques++;
  enemigos_golpe_a(&enemigos, auto_objetivo, jugador.entidad.danio + jugador.entidad.items.damage);
  auto_espera_ms = AUTO_RITMO_MS;
}

int juego_auto_objetivo(void){ return auto_objetivo; }

void juego_mantener_habilidad(int habilidad, int apretada){
  if (apretada && habilidad == HAB_BLOQUEAR && lanzando) return; // o se cubre o tira la lanza
  jugador_mantener(&jugador, habilidad, apretada);
}

void juego_actualizar(float dt_ms){
  // 1. El tiempo
  int eventos = reloj_avanzar(&reloj, dt_ms * velocidad_tiempo);
  if (eventos & EVENTO_NUEVO_DIA)   printf("Amanece el dia %d\n", reloj.dia);
  if (eventos & EVENTO_ANOCHECER)   printf("Cae la noche del dia %d\n", reloj.dia);
  if (eventos & EVENTO_CAMBIO_FASE) printf("Ahora es %s\n", reloj_nombre_fase(reloj.fase));
  if (eventos & EVENTO_EXPANSION){
    if (laberinto_expandir(&laberinto)){
      printf("El laberinto crece (expansion %d)\n", reloj.expansiones);
      enemigos_nueva_hoguera(&enemigos, &laberinto);
    } else printf("El laberinto ya no puede crecer mas\n");
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
  auto_atacar(dt_ms);

  // 3b. Lava: saltando se pasa por encima; el que la pisa se quema y vuelve
  //     al ultimo lugar seguro (el parkour se reintenta sin volver a la base)
  if (!jugador_muerto(&jugador) && !jugador_activa(&jugador, HAB_SALTAR)){
    if (laberinto_pisa_lava(&laberinto, jugador.entidad.posicion)){
      quemaduras++;
      jugador.entidad.vida -= DANIO_LAVA;
      jugador.entidad.posicion = pie_seguro;
      jugador.hay_destino = 0;
      printf("La lava te quema\n");
      if (jugador.entidad.vida <= 0){
        printf("Te consumio la lava\n");
        jugador_morir(&jugador, laberinto_aparicion(&laberinto));
      }
    } else pie_seguro = jugador.entidad.posicion;
  }

  // 4. Los enemigos: rodean al jugador y, cuando se animan, le pegan. El
  //    primer dia (la tregua) casi no entran a la plaza; despues entran
  //    mientras las puertas estan abiertas.
  enemigos_plaza_permitida(&enemigos, !juego_tregua());
  enemigos_noche(&enemigos, reloj_noche(&reloj));
  if (enemigos_actualizar(&enemigos, &laberinto, &jugador, dt_ms) > 0 && jugador.entidad.vida <= 0){
    printf("Te mataron los enemigos\n");
    jugador_morir(&jugador, laberinto_aparicion(&laberinto));
  }
  enemigos_hogueras_solidas(&enemigos, &laberinto);

  ovejas_actualizar(&ovejas, &laberinto, jugador.entidad.posicion, dt_ms);

  // 5. Experiencia: por cada enemigo que mato desde el paso anterior (a
  //    golpes, con la lanza o con el golpe al suelo)
  int nuevos = enemigos.muertos - muertos_cobrados;
  muertos_cobrados = enemigos.muertos;
  if (nuevos > 0) jugador_ganar_experiencia(&jugador, nuevos * EXPERIENCIA_ENEMIGO);
  int jefes = enemigos.jefes_muertos - jefes_cobrados;
  jefes_cobrados = enemigos.jefes_muertos;
  if (jefes > 0) jugador_ganar_experiencia(&jugador, jefes * EXPERIENCIA_JEFE);
  int hogueras = enemigos.hogueras_rotas - hogueras_cobradas;
  hogueras_cobradas = enemigos.hogueras_rotas;
  if (hogueras > 0) jugador_ganar_experiencia(&jugador, hogueras * EXPERIENCIA_HOGUERA);
}

int juego_quemaduras(void){ return quemaduras; }

int juego_tregua(void){ return reloj.dia == 1 && reloj.fase == FASE_DIA; }

int juego_jefes_vencidos(void){ return enemigos.vencidos; }
void juego_cargar_jefes_vencidos(int vencidos){ enemigos_cargar_vencidos(&enemigos, vencidos); }

int juego_hogueras_apagadas(void){ return enemigos_hogueras_apagadas(&enemigos); }
void juego_cargar_hogueras(int apagadas){
  enemigos_cargar_hogueras(&enemigos, apagadas);
  enemigos_hogueras_solidas(&enemigos, &laberinto);
}

const Entity *juego_jugador(void){ return &jugador.entidad; }
const Jugador *juego_jugador_completo(void){ return &jugador; }
int juego_hay_destino(void){ return jugador.hay_destino; }
Direccion juego_destino(void){ return jugador.destino; }
const Reloj *juego_reloj(void){ return &reloj; }

const FechaLunar *juego_fecha(void){
  static FechaLunar fecha;
  fecha = calendario_fecha(reloj.calendario.t);
  return &fecha;
}

const Laberinto *juego_laberinto(void){ return &laberinto; }

int juego_agregar_obstaculo(float x, float y, float ancho, float alto){
  return laberinto_agregar_obstaculo(&laberinto, (RectPx){x, y, ancho, alto});
}

void juego_quitar_obstaculo(int i){
  laberinto_quitar_obstaculo(&laberinto, i);
}

void juego_velocidad_tiempo(float factor){ velocidad_tiempo = factor; }

void juego_calendario_avanzar_dia(void){ calendario_avanzar_dia(&reloj.calendario); }
void juego_calendario_fijar(int t){ calendario_fijar(&reloj.calendario, t); }

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

#define ALCANCE_LANZA 320.0f     // con la barra llena
#define LANZA_FUERZA_MIN 0.15f   // soltada enseguida, llega a esta parte del alcance
static Direccion lanza_impacto, lanza_cae;

int juego_lanzar(float dx, float dy, float fuerza, int probar){
  lanza_impacto = lanza_cae = jugador.entidad.posicion;
  if (jugador_muerto(&jugador)) return -1;
  if (fuerza < LANZA_FUERZA_MIN) fuerza = LANZA_FUERZA_MIN;
  if (fuerza > 1.0f) fuerza = 1.0f;
  return enemigos_lanza(&enemigos, &laberinto, jugador.entidad.posicion, (Direccion){dx, dy}, ALCANCE_LANZA * fuerza,
                        probar, &lanza_impacto, &lanza_cae);
}

void juego_lanzando(int si){ lanzando = si; }

Direccion juego_lanza_impacto(void){ return lanza_impacto; }
Direccion juego_lanza_cae(void){ return lanza_cae; }

void juego_desclavar(int i){
  if (i >= 0 && i < ENEMIGOS_MAX) enemigos_desclavar(&enemigos, i);
}

const Entity *juego_medusa(void){ return &medusa; }
const Enemigos *juego_enemigos(void){ return &enemigos; }
const Ovejas *juego_ovejas(void){ return &ovejas; }
int juego_auto_ataques(void){ return auto_ataques; }

void juego_cargar_progreso(int nivel, int experiencia, const int mejoras[MEJORA_CANTIDAD]){
  jugador_cargar(&jugador, nivel, experiencia, mejoras);
}

void juego_cargar_partida(float reloj_ms, float x, float y){
  reloj_iniciar(&reloj);
  float falta = reloj_ms;
  while (falta > 0){ // de a un segundo: cada expansion en su momento
    float paso = falta < SEGUNDO_MS ? falta : SEGUNDO_MS;
    if ((reloj_avanzar(&reloj, paso) & EVENTO_EXPANSION) && laberinto_expandir(&laberinto)){
      enemigos_nueva_hoguera(&enemigos, &laberinto);
    }
    falta -= paso;
  }
  laberinto_apertura(&laberinto, reloj_apertura_puertas(&reloj));
  enemigos_hogueras_solidas(&enemigos, &laberinto);
  // Si el laberinto cambio desde que se guardo (otra version del juego) y
  // quedo adentro de un muro o sobre lava, vuelve a la base
  Direccion donde = {x, y};
  int lava = laberinto_pisa_lava(&laberinto, donde);
  if (!laberinto_libre(&laberinto, donde) || lava) donde = laberinto_aparicion(&laberinto);
  jugador.entidad.posicion = pie_seguro = donde;
  jugador.hay_destino = 0;
}

void juego_escudo(int si){ jugador.escudo = si; }

int juego_mejorar(int mejora){ return jugador_mejorar(&jugador, mejora); }

void juego_curar(int vida){
  if (jugador_muerto(&jugador)) return;
  jugador.entidad.vida += vida;
  if (jugador.entidad.vida > jugador.entidad.vidaMAX) jugador.entidad.vida = jugador.entidad.vidaMAX;
  // Con `vida` negativa (una fruta venenosa) puede matar
  if (jugador.entidad.vida <= 0){
    printf("Te mato el veneno\n");
    jugador_morir(&jugador, laberinto_aparicion(&laberinto));
  }
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
