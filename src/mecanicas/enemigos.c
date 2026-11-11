#include "enemigos.h"

#include <math.h>
#include <stdio.h>

// Sueltos a la vez: los que salen de las hogueras a deambular (y a cazar en
// manada). Los de las rondas van aparte.
#define ENEMIGOS_ERRANTES 36
#define ENEMIGOS_PASEANTES 32 // los que andan por el laberinto a toda hora: mitad espiritus, mitad espartanos
#define ESQUELETOS_TIRADOS 24 // los que esperan tirados como huesos
#define MEDUCITAS 6           // las que cuidan a Medusa
#define RUEDAS 5              // los de la rueda en el bosque, a la vez
// Donde empieza cada grupo en la lista.
#define HUECO_ERRANTES (RONDAS_MAX * RONDA_MAX)
#define HUECO_PASEANTES (HUECO_ERRANTES + ENEMIGOS_ERRANTES)
#define HUECO_TIRADOS (HUECO_PASEANTES + ENEMIGOS_PASEANTES)
#define HUECO_MEDUCITAS (HUECO_TIRADOS + ESQUELETOS_TIRADOS)
#define HUECO_RUEDAS (HUECO_MEDUCITAS + MEDUCITAS)

#define VIDA_ENEMIGO 30

// Velocidades, en pixeles por segundo (el jugador camina a 110).
#define VEL_PASEO 40.0f
#define VEL_ACECHO 70.0f
#define VEL_ATAQUE 165.0f
#define VEL_HUIDA 140.0f

#define VISION 300.0f       // hasta donde ve al jugador (si no hay muros en el medio)
#define DIST_MIEDO 95.0f    // mas cerca que esto, escapa
#define DIST_COMODO 160.0f  // le gusta quedarse a esta distancia, rodeandolo
#define ALCANCE 24.0f       // de pies a pies, para pegar
#define OLVIDO_MS 2500.0f   // sin verlo este tiempo, vuelve a deambular...
#define OLVIDA_LEJOS 450.0f // ...y si se alejo tanto, enseguida
#define DESINTERES_MS 25000.0f // cuanto tarda en ponerse a buscarlo de nuevo
#define HUIDA_MS 1300.0f    // cuanto escapa despues de un susto
#define ATAQUE_MAX_MS 1800.0f // si no lo alcanza en este tiempo, se arrepiente
#define GOLPEADO_MS 220.0f
// Oportunistas: mientras otros se lanzan, el resto espera su momento.
#define MAX_ATACANTES 2
#define MUERTE_MS 2640.0f   // la animacion de morir (33 frames de 80 ms)
#define CLAVADO_MS 20000.0f // cuanto queda clavado al muro antes de desaparecer
#define LANZA_ESPALDA 9.0f  // de sus pies a la cara del muro (art/enemigo1.py SPEAR)
#define LANZA_ANCHO 16.0f   // a esta distancia de la linea del vuelo le da
// Cuantos sueltos andan a la vez y cada cuanto sale una tanda de una hoguera,
// de pleno dia y con la noche cerrada: cuanto mas oscuro, mas y mas seguido.
#define TANDA 5                // salen todos juntos, de a tantos...
#define TANDA_GRANDE 9         // ...y a veces de a tantos
#define TANDA_GRANDE_POR_100 25
#define SUELTOS_DE_DIA 14
#define SUELTOS_DE_NOCHE 22
#define SUELTOS_POR_DIA 2      // cada dia que pasa, tantos mas de dia...
#define SUELTOS_POR_NOCHE 3    // ...y tantos mas de noche
#define SALIDA_DIA_MS 40000.0f
#define SALIDA_NOCHE_MS 25000.0f
// Cuanto mas lleva el jugador en el laberinto, mas lo rodean: a los PRESION_MS
// andan PRESION_SUELTOS mas y salen tanto mas seguido. En la plaza se le pasa,
// PRESION_CALMA veces mas rapido.
#define PRESION_MS 180000.0f
#define PRESION_SUELTOS 14
#define PRESION_SALIDA 0.7f
#define PRESION_CALMA 2.0f
#define SALIDA_PRIMERA_MS 2000.0f // el primero, al empezar la partida
#define TIRADO_DESPIERTA 130.0f // tan cerca, el esqueleto tirado se levanta
#define PASEANTE_VUELVE_MS 60000.0f // un paseante muerto sale de nuevo tanto despues
#define SEPARACION 30.0f       // mas cerca que esto, se abren para no pisarse
#define SALIDA_SIN_LUGAR_MS 4000.0f // no habia hoguera fuera de la vista: prueba de nuevo
// Salen de una hoguera fuera de la pantalla del jugador...
#define APARECE_DESDE 480.0f
// ...y los que deambulan mas lejos que esto vuelven a salir de la mas cercana.
#define DEMASIADO_LEJOS 1700.0f
#define RECICLA_POR_PASO 4 // cuantos como mucho por paso, para no hacerlo de golpe
#define TIRA_A_LA_PLAZA 55 // % de los rumbos que van hacia la plaza (desde afuera)
// El primer dia casi nadie entra: tiran poco para la plaza y, de los que llegan
// a una puerta abierta, se cuelan unos pocos en todo el dia.
#define TIRA_EN_TREGUA 12
#define COLADOS_MAX 2
#define COLARSE_POR_100 4  // cada vez que uno empuja la puerta

// Manadas: cuantas y de cuantos (salen de los ENEMIGOS_ERRANTES).
#define MANADAS 1
#define MANADA_SEPARACION 34.0f // a cuanto del que manda camina cada uno
#define MANADA_LEJOS 420.0f     // mas lejos que esto del que manda, se le junta
#define CAZA_CELDAS 15          // los sueltos cazan al jugador si esta a estas celdas de camino
#define VEL_CAZA 70.0f
#define VENTAJA_HOGUERA 3       // celdas de camino que tiene que ahorrar volver a salir de otra hoguera
#define CAZA_RUMBO_MS 400.0f    // cazando miran el camino asi de seguido
#define RUTA_CADA_MS 1000.0f    // cada cuanto se traza el camino hasta el jugador
// El que lo vio y lo perdio detras de un muro lo busca dando la vuelta por los
// pasillos, si el jugador queda a estas celdas de camino como mucho y por este
// tiempo; si no, se da por vencido y se va.
#define BUSCA_CELDAS 4
#define BUSCA_MS 25000.0f
#define CUERPO_ANCHO 14.0f      // medio ancho del cuerpo: para no cortar las esquinas

// Rondas: cuantas al empezar y como son. En la plaza no hay: es la base.
#define RONDAS_LABERINTO 12
#define EMBRUJADA_CADA 3        // una de cada tantas la bailan fantasmas y espiritus
#define RONDA_MIN 4             // bailan pocos: de RONDA_MIN a RONDA_MAX
#define RONDA_RADIO 72.0f       // radio del circulo en el que bailan
#define BAILE_GIRO 0.8f         // radianes por segundo que gira el circulo
#define BAILE_VEL 100.0f        // lo que corre cada uno para no perder su lugar
#define VISION_CHARLA 170.0f    // bailando ven poco: se los puede sorprender
#define CALMA_MS 6000.0f        // deambulando sin verlo este tiempo, vuelven a la ronda
#define VUELTA_MAX_MS 15000.0f  // si no llegan en este tiempo (y nadie mira), aparecen ahi
#define REAPARECE_RONDA_MS 90000.0f // un muerto de la ronda vuelve tanto despues...
#define RONDA_NOCHE 3.0f            // ...y con la noche cerrada, tantas veces mas rapido

// La hoguera
#define VIDA_HOGUERA 200
#define HOGUERA_CUERPO 26.0f     // radio, para que los golpes la alcancen
#define HOGUERA_ANCHO 56.0f      // su caja solida, centrada en la pila de huesos
#define HOGUERA_ALTO 26.0f
#define LANZA_DANIO_HOGUERA 40
#define LANZA_CAE_HOGUERA 36.0f  // la lanza rebota: cae a esta distancia, afuera de la caja
#define MONEDAS_HOGUERA 6

// Los que no son espartanos
#define VIDA_FANTASMA 30
#define VIDA_ESPIRITU 18
#define VIDA_ESQUELETO 40
#define VIDA_MEDUCITA 25
#define VIDA_RUEDA 120
#define VEL_RUEDA 45.0f
#define RUEDA_VE 300.0f          // ve menos que un esqueleto: en el bosque hay niebla
#define RUEDA_VUELVE_MS 40000.0f // otro se levanta de los huesos tanto despues
#define RUEDA_LEJOS 320.0f       // los huesos de donde se levanta, a esta distancia del jugador
#define MEDUCITA_VUELVE_MS 30000.0f
#define MEDUCITA_LEJOS 260.0f    // mas lejos del medio de la sala, vuelve
#define VEL_ESQUELETO 58.0f
#define ESQUELETO_VE 420.0f      // despierto ve mas lejos que un espartano
#define SALTO_VEL 330.0f         // el esqueleto en el aire
#define RUEDA_PARA 44.0f         // tan cerca se planta: su mano llega desde ahi
#define MANOTAZO_1_MS 390.0f     // los dos golpes: lo que le queda a la fase
#define MANOTAZO_2_MS 120.0f     // cuando cada mano llega (art/espectros.py, SLAPS)
#define CAE_MS 850.0f            // lo que tarda en bajar lo del fantasma
#define ESTALLA_MS 300.0f        // y lo que dura el estallido en el piso (5 de 60 ms)
#define CAE_RADIO 30.0f
#define ESQUELETO_POR_100 30     // de cada 100 espartanos muertos, los que se levantan
#define APARECE_MS 720.0f        // la animacion de aparecer (8 frames de 90 ms)
#define LEVANTA_MS 1100.0f       // la de levantarse (10 de 110 ms)
#define ESPARTANO_POR_100 40     // de cada 100 sueltos, espartanos...
#define FANTASMA_POR_100 30      // ...y fantasmas (el resto, espiritus)

// El espiritu se queda a esta distancia y tira
#define TIRO_CERCA 150.0f
#define TIRO_LEJOS 240.0f
#define TIRO_RITMO_MS 3800.0f
#define TIRO_PREPARA_MS 720.0f   // la animacion de lanzar (8 frames de 90 ms)...
#define TIRO_SALE_MS 360.0f      // ...y le queda esto cuando sale la sombra
#define TIRO_VEL 190.0f
#define FLECHA_VEL 270.0f
#define MEDUSA_ALCANCE 330.0f    // tira si el jugador esta a esto...
#define MEDUSA_CERCA 130.0f      // ...y mas cerca que esto se aleja
#define TIRO_VUELO_MS 2200.0f
#define TIRO_REBOTE_DANIO 30    // lo que le saca a un enemigo la sombra que volvio del escudo
#define TIRO_REBOTE_BUSCA 420.0f // hasta donde busca a quien darle
#define TIRO_RADIO 16.0f

// Arbustos
// Con HAY_ARBUSTOS en 0 no hay ninguno: nadie se esconde y la mecanica queda
// quieta.
#define HAY_ARBUSTOS 1
// Los grandes, los que esconden: sacados hasta que haya dibujos nuevos (poner
// en 1). Sin ellos solo hay de frutas y nadie se esconde.
#define HAY_ARBUSTOS_GRANDES 0
// Lo que tapa el dibujo (art/arbustos.py): de los pies para arriba, con este
// radio el cuerpo queda adentro de la mata.
#define ARBUSTO_RADIO 34.0f
#define ARBUSTO_RADIO_FRUTAS 0.0f // los de frutas son chicos: no esconden (render/bushes.ts)
#define ARBUSTOS_POR_RONDA 2
#define ARBUSTOS_PLAZA 24
#define ARBUSTOS_LABERINTO 20
#define VE_DE_CERCA 45.0f       // tan cerca, lo ve aunque este en un arbusto
#define DELATADO_MS 1000.0f     // pegar desde un arbusto lo deja a la vista
#define LEJOS_DE_LA_BASE 650.0f // nada de rondas ni arbustos tan cerca del inicio

_Static_assert(HUECO_RUEDAS + RUEDAS + RONDAS_MAX + JEFES <= ENEMIGOS_MAX, "no entran todos en la lista");
_Static_assert(RONDAS_LABERINTO + LAB_EXPANSIONES <= RONDAS_MAX, "demasiadas rondas");
_Static_assert(MANADAS <= MANADAS_MAX && MANADAS * MANADA_MAX <= ENEMIGOS_ERRANTES, "demasiadas manadas");

// ---------------------------------------------------------------- azar

static unsigned int siguiente(Enemigos *e){
  e->azar = e->azar * 1103515245u + 12345u;
  return (e->azar >> 16) & 0x7fff;
}

// Numero al azar entre a y b.
static float entre(Enemigos *e, float a, float b){
  return a + (b - a) * (float)siguiente(e) / 32767.0f;
}

// ---------------------------------------------------------------- vectores

static float largo(Direccion v){ return sqrtf(v.x * v.x + v.y * v.y); }

static float distancia(Direccion a, Direccion b){ return largo((Direccion){a.x - b.x, a.y - b.y}); }

static Direccion unitario(Direccion v){
  float l = largo(v);
  if (l < 0.0001f) return (Direccion){0, 0};
  return (Direccion){v.x / l, v.y / l};
}

// Gira `v` `grados` (positivo: sentido horario en la pantalla).
static Direccion girar(Direccion v, float grados){
  float a = grados * 3.14159265f / 180.0f;
  float c = cosf(a), s = sinf(a);
  return (Direccion){v.x * c - v.y * s, v.x * s + v.y * c};
}

// ---------------------------------------------------------------- laberinto

// 1 si no hay muros en la linea entre a y b (mirando cada medio tile).
static int linea_libre(const Laberinto *lab, Direccion a, Direccion b){
  Direccion d = {b.x - a.x, b.y - a.y};
  int pasos = (int)(largo(d) / (LAB_TILE / 2.0f)) + 1;
  for (int i = 1; i < pasos; i++){
    float t = (float)i / pasos;
    int col = (int)((a.x + d.x * t) / LAB_TILE);
    int fila = (int)((a.y + d.y * t) / LAB_TILE);
    if (laberinto_es_muro(lab, col, fila)) return 0;
  }
  return 1;
}

// 1 si el tile y los que estan a `radio` tiles alrededor son piso.
static int zona_libre(const Laberinto *lab, int col, int fila, int radio){
  for (int f = fila - radio; f <= fila + radio; f++){
    for (int c = col - radio; c <= col + radio; c++){
      if (laberinto_es_muro(lab, c, f) || laberinto_es_puerta(lab, c, f)) return 0;
      if (laberinto_sala(lab, c, f) != ZONA_LABERINTO || laberinto_es_lava(lab, c, f)) return 0;
      if (laberinto_toca_obstaculo(lab, (RectPx){c * (float)LAB_TILE, f * (float)LAB_TILE, LAB_TILE, LAB_TILE})) return 0;
    }
  }
  return 1;
}

// 1 si el tile y sus 8 vecinos son piso (entra un enemigo sin tocar muros).
static int lugar_libre(const Laberinto *lab, int col, int fila){
  return zona_libre(lab, col, fila, 1);
}

static int plaza_desde_tile(void){ return (LAB_MAX_CELDAS / 2 - LAB_PLAZA / 2) * LAB_CELDA; }
static int plaza_hasta_tile(void){ return plaza_desde_tile() + LAB_PLAZA * LAB_CELDA + LAB_MURO; }

// 1 si el tile esta en la plaza (con su anillo de muros).
static int en_plaza(int col, int fila){
  int desde = plaza_desde_tile(), hasta = plaza_hasta_tile();
  return col >= desde && col <= hasta && fila >= desde && fila <= hasta;
}

static int en_plaza_px(Direccion p){
  return en_plaza((int)floorf(p.x / LAB_TILE), (int)floorf(p.y / LAB_TILE));
}

static Direccion centro_de_tile(int col, int fila){
  return (Direccion){(col + 0.5f) * LAB_TILE, (fila + 0.5f) * LAB_TILE};
}

// Un lugar de piso al azar con `radio` tiles libres alrededor: en la plaza
// (`en_la_plaza` 1) o en el laberinto ya tallado (0). Un solo intento:
// devuelve 0 si el tile elegido no sirve.
static int lugar_al_azar(Enemigos *e, const Laberinto *lab, int en_la_plaza, int radio, Direccion *lugar){
  int desde, hasta;
  if (en_la_plaza){
    desde = plaza_desde_tile();
    hasta = plaza_hasta_tile();
  } else {
    desde = lab->c_min * LAB_CELDA;
    hasta = (lab->c_max + 1) * LAB_CELDA + LAB_MURO;
  }
  int col = desde + (int)(siguiente(e) % (unsigned)(hasta - desde));
  int fila = desde + (int)(siguiente(e) % (unsigned)(hasta - desde));
  if (en_plaza(col, fila) != en_la_plaza) return 0;
  if (!zona_libre(lab, col, fila, radio)) return 0;
  *lugar = centro_de_tile(col, fila);
  return 1;
}

// ---------------------------------------------------------------- caminos

static int celda_de(float px){ return (int)(px / LAB_TILE) / LAB_CELDA; }

static Direccion centro_de_celda(int c, int f){
  float medio = (LAB_MURO + LAB_PASILLO / 2.0f) * LAB_TILE;
  return (Direccion){c * (float)(LAB_CELDA * LAB_TILE) + medio, f * (float)(LAB_CELDA * LAB_TILE) + medio};
}

// 1 si de la celda (c, f) se pasa a la vecina (c + dc, f + df): mira el medio
// del muro que las separa. Una puerta cerrada no deja pasar.
static int hay_paso(const Laberinto *lab, int c, int f, int dc, int df){
  if (c + dc < 0 || f + df < 0 || c + dc >= LAB_MAX_CELDAS || f + df >= LAB_MAX_CELDAS) return 0;
  int medio_c = c * LAB_CELDA + LAB_MURO + LAB_PASILLO / 2;
  int medio_f = f * LAB_CELDA + LAB_MURO + LAB_PASILLO / 2;
  if (dc) medio_c = (dc > 0 ? c + 1 : c) * LAB_CELDA + LAB_MURO / 2;
  if (df) medio_f = (df > 0 ? f + 1 : f) * LAB_CELDA + LAB_MURO / 2;
  return !laberinto_es_muro(lab, medio_c, medio_f);
}

static const int VECINOS[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};

// Cuenta los pasos de cada celda hasta el jugador, a lo ancho.
static void trazar_ruta(Enemigos *e, const Laberinto *lab, Direccion jugador){
  static int cola[LAB_MAX_CELDAS * LAB_MAX_CELDAS];
  for (int f = 0; f < LAB_MAX_CELDAS; f++){
    for (int c = 0; c < LAB_MAX_CELDAS; c++) e->ruta[f][c] = -1;
  }
  int desde_c = celda_de(jugador.x), desde_f = celda_de(jugador.y);
  if (desde_c < 0 || desde_f < 0 || desde_c >= LAB_MAX_CELDAS || desde_f >= LAB_MAX_CELDAS) return;
  int primero = 0, ultimo = 0;
  e->ruta[desde_f][desde_c] = 0;
  cola[ultimo++] = desde_f * LAB_MAX_CELDAS + desde_c;
  while (primero < ultimo){
    int c = cola[primero] % LAB_MAX_CELDAS, f = cola[primero] / LAB_MAX_CELDAS;
    primero++;
    for (int v = 0; v < 4; v++){
      int dc = VECINOS[v][0], df = VECINOS[v][1];
      if (!hay_paso(lab, c, f, dc, df) || e->ruta[f + df][c + dc] >= 0) continue;
      e->ruta[f + df][c + dc] = e->ruta[f][c] + 1;
      cola[ultimo++] = (f + df) * LAB_MAX_CELDAS + c + dc;
    }
  }
}

// Celdas de camino de `p` al jugador (-1: no se llega).
static int pasos_desde(const Enemigos *e, Direccion p){
  int c = celda_de(p.x), f = celda_de(p.y);
  return c < 0 || f < 0 || c >= LAB_MAX_CELDAS || f >= LAB_MAX_CELDAS ? -1 : e->ruta[f][c];
}

// 1 si entra el cuerpo entero de a a b: la linea del medio y las de los
// costados, a CUERPO_ANCHO de ella.
static int paso_ancho(const Laberinto *lab, Direccion a, Direccion b){
  Direccion d = unitario((Direccion){b.x - a.x, b.y - a.y});
  Direccion lado = {-d.y * CUERPO_ANCHO, d.x * CUERPO_ANCHO};
  return linea_libre(lab, a, b) &&
         linea_libre(lab, (Direccion){a.x + lado.x, a.y + lado.y}, (Direccion){b.x + lado.x, b.y + lado.y}) &&
         linea_libre(lab, (Direccion){a.x - lado.x, a.y - lado.y}, (Direccion){b.x - lado.x, b.y - lado.y});
}

// El rumbo desde `pies` por el camino al jugador, si queda a `max_pasos`
// celdas de camino como mucho. 0 si queda lejos o no se llega. Va al medio de
// la celda siguiente; si de donde esta rozaria la esquina del muro, primero
// al medio de la suya, que de ahi se pasa derecho.
static int rumbo_al_jugador(const Enemigos *e, const Laberinto *lab, Direccion pies, Direccion jugador, int max_pasos, Direccion *rumbo){
  int pasos = pasos_desde(e, pies);
  if (pasos < 0 || pasos > max_pasos) return 0;
  int c = celda_de(pies.x), f = celda_de(pies.y);
  Direccion destino = jugador;
  for (int v = 0; v < 4 && pasos > 0; v++){
    int dc = VECINOS[v][0], df = VECINOS[v][1];
    if (!hay_paso(lab, c, f, dc, df) || e->ruta[f + df][c + dc] != pasos - 1) continue;
    destino = centro_de_celda(c + dc, f + df);
    Direccion medio = centro_de_celda(c, f);
    if (distancia(pies, medio) > 8.0f && !paso_ancho(lab, pies, destino)) destino = medio;
    break;
  }
  Direccion falta = {destino.x - pies.x, destino.y - pies.y};
  if (largo(falta) < 1.0f) return 0;
  *rumbo = unitario(falta);
  return 1;
}

// ---------------------------------------------------------------- grupos

static int vivo(const Enemigo *en){ return en->activo && !en->tirado && en->entidad.estados != MUERTO; }

// Los que caminan derecho al jugador y no se asustan.
static int es_caminante(const Enemigo *en){ return en->tipo == ENEMIGO_ESQUELETO || en->tipo == ENEMIGO_RUEDA; }

// Los que se quedan lejos y tiran.
static int es_tirador(const Enemigo *en){ return en->tipo == ENEMIGO_ESPIRITU || en->tipo == ENEMIGO_MEDUCITA; }

// Lo que le saca un golpe: sin armadura, toda la vida.
static int danio_de_golpe(const Jugador *j){
  int vida = j->entidad.vidaMAX;
  return j->armadura ? (vida + GOLPES_CON_ARMADURA - 1) / GOLPES_CON_ARMADURA : vida;
}

// Le da un golpe, si no se cubrio ni salto. Devuelve el danio.
static int pegar(Jugador *j){
  if (jugador_activa(j, HAB_BLOQUEAR) || jugador_activa(j, HAB_SALTAR) || jugador_muerto(j)) return 0;
  int danio = danio_de_golpe(j);
  j->entidad.vida -= danio;
  return danio;
}

// El que manda en la manada `m`: el primero vivo. -1 si no queda ninguno.
static int lider(const Enemigos *e, int m){
  const Manada *ma = &e->manadas[m];
  for (int k = 0; k < ma->cant; k++){
    if (vivo(&e->lista[ma->miembros[k]])) return ma->miembros[k];
  }
  return -1;
}

// 1 si `en` tiene una ronda a la que volver (la hoguera sigue encendida).
static int con_ronda(const Enemigos *e, const Enemigo *en){
  return en->ronda >= 0 && !e->rondas[en->ronda].apagada;
}

// Donde va el que tiene el asiento `asiento` en la ronda, que gira.
static Direccion asiento(const Ronda *r, int asiento){
  float a = r->giro + 2.0f * 3.14159265f * asiento / r->cant;
  return (Direccion){r->centro.x + cosf(a) * RONDA_RADIO, r->centro.y + sinf(a) * RONDA_RADIO};
}

// ---------------------------------------------------------------- vida

static void nuevo_coraje(Enemigos *e, Enemigo *en){
  en->coraje = 0;
  en->valor = entre(e, 3000.0f, 7000.0f);
}

static void cambiar_animo(Enemigo *en, Animo animo){
  en->animo = animo;
  en->animo_ms = 0;
  en->fase = ATAQUE_NADA; // el que se asusta no termina de pegar
}

// Un ataque de los que se detienen: `prepara` avisa, `pega` es cuando lastima
// (dura lo que su animacion en art/espectros.py) y `recupera` es el momento de
// devolverle. El fantasma no pega: tira al terminar de preparar.
typedef struct ataque_def {
  float alcance;     // mas cerca que esto, ataca
  float golpe;       // hasta donde lastima
  float prepara_ms, pega_ms, recupera_ms;
  float ritmo_ms;    // caminantes: de ahi al proximo ataque
} AtaqueDef;

static const AtaqueDef ATAQUE[] = {
  [ENEMIGO_ESPARTANO] = {ALCANCE, ALCANCE * 1.6f, 240.0f, 120.0f, 0.0f, 0.0f},
  [ENEMIGO_FANTASMA]  = {280.0f, 0.0f, 720.0f, 0.0f, 300.0f, 0.0f},
  [ENEMIGO_ESQUELETO] = {105.0f, ALCANCE + 6.0f, 420.0f, 300.0f, 650.0f, 500.0f},
  [ENEMIGO_RUEDA]     = {52.0f, 60.0f, 380.0f, 540.0f, 600.0f, 700.0f},
};

static void empezar_ataque(Enemigo *en){
  en->fase = ATAQUE_PREPARA;
  en->fase_ms = ATAQUE[en->tipo].prepara_ms;
  en->tiro_ms = ATAQUE[en->tipo].ritmo_ms;
  en->embiste_pego = 0;
  en->entidad.estados = ATACANDO;
}

// Uno nuevo en `lugar`, sin perder con quien anda.
// De cada 100 que nacen, cuantos llevan cada cosa encima (el resto, nada).
#define BOTIN_POCION_POR_100 6
#define BOTIN_ESPADA_POR_100 3
#define BOTIN_RAMA_POR_100 4

static Botin elegir_botin(Enemigos *e){
  int tirada = (int)(siguiente(e) % 100);
  if (tirada < BOTIN_POCION_POR_100) return BOTIN_POCION;
  tirada -= BOTIN_POCION_POR_100;
  if (tirada < BOTIN_ESPADA_POR_100) return BOTIN_ESPADA;
  tirada -= BOTIN_ESPADA_POR_100;
  if (tirada < BOTIN_RAMA_POR_100) return BOTIN_RAMA;
  return BOTIN_NADA;
}

// De cada 100 que nacen, cuantos llevan cada arma; y de los que llevan, cuantos
// la sueltan al morir (al resto se le rompe o se la queda).
#define ARMA_LANZA_POR_100 15
#define ARMA_ANTORCHA_POR_100 10
#define ARMA_HACHA_POR_100 15
#define ARMA_SUELTA_POR_100 35

static ArmaEnemigo elegir_arma(Enemigos *e){
  int tirada = (int)(siguiente(e) % 100);
  if (tirada < ARMA_LANZA_POR_100) return ARMA_LANZA;
  tirada -= ARMA_LANZA_POR_100;
  if (tirada < ARMA_ANTORCHA_POR_100) return ARMA_ANTORCHA;
  tirada -= ARMA_ANTORCHA_POR_100;
  if (tirada < ARMA_HACHA_POR_100) return ARMA_HACHA;
  return ARMA_NINGUNA;
}

// ---------------------------------------------------------------- jefes

typedef struct jefe_def {
  int vida;
  float velocidad;  // pixeles por segundo, persiguiendo
  float escala;     // tamanio del dibujo y del cuerpo, contra un espartano
  float carga_ms;   // lo que tarda en cargar el golpe (el aviso para esquivarlo)
  float espera_ms;  // entre golpe y golpe
} JefeDef;

static const JefeDef JEFE[ZONA_CANTIDAD] = {
  [ZONA_MEDUSAS]   = {350,  85.0f,  2.0f, 650.0f, 1100.0f},
  [ZONA_POSEIDON]  = {600,  115.0f, 2.4f, 550.0f, 950.0f},
  [ZONA_MINOTAURO] = {1000, 100.0f, 2.8f, 600.0f, 1000.0f},
};
#define CENTAURO_ALCANCE 340.0f  // embiste si el jugador esta a esto
#define CENTAURO_EMBISTE_MS 1100.0f
#define CENTAURO_VEL_EMBISTE 340.0f
#define JEFE_RADIO 9.0f          // radio del cuerpo de un espartano: se multiplica por la escala
#define JEFE_VUELVE_MS 4000.0f   // el jugador fuera de la sala este tiempo: se calma y se cura
#define LANZA_DANIO_JEFE 60      // una lanza no lo mata de un tiro: le saca esto

static int hueco_jefe(Zona z){ return ENEMIGOS_MAX - JEFES + (z - 1); }

// Lo que ocupa su cuerpo mas alla de los pies (para que el jugador y la
// lanza lo alcancen aunque sea grande). 0 en los comunes.
static float cuerpo(const Enemigo *en){
  if (en->tipo == ENEMIGO_HOGUERA) return HOGUERA_CUERPO;
  return en->jefe ? JEFE_RADIO * JEFE[en->jefe].escala : 0.0f;
}

// Donde se mueve el jefe: su sala (el Minotauro, su isla), con un margen
// para que el cuerpo no se meta en los muros.
static RectPx terreno_jefe(const Laberinto *lab, Zona z){
  RectPx r = z == ZONA_MINOTAURO ? laberinto_isla_px(lab) : laberinto_sala_px(lab, z);
  float m = 16.0f;
  return (RectPx){r.x + m, r.y + m, r.ancho - 2 * m, r.alto - 2 * m};
}

static Direccion centro_rect(RectPx r){ return (Direccion){r.x + r.ancho / 2, r.y + r.alto / 2}; }

static int dentro_rect(RectPx r, Direccion p){
  return p.x >= r.x && p.x <= r.x + r.ancho && p.y >= r.y && p.y <= r.y + r.alto;
}

static void nacer(Enemigos *e, Enemigo *en, Direccion lugar, Animo animo);
static void tirar(Enemigos *e, Direccion desde, Direccion hacia, int flecha);

// El jefe de la sala `z`, quieto en el medio de su terreno, esperando.
static void nacer_jefe(Enemigos *e, const Laberinto *lab, Zona z){
  Enemigo *en = &e->lista[hueco_jefe(z)];
  en->ronda = en->manada = -1;
  nacer(e, en, centro_rect(terreno_jefe(lab, z)), ANIMO_DEAMBULA);
  en->jefe = z;
  if (z == ZONA_MEDUSAS) en->tipo = ENEMIGO_MEDUSA;
  if (z == ZONA_POSEIDON) en->tipo = ENEMIGO_CENTAURO;
  en->entidad.vidaMAX = en->entidad.vida = JEFE[z].vida;
  en->arma = z == ZONA_POSEIDON ? ARMA_LANZA : z == ZONA_MINOTAURO ? ARMA_HACHA : ARMA_NINGUNA;
  en->suelta_arma = 0;
  en->botin = BOTIN_POCION;
  en->monedas = 10 * z;
}

// El centauro embistiendo: galopa derecho hasta chocar o cansarse, y al que
// agarra en el camino le pega una vez. Devuelve el danio que le hizo.
static int embestir(Enemigos *e, Enemigo *en, const Laberinto *lab, Jugador *j, RectPx terreno, float dt_ms){
  const JefeDef *def = &JEFE[en->jefe];
  float paso = CENTAURO_VEL_EMBISTE * dt_ms / 1000.0f;
  float movido = laberinto_mover(lab, &en->entidad.posicion, en->embiste.x * paso, en->embiste.y * paso);
  en->embiste_ms -= dt_ms;
  en->mira = en->entidad.dir = en->embiste;
  en->entidad.estados = CORRIENDO;
  e->combate = (int)(en - e->lista);
  int choco = movido < paso * 0.3f || !dentro_rect(terreno, en->entidad.posicion);
  if (choco || en->embiste_ms <= 0){
    en->embiste_ms = 0;
    en->espera_ms = def->espera_ms * 2; // queda agitado: es el momento de pegarle
  }
  int alcanzo = distancia(en->entidad.posicion, j->entidad.posicion) <= ALCANCE + cuerpo(en);
  int a_salvo = jugador_activa(j, HAB_BLOQUEAR) || jugador_activa(j, HAB_SALTAR);
  if (!alcanzo || en->embiste_pego || a_salvo || jugador_muerto(j)) return 0;
  en->embiste_pego = 1;
  j->entidad.vida -= danio_de_golpe(j);
  return danio_de_golpe(j);
}

// Un paso del jefe. Devuelve el danio que le hizo al jugador.
static int paso_jefe(Enemigos *e, Enemigo *en, int yo, const Laberinto *lab, Jugador *j, float dt_ms){
  Zona z = en->jefe;
  const JefeDef *def = &JEFE[z];
  RectPx terreno = terreno_jefe(lab, z);
  Direccion pies = en->entidad.posicion;
  Direccion jugador = j->entidad.posicion;
  int adentro = !jugador_muerto(j) && dentro_rect(laberinto_sala_px(lab, z), jugador);
  Direccion al_jugador = {jugador.x - pies.x, jugador.y - pies.y};
  float dist = largo(al_jugador);
  Direccion hacia = unitario(al_jugador);
  if (en->espera_ms > 0) en->espera_ms -= dt_ms;

  // Entro a la sala: empieza el combate
  if (!en->despierto){
    en->entidad.estados = QUIETO;
    if (adentro){
      en->despierto = 1;
      en->afuera_ms = 0;
      en->espera_ms = 800.0f; // un respiro antes del primer golpe
      printf("Empieza el combate con el jefe %d\n", z);
    } else return 0;
  }
  e->combate = yo;

  // Se fue: un rato despues el jefe se calma, vuelve a su lugar y se cura
  if (!adentro){
    en->afuera_ms += dt_ms;
    if (en->afuera_ms > JEFE_VUELVE_MS){
      en->despierto = 0;
      en->carga_ms = 0;
      en->entidad.vida = en->entidad.vidaMAX;
      en->entidad.posicion = centro_rect(terreno);
      e->combate = -1;
      return 0;
    }
  } else en->afuera_ms = 0;

  int arquera = z == ZONA_MEDUSAS, jinete = z == ZONA_POSEIDON;
  float alcance = arquera ? MEDUSA_ALCANCE : jinete ? CENTAURO_ALCANCE : ALCANCE + cuerpo(en);
  int danio = 0;
  if (en->embiste_ms > 0) return embestir(e, en, lab, j, terreno, dt_ms);
  Direccion dir = {0, 0};
  float velocidad = 0;
  if (en->carga_ms > 0){
    // Cargando el golpe: quieto, mirandolo. Al terminar pega donde este
    en->mira = hacia;
    en->carga_ms -= dt_ms;
    en->entidad.estados = ATACANDO;
    if (en->carga_ms <= 0){
      en->carga_ms = 0;
      en->espera_ms = def->espera_ms;
      int a_salvo = jugador_activa(j, HAB_BLOQUEAR) || jugador_activa(j, HAB_SALTAR);
      if (arquera) tirar(e, pies, hacia, 1);
      else if (jinete){
        en->embiste = hacia;
        en->embiste_ms = CENTAURO_EMBISTE_MS;
        en->embiste_pego = 0;
      } else if (dist <= alcance * 1.15f && !a_salvo && !jugador_muerto(j)){
        danio = danio_de_golpe(j);
        j->entidad.vida -= danio;
      }
    }
    return danio;
  }
  if (adentro && dist <= alcance && en->espera_ms <= 0){
    en->carga_ms = def->carga_ms;
    en->mira = hacia;
    en->entidad.estados = ATACANDO;
    return 0;
  }
  if (adentro && arquera && dist < MEDUSA_CERCA){
    dir = (Direccion){-hacia.x, -hacia.y};
    velocidad = def->velocidad;
  } else if (adentro && dist > alcance * 0.7f){
    dir = hacia;
    velocidad = def->velocidad;
  } else if (!adentro){
    Direccion casa = centro_rect(terreno);
    if (distancia(casa, pies) > 8.0f){
      dir = unitario((Direccion){casa.x - pies.x, casa.y - pies.y});
      velocidad = def->velocidad * 0.6f;
    }
  }
  float paso = velocidad * dt_ms / 1000.0f;
  float movido = laberinto_mover(lab, &en->entidad.posicion, dir.x * paso, dir.y * paso);
  // Sin salir de su terreno
  Direccion *p = &en->entidad.posicion;
  if (p->x < terreno.x) p->x = terreno.x;
  if (p->x > terreno.x + terreno.ancho) p->x = terreno.x + terreno.ancho;
  if (p->y < terreno.y) p->y = terreno.y;
  if (p->y > terreno.y + terreno.alto) p->y = terreno.y + terreno.alto;
  if (largo(dir) > 0){
    en->entidad.dir = dir;
    en->mira = adentro ? hacia : dir;
  }
  en->entidad.estados = movido < 0.01f ? QUIETO : jinete ? CAMINANDO : CORRIENDO;
  return 0;
}

static void nacer(Enemigos *e, Enemigo *en, Direccion lugar, Animo animo){
  int ronda = en->ronda, sitio = en->asiento, manada = en->manada, es_paseante = en->es_paseante;
  int guardia = en->guardia, de_bosque = en->de_bosque;
  TipoEnemigo paseante = en->paseante;
  *en = (Enemigo){0};
  en->guardia = guardia;
  en->de_bosque = de_bosque;
  en->es_paseante = es_paseante;
  en->paseante = paseante;
  en->ronda = ronda;
  en->asiento = sitio;
  en->manada = manada;
  en->activo = 1;
  en->entidad = (Entity){.vidaMAX = VIDA_ENEMIGO, .vida = VIDA_ENEMIGO};
  en->entidad.posicion = lugar;
  en->entidad.estados = QUIETO;
  en->mira = (Direccion){0, 1};
  en->lado = (siguiente(e) & 1) ? 1 : -1;
  en->botin = elegir_botin(e);
  en->monedas = 1 + (int)(siguiente(e) % 3);
  en->arma = elegir_arma(e);
  en->suelta_arma = en->arma != ARMA_NINGUNA && (int)(siguiente(e) % 100) < ARMA_SUELTA_POR_100;
  nuevo_coraje(e, en);
  cambiar_animo(en, animo);
}

// Lo convierte en algo que no es un espartano: sin arma ni botin, y aparece
// de a poco.
static void volverse(Enemigos *e, Enemigo *en, TipoEnemigo tipo){
  en->tipo = tipo;
  en->arma = ARMA_NINGUNA;
  en->suelta_arma = 0;
  en->botin = BOTIN_NADA;
  en->monedas = 1;
  en->naciendo_ms = es_caminante(en) ? LEVANTA_MS : APARECE_MS;
  en->tiro_ms = entre(e, 800.0f, TIRO_RITMO_MS);
  int vida = tipo == ENEMIGO_FANTASMA ? VIDA_FANTASMA : tipo == ENEMIGO_ESPIRITU ? VIDA_ESPIRITU
             : tipo == ENEMIGO_MEDUCITA ? VIDA_MEDUCITA : tipo == ENEMIGO_RUEDA ? VIDA_RUEDA : VIDA_ESQUELETO;
  en->entidad.vidaMAX = en->entidad.vida = vida;
}

static TipoEnemigo tipo_suelto(Enemigos *e){
  int tirada = (int)(siguiente(e) % 100);
  if (tirada < ESPARTANO_POR_100) return ENEMIGO_ESPARTANO;
  return tirada < ESPARTANO_POR_100 + FANTASMA_POR_100 ? ENEMIGO_FANTASMA : ENEMIGO_ESPIRITU;
}

// En su lugar de la ronda, bailando.
static void sentar(Enemigos *e, Enemigo *en){
  Ronda *r = &e->rondas[en->ronda];
  nacer(e, en, asiento(r, en->asiento), ANIMO_CHARLA);
  en->mira = unitario((Direccion){r->centro.x - en->entidad.posicion.x, r->centro.y - en->entidad.posicion.y});
  if (r->embrujada) volverse(e, en, en->asiento % 2 ? ENEMIGO_ESPIRITU : ENEMIGO_FANTASMA);
}

// Casi encima del que manda (lo mueve sin hacerlo nacer de nuevo). Bien
// pegado, para no caer en un muro: al caminar se acomoda a su lado.
static void juntar_con_lider(Enemigo *en, const Enemigo *jefe, int rango){
  Direccion d = girar((Direccion){8.0f, 0}, 90.0f * rango + 45.0f);
  en->entidad.posicion = (Direccion){jefe->entidad.posicion.x + d.x, jefe->entidad.posicion.y + d.y};
}

// La hoguera encendida mas cercana al jugador por los pasillos (o, si no se
// llega a ninguna, en linea recta) y fuera de su vista. -1 si no hay ninguna.
static int hoguera_mas_cercana(const Enemigos *e, Direccion jugador){
  int mejor = -1;
  float mejor_d = 0;
  for (int k = 0; k < e->cant_rondas; k++){
    const Ronda *r = &e->rondas[k];
    float recta = distancia(r->centro, jugador);
    if (r->apagada || recta < APARECE_DESDE) continue;
    int pasos = pasos_desde(e, r->centro);
    float d = pasos >= 0 ? (float)pasos : (float)(LAB_MAX_CELDAS * LAB_MAX_CELDAS) + recta;
    if (mejor < 0 || d < mejor_d){
      mejor = k;
      mejor_d = d;
    }
  }
  return mejor;
}

// Sale de la hoguera `k`, a un costado de la ronda. 0 si no encontro lugar.
static int salir_de_hoguera(Enemigos *e, Enemigo *en, const Laberinto *lab, int k, TipoEnemigo tipo){
  for (int intento = 0; intento < 24; intento++){
    Direccion d = girar((Direccion){RONDA_RADIO + 16.0f, 0}, entre(e, 0, 360));
    Direccion lugar = {e->rondas[k].centro.x + d.x, e->rondas[k].centro.y + d.y};
    if (!lugar_libre(lab, (int)(lugar.x / LAB_TILE), (int)(lugar.y / LAB_TILE))) continue;
    nacer(e, en, lugar, ANIMO_DEAMBULA);
    if (tipo != ENEMIGO_ESPARTANO) volverse(e, en, tipo);
    return 1;
  }
  return 0;
}

// Sale de la hoguera mas cercana al jugador. Sin hogueras no sale nadie:
// devuelve 0.
static int aparecer(Enemigos *e, Enemigo *en, const Laberinto *lab, Direccion jugador){
  int k = hoguera_mas_cercana(e, jugador);
  return k >= 0 && salir_de_hoguera(e, en, lab, k, en->manada >= 0 ? ENEMIGO_FANTASMA : tipo_suelto(e));
}

// Un paseante sale de una hoguera cualquiera que el jugador no este viendo.
static int salir_a_pasear(Enemigos *e, Enemigo *en, const Laberinto *lab, Direccion jugador){
  if (e->cant_rondas == 0) return 0;
  int k = (int)(siguiente(e) % (unsigned)e->cant_rondas);
  if (e->rondas[k].apagada || distancia(e->rondas[k].centro, jugador) < APARECE_DESDE) return 0;
  return salir_de_hoguera(e, en, lab, k, en->paseante);
}

// Cuanto lo rodean por andar en el laberinto (0..1).
static float presion(const Enemigos *e){ return e->laberinto_ms / PRESION_MS; }

// Cuantos sueltos pueden andar ahora: mas cuanto mas vieja la noche, cuantos
// mas dias pasaron y cuanto mas lleva el jugador en el laberinto.
static int sueltos_permitidos(const Enemigos *e){
  int dias = e->dia > 1 ? e->dia - 1 : 0;
  int de_dia = SUELTOS_DE_DIA + SUELTOS_POR_DIA * dias;
  int de_noche = SUELTOS_DE_NOCHE + SUELTOS_POR_NOCHE * dias;
  int total = de_dia + (int)((de_noche - de_dia) * e->noche) + (int)(PRESION_SUELTOS * presion(e));
  return total < ENEMIGOS_ERRANTES ? total : ENEMIGOS_ERRANTES;
}

// Cada tanto sale una tanda de una hoguera, si hay lugar para toda. Si
// sobraran, al rato volverian al fuego.
static void soltar(Enemigos *e, const Laberinto *lab, Direccion jugador, float dt_ms){
  e->salida_ms -= dt_ms;
  if (e->salida_ms > 0 || sueltos_permitidos(e) - e->sueltos < e->tanda) return;
  int desde = HUECO_ERRANTES, salieron = 0;
  for (int i = desde; i < desde + ENEMIGOS_ERRANTES && salieron < e->tanda; i++){
    if (e->lista[i].activo) continue;
    if (!aparecer(e, &e->lista[i], lab, jugador)) break;
    salieron++;
  }
  e->sueltos += salieron;
  float cada = (SALIDA_DIA_MS + (SALIDA_NOCHE_MS - SALIDA_DIA_MS) * e->noche) * (1.0f - PRESION_SALIDA * presion(e));
  e->salida_ms = salieron ? cada : SALIDA_SIN_LUGAR_MS;
  if (salieron) e->tanda = (int)(siguiente(e) % 100) < TANDA_GRANDE_POR_100 ? TANDA_GRANDE : TANDA;
}

// Toda la ronda o la manada de `en` se pone a acechar (los que estaban en
// lo suyo; los que ya pelean o escapan siguen igual).
static void alertar_grupo(Enemigos *e, const Enemigo *en){
  const int *miembros = 0;
  int cant = 0;
  if (en->ronda >= 0){
    miembros = e->rondas[en->ronda].miembros;
    cant = e->rondas[en->ronda].cant;
  } else if (en->manada >= 0){
    miembros = e->manadas[en->manada].miembros;
    cant = e->manadas[en->manada].cant;
  }
  for (int k = 0; k < cant; k++){
    Enemigo *otro = &e->lista[miembros[k]];
    if (!vivo(otro) || (otro->animo != ANIMO_DEAMBULA && otro->animo != ANIMO_CHARLA)) continue;
    nuevo_coraje(e, otro);
    cambiar_animo(otro, ANIMO_ACECHA);
  }
}

// ---------------------------------------------------------------- iniciar

static int hueco_hoguera(int ronda){ return ENEMIGOS_MAX - JEFES - RONDAS_MAX + ronda; }

// Una hoguera en `centro` con su ronda.
static void encender(Enemigos *e, Direccion centro){
  int k = e->cant_rondas++;
  Ronda *r = &e->rondas[k];
  *r = (Ronda){.centro = centro, .habla = -1, .obstaculo = -1, .hoguera = hueco_hoguera(k)};
  r->embrujada = k % EMBRUJADA_CADA == EMBRUJADA_CADA - 1;
  r->cant = RONDA_MIN + (int)(siguiente(e) % (RONDA_MAX - RONDA_MIN + 1));
  r->turno_ms = entre(e, 0, 2000.0f);
  r->giro = entre(e, 0, 6.28f);
  r->sentido = (siguiente(e) & 1) ? 1.0f : -1.0f;
  r->paso_ms = entre(e, 3000.0f, 7000.0f);
  for (int m = 0; m < r->cant; m++){
    Enemigo *en = &e->lista[k * RONDA_MAX + m];
    r->miembros[m] = k * RONDA_MAX + m;
    en->ronda = k;
    en->asiento = m;
    en->manada = -1;
    sentar(e, en);
  }
  Enemigo *h = &e->lista[r->hoguera];
  h->ronda = k;
  h->manada = -1;
  nacer(e, h, centro, ANIMO_DEAMBULA);
  h->tipo = ENEMIGO_HOGUERA;
  h->entidad.vidaMAX = h->entidad.vida = VIDA_HOGUERA;
  h->arma = ARMA_NINGUNA;
  h->suelta_arma = 0;
  h->botin = BOTIN_POCION;
  h->monedas = MONEDAS_HOGUERA;
}

// 1 si en `col`, `fila` entra una hoguera con su ronda. No mira los
// obstaculos: las rocas las pone el navegador despues, esquivando las hogueras
// (y al cargar la partida todavia no estan, y tiene que salir lo mismo).
static int entra_hoguera(const Enemigos *e, const Laberinto *lab, int col, int fila, Direccion base){
  for (int f = fila - 3; f <= fila + 3; f++){
    for (int c = col - 3; c <= col + 3; c++){
      if (laberinto_es_muro(lab, c, f) || laberinto_es_puerta(lab, c, f)) return 0;
      if (laberinto_sala(lab, c, f) != ZONA_LABERINTO || laberinto_es_lava(lab, c, f)) return 0;
    }
  }
  Direccion centro = centro_de_tile(col, fila);
  if (distancia(centro, base) < 2 * LEJOS_DE_LA_BASE) return 0;
  for (int k = 0; k < e->cant_rondas; k++){
    if (distancia(centro, e->rondas[k].centro) < 700.0f) return 0;
  }
  return 1;
}

// Busca lugar en el laberinto tallado, fuera del cuadrado de tiles de
// `viejo_desde` a `viejo_hasta` (lo que ya estaba). 1 si encendio una.
static int buscar_hoguera(Enemigos *e, const Laberinto *lab, int viejo_desde, int viejo_hasta){
  if (e->cant_rondas >= RONDAS_MAX) return 0;
  int desde = lab->c_min * LAB_CELDA;
  int hasta = (lab->c_max + 1) * LAB_CELDA + LAB_MURO;
  for (int intento = 0; intento < 1500; intento++){
    int col = desde + (int)(siguiente(e) % (unsigned)(hasta - desde));
    int fila = desde + (int)(siguiente(e) % (unsigned)(hasta - desde));
    if (en_plaza(col, fila)) continue;
    if (col >= viejo_desde && col <= viejo_hasta && fila >= viejo_desde && fila <= viejo_hasta) continue;
    if (!entra_hoguera(e, lab, col, fila, e->plaza)) continue;
    encender(e, centro_de_tile(col, fila));
    return 1;
  }
  return 0;
}

void enemigos_nueva_hoguera(Enemigos *e, const Laberinto *lab){
  unsigned int azar = e->azar;
  e->azar = e->azar_hogueras;
  int viejo_desde = (lab->c_min + LAB_ANILLO) * LAB_CELDA + LAB_MURO;
  int viejo_hasta = (lab->c_max - LAB_ANILLO + 1) * LAB_CELDA;
  buscar_hoguera(e, lab, viejo_desde, viejo_hasta);
  e->azar_hogueras = e->azar;
  e->azar = azar;
}

void enemigos_hogueras_solidas(Enemigos *e, Laberinto *lab){
  for (int k = 0; k < e->cant_rondas; k++){
    Ronda *r = &e->rondas[k];
    if (r->apagada && r->obstaculo >= 0){
      laberinto_quitar_obstaculo(lab, r->obstaculo);
      r->obstaculo = -1;
    } else if (!r->apagada && r->obstaculo < 0){
      r->obstaculo = laberinto_agregar_obstaculo(lab, (RectPx){r->centro.x - HOGUERA_ANCHO / 2, r->centro.y - HOGUERA_ALTO / 2,
                                                               HOGUERA_ANCHO, HOGUERA_ALTO});
    }
  }
}

static void poner_rondas(Enemigos *e, const Laberinto *lab){
  unsigned int azar = e->azar;
  e->azar = e->azar_hogueras;
  for (int n = 0; n < RONDAS_LABERINTO; n++) buscar_hoguera(e, lab, 1, 0);
  e->azar_hogueras = e->azar;
  e->azar = azar;
}

// 1 si un arbusto en `centro` no tapa una ronda, no pisa otro arbusto, no
// esta en la base y tiene piso alrededor.
static int arbusto_valido(const Enemigos *e, const Laberinto *lab, Direccion centro, Direccion base){
  if (distancia(centro, base) < LEJOS_DE_LA_BASE) return 0;
  if (!zona_libre(lab, (int)(centro.x / LAB_TILE), (int)(centro.y / LAB_TILE), 2)) return 0;
  if (arbustos_encima(&e->arbustos, centro, ARBUSTO_RADIO, 40.0f)) return 0;
  for (int k = 0; k < e->cant_rondas; k++){
    if (distancia(centro, e->rondas[k].centro) < RONDA_RADIO + ARBUSTO_RADIO + 40.0f) return 0;
  }
  return 1;
}

// Uno de cada tres sueltos es de los grandes; el resto, de frutas.
static float radio_de_arbusto(Enemigos *e){
  return HAY_ARBUSTOS_GRANDES && siguiente(e) % 3 == 0 ? ARBUSTO_RADIO : ARBUSTO_RADIO_FRUTAS;
}

static void poner_arbustos(Enemigos *e, const Laberinto *lab, Direccion base){
  // Al lado de cada ronda, a una distancia desde la que se los espia: grandes,
  // para poder esconderse
  for (int k = 0; HAY_ARBUSTOS_GRANDES && k < e->cant_rondas; k++){
    int puestos = 0;
    for (int intento = 0; intento < 80 && puestos < ARBUSTOS_POR_RONDA; intento++){
      Direccion d = girar((Direccion){1, 0}, entre(e, 0, 360));
      float r = entre(e, 180.0f, 260.0f);
      Direccion c = {e->rondas[k].centro.x + d.x * r, e->rondas[k].centro.y + d.y * r};
      if (!arbusto_valido(e, lab, c, base)) continue;
      arbustos_agregar(&e->arbustos, c, ARBUSTO_RADIO);
      puestos++;
    }
  }
  // Y algunos sueltos por la plaza y los pasillos
  for (int en_la_plaza = 1; en_la_plaza >= 0; en_la_plaza--){
    int quiere = en_la_plaza ? ARBUSTOS_PLAZA : ARBUSTOS_LABERINTO;
    int puestos = 0;
    for (int intento = 0; intento < 2000 && puestos < quiere; intento++){
      Direccion c;
      if (!lugar_al_azar(e, lab, en_la_plaza, 2, &c) || !arbusto_valido(e, lab, c, base)) continue;
      if (!arbustos_agregar(&e->arbustos, c, radio_de_arbusto(e))) return;
      puestos++;
    }
  }
}

// Quienes son los sueltos. Ninguno esta todavia: van saliendo de las hogueras.
static void poner_errantes(Enemigos *e){
  int desde = RONDAS_MAX * RONDA_MAX;
  int hueco = desde;
  for (int m = 0; m < MANADAS; m++){
    Manada *ma = &e->manadas[e->cant_manadas];
    *ma = (Manada){0};
    ma->cant = 3 + (int)(siguiente(e) % (MANADA_MAX - 3 + 1));
    for (int k = 0; k < ma->cant; k++){
      ma->miembros[k] = hueco;
      e->lista[hueco].manada = e->cant_manadas;
      hueco++;
    }
    e->cant_manadas++;
  }
  e->salida_ms = SALIDA_PRIMERA_MS;
  e->tanda = TANDA;
  // Los paseantes salen enseguida, de a uno
  for (int n = 0; n < ENEMIGOS_PASEANTES; n++){
    Enemigo *en = &e->lista[desde + ENEMIGOS_ERRANTES + n];
    en->es_paseante = 1;
    en->paseante = n % 2 ? ENEMIGO_ESPIRITU : ENEMIGO_ESPARTANO;
    en->reaparece_ms = entre(e, 500.0f, 10000.0f);
  }
}

// Una meducita en la sala de Medusa, a un lado del medio.
static void poner_meducita(Enemigos *e, Enemigo *en, const Laberinto *lab){
  Direccion centro = centro_rect(laberinto_sala_px(lab, ZONA_MEDUSAS));
  Direccion d = girar((Direccion){entre(e, 120.0f, 240.0f), 0}, entre(e, 0, 360));
  nacer(e, en, (Direccion){centro.x + d.x, centro.y + d.y}, ANIMO_DEAMBULA);
  volverse(e, en, ENEMIGO_MEDUCITA);
}

// El de la rueda se levanta de unos huesos del bosque que el jugador no tenga
// encima. 0 si ahora no hay ninguno.
static int levantar_rueda(Enemigos *e, Enemigo *en, Direccion jugador){
  if (e->cant_huesos_bosque == 0) return 0;
  Direccion lugar = e->huesos_bosque[siguiente(e) % (unsigned)e->cant_huesos_bosque];
  if (distancia(lugar, jugador) < RUEDA_LEJOS) return 0;
  nacer(e, en, lugar, ANIMO_ACECHA);
  volverse(e, en, ENEMIGO_RUEDA);
  return 1;
}

// Los esqueletos que esperan tirados por el laberinto, como otra pila de huesos.
static void poner_tirados(Enemigos *e, const Laberinto *lab){
  int desde = HUECO_TIRADOS;
  int puestos = 0;
  for (int intento = 0; intento < 4000 && puestos < ESQUELETOS_TIRADOS; intento++){
    Direccion lugar;
    if (!lugar_al_azar(e, lab, 0, 1, &lugar)) continue;
    Enemigo *en = &e->lista[desde + puestos++];
    nacer(e, en, lugar, ANIMO_ACECHA);
    volverse(e, en, ENEMIGO_ESQUELETO);
    en->naciendo_ms = 0;
    en->tirado = 1;
  }
}

void enemigos_iniciar(Enemigos *e, const Laberinto *lab, Direccion jugador, unsigned int semilla){
  *e = (Enemigos){0};
  e->azar = semilla ^ 0x9e3779b9u;
  e->azar_hogueras = semilla ^ 0x51ed270bu;
  e->plaza = laberinto_aparicion(lab);
  e->arbusto_jugador = -1;
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    e->lista[i].ronda = -1;
    e->lista[i].manada = -1;
  }
  e->combate = -1;
  poner_rondas(e, lab);
  if (HAY_ARBUSTOS) poner_arbustos(e, lab, jugador);
  poner_errantes(e);
  poner_tirados(e, lab);
  for (int n = 0; n < MEDUCITAS; n++) e->lista[HUECO_MEDUCITAS + n].guardia = 1;
  for (int n = 0; n < RUEDAS; n++){
    e->lista[HUECO_RUEDAS + n].de_bosque = 1;
    e->lista[HUECO_RUEDAS + n].reaparece_ms = entre(e, 3000.0f, RUEDA_VUELVE_MS);
  }
}

void enemigos_hueso_bosque(Enemigos *e, Direccion lugar){
  if (e->cant_huesos_bosque < HUESOS_BOSQUE_MAX) e->huesos_bosque[e->cant_huesos_bosque++] = lugar;
}

// ---------------------------------------------------------------- golpes

// Le saca vida. Si sobrevive, se asusta y escapa. Su grupo se alerta.
static int herir(Enemigos *e, Enemigo *en, int danio){
  if (!vivo(en) || en->naciendo_ms > 0) return 0; // el que aparece todavia no esta
  en->entidad.vida -= danio;
  en->golpeado_ms = GOLPEADO_MS;
  if (en->entidad.vida <= 0){
    en->entidad.vida = 0;
    en->entidad.estados = MUERTO;
    en->muerto_ms = MUERTE_MS;
    if (en->tipo == ENEMIGO_HOGUERA){
      e->rondas[en->ronda].apagada = 1;
      e->rondas[en->ronda].habla = -1;
      e->hogueras_rotas++;
    } else if (en->jefe){
      e->jefes_muertos++;
      e->vencidos |= 1 << en->jefe;
      e->combate = -1;
      printf("Venciste al jefe %d\n", en->jefe);
    } else e->muertos++;
  } else if (en->jefe){
    en->despierto = 1; // un jefe no escapa: pelea
  } else if (en->tipo != ENEMIGO_HOGUERA && !es_caminante(en)){
    cambiar_animo(en, ANIMO_HUYE);
  }
  alertar_grupo(e, en);
  return 1;
}

int enemigos_golpe_jugador(Enemigos *e, const Jugador *j, float alcance, int danio){
  Direccion pies = j->entidad.posicion;
  Direccion mira = unitario(j->entidad.dir);
  int golpes = 0;
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    Enemigo *en = &e->lista[i];
    Direccion hacia = {en->entidad.posicion.x - pies.x, en->entidad.posicion.y - pies.y};
    float d = largo(hacia);
    if (d > alcance + cuerpo(en)) continue;
    // Del lado al que mira (o encima suyo)
    Direccion u = unitario(hacia);
    if (d > 12.0f + cuerpo(en) && u.x * mira.x + u.y * mira.y < 0.2f) continue;
    golpes += herir(e, en, danio);
  }
  return golpes;
}

int enemigos_lanza(Enemigos *e, const Laberinto *lab, Direccion desde, Direccion hacia, float alcance,
                   int probar, Direccion *impacto, Direccion *cae){
  Direccion tiro = unitario(hacia);
  // Vuela derecho hasta el alcance o el primer muro (o puerta). Del tile en
  // el que estaba al del muro sale que cara del muro alcanzo. Al hueco no
  // entra: cae en el borde, donde se la puede levantar.
  float vuelo = 0;
  int col = 0, fila = 0, antes_col = 0, antes_fila = 0, pared = 0;
  while (vuelo < alcance){
    float x = desde.x + tiro.x * (vuelo + 2.0f), y = desde.y + tiro.y * (vuelo + 2.0f);
    col = (int)(x / LAB_TILE);
    fila = (int)(y / LAB_TILE);
    if (laberinto_es_muro(lab, col, fila)){
      pared = !laberinto_es_puerta(lab, col, fila);
      antes_col = (int)((desde.x + tiro.x * vuelo) / LAB_TILE);
      antes_fila = (int)((desde.y + tiro.y * vuelo) / LAB_TILE);
      break;
    }
    if (laberinto_toca_hueco(lab, (RectPx){x, y, 1, 1})) break;
    vuelo += 2.0f;
  }
  Direccion fin = {desde.x + tiro.x * vuelo, desde.y + tiro.y * vuelo};
  *impacto = *cae = fin;
  // El primero que cruza en la linea del vuelo
  int mejor = -1;
  float mejor_d = vuelo;
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    const Enemigo *en = &e->lista[i];
    if (!vivo(en)) continue;
    Direccion rel = {en->entidad.posicion.x - desde.x, en->entidad.posicion.y - desde.y};
    float adelante = rel.x * tiro.x + rel.y * tiro.y;
    float costado = fabsf(rel.x * tiro.y - rel.y * tiro.x);
    if (adelante > 0 && adelante <= mejor_d && costado <= LANZA_ANCHO + cuerpo(en)){
      mejor = i;
      mejor_d = adelante;
    }
  }
  if (mejor < 0) return -1;
  Enemigo *en = &e->lista[mejor];
  *impacto = *cae = en->entidad.posicion;
  if (en->tipo == ENEMIGO_HOGUERA){
    // Le saca vida y rebota: cae antes de la caja solida, donde se la levanta
    *cae = (Direccion){en->entidad.posicion.x - tiro.x * LANZA_CAE_HOGUERA, en->entidad.posicion.y - tiro.y * LANZA_CAE_HOGUERA};
    if (!probar) herir(e, en, LANZA_DANIO_HOGUERA);
    return -1;
  }
  if (probar) return en->jefe ? -1 : mejor;
  // A un jefe la lanza le pega y cae a sus pies: no lo mata ni lo clava
  if (en->jefe){
    herir(e, en, LANZA_DANIO_JEFE);
    return -1;
  }
  herir(e, en, en->entidad.vida);

  // Se lo lleva ensartado hasta donde termina el vuelo. Clavado solo contra
  // las caras que se ven: la de adelante (venia de abajo) o un costado; no
  // contra la de atras, una esquina (entro en diagonal) ni una puerta.
  if (!pared || en->tipo != ENEMIGO_ESPARTANO) return mejor; // los espectros no se clavan
  int dc = col - antes_col, df = fila - antes_fila;
  Clavado lado;
  if (dc == 0 && df == -1) lado = CLAVADO_FRENTE;
  else if (dc == 1 && df == 0) lado = CLAVADO_IZQ;
  else if (dc == -1 && df == 0) lado = CLAVADO_DER;
  else return mejor;
  Direccion pies = fin;
  if (lado == CLAVADO_FRENTE) pies.y = (fila + 1) * LAB_TILE + LANZA_ESPALDA;
  else if (lado == CLAVADO_IZQ) pies.x = col * LAB_TILE - LANZA_ESPALDA;
  else pies.x = (col + 1) * LAB_TILE + LANZA_ESPALDA;
  Direccion mira = {(float)-dc, (float)-df};
  en->entidad.posicion = pies;
  *cae = (Direccion){pies.x + mira.x * 10.0f, pies.y + mira.y * 10.0f}; // a sus pies, del lado del tiro
  en->mira = mira;
  en->clavado = lado;
  en->muerto_ms = CLAVADO_MS;
  return mejor;
}

void enemigos_desclavar(Enemigos *e, int i){
  Enemigo *en = &e->lista[i];
  if (!en->activo || en->clavado == CLAVADO_NO) return;
  en->clavado = CLAVADO_NO;
  en->muerto_ms = MUERTE_MS;
}

int enemigos_vivo(const Enemigos *e, int i){
  return i >= 0 && i < ENEMIGOS_MAX && vivo(&e->lista[i]);
}

int enemigos_golpe_a(Enemigos *e, int i, int danio){
  if (i < 0 || i >= ENEMIGOS_MAX) return 0;
  return herir(e, &e->lista[i], danio);
}

int enemigos_golpe_suelo(Enemigos *e, Direccion centro, float radio, int danio){
  int golpes = 0;
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    Enemigo *en = &e->lista[i];
    if (!vivo(en)) continue;
    float d = distancia(en->entidad.posicion, centro) - cuerpo(en);
    if (d <= radio) golpes += herir(e, en, danio);
    else if (d <= radio * 3 && !en->jefe && en->tipo != ENEMIGO_HOGUERA && !es_caminante(en)){ // el temblor los asusta
      cambiar_animo(en, ANIMO_HUYE);
      alertar_grupo(e, en);
    }
  }
  return golpes;
}

int enemigos_mas_cercano(const Enemigos *e, Direccion pies, float radio, Direccion *hacia){
  int mejor = -1;
  float mejor_d = radio;
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    const Enemigo *en = &e->lista[i];
    if (!vivo(en) || en->naciendo_ms > 0) continue;
    float d = distancia(en->entidad.posicion, pies) - cuerpo(en);
    if (d <= mejor_d){
      mejor = i;
      mejor_d = d;
    }
  }
  if (mejor < 0) return -1;
  Direccion p = e->lista[mejor].entidad.posicion;
  *hacia = unitario((Direccion){p.x - pies.x, p.y - pies.y});
  if (largo(*hacia) == 0) *hacia = (Direccion){0, 1}; // encima suyo: hacia abajo
  return mejor;
}

void enemigos_delatar(Enemigos *e){
  if (e->arbusto_jugador >= 0) e->delatado_ms = DELATADO_MS;
}

int enemigos_jugador_escondido(const Enemigos *e){
  return e->arbusto_jugador >= 0 && e->delatado_ms <= 0;
}

int enemigos_grupo(const Enemigos *e, int i){
  const Enemigo *en = &e->lista[i];
  if (en->ronda >= 0) return en->ronda;
  if (en->manada >= 0) return RONDAS_MAX + en->manada;
  return -1;
}

void enemigos_plaza_permitida(Enemigos *e, int si){ e->plaza_permitida = si; }

void enemigos_noche(Enemigos *e, float noche, int dia){
  e->noche = noche;
  e->dia = dia;
}

float enemigos_distancia(const Enemigos *e, int i, Direccion pies){
  const Enemigo *en = &e->lista[i];
  return distancia(en->entidad.posicion, pies) - cuerpo(en);
}

float enemigos_escala(const Enemigos *e, int i){
  const Enemigo *en = &e->lista[i];
  return en->jefe ? JEFE[en->jefe].escala : 1.0f;
}

float enemigos_carga(const Enemigos *e, int i){
  const Enemigo *en = &e->lista[i];
  if (!en->jefe || en->carga_ms <= 0) return 0.0f;
  return 1.0f - en->carga_ms / JEFE[en->jefe].carga_ms;
}

void enemigos_cargar_vencidos(Enemigos *e, int vencidos){
  e->vencidos = vencidos;
  for (int z = ZONA_LABERINTO + 1; z < ZONA_CANTIDAD; z++){
    if (vencidos & (1 << z)) e->lista[hueco_jefe(z)].activo = 0;
  }
}

int enemigos_hogueras_apagadas(const Enemigos *e){
  int apagadas = 0;
  for (int k = 0; k < e->cant_rondas; k++) if (e->rondas[k].apagada) apagadas |= 1 << k;
  return apagadas;
}

void enemigos_cargar_hogueras(Enemigos *e, int apagadas){
  for (int k = 0; k < e->cant_rondas; k++){
    Ronda *r = &e->rondas[k];
    if (!(apagadas & (1 << k))) continue;
    r->apagada = 1;
    e->lista[r->hoguera].activo = 0;
    for (int m = 0; m < r->cant; m++) e->lista[r->miembros[m]].activo = 0;
  }
}

int enemigos_habla(const Enemigos *e, int i){
  const Enemigo *en = &e->lista[i];
  return vivo(en) && en->ronda >= 0 && en->animo == ANIMO_CHARLA && e->rondas[en->ronda].habla == i;
}

// ---------------------------------------------------------------- rondas

// El giro del circulo y quien grita, una vez por paso en cada ronda.
static void actualizar_rondas(Enemigos *e, float dt_ms){
  for (int k = 0; k < e->cant_rondas; k++){
    Ronda *r = &e->rondas[k];
    if (r->apagada) continue;
    r->giro += r->sentido * BAILE_GIRO * dt_ms / 1000.0f;
    r->paso_ms -= dt_ms;
    if (r->paso_ms <= 0){
      // Cambian de sentido, y a veces paran un momento a gritar en el lugar
      if (r->sentido != 0 && siguiente(e) % 100 < 30){
        r->sentido = 0;
        r->paso_ms = entre(e, 900.0f, 1800.0f);
      } else {
        r->sentido = (siguiente(e) & 1) ? 1.0f : -1.0f;
        r->paso_ms = entre(e, 3000.0f, 7000.0f);
      }
    }
    // Los que bailan ahora
    int libres[RONDA_MAX], cant = 0;
    for (int m = 0; m < r->cant; m++){
      const Enemigo *en = &e->lista[r->miembros[m]];
      if (vivo(en) && en->animo == ANIMO_CHARLA && en->tipo == ENEMIGO_ESPARTANO) libres[cant++] = r->miembros[m];
    }
    if (r->habla >= 0){
      const Enemigo *el = &e->lista[r->habla];
      if (!vivo(el) || el->animo != ANIMO_CHARLA) r->habla = -1; // se fue: silencio
    }
    r->turno_ms -= dt_ms;
    if (r->turno_ms <= 0){
      // Casi siempre grita alguno: no tienen que oir nada
      if (cant == 0 || siguiente(e) % 100 < 15){
        r->habla = -1;
        r->turno_ms = entre(e, 300.0f, 700.0f);
      } else {
        r->habla = libres[siguiente(e) % (unsigned)cant];
        r->turno_ms = entre(e, 900.0f, 1800.0f);
      }
    }
  }
}

// Velocidad para llegar a `destino` sin pasarse en este paso.
static float ir_a(Direccion pies, Direccion destino, float maxima, float dt_ms, Direccion *dir){
  Direccion d = {destino.x - pies.x, destino.y - pies.y};
  float l = largo(d);
  if (l < 1.5f || dt_ms <= 0){
    *dir = (Direccion){0, 0};
    return 0;
  }
  *dir = unitario(d);
  float justo = l * 1000.0f / dt_ms;
  return justo < maxima ? justo : maxima;
}

// En la ronda: va detras de su lugar, que gira alrededor de la hoguera, mirando
// para donde gira. Cuando el circulo para, se da vuelta a gritarle al fuego. El
// paso no sale de lo que camino en este cuadro: lo alcanza y se frena a cada
// rato, y se veria cambiar de animacion todo el tiempo.
static float bailar(Enemigos *e, Enemigo *en, float dt_ms, Direccion *dir){
  const Ronda *r = &e->rondas[en->ronda];
  Direccion pies = en->entidad.posicion;
  Direccion radio = unitario((Direccion){pies.x - r->centro.x, pies.y - r->centro.y});
  if (r->sentido != 0) en->mira = (Direccion){-radio.y * r->sentido, radio.x * r->sentido};
  else en->mira = (Direccion){-radio.x, -radio.y};
  return ir_a(pies, asiento(r, en->asiento), BAILE_VEL, dt_ms, dir);
}

// ---------------------------------------------------------------- decidir

// El jugador esta distraido: pegando, o mirando para otro lado.
static int distraido(const Jugador *j, Direccion hacia_enemigo){
  for (int h = HAB_ATAQUE_LIGERO; h <= HAB_ATAQUE_CRITICO; h++){
    if (jugador_activa(j, h)) return 1;
  }
  Direccion mira = unitario(j->entidad.dir);
  return mira.x * hacia_enemigo.x + mira.y * hacia_enemigo.y < -0.2f;
}

// El jugador esta escondido de `en`: en un arbusto, sin delatarse, no
// demasiado cerca y no en el mismo arbusto que el.
static int escondido_de(const Enemigos *e, const Enemigo *en, float dist){
  if (!enemigos_jugador_escondido(e) || dist <= VE_DE_CERCA) return 0;
  return arbustos_en(&e->arbustos, en->entidad.posicion) != e->arbusto_jugador;
}

// Deambulando: sigue al que manda, vuelve a su ronda o camina al azar.
static float deambular(Enemigos *e, Enemigo *en, const Laberinto *lab, const Jugador *j, float dt_ms, Direccion *dir){
  Direccion pies = en->entidad.posicion;

  // En manada y no manda: camina al lado del que manda
  if (en->manada >= 0){
    int jefe = lider(e, en->manada);
    if (jefe >= 0 && &e->lista[jefe] != en){
      const Enemigo *el = &e->lista[jefe];
      int rango = 0;
      const Manada *ma = &e->manadas[en->manada];
      for (int k = 0; k < ma->cant; k++) if (&e->lista[ma->miembros[k]] == en) rango = k;
      Direccion d = girar((Direccion){MANADA_SEPARACION, 0}, 90.0f * rango + 45.0f);
      Direccion destino = {el->entidad.posicion.x + d.x, el->entidad.posicion.y + d.y};
      float v = ir_a(pies, destino, VEL_PASEO * 1.6f, dt_ms, dir);
      en->mira = v > VEL_PASEO * 0.5f ? *dir : el->mira;
      return v;
    }
  }

  // Las meducitas no se van de la sala
  if (en->guardia){
    Direccion centro = centro_rect(laberinto_sala_px(lab, ZONA_MEDUSAS));
    if (distancia(pies, centro) > MEDUCITA_LEJOS){
      *dir = unitario((Direccion){centro.x - pies.x, centro.y - pies.y});
      en->mira = *dir;
      return VEL_PASEO;
    }
  }

  // De una ronda y ya calmado: vuelve a su lugar
  if (con_ronda(e, en) && en->animo_ms > CALMA_MS){
    Direccion lugar = asiento(&e->rondas[en->ronda], en->asiento);
    if (distancia(pies, lugar) < 30.0f){
      cambiar_animo(en, ANIMO_CHARLA);
      *dir = (Direccion){0, 0};
      return 0;
    }
    // Derecho, y si un muro lo tapa, un rumbo al azar un rato
    en->rumbo_ms -= dt_ms;
    if (en->rumbo_ms <= 0) en->entidad.dir = unitario((Direccion){lugar.x - pies.x, lugar.y - pies.y});
    *dir = en->entidad.dir;
    if (largo(*dir) > 0) en->mira = *dir;
    return VEL_PASEO;
  }

  // Como ia_enemigos(): un rumbo al azar cada tanto (aca en 8 direcciones).
  // Desde afuera, mas de la mitad de las veces tiran para la plaza
  // (torcidos, que son tontos); adentro dan vueltas por ahi. Los sueltos
  // cazan: si el jugador esta a unas celdas, van por los pasillos hacia el
  // (en la tregua no lo siguen a la plaza).
  en->rumbo_ms -= dt_ms;
  if (en->rumbo_ms <= 0){
    en->rumbo_ms = entre(e, 700.0f, 2200.0f);
    int afuera = !en_plaza((int)(pies.x / LAB_TILE), (int)(pies.y / LAB_TILE));
    int a_su_alcance = e->plaza_permitida || !en_plaza_px(j->entidad.posicion);
    Direccion rumbo;
    en->cazando = en->ronda < 0 && !en->es_paseante && !en->guardia && en->desinteres_ms <= 0 && a_su_alcance && rumbo_al_jugador(e, lab, pies, j->entidad.posicion, CAZA_CELDAS, &rumbo);
    if (en->cazando){
      en->entidad.dir = rumbo;
      en->rumbo_ms = CAZA_RUMBO_MS;
    } else if (afuera && !en->es_paseante && !en->guardia && (int)(siguiente(e) % 100) < (e->plaza_permitida ? TIRA_A_LA_PLAZA : TIRA_EN_TREGUA)){
      Direccion a_plaza = unitario((Direccion){e->plaza.x - pies.x, e->plaza.y - pies.y});
      en->entidad.dir = girar(a_plaza, entre(e, -70.0f, 70.0f));
    } else {
      int r = siguiente(e) % 10;
      en->entidad.dir = r >= 8 ? (Direccion){0, 0} : girar((Direccion){1, 0}, 45.0f * r);
    }
  }
  *dir = en->entidad.dir;
  if (largo(*dir) > 0) en->mira = *dir;
  return en->cazando ? VEL_CAZA : VEL_PASEO;
}

// Una sombra hacia el jugador, desde la altura del espiritu.
static void tirar(Enemigos *e, Direccion desde, Direccion hacia, int flecha){
  for (int i = 0; i < TIROS_MAX; i++){
    Tiro *t = &e->tiros[i];
    if (t->activo) continue;
    *t = (Tiro){.activo = 1, .flecha = flecha, .posicion = desde, .dir = hacia, .vuelo_ms = TIRO_VUELO_MS};
    return;
  }
}

// Lo que el fantasma deja caer sobre `lugar`.
static void dejar_caer(Enemigos *e, Direccion lugar){
  for (int i = 0; i < TIROS_MAX; i++){
    Tiro *t = &e->tiros[i];
    if (t->activo) continue;
    *t = (Tiro){.activo = 1, .cae = 1, .posicion = lugar, .vuelo_ms = CAE_MS + ESTALLA_MS};
    return;
  }
}

float enemigos_tiro_altura(const Tiro *t){
  float falta = (t->vuelo_ms - ESTALLA_MS) / CAE_MS;
  return t->cae && falta > 0 ? falta : 0.0f;
}

float enemigos_tiro_estalla(const Tiro *t){
  return t->cae && t->vuelo_ms < ESTALLA_MS ? 1.0f - t->vuelo_ms / ESTALLA_MS : 0.0f;
}

// El espiritu que vio al jugador: se queda a tiro y cada tanto le tira una
// sombra. Quieto mientras la prepara.
static float acosar(Enemigos *e, Enemigo *en, int lo_ve, float dist, Direccion hacia, float dt_ms, Direccion *dir){
  en->mira = hacia;
  if (en->lanzando_ms > 0){
    float antes = en->lanzando_ms;
    en->lanzando_ms -= dt_ms;
    if (antes > TIRO_SALE_MS && en->lanzando_ms <= TIRO_SALE_MS) tirar(e, en->entidad.posicion, hacia, en->tipo == ENEMIGO_MEDUCITA);
    *dir = (Direccion){0, 0};
    return 0;
  }
  en->tiro_ms -= dt_ms;
  if (lo_ve && en->tiro_ms <= 0 && dist < TIRO_LEJOS * 1.25f){
    en->tiro_ms = TIRO_RITMO_MS;
    en->lanzando_ms = TIRO_PREPARA_MS;
    *dir = (Direccion){0, 0};
    return 0;
  }
  if (dist < TIRO_CERCA) *dir = girar((Direccion){-hacia.x, -hacia.y}, 20.0f * en->lado);
  else if (dist > TIRO_LEJOS) *dir = girar(hacia, 25.0f * en->lado);
  else *dir = girar(hacia, 90.0f * en->lado);
  if (siguiente(e) % 1000 < 4) en->lado = -en->lado;
  return VEL_ACECHO;
}

// El esqueleto: si ve al jugador va derecho y lo ataca cada tanto. Si lo vio
// y un muro lo tapa, da la vuelta por los pasillos (`rodeo`, si hay) un rato;
// si no, espera. Devuelve la velocidad; el ataque lo sigue paso_ataque.
static float perseguir(Enemigo *en, int lo_ve, const Direccion *rodeo, float dist, Direccion hacia, float dt_ms, Direccion *dir){
  *dir = (Direccion){0, 0};
  float vel = en->tipo == ENEMIGO_RUEDA ? VEL_RUEDA : VEL_ESQUELETO;
  if (!lo_ve){
    en->busca_ms += dt_ms;
    if (!en->lo_busca || !rodeo || en->busca_ms > BUSCA_MS){
      en->lo_busca = 0;
      return 0;
    }
    *dir = *rodeo;
    en->mira = *rodeo;
    return vel;
  }
  en->lo_busca = 1;
  en->busca_ms = 0;
  en->mira = hacia;
  if (dist <= ATAQUE[en->tipo].alcance && en->tiro_ms <= 0){
    empezar_ataque(en);
    return 0;
  }
  if (dist <= (en->tipo == ENEMIGO_RUEDA ? RUEDA_PARA : ALCANCE)) return 0;
  *dir = hacia;
  return vel;
}

// Elige como moverse segun el animo. Devuelve la velocidad y deja el rumbo
// en `dir` (y hacia donde mira en en->mira).
static float decidir(Enemigos *e, Enemigo *en, const Laberinto *lab, const Jugador *j, float dt_ms, Direccion *dir){
  Direccion pies = en->entidad.posicion;
  Direccion al_jugador = {j->entidad.posicion.x - pies.x, j->entidad.posicion.y - pies.y};
  float dist = largo(al_jugador);
  Direccion hacia = unitario(al_jugador);
  float vision = en->animo == ANIMO_CHARLA ? VISION_CHARLA : en->tipo == ENEMIGO_ESQUELETO ? ESQUELETO_VE : en->tipo == ENEMIGO_RUEDA ? RUEDA_VE : VISION;
  int vivo_j = !jugador_muerto(j);
  int escondido = escondido_de(e, en, dist);
  int libre = linea_libre(lab, pies, j->entidad.posicion);
  int lo_ve = vivo_j && dist < vision && !escondido && libre;
  // Un muro en el medio (no un arbusto): el rodeo por los pasillos, si el
  // jugador no quedo lejos de camino.
  int tapado = vivo_j && !escondido && !libre;
  Direccion por_camino;
  int rodea = tapado && rumbo_al_jugador(e, lab, pies, j->entidad.posicion, BUSCA_CELDAS, &por_camino);

  en->animo_ms += dt_ms;
  if (en->desinteres_ms > 0) en->desinteres_ms -= dt_ms;
  if (es_caminante(en)) return perseguir(en, lo_ve, rodea ? &por_camino : 0, dist, hacia, dt_ms, dir);
  switch (en->animo){
    case ANIMO_CHARLA:
      if (lo_ve){
        alertar_grupo(e, en); // la ronda entera
        break;
      }
      return bailar(e, en, dt_ms, dir);

    case ANIMO_DEAMBULA:
      if (lo_ve){
        nuevo_coraje(e, en);
        cambiar_animo(en, ANIMO_ACECHA);
        alertar_grupo(e, en); // su manada (o su ronda) con el
        break;
      }
      return deambular(e, en, lab, j, dt_ms, dir);

    case ANIMO_ACECHA:
      if (lo_ve) en->busca_ms = 0;
      if (tapado){
        // Detras de un muro: lo va a buscar dando la vuelta, y si quedo
        // lejos de camino (o tarda demasiado), se da por vencido y se va
        en->busca_ms += dt_ms;
        if (!rodea || en->busca_ms > BUSCA_MS){
          cambiar_animo(en, ANIMO_DEAMBULA);
          en->desinteres_ms = DESINTERES_MS;
          en->lanzando_ms = 0;
          break;
        }
        en->animo_ms = 0; // lo sigue: no lo olvida mientras da la vuelta
        *dir = por_camino;
        en->mira = por_camino;
        return VEL_ACECHO;
      }
      if (!lo_ve){
        if (en->animo_ms > OLVIDO_MS || dist > OLVIDA_LEJOS){
          cambiar_animo(en, ANIMO_DEAMBULA);
          en->desinteres_ms = DESINTERES_MS;
          en->lanzando_ms = 0;
          break;
        }
      } else {
        en->animo_ms = 0;
      }
      if (es_tirador(en)) return acosar(e, en, lo_ve, dist, hacia, dt_ms, dir);
      en->mira = hacia; // no le saca los ojos de encima
      if (dist < DIST_MIEDO && en->tipo == ENEMIGO_ESPARTANO){ // los fantasmas no tienen miedo
        cambiar_animo(en, ANIMO_HUYE);
        break;
      }
      // Coraje: mas rapido si el jugador no lo esta mirando
      en->coraje += lo_ve ? dt_ms * (distraido(j, (Direccion){-hacia.x, -hacia.y}) ? 2.5f : 1.0f) : 0;
      // El fantasma tira de lejos: necesita verlo, y en la tregua la plaza es sagrada
      int fantasma = en->tipo == ENEMIGO_FANTASMA;
      int a_tiro = !fantasma || (lo_ve && dist <= ATAQUE[en->tipo].alcance &&
                                 (e->plaza_permitida || !en_plaza_px(j->entidad.posicion)));
      if (en->coraje >= en->valor && e->atacando < MAX_ATACANTES && a_tiro){
        cambiar_animo(en, ANIMO_ATACA);
        e->atacando++;
        if (fantasma) empezar_ataque(en);
        break;
      }
      // Lejos: se acerca de costado (la vuelta larga). Cerca: lo rodea.
      if (dist > DIST_COMODO * 1.3f) *dir = girar(hacia, 50.0f * en->lado);
      else if (dist > DIST_COMODO) *dir = girar(hacia, 75.0f * en->lado);
      else *dir = girar(hacia, 105.0f * en->lado);
      // De vez en cuando cambia de costado, como si dudara
      if (siguiente(e) % 1000 < 4) en->lado = -en->lado;
      return VEL_ACECHO;

    case ANIMO_ATACA:
      // Un muro en el medio: no se lo lleva por delante, lo rodea acechando
      if (tapado || (!lo_ve && en->animo_ms > 400.0f)){
        cambiar_animo(en, ANIMO_ACECHA);
        break;
      }
      if (en->animo_ms > ATAQUE_MAX_MS){
        cambiar_animo(en, ANIMO_HUYE);
        break;
      }
      en->mira = hacia;
      *dir = hacia;
      return VEL_ATAQUE;

    case ANIMO_HUYE:
      if (en->animo_ms > HUIDA_MS){
        nuevo_coraje(e, en);
        cambiar_animo(en, lo_ve ? ANIMO_ACECHA : ANIMO_DEAMBULA);
        break;
      }
      // Escapa para atras, un poco torcido
      *dir = girar((Direccion){-hacia.x, -hacia.y}, 25.0f * en->lado);
      en->mira = *dir;
      return VEL_HUIDA;
  }
  *dir = (Direccion){0, 0};
  return 0;
}

// ---------------------------------------------------------------- paso

// Tuerce `dir` para abrirse de los que tiene encima: los que van al mismo lugar
// no terminan todos en el mismo punto, un dibujo sobre otro.
static void apartar(const Enemigos *e, const Enemigo *en, Direccion *dir){
  Direccion empuje = {0, 0};
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    const Enemigo *otro = &e->lista[i];
    if (otro == en || !vivo(otro) || otro->tipo == ENEMIGO_HOGUERA) continue;
    Direccion lejos = {en->entidad.posicion.x - otro->entidad.posicion.x, en->entidad.posicion.y - otro->entidad.posicion.y};
    float d = largo(lejos);
    if (d >= SEPARACION) continue;
    if (d < 0.5f) lejos = girar((Direccion){1, 0}, 37.0f * (float)i), d = 1.0f;
    float fuerza = 1.5f * (1.0f - d / SEPARACION) / d;
    empuje.x += lejos.x * fuerza;
    empuje.y += lejos.y * fuerza;
  }
  if (largo(empuje) > 0) *dir = unitario((Direccion){dir->x + empuje.x, dir->y + empuje.y});
}

// Para donde sale una sombra que reboto en `p`: hacia el enemigo a tiro mas
// cercano, o para `atras` si no hay ninguno.
static Direccion rumbo_de_rebote(const Enemigos *e, const Laberinto *lab, Direccion p, Direccion atras){
  int mejor = -1;
  float mejor_d = TIRO_REBOTE_BUSCA;
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    const Enemigo *en = &e->lista[i];
    if (!vivo(en) || en->naciendo_ms > 0) continue;
    float d = distancia(en->entidad.posicion, p);
    if (d < mejor_d && linea_libre(lab, p, en->entidad.posicion)){
      mejor = i;
      mejor_d = d;
    }
  }
  if (mejor < 0) return atras;
  Direccion hacia = e->lista[mejor].entidad.posicion;
  return unitario((Direccion){hacia.x - p.x, hacia.y - p.y});
}

// Las sombras en el aire: siguen derecho hasta un muro, el fin de su vuelo o
// a quien le dan. Cubierto sin escudo se deshacen; con escudo rebotan y vuelven
// por algun enemigo. Devuelve el danio que le hicieron al jugador.
static int mover_tiros(Enemigos *e, const Laberinto *lab, Jugador *j, float dt_ms){
  int danio = 0;
  for (int i = 0; i < TIROS_MAX; i++){
    Tiro *t = &e->tiros[i];
    if (!t->activo) continue;
    if (t->cae){
      float antes = t->vuelo_ms;
      t->vuelo_ms -= dt_ms;
      if (antes > ESTALLA_MS && t->vuelo_ms <= ESTALLA_MS && distancia(t->posicion, j->entidad.posicion) <= CAE_RADIO) danio += pegar(j);
      if (t->vuelo_ms <= 0) t->activo = 0;
      continue;
    }
    float paso = (t->flecha ? FLECHA_VEL : TIRO_VEL) * dt_ms / 1000.0f;
    t->posicion.x += t->dir.x * paso;
    t->posicion.y += t->dir.y * paso;
    t->vuelo_ms -= dt_ms;
    int col = (int)(t->posicion.x / LAB_TILE), fila = (int)(t->posicion.y / LAB_TILE);
    if (t->vuelo_ms <= 0 || laberinto_es_muro(lab, col, fila)){
      t->activo = 0;
    } else if (t->rebotado){
      for (int k = 0; k < ENEMIGOS_MAX; k++){
        Enemigo *en = &e->lista[k];
        if (!vivo(en) || distancia(t->posicion, en->entidad.posicion) > TIRO_RADIO + cuerpo(en)) continue;
        herir(e, en, TIRO_REBOTE_DANIO);
        t->activo = 0;
        break;
      }
    } else if (!jugador_muerto(j) && distancia(t->posicion, j->entidad.posicion) <= TIRO_RADIO){
      int cubierto = jugador_activa(j, HAB_BLOQUEAR);
      if (cubierto && j->escudo){
        t->rebotado = 1;
        t->vuelo_ms = TIRO_VUELO_MS;
        t->dir = rumbo_de_rebote(e, lab, t->posicion, (Direccion){-t->dir.x, -t->dir.y});
      } else {
        t->activo = 0;
        if (!cubierto && !jugador_activa(j, HAB_SALTAR)){
          j->entidad.vida -= danio_de_golpe(j);
          danio += danio_de_golpe(j);
        }
      }
    }
  }
  return danio;
}

// El salto del esqueleto: derecho a donde estaba el jugador, hasta chocar. En la
// tregua tampoco cruza las puertas de la plaza.
static void saltar(Enemigos *e, Enemigo *en, const Laberinto *lab, float dt_ms){
  float paso = SALTO_VEL * dt_ms / 1000.0f;
  Direccion antes = en->entidad.posicion;
  float movido = laberinto_mover(lab, &en->entidad.posicion, en->embiste.x * paso, en->embiste.y * paso);
  if (!e->plaza_permitida && en_plaza_px(en->entidad.posicion) && !en_plaza_px(antes)){
    en->entidad.posicion = antes;
    movido = 0;
  }
  en->entidad.dir = en->mira = en->embiste;
  if (movido < paso * 0.3f) en->fase_ms = 0;
}

// Un paso del ataque en curso, quieto en su lugar (salvo el salto). Devuelve el
// danio que le hizo al jugador.
static int paso_ataque(Enemigos *e, Enemigo *en, const Laberinto *lab, Jugador *j, float dt_ms){
  const AtaqueDef *a = &ATAQUE[en->tipo];
  Direccion jugador = j->entidad.posicion;
  float antes = en->fase_ms;
  int danio = 0;
  en->fase_ms -= dt_ms;
  en->entidad.estados = ATACANDO;
  if (en->fase == ATAQUE_PREPARA){
    en->mira = unitario((Direccion){jugador.x - en->entidad.posicion.x, jugador.y - en->entidad.posicion.y});
    if (en->fase_ms > 0) return 0;
    en->embiste = en->mira; // ya no corrige: se lo puede esquivar
    if (en->tipo == ENEMIGO_FANTASMA) dejar_caer(e, jugador);
    en->fase = ATAQUE_PEGA;
    en->fase_ms = a->pega_ms;
    return 0;
  }
  if (en->fase == ATAQUE_PEGA){
    if (en->tipo == ENEMIGO_ESQUELETO) saltar(e, en, lab, dt_ms);
    int llega = en->tipo != ENEMIGO_RUEDA || (antes > MANOTAZO_1_MS && en->fase_ms <= MANOTAZO_1_MS) ||
                (antes > MANOTAZO_2_MS && en->fase_ms <= MANOTAZO_2_MS);
    if (llega && !en->embiste_pego && distancia(jugador, en->entidad.posicion) <= a->golpe){
      danio = pegar(j);
      en->embiste_pego = danio > 0;
    }
    if (en->fase_ms > 0) return danio;
    en->fase = ATAQUE_RECUPERA;
    en->fase_ms = a->recupera_ms;
    return danio;
  }
  if (en->fase_ms > 0) return 0;
  en->fase = ATAQUE_NADA;
  if (en->tipo == ENEMIGO_ESPARTANO) cambiar_animo(en, ANIMO_HUYE);
  else if (en->tipo == ENEMIGO_FANTASMA){
    nuevo_coraje(e, en);
    cambiar_animo(en, ANIMO_ACECHA);
  }
  return 0;
}

// Los que estan lejos de la vista del jugador se acomodan sin caminar: los
// sueltos salen de nuevo de la hoguera mas cercana a el, los de una ronda
// vuelven a su lugar y los de una manada se juntan con el que manda. Devuelve
// 1 si lo movio.
static int acomodar_lejos(Enemigos *e, Enemigo *en, const Laberinto *lab, Direccion jugador, int *reciclados){
  if (en->animo != ANIMO_DEAMBULA || en->es_paseante || en->guardia) return 0;
  Direccion pies = en->entidad.posicion;
  float lejos = distancia(pies, jugador);

  if (en->ronda >= 0 && !con_ronda(e, en)) return 0; // sin hoguera: queda por ahi

  // Amanece y sobran: los que nadie ve vuelven al fuego
  if (en->ronda < 0 && e->sueltos > sueltos_permitidos(e) && lejos > APARECE_DESDE){
    en->activo = 0;
    e->sueltos--;
    return 1;
  }

  if (en->ronda >= 0){
    // Ya calmado, lejos, y tarda en volver (o quedo muy lejos): aparece en su lugar
    Direccion lugar = asiento(&e->rondas[en->ronda], en->asiento);
    int tarda = en->animo_ms > CALMA_MS + VUELTA_MAX_MS;
    if ((tarda || lejos > DEMASIADO_LEJOS) && en->animo_ms > CALMA_MS && lejos > APARECE_DESDE &&
        distancia(lugar, jugador) > APARECE_DESDE){
      sentar(e, en);
      return 1;
    }
    return 0;
  }

  if (en->manada >= 0){
    int jefe = lider(e, en->manada);
    if (jefe >= 0 && &e->lista[jefe] != en){
      // Se perdio: aparece al lado del que manda (si nadie mira)
      const Enemigo *el = &e->lista[jefe];
      if (distancia(pies, el->entidad.posicion) > MANADA_LEJOS && lejos > APARECE_DESDE &&
          distancia(el->entidad.posicion, jugador) > APARECE_DESDE){
        juntar_con_lider(en, el, 1);
        return 1;
      }
      return 0; // no se recicla solo: sigue al que manda
    }
  }

  // Vuelve a salir solo si hay una hoguera mas cerca del jugador que el: si ya
  // rompio las de su zona, por ahi no vuelve nadie
  int k = hoguera_mas_cercana(e, jugador);
  int pasos = pasos_desde(e, pies);
  int pasos_hoguera = k >= 0 ? pasos_desde(e, e->rondas[k].centro) : -1;
  int mas_cerca = pasos_hoguera >= 0 ? pasos < 0 || pasos_hoguera + VENTAJA_HOGUERA < pasos
                                     : k >= 0 && lejos > DEMASIADO_LEJOS && distancia(e->rondas[k].centro, jugador) < lejos;
  if (mas_cerca && en->desinteres_ms <= 0 && lejos > APARECE_DESDE && *reciclados < RECICLA_POR_PASO){
    aparecer(e, en, lab, jugador);
    (*reciclados)++;
    // El que manda se lleva a los suyos que andaban con el
    if (en->manada >= 0){
      const Manada *ma = &e->manadas[en->manada];
      for (int k = 0; k < ma->cant; k++){
        Enemigo *otro = &e->lista[ma->miembros[k]];
        if (otro == en || !vivo(otro) || otro->animo != ANIMO_DEAMBULA) continue;
        if (distancia(otro->entidad.posicion, jugador) > APARECE_DESDE) juntar_con_lider(otro, en, k);
      }
    }
    return 1;
  }
  return 0;
}

int enemigos_actualizar(Enemigos *e, const Laberinto *lab, Jugador *j, float dt_ms){
  int danio_total = 0;
  int reciclados = 0;
  Direccion jugador = j->entidad.posicion;
  e->arbusto_jugador = arbustos_en(&e->arbustos, jugador);
  if (e->delatado_ms > 0) e->delatado_ms -= dt_ms;
  e->atacando = 0;
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    const Enemigo *en = &e->lista[i];
    if (vivo(en) && en->animo == ANIMO_ATACA) e->atacando++;
  }
  e->sueltos = 0;
  for (int i = RONDAS_MAX * RONDA_MAX; i < RONDAS_MAX * RONDA_MAX + ENEMIGOS_ERRANTES; i++){
    if (vivo(&e->lista[i])) e->sueltos++;
  }
  e->laberinto_ms += en_plaza_px(jugador) ? -PRESION_CALMA * dt_ms : dt_ms;
  if (e->laberinto_ms < 0) e->laberinto_ms = 0;
  if (e->laberinto_ms > PRESION_MS) e->laberinto_ms = PRESION_MS;
  e->ruta_ms -= dt_ms;
  if (e->ruta_ms <= 0){
    e->ruta_ms = RUTA_CADA_MS;
    trazar_ruta(e, lab, jugador);
  }
  soltar(e, lab, jugador, dt_ms);
  actualizar_rondas(e, dt_ms);
  danio_total += mover_tiros(e, lab, j, dt_ms);
  // Los jefes aparecen cuando su sala ya esta tallada (y no los vencio)
  for (int z = ZONA_LABERINTO + 1; z < ZONA_CANTIDAD; z++){
    if (e->lista[hueco_jefe(z)].activo || (e->vencidos & (1 << z)) || !lab->salas[z].tallada) continue;
    nacer_jefe(e, lab, (Zona)z);
    if (z != ZONA_MEDUSAS) continue;
    for (int n = 0; n < MEDUCITAS; n++) poner_meducita(e, &e->lista[HUECO_MEDUCITAS + n], lab);
  }
  e->combate = -1;
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    Enemigo *en = &e->lista[i];
    if (!en->activo){
      if (en->reaparece_ms > 0){
        en->reaparece_ms -= dt_ms * (1.0f + RONDA_NOCHE * e->noche);
        if (en->reaparece_ms > 0) continue;
        if (en->guardia){
          // Vuelve mientras viva Medusa y el jugador no este mirando
          if (e->vencidos & (1 << ZONA_MEDUSAS)) continue;
          if (distancia(centro_rect(laberinto_sala_px(lab, ZONA_MEDUSAS)), jugador) > APARECE_DESDE) poner_meducita(e, en, lab);
          else en->reaparece_ms = 3000.0f;
          continue;
        }
        if (en->de_bosque){
          if (!levantar_rueda(e, en, jugador)) en->reaparece_ms = 3000.0f;
          continue;
        }
        if (en->es_paseante){
          if (!salir_a_pasear(e, en, lab, jugador)) en->reaparece_ms = 3000.0f;
          continue;
        }
        if (!con_ronda(e, en)) continue; // se apago su hoguera mientras esperaba
        // Los de una ronda vuelven a su lugar solo si el jugador no esta cerca
        else if (distancia(asiento(&e->rondas[en->ronda], en->asiento), jugador) > APARECE_DESDE) sentar(e, en);
        else en->reaparece_ms = 3000.0f;
      }
      continue;
    }
    if (en->tirado){
      if (!jugador_muerto(j) && distancia(en->entidad.posicion, jugador) < TIRADO_DESPIERTA){
        en->tirado = 0;
        en->naciendo_ms = LEVANTA_MS;
      }
      continue;
    }
    if (en->golpeado_ms > 0) en->golpeado_ms -= dt_ms;
    if (en->entidad.estados == MUERTO){
      en->muerto_ms -= dt_ms;
      if (en->muerto_ms <= 0){
        // Algunos espartanos no se quedan muertos
        if (en->tipo == ENEMIGO_ESPARTANO && !en->jefe && !en->clavado && (int)(siguiente(e) % 100) < ESQUELETO_POR_100){
          nacer(e, en, en->entidad.posicion, ANIMO_ACECHA);
          volverse(e, en, ENEMIGO_ESQUELETO);
          continue;
        }
        en->activo = 0;
        en->reaparece_ms = en->guardia ? MEDUCITA_VUELVE_MS : en->de_bosque ? RUEDA_VUELVE_MS
                           : en->es_paseante ? PASEANTE_VUELVE_MS
                           : !en->jefe && en->tipo != ENEMIGO_HOGUERA && con_ronda(e, en) ? REAPARECE_RONDA_MS : 0;
      }
      continue;
    }

    if (en->tipo == ENEMIGO_HOGUERA) continue;

    if (en->naciendo_ms > 0){
      en->naciendo_ms -= dt_ms;
      en->entidad.estados = QUIETO;
      continue;
    }

    if (en->jefe){
      danio_total += paso_jefe(e, en, i, lab, j, dt_ms);
      continue;
    }

    if (en->fase != ATAQUE_NADA){
      danio_total += paso_ataque(e, en, lab, j, dt_ms);
      continue;
    }

    if (acomodar_lejos(e, en, lab, jugador, &reciclados)) continue;

    Direccion dir;
    float velocidad = decidir(e, en, lab, j, dt_ms, &dir);
    if (en->animo != ANIMO_CHARLA && velocidad > 0) apartar(e, en, &dir);
    float paso = velocidad * dt_ms / 1000.0f;
    Direccion antes = en->entidad.posicion;
    float movido = laberinto_mover(lab, &en->entidad.posicion, dir.x * paso, dir.y * paso);
    // Tregua: no cruzan las puertas (se quedan del lado de afuera), salvo
    // alguno que se cuela
    if (!e->plaza_permitida && en_plaza_px(en->entidad.posicion) && !en_plaza_px(antes)){
      if (e->colados < COLADOS_MAX && (int)(siguiente(e) % 100) < COLARSE_POR_100){
        e->colados++;
      } else {
        en->entidad.posicion = antes;
        movido = 0;
        if (en->animo == ANIMO_DEAMBULA) en->rumbo_ms = 0; // otro rumbo
      }
    }
    if (largo(dir) > 0) en->entidad.dir = dir;
    // Contra un muro al deambular: busca otro rumbo enseguida (o, volviendo
    // a la ronda, uno al azar un rato para rodearlo)
    if (en->animo == ANIMO_DEAMBULA && paso > 0 && movido < paso * 0.3f){
      if (en->ronda >= 0 && en->animo_ms > CALMA_MS){
        en->entidad.dir = girar((Direccion){1, 0}, 45.0f * (siguiente(e) % 8));
        en->rumbo_ms = entre(e, 600.0f, 1500.0f);
      } else {
        en->rumbo_ms = 0;
      }
    }

    if (en->animo == ANIMO_CHARLA) en->entidad.estados = e->rondas[en->ronda].sentido != 0 ? CAMINANDO : QUIETO;
    else if (en->lanzando_ms > 0 || en->fase != ATAQUE_NADA) en->entidad.estados = ATACANDO;
    else if (movido < 0.01f) en->entidad.estados = QUIETO;
    else if (velocidad >= VEL_ATAQUE || velocidad >= VEL_HUIDA) en->entidad.estados = CORRIENDO;
    else en->entidad.estados = CAMINANDO;

    // El esqueleto no escapa. Si el jugador se fue lejos, se deshace
    if (es_caminante(en)){
      en->tiro_ms -= dt_ms;
      if (distancia(jugador, en->entidad.posicion) > DEMASIADO_LEJOS && en->tipo == ENEMIGO_ESQUELETO){
        en->activo = 0;
        en->reaparece_ms = en->es_paseante ? PASEANTE_VUELVE_MS : con_ronda(e, en) ? REAPARECE_RONDA_MS : 0;
      }
      continue;
    }

    // Llego al jugador: se planta, pega una vez y a escapar
    if (en->animo == ANIMO_ATACA && en->fase == ATAQUE_NADA && distancia(jugador, en->entidad.posicion) <= ATAQUE[en->tipo].alcance) empezar_ataque(en);
  }
  return danio_total;
}
