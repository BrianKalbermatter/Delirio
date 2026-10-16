#include "enemigos.h"

#include <math.h>

// Cuantos hay a la vez (el resto de los huecos queda libre).
#define ENEMIGOS_ACTIVOS 130

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
#define REAPARECE_MS 6000.0f
// Aparecen en un anillo alrededor del jugador, fuera de su pantalla...
#define APARECE_DESDE 480.0f
#define APARECE_HASTA 1150.0f
// ...y los que deambulan mas lejos que esto vuelven a aparecer cerca suyo.
#define DEMASIADO_LEJOS 1700.0f
#define RECICLA_POR_PASO 4 // cuantos como mucho por paso, para no hacerlo de golpe
#define TIRA_A_LA_PLAZA 55 // % de los rumbos que van hacia la plaza (desde afuera)

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

// 1 si el tile y sus 8 vecinos son piso (entra un enemigo sin tocar muros).
static int lugar_libre(const Laberinto *lab, int col, int fila){
  for (int f = fila - 1; f <= fila + 1; f++){
    for (int c = col - 1; c <= col + 1; c++){
      if (laberinto_es_muro(lab, c, f) || laberinto_es_puerta(lab, c, f)) return 0;
    }
  }
  return 1;
}

// 1 si el tile esta en la plaza (con su anillo de muros).
static int en_plaza(int col, int fila){
  int desde = (LAB_MAX_CELDAS / 2 - LAB_PLAZA / 2) * LAB_CELDA;
  int hasta = desde + LAB_PLAZA * LAB_CELDA + LAB_MURO;
  return col >= desde && col <= hasta && fila >= desde && fila <= hasta;
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
    *lugar = (Direccion){(col + 0.5f) * LAB_TILE, (fila + 0.5f) * LAB_TILE};
    return 1;
  }
  return 0;
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

static void aparecer(Enemigos *e, Enemigo *en, const Laberinto *lab, Direccion jugador){
  Direccion lugar;
  if (!buscar_lugar(e, lab, jugador, &lugar)){
    en->reaparece_ms = 2000.0f; // probar de nuevo en un rato
    return;
  }
  *en = (Enemigo){0};
  en->activo = 1;
  en->entidad = (Entity){.vidaMAX = VIDA_ENEMIGO, .vida = VIDA_ENEMIGO, .danio = DANIO_ENEMIGO};
  en->entidad.posicion = lugar;
  en->entidad.estados = QUIETO;
  en->mira = (Direccion){0, 1};
  en->lado = (siguiente(e) & 1) ? 1 : -1;
  nuevo_coraje(e, en);
  cambiar_animo(en, ANIMO_DEAMBULA);
}

void enemigos_iniciar(Enemigos *e, const Laberinto *lab, Direccion jugador, unsigned int semilla){
  *e = (Enemigos){0};
  e->azar = semilla ^ 0x9e3779b9u;
  e->plaza = laberinto_aparicion(lab);
  for (int i = 0; i < ENEMIGOS_ACTIVOS; i++) aparecer(e, &e->lista[i], lab, jugador);
}

// Le saca vida. Si sobrevive, se asusta y escapa.
static int herir(Enemigo *en, int danio){
  if (!en->activo || en->entidad.estados == MUERTO) return 0;
  en->entidad.vida -= danio;
  en->golpeado_ms = GOLPEADO_MS;
  if (en->entidad.vida <= 0){
    en->entidad.vida = 0;
    en->entidad.estados = MUERTO;
    en->muerto_ms = MUERTE_MS;
  } else {
    cambiar_animo(en, ANIMO_HUYE);
  }
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
    golpes += herir(en, danio);
  }
  return golpes;
}

int enemigos_golpe_suelo(Enemigos *e, Direccion centro, float radio, int danio){
  int golpes = 0;
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    Enemigo *en = &e->lista[i];
    if (!en->activo || en->entidad.estados == MUERTO) continue;
    float d = largo((Direccion){en->entidad.posicion.x - centro.x, en->entidad.posicion.y - centro.y});
    if (d <= radio) golpes += herir(en, danio);
    else if (d <= radio * 3) cambiar_animo(en, ANIMO_HUYE); // el temblor los asusta
  }
  return golpes;
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

// Elige como moverse segun el animo. Devuelve la velocidad y deja el rumbo
// en `dir` (y hacia donde mira en en->mira).
static float decidir(Enemigos *e, Enemigo *en, const Laberinto *lab, const Jugador *j, float dt_ms, Direccion *dir){
  Direccion pies = en->entidad.posicion;
  Direccion al_jugador = {j->entidad.posicion.x - pies.x, j->entidad.posicion.y - pies.y};
  float dist = largo(al_jugador);
  Direccion hacia = unitario(al_jugador);
  int lo_ve = !jugador_muerto(j) && dist < VISION && linea_libre(lab, pies, j->entidad.posicion);

  en->animo_ms += dt_ms;
  switch (en->animo){
    case ANIMO_DEAMBULA:
      if (lo_ve){
        nuevo_coraje(e, en);
        cambiar_animo(en, ANIMO_ACECHA);
        break;
      }
      // Como ia_enemigos(): un rumbo al azar cada tanto (aca en 8 direcciones).
      // Desde afuera, mas de la mitad de las veces tiran para la plaza
      // (torcidos, que son tontos); adentro dan vueltas por ahi.
      en->rumbo_ms -= dt_ms;
      if (en->rumbo_ms <= 0){
        en->rumbo_ms = entre(e, 700.0f, 2200.0f);
        int afuera = !en_plaza((int)(pies.x / LAB_TILE), (int)(pies.y / LAB_TILE));
        if (afuera && (int)(siguiente(e) % 100) < TIRA_A_LA_PLAZA){
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

int enemigos_actualizar(Enemigos *e, const Laberinto *lab, Jugador *j, float dt_ms){
  int danio_total = 0;
  int reciclados = 0;
  e->atacando = 0;
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    const Enemigo *en = &e->lista[i];
    if (en->activo && en->entidad.estados != MUERTO && en->animo == ANIMO_ATACA) e->atacando++;
  }
  for (int i = 0; i < ENEMIGOS_MAX; i++){
    Enemigo *en = &e->lista[i];
    if (!en->activo){
      if (en->reaparece_ms > 0){
        en->reaparece_ms -= dt_ms;
        if (en->reaparece_ms <= 0) aparecer(e, en, lab, j->entidad.posicion);
      }
      continue;
    }
    if (en->golpeado_ms > 0) en->golpeado_ms -= dt_ms;
    if (en->entidad.estados == MUERTO){
      en->muerto_ms -= dt_ms;
      if (en->muerto_ms <= 0){
        en->activo = 0;
        en->reaparece_ms = REAPARECE_MS;
      }
      continue;
    }

    // Quedo muy lejos del jugador sin hacer nada: reaparece cerca suyo
    Direccion pies = en->entidad.posicion;
    float lejos = largo((Direccion){pies.x - j->entidad.posicion.x, pies.y - j->entidad.posicion.y});
    if (lejos > DEMASIADO_LEJOS && en->animo == ANIMO_DEAMBULA && reciclados < RECICLA_POR_PASO){
      aparecer(e, en, lab, j->entidad.posicion);
      reciclados++;
      continue;
    }

    Direccion dir;
    float velocidad = decidir(e, en, lab, j, dt_ms, &dir);
    float paso = velocidad * dt_ms / 1000.0f;
    float movido = laberinto_mover(lab, &en->entidad.posicion, dir.x * paso, dir.y * paso);
    if (largo(dir) > 0) en->entidad.dir = dir;
    // Contra un muro al deambular: busca otro rumbo enseguida
    if (en->animo == ANIMO_DEAMBULA && paso > 0 && movido < paso * 0.3f) en->rumbo_ms = 0;

    if (movido < 0.01f) en->entidad.estados = QUIETO;
    else if (velocidad >= VEL_ATAQUE || velocidad >= VEL_HUIDA) en->entidad.estados = CORRIENDO;
    else en->entidad.estados = CAMINANDO;

    // Llego al jugador: un golpe y a escapar
    if (en->animo == ANIMO_ATACA){
      Direccion d = {j->entidad.posicion.x - en->entidad.posicion.x, j->entidad.posicion.y - en->entidad.posicion.y};
      if (largo(d) <= ALCANCE){
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
