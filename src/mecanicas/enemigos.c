#include "enemigos.h"

#include <math.h>

// Sueltos a la vez: los que deambulan (y cazan en manada) alrededor del
// jugador. Los de las rondas van aparte.
#define ENEMIGOS_ERRANTES 40

#define VIDA_ENEMIGO 30
#define DANIO_ENEMIGO 6

// Velocidades, en pixeles por segundo (el jugador camina a 110).
#define VEL_PASEO 40.0f
#define VEL_ACECHO 70.0f
#define VEL_ATAQUE 165.0f
#define VEL_HUIDA 140.0f

#define VISION 300.0f       // hasta donde ve al jugador (si no hay muros en el medio)
#define DIST_MIEDO 95.0f    // mas cerca que esto, escapa
#define DIST_COMODO 160.0f  // le gusta quedarse a esta distancia, rodeandolo
#define ALCANCE 24.0f       // de pies a pies, para pegar
#define OLVIDO_MS 2500.0f   // sin verlo este tiempo, vuelve a deambular
#define HUIDA_MS 1300.0f    // cuanto escapa despues de un susto
#define ATAQUE_MAX_MS 1800.0f // si no lo alcanza en este tiempo, se arrepiente
#define GOLPEADO_MS 220.0f
// Oportunistas: mientras otros se lanzan, el resto espera su momento.
#define MAX_ATACANTES 2
#define MUERTE_MS 2640.0f   // la animacion de morir (33 frames de 80 ms)
#define CLAVADO_MS 20000.0f // cuanto queda clavado al muro antes de desaparecer
#define LANZA_ESPALDA 9.0f  // de sus pies a la cara del muro (art/enemigo1.py SPEAR)
#define LANZA_ANCHO 16.0f   // a esta distancia de la linea del vuelo le da
#define REAPARECE_MS 6000.0f
// Aparecen en un anillo alrededor del jugador, fuera de su pantalla...
#define APARECE_DESDE 480.0f
#define APARECE_HASTA 1150.0f
// ...y los que deambulan mas lejos que esto vuelven a aparecer cerca suyo.
#define DEMASIADO_LEJOS 1700.0f
#define RECICLA_POR_PASO 4 // cuantos como mucho por paso, para no hacerlo de golpe
#define TIRA_A_LA_PLAZA 55 // % de los rumbos que van hacia la plaza (desde afuera)

// Manadas: cuantas y de cuantos (salen de los ENEMIGOS_ERRANTES).
#define MANADAS 4
#define MANADA_SEPARACION 34.0f // a cuanto del que manda camina cada uno
#define MANADA_LEJOS 420.0f     // mas lejos que esto del que manda, se le junta
#define RASTREO 950.0f          // el que manda caza al jugador si esta a menos que esto...
#define CAZA 50                 // ...en este % de sus rumbos

// Rondas: cuantas en la plaza y en el laberinto, y como son.
#define RONDAS_PLAZA 3
#define RONDAS_LABERINTO 4
#define RONDA_RADIO 46.0f       // radio del circulo en el que se paran
#define VISION_CHARLA 140.0f    // charlando ven poco: se los puede sorprender
#define CALMA_MS 6000.0f        // deambulando sin verlo este tiempo, vuelven a la ronda
#define VUELTA_MAX_MS 15000.0f  // si no llegan en este tiempo (y nadie mira), aparecen ahi
#define REAPARECE_RONDA_MS 45000.0f // un muerto de la ronda vuelve tanto despues

// Arbustos
#define ARBUSTO_RADIO 76.0f
#define ARBUSTOS_POR_RONDA 2
#define ARBUSTOS_PLAZA 6
#define ARBUSTOS_LABERINTO 10
#define VE_DE_CERCA 45.0f       // tan cerca, lo ve aunque este en un arbusto
#define DELATADO_MS 1000.0f     // pegar desde un arbusto lo deja a la vista
#define LEJOS_DE_LA_BASE 650.0f // nada de rondas ni arbustos tan cerca del inicio

_Static_assert(RONDAS_MAX * RONDA_MAX + ENEMIGOS_ERRANTES <= ENEMIGOS_MAX, "no entran todos en la lista");
_Static_assert(RONDAS_PLAZA + RONDAS_LABERINTO <= RONDAS_MAX, "demasiadas rondas");
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

// Un lugar de piso (laberinto o plaza) en el anillo alrededor del jugador.
// Devuelve 0 si no encontro (prueba un numero limitado de veces).
static int buscar_lugar(Enemigos *e, const Laberinto *lab, Direccion jugador, Direccion *lugar){
  for (int intento = 0; intento < 60; intento++){
    Direccion d = girar((Direccion){1, 0}, entre(e, 0, 360));
    float r = entre(e, APARECE_DESDE, APARECE_HASTA);
    Direccion p = {jugador.x + d.x * r, jugador.y + d.y * r};
    if (p.x < 0 || p.y < 0) continue;
    int col = (int)(p.x / LAB_TILE);
    int fila = (int)(p.y / LAB_TILE);
    if (!lugar_libre(lab, col, fila)) continue;
    *lugar = centro_de_tile(col, fila);
    return 1;
  }
  return 0;
}

// ---------------------------------------------------------------- grupos

static int vivo(const Enemigo *en){ return en->activo && en->entidad.estados != MUERTO; }

// El que manda en la manada `m`: el primero vivo. -1 si no queda ninguno.
static int lider(const Enemigos *e, int m){
  const Manada *ma = &e->manadas[m];
  for (int k = 0; k < ma->cant; k++){
    if (vivo(&e->lista[ma->miembros[k]])) return ma->miembros[k];
  }
  return -1;
}

// Donde se para el que tiene el asiento `asiento` en la ronda.
static Direccion asiento(const Ronda *r, int asiento){
  float a = 2.0f * 3.14159265f * asiento / r->cant;
  return (Direccion){r->centro.x + cosf(a) * RONDA_RADIO, r->centro.y + sinf(a) * RONDA_RADIO};
}

// ---------------------------------------------------------------- vida

static void nuevo_coraje(Enemigos *e, Enemigo *en){
  en->coraje = 0;
  en->valor = entre(e, 1800.0f, 4500.0f);
}

static void cambiar_animo(Enemigo *en, Animo animo){
  en->animo = animo;
  en->animo_ms = 0;
}

// Uno nuevo en `lugar`, sin perder con quien anda.
static void nacer(Enemigos *e, Enemigo *en, Direccion lugar, Animo animo){
  int ronda = en->ronda, sitio = en->asiento, manada = en->manada;
  *en = (Enemigo){0};
  en->ronda = ronda;
  en->asiento = sitio;
  en->manada = manada;
  en->activo = 1;
  en->entidad = (Entity){.vidaMAX = VIDA_ENEMIGO, .vida = VIDA_ENEMIGO, .danio = DANIO_ENEMIGO};
  en->entidad.posicion = lugar;
  en->entidad.estados = QUIETO;
  en->mira = (Direccion){0, 1};
  en->lado = (siguiente(e) & 1) ? 1 : -1;
  en->ajuste_ms = entre(e, 0, 3000.0f);
  nuevo_coraje(e, en);
  cambiar_animo(en, animo);
}

// En su lugar de la ronda, charlando.
static void sentar(Enemigos *e, Enemigo *en){
  Ronda *r = &e->rondas[en->ronda];
  nacer(e, en, asiento(r, en->asiento), ANIMO_CHARLA);
  en->mira = unitario((Direccion){r->centro.x - en->entidad.posicion.x, r->centro.y - en->entidad.posicion.y});
}

// Casi encima del que manda (lo mueve sin hacerlo nacer de nuevo). Bien
// pegado, para no caer en un muro: al caminar se acomoda a su lado.
static void juntar_con_lider(Enemigo *en, const Enemigo *jefe, int rango){
  Direccion d = girar((Direccion){8.0f, 0}, 90.0f * rango + 45.0f);
  en->entidad.posicion = (Direccion){jefe->entidad.posicion.x + d.x, jefe->entidad.posicion.y + d.y};
}

static void aparecer(Enemigos *e, Enemigo *en, const Laberinto *lab, Direccion jugador){
  // Uno de una manada, si el que manda esta lejos de la vista: al lado suyo
  if (en->manada >= 0){
    int jefe = lider(e, en->manada);
    if (jefe >= 0 && &e->lista[jefe] != en && distancia(e->lista[jefe].entidad.posicion, jugador) > APARECE_DESDE){
      nacer(e, en, e->lista[jefe].entidad.posicion, ANIMO_DEAMBULA);
      return;
    }
  }
  Direccion lugar;
  if (!buscar_lugar(e, lab, jugador, &lugar)){
    en->reaparece_ms = 2000.0f; // probar de nuevo en un rato
    return;
  }
  nacer(e, en, lugar, ANIMO_DEAMBULA);
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

static void poner_rondas(Enemigos *e, const Laberinto *lab, Direccion base, int *hueco){
  for (int n = 0; n < RONDAS_PLAZA + RONDAS_LABERINTO; n++){
    int en_la_plaza = n < RONDAS_PLAZA;
    float minimo = en_la_plaza ? LEJOS_DE_LA_BASE : 2 * LEJOS_DE_LA_BASE;
    Direccion centro;
    int hallado = 0;
    for (int intento = 0; intento < 800 && !hallado; intento++){
      if (!lugar_al_azar(e, lab, en_la_plaza, 3, &centro)) continue;
      if (distancia(centro, base) < minimo) continue;
      hallado = 1;
      for (int k = 0; k < e->cant_rondas; k++){
        if (distancia(centro, e->rondas[k].centro) < 700.0f) hallado = 0;
      }
    }
    if (!hallado) continue;
    Ronda *r = &e->rondas[e->cant_rondas];
    *r = (Ronda){.centro = centro, .habla = -1};
    r->cant = 4 + (int)(siguiente(e) % (RONDA_MAX - 4 + 1));
    r->turno_ms = entre(e, 0, 2000.0f);
    r->baile_ms = entre(e, 2000.0f, 9000.0f);
    for (int k = 0; k < r->cant; k++){
      Enemigo *en = &e->lista[*hueco];
      r->miembros[k] = (*hueco)++;
      en->ronda = e->cant_rondas;
      en->asiento = k;
      en->manada = -1;
      sentar(e, en);
    }
    e->cant_rondas++;
  }
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

static void poner_arbustos(Enemigos *e, const Laberinto *lab, Direccion base){
  // Al lado de cada ronda, a una distancia desde la que se los espia
  for (int k = 0; k < e->cant_rondas; k++){
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
      if (!arbustos_agregar(&e->arbustos, c, ARBUSTO_RADIO)) return;
      puestos++;
    }
  }
}

static void poner_errantes(Enemigos *e, const Laberinto *lab, Direccion jugador, int hueco){
  int desde = hueco;
  for (int m = 0; m < MANADAS; m++){
    Manada *ma = &e->manadas[e->cant_manadas];
    *ma = (Manada){0};
    ma->cant = 3 + (int)(siguiente(e) % (MANADA_MAX - 3 + 1));
    for (int k = 0; k < ma->cant; k++){
      ma->miembros[k] = hueco;
      e->lista[hueco].ronda = -1;
      e->lista[hueco].manada = e->cant_manadas;
      hueco++;
    }
    e->cant_manadas++;
  }
  for (; hueco < desde + ENEMIGOS_ERRANTES; hueco++){
    e->lista[hueco].ronda = -1;
    e->lista[hueco].manada = -1;
  }
  // El que manda aparece en el anillo; los suyos, a su lado
  for (int i = desde; i < hueco; i++) aparecer(e, &e->lista[i], lab, jugador);
}

void enemigos_iniciar(Enemigos *e, const Laberinto *lab, Direccion jugador, unsigned int semilla){
  *e = (Enemigos){0};
  e->azar = semilla ^ 0x9e3779b9u;
  e->plaza = laberinto_aparicion(lab);
  e->arbusto_jugador = -1;
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    e->lista[i].ronda = -1;
    e->lista[i].manada = -1;
  }
  int hueco = 0;
  poner_rondas(e, lab, jugador, &hueco);
  poner_arbustos(e, lab, jugador);
  poner_errantes(e, lab, jugador, hueco);
}

// ---------------------------------------------------------------- golpes

// Le saca vida. Si sobrevive, se asusta y escapa. Su grupo se alerta.
static int herir(Enemigos *e, Enemigo *en, int danio){
  if (!vivo(en)) return 0;
  en->entidad.vida -= danio;
  en->golpeado_ms = GOLPEADO_MS;
  if (en->entidad.vida <= 0){
    en->entidad.vida = 0;
    en->entidad.estados = MUERTO;
    en->muerto_ms = MUERTE_MS;
    e->muertos++;
  } else {
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
    if (d > alcance) continue;
    // Del lado al que mira (o encima suyo)
    Direccion u = unitario(hacia);
    if (d > 12.0f && u.x * mira.x + u.y * mira.y < 0.2f) continue;
    golpes += herir(e, en, danio);
  }
  return golpes;
}

int enemigos_lanza(Enemigos *e, const Laberinto *lab, Direccion desde, Direccion hacia, float alcance,
                   int probar, Direccion *impacto, Direccion *cae){
  Direccion tiro = unitario(hacia);
  // Vuela derecho hasta el alcance o el primer muro (o puerta). Del tile en
  // el que estaba al del muro sale que cara del muro alcanzo.
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
    if (adelante > 0 && adelante <= mejor_d && costado <= LANZA_ANCHO){
      mejor = i;
      mejor_d = adelante;
    }
  }
  if (mejor < 0) return -1;
  Enemigo *en = &e->lista[mejor];
  *impacto = *cae = en->entidad.posicion;
  if (probar) return mejor;
  herir(e, en, en->entidad.vida);

  // Se lo lleva ensartado hasta donde termina el vuelo. Clavado solo contra
  // las caras que se ven: la de adelante (venia de abajo) o un costado; no
  // contra la de atras, una esquina (entro en diagonal) ni una puerta.
  if (!pared) return mejor;
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
    float d = distancia(en->entidad.posicion, centro);
    if (d <= radio) golpes += herir(e, en, danio);
    else if (d <= radio * 3){ // el temblor los asusta
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
    if (!vivo(en)) continue;
    float d = distancia(en->entidad.posicion, pies);
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

int enemigos_habla(const Enemigos *e, int i){
  const Enemigo *en = &e->lista[i];
  return vivo(en) && en->ronda >= 0 && en->animo == ANIMO_CHARLA && e->rondas[en->ronda].habla == i;
}

// ---------------------------------------------------------------- rondas

// Turnos para hablar y quien baila, una vez por paso en cada ronda.
static void actualizar_rondas(Enemigos *e, float dt_ms){
  for (int k = 0; k < e->cant_rondas; k++){
    Ronda *r = &e->rondas[k];
    // Los que charlan ahora (y no bailan)
    int libres[RONDA_MAX], cant = 0;
    for (int m = 0; m < r->cant; m++){
      const Enemigo *en = &e->lista[r->miembros[m]];
      if (vivo(en) && en->animo == ANIMO_CHARLA && en->baile_ms <= 0) libres[cant++] = r->miembros[m];
    }
    if (r->habla >= 0){
      const Enemigo *el = &e->lista[r->habla];
      if (!vivo(el) || el->animo != ANIMO_CHARLA) r->habla = -1; // se fue: silencio
    }
    r->turno_ms -= dt_ms;
    if (r->turno_ms <= 0){
      // A veces se callan todos un momento; si no, habla otro
      if (cant < 2 || siguiente(e) % 100 < 25){
        r->habla = -1;
        r->turno_ms = entre(e, 500.0f, 1200.0f);
      } else {
        int nuevo = libres[siguiente(e) % (unsigned)cant];
        if (nuevo == r->habla) nuevo = libres[(siguiente(e) % (unsigned)cant)];
        r->habla = nuevo;
        r->turno_ms = entre(e, 1500.0f, 3500.0f);
      }
    }
    r->baile_ms -= dt_ms;
    if (r->baile_ms <= 0){
      r->baile_ms = entre(e, 7000.0f, 15000.0f);
      if (cant >= 3){
        int bailarin = libres[siguiente(e) % (unsigned)cant];
        if (bailarin != r->habla) e->lista[bailarin].baile_ms = entre(e, 2500.0f, 4500.0f);
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

// En la ronda: en su lugar, mirando al que habla, acomodandose; o bailando
// en el medio.
static float charlar(Enemigos *e, Enemigo *en, int yo, float dt_ms, Direccion *dir){
  const Ronda *r = &e->rondas[en->ronda];
  Direccion pies = en->entidad.posicion;
  Direccion lugar = asiento(r, en->asiento);
  if (en->baile_ms > 0){
    // Da vueltitas entre su lugar y el centro
    en->baile_ms -= dt_ms;
    float a = en->baile_ms / 1000.0f * 4.0f;
    Direccion medio = {lugar.x + (r->centro.x - lugar.x) * 0.6f, lugar.y + (r->centro.y - lugar.y) * 0.6f};
    Direccion paso = {medio.x + cosf(a) * 12.0f, medio.y + sinf(a) * 12.0f};
    float v = ir_a(pies, paso, VEL_PASEO * 1.5f, dt_ms, dir);
    if (largo(*dir) > 0) en->mira = *dir;
    return v;
  }
  // Cada tanto se acomoda un poco (se balancea)
  en->ajuste_ms -= dt_ms;
  if (en->ajuste_ms <= 0){
    en->ajuste_ms = entre(e, 1200.0f, 4000.0f);
    en->ajuste = (Direccion){entre(e, -5.0f, 5.0f), entre(e, -5.0f, 5.0f)};
  }
  Direccion destino = {lugar.x + en->ajuste.x, lugar.y + en->ajuste.y};
  float v = ir_a(pies, destino, VEL_PASEO, dt_ms, dir);
  // Mira al que habla; el que habla, al centro
  Direccion foco = r->centro;
  if (r->habla >= 0 && r->habla != yo) foco = e->lista[r->habla].entidad.posicion;
  Direccion hacia = unitario((Direccion){foco.x - pies.x, foco.y - pies.y});
  if (largo(hacia) > 0) en->mira = hacia;
  return v;
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
static float deambular(Enemigos *e, Enemigo *en, const Jugador *j, float dt_ms, Direccion *dir){
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

  // De una ronda y ya calmado: vuelve a su lugar
  if (en->ronda >= 0 && en->animo_ms > CALMA_MS){
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
  // (torcidos, que son tontos); adentro dan vueltas por ahi. El que manda
  // una manada caza: muchas veces tira para donde esta el jugador.
  en->rumbo_ms -= dt_ms;
  if (en->rumbo_ms <= 0){
    en->rumbo_ms = entre(e, 700.0f, 2200.0f);
    int afuera = !en_plaza((int)(pies.x / LAB_TILE), (int)(pies.y / LAB_TILE));
    Direccion al_jugador = {j->entidad.posicion.x - pies.x, j->entidad.posicion.y - pies.y};
    if (en->manada >= 0 && largo(al_jugador) < RASTREO && (int)(siguiente(e) % 100) < CAZA){
      en->entidad.dir = girar(unitario(al_jugador), entre(e, -35.0f, 35.0f));
    } else if (afuera && (int)(siguiente(e) % 100) < TIRA_A_LA_PLAZA){
      Direccion a_plaza = unitario((Direccion){e->plaza.x - pies.x, e->plaza.y - pies.y});
      en->entidad.dir = girar(a_plaza, entre(e, -70.0f, 70.0f));
    } else {
      int r = siguiente(e) % 10;
      en->entidad.dir = r >= 8 ? (Direccion){0, 0} : girar((Direccion){1, 0}, 45.0f * r);
    }
  }
  *dir = en->entidad.dir;
  if (largo(*dir) > 0) en->mira = *dir;
  return VEL_PASEO;
}

// Elige como moverse segun el animo. Devuelve la velocidad y deja el rumbo
// en `dir` (y hacia donde mira en en->mira).
static float decidir(Enemigos *e, Enemigo *en, int yo, const Laberinto *lab, const Jugador *j, float dt_ms, Direccion *dir){
  Direccion pies = en->entidad.posicion;
  Direccion al_jugador = {j->entidad.posicion.x - pies.x, j->entidad.posicion.y - pies.y};
  float dist = largo(al_jugador);
  Direccion hacia = unitario(al_jugador);
  float vision = en->animo == ANIMO_CHARLA ? VISION_CHARLA : VISION;
  int lo_ve = !jugador_muerto(j) && dist < vision && !escondido_de(e, en, dist) &&
              linea_libre(lab, pies, j->entidad.posicion);

  en->animo_ms += dt_ms;
  switch (en->animo){
    case ANIMO_CHARLA:
      if (lo_ve){
        en->baile_ms = 0;
        alertar_grupo(e, en); // la ronda entera
        break;
      }
      return charlar(e, en, yo, dt_ms, dir);

    case ANIMO_DEAMBULA:
      if (lo_ve){
        nuevo_coraje(e, en);
        cambiar_animo(en, ANIMO_ACECHA);
        alertar_grupo(e, en); // su manada (o su ronda) con el
        break;
      }
      return deambular(e, en, j, dt_ms, dir);

    case ANIMO_ACECHA:
      if (!lo_ve){
        if (en->animo_ms > OLVIDO_MS) cambiar_animo(en, ANIMO_DEAMBULA);
      } else {
        en->animo_ms = 0;
      }
      en->mira = hacia; // no le saca los ojos de encima
      if (dist < DIST_MIEDO){
        cambiar_animo(en, ANIMO_HUYE);
        break;
      }
      // Coraje: mas rapido si el jugador no lo esta mirando
      en->coraje += lo_ve ? dt_ms * (distraido(j, (Direccion){-hacia.x, -hacia.y}) ? 2.5f : 1.0f) : 0;
      if (en->coraje >= en->valor && e->atacando < MAX_ATACANTES){
        cambiar_animo(en, ANIMO_ATACA);
        e->atacando++;
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
      if (!lo_ve && en->animo_ms > 400.0f){
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

// Los que estan lejos de la vista del jugador se acomodan sin caminar: los
// sueltos reaparecen cerca suyo, los de una ronda vuelven a su lugar y los
// de una manada se juntan con el que manda. Devuelve 1 si lo movio.
static int acomodar_lejos(Enemigos *e, Enemigo *en, const Laberinto *lab, Direccion jugador, int *reciclados){
  if (en->animo != ANIMO_DEAMBULA) return 0;
  Direccion pies = en->entidad.posicion;
  float lejos = distancia(pies, jugador);

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

  if (lejos > DEMASIADO_LEJOS && *reciclados < RECICLA_POR_PASO){
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
  actualizar_rondas(e, dt_ms);
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    Enemigo *en = &e->lista[i];
    if (!en->activo){
      if (en->reaparece_ms > 0){
        en->reaparece_ms -= dt_ms;
        if (en->reaparece_ms > 0) continue;
        if (en->ronda < 0) aparecer(e, en, lab, jugador);
        // Los de una ronda vuelven a su lugar solo si el jugador no esta cerca
        else if (distancia(asiento(&e->rondas[en->ronda], en->asiento), jugador) > APARECE_DESDE) sentar(e, en);
        else en->reaparece_ms = 3000.0f;
      }
      continue;
    }
    if (en->golpeado_ms > 0) en->golpeado_ms -= dt_ms;
    if (en->entidad.estados == MUERTO){
      en->muerto_ms -= dt_ms;
      if (en->muerto_ms <= 0){
        en->activo = 0;
        en->reaparece_ms = en->ronda >= 0 ? REAPARECE_RONDA_MS : REAPARECE_MS;
      }
      continue;
    }

    if (acomodar_lejos(e, en, lab, jugador, &reciclados)) continue;

    Direccion dir;
    float velocidad = decidir(e, en, i, lab, j, dt_ms, &dir);
    float paso = velocidad * dt_ms / 1000.0f;
    float movido = laberinto_mover(lab, &en->entidad.posicion, dir.x * paso, dir.y * paso);
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

    if (movido < 0.01f) en->entidad.estados = QUIETO;
    else if (velocidad >= VEL_ATAQUE || velocidad >= VEL_HUIDA) en->entidad.estados = CORRIENDO;
    else en->entidad.estados = CAMINANDO;

    // Llego al jugador: un golpe y a escapar
    if (en->animo == ANIMO_ATACA){
      if (distancia(jugador, en->entidad.posicion) <= ALCANCE){
        int a_salvo = jugador_activa(j, HAB_BLOQUEAR) || jugador_activa(j, HAB_SALTAR);
        if (!a_salvo && !jugador_muerto(j)){
          j->entidad.vida -= en->entidad.danio;
          danio_total += en->entidad.danio;
        }
        cambiar_animo(en, ANIMO_HUYE);
      }
    }
  }
  return danio_total;
}
