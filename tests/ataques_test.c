// Pruebas de los ataques de los enemigos. Se corren con: bash tests/ataques.sh
//
// Incluye enemigos.c para llegar a lo que es static. Cada prueba deja un solo
// enemigo y un jugador en la plaza, y avanza el juego de a 16 ms.

#include <string.h>

#include "../src/mecanicas/enemigos.c"

#define PASO_MS 16.0f
#define VIDA 90

static Laberinto lab;
static Enemigos e;
static Jugador j;
static int fallas;
static Enemigo *en;
static Direccion centro;

static void ver(int ok, const char *que){
  printf("  %s %s\n", ok ? "ok  " : "FALLA", que);
  if (!ok) fallas++;
}

// Un enemigo de `tipo` a `lejos` px a la derecha del jugador.
static void preparar(TipoEnemigo tipo, float lejos){
  memset(&e, 0, sizeof e);
  enemigos_iniciar(&e, &lab, centro, 7);
  for (int i = 0; i < ENEMIGOS_MAX; i++) e.lista[i] = (Enemigo){.ronda = -1, .manada = -1};
  memset(e.rondas, 0, sizeof e.rondas);
  e.plaza_permitida = 1;
  j.entidad.posicion = centro;
  j.entidad.vida = j.entidad.vidaMAX = VIDA;
  j.armadura = 0;
  en = &e.lista[0];
  nacer(&e, en, (Direccion){centro.x + lejos, centro.y}, ANIMO_ACECHA);
  en->ronda = en->manada = -1;
  en->tipo = tipo;
  if (tipo != ENEMIGO_ESPARTANO) volverse(&e, en, tipo);
  en->naciendo_ms = 0;
  en->tiro_ms = 0;
}

// Avanza hasta que se cumple `cond` o pasan `max_ms`. Devuelve 1 si se cumplio.
#define AVANZAR_HASTA(cond, max_ms) ({ \
  float _ms = 0; \
  while (!(cond) && _ms < (max_ms)){ \
    enemigos_actualizar(&e, &lab, &j, PASO_MS); \
    for (int _i = 1; _i < ENEMIGOS_MAX; _i++) e.lista[_i].activo = 0; \
    _ms += PASO_MS; \
  } \
  (cond); })

static void esqueleto_salta(void){
  printf("esqueleto\n");
  preparar(ENEMIGO_ESQUELETO, 90.0f);
  Direccion antes = en->entidad.posicion;
  ver(AVANZAR_HASTA(en->fase == ATAQUE_PREPARA, 200), "de cerca se prepara");
  ver(en->entidad.estados == ATACANDO, "preparando se ve atacando");
  ver(AVANZAR_HASTA(en->fase == ATAQUE_PEGA, 600), "y salta");
  ver(distancia(antes, en->entidad.posicion) < 1.0f, "preparando no camina");
  ver(j.entidad.vida == VIDA, "todavia no pego");
  ver(AVANZAR_HASTA(en->fase == ATAQUE_RECUPERA, 500), "y cae");
  ver(j.entidad.vida == 0, "el salto lastima");
  ver(distancia(antes, en->entidad.posicion) > 60.0f, "se tiro hacia el jugador");
  Direccion caido = en->entidad.posicion;
  ver(AVANZAR_HASTA(en->fase == ATAQUE_NADA, 900), "y se para");
  ver(distancia(caido, en->entidad.posicion) < 1.0f, "caido queda quieto, para devolverle");

  preparar(ENEMIGO_ESQUELETO, 90.0f);
  AVANZAR_HASTA(en->fase == ATAQUE_PEGA, 800);
  j.entidad.posicion.y += 60.0f; // se corrio a tiempo
  AVANZAR_HASTA(en->fase == ATAQUE_NADA, 1500);
  ver(j.entidad.vida == VIDA, "el que se corre lo esquiva");

  preparar(ENEMIGO_ESQUELETO, 90.0f);
  e.lista[0].entidad.vida = 500;
  e.lista[0].entidad.vidaMAX = 500;
  AVANZAR_HASTA(en->fase == ATAQUE_PREPARA, 200);
  herir(&e, en, 10);
  ver(en->fase == ATAQUE_PREPARA, "al esqueleto el golpe no lo frena");
}

static void rueda_manotea(void){
  printf("rueda\n");
  preparar(ENEMIGO_RUEDA, 200.0f);
  en->tiro_ms = 0;
  ver(AVANZAR_HASTA(en->fase == ATAQUE_PREPARA, 8000), "camina hasta tenerlo a mano y se planta");
  ver(distancia(j.entidad.posicion, en->entidad.posicion) > 40.0f, "se planta a distancia de brazo");
  Direccion plantado = en->entidad.posicion;
  j.armadura = 1;
  ver(AVANZAR_HASTA(en->fase == ATAQUE_RECUPERA, 1200), "tira los manotazos");
  ver(j.entidad.vida == VIDA - VIDA / GOLPES_CON_ARMADURA, "pega una vez por ataque");
  ver(AVANZAR_HASTA(en->fase == ATAQUE_NADA, 800), "y se queda agitado");
  ver(distancia(plantado, en->entidad.posicion) < 1.0f, "sin moverse del lugar");

  preparar(ENEMIGO_RUEDA, 45.0f);
  AVANZAR_HASTA(en->fase == ATAQUE_PEGA, 800);
  j.entidad.posicion.x -= 100.0f; // fuera de su mano
  AVANZAR_HASTA(en->fase == ATAQUE_RECUPERA, 800);
  ver(j.entidad.vida == VIDA, "fuera de su mano no lastima");

  preparar(ENEMIGO_RUEDA, 45.0f);
  AVANZAR_HASTA(en->fase == ATAQUE_PEGA, 800);
  j.entidad.posicion.x -= 100.0f;
  AVANZAR_HASTA(en->fase_ms < MANOTAZO_1_MS - 20.0f, 300);
  j.entidad.posicion.x += 100.0f; // volvio: el segundo lo agarra
  AVANZAR_HASTA(en->fase == ATAQUE_RECUPERA, 800);
  ver(j.entidad.vida == 0, "el segundo manotazo agarra al que vuelve");
}

static int tiro_que_cae(void){
  for (int i = 0; i < TIROS_MAX; i++) if (e.tiros[i].activo && e.tiros[i].cae) return i;
  return -1;
}

static void fantasma_tira(void){
  printf("fantasma\n");
  preparar(ENEMIGO_FANTASMA, 150.0f);
  en->coraje = en->valor = 1.0f;
  ver(AVANZAR_HASTA(en->fase == ATAQUE_PREPARA, 200), "con coraje levanta el brazo");
  ver(tiro_que_cae() < 0, "todavia no tiro");
  ver(AVANZAR_HASTA(tiro_que_cae() >= 0, 900), "y deja caer algo");
  const Tiro *t = &e.tiros[tiro_que_cae()];
  ver(distancia(t->posicion, j.entidad.posicion) < 1.0f, "sobre el jugador");
  ver(enemigos_tiro_altura(t) > 0.9f, "desde arriba");
  ver(j.entidad.vida == VIDA, "el aire no lastima");
  ver(AVANZAR_HASTA(enemigos_tiro_altura(t) == 0, 1000), "baja hasta el piso");
  ver(j.entidad.vida == 0, "al que se quedo abajo lo lastima");
  ver(AVANZAR_HASTA(enemigos_tiro_estalla(t) > 0, 100), "y estalla");
  ver(AVANZAR_HASTA(!t->activo, 500), "y se termina");
  ver(en->fase == ATAQUE_NADA && en->animo == ANIMO_ACECHA, "el fantasma vuelve a rondarlo");

  preparar(ENEMIGO_FANTASMA, 150.0f);
  en->coraje = en->valor = 1.0f;
  AVANZAR_HASTA(tiro_que_cae() >= 0, 1000);
  j.entidad.posicion.x -= CAE_RADIO + 5.0f;
  AVANZAR_HASTA(tiro_que_cae() < 0, 1500);
  ver(j.entidad.vida == VIDA, "el que se corre de la marca no recibe nada");

  preparar(ENEMIGO_FANTASMA, 150.0f);
  en->coraje = en->valor = 1.0f;
  AVANZAR_HASTA(en->fase == ATAQUE_PREPARA, 200);
  herir(&e, en, 1);
  ver(en->fase == ATAQUE_NADA, "golpeado mientras prepara, no tira");
  AVANZAR_HASTA(tiro_que_cae() >= 0, 1000);
  ver(tiro_que_cae() < 0, "y no sale nada");

  preparar(ENEMIGO_FANTASMA, 150.0f);
  e.plaza_permitida = 0;
  en->coraje = en->valor = 1.0f;
  AVANZAR_HASTA(en->fase == ATAQUE_PREPARA, 300);
  ver(en->fase == ATAQUE_NADA, "en la tregua no tira a la plaza");
}

static void espartano_pega(void){
  printf("espartano\n");
  preparar(ENEMIGO_ESPARTANO, 20.0f);
  cambiar_animo(en, ANIMO_ATACA);
  ver(AVANZAR_HASTA(en->fase == ATAQUE_PREPARA, 200), "llega y se planta");
  ver(j.entidad.vida == VIDA, "avisa antes de pegar");
  ver(AVANZAR_HASTA(en->animo == ANIMO_HUYE, 600), "pega y escapa");
  ver(j.entidad.vida == 0, "el golpe lastima");
}

// Dos celdas vecinas con un muro en el medio, a `min`..`max` celdas de camino
// una de la otra (dando la vuelta). Devuelve 1 si encontro.
static int celdas_tapadas(int min, int max, Direccion *a, Direccion *b){
  for (int f = 1; f < LAB_MAX_CELDAS - 1; f++){
    for (int c = 1; c < LAB_MAX_CELDAS - 1; c++){
      if (en_plaza(c * LAB_CELDA, f * LAB_CELDA) || hay_paso(&lab, c, f, 1, 0)) continue;
      Direccion p = centro_de_celda(c, f), q = centro_de_celda(c + 1, f);
      int pc = (int)(p.x / LAB_TILE), pf = (int)(p.y / LAB_TILE);
      int qc = (int)(q.x / LAB_TILE), qf = (int)(q.y / LAB_TILE);
      if (!zona_libre(&lab, pc, pf, 2) || !zona_libre(&lab, qc, qf, 2)) continue;
      trazar_ruta(&e, &lab, q);
      int pasos = pasos_desde(&e, p);
      if (pasos < min || pasos > max) continue;
      *a = p;
      *b = q;
      return 1;
    }
  }
  return 0;
}

// Un enemigo de `tipo` acechando en `desde` y el jugador en `jugador`.
static void preparar_en(TipoEnemigo tipo, Direccion desde, Direccion jugador){
  preparar(tipo, 0);
  j.entidad.posicion = jugador;
  en->entidad.posicion = desde;
  e.ruta_ms = 0;
}

static void rodea_muros(void){
  printf("detras de un muro\n");
  Direccion a, b;
  if (!celdas_tapadas(2, BUSCA_CELDAS, &a, &b)){
    ver(0, "hay dos celdas tapadas cerca de camino");
    return;
  }
  preparar_en(ENEMIGO_ESPARTANO, a, b);
  ver(AVANZAR_HASTA(distancia(en->entidad.posicion, j.entidad.posicion) < 120.0f, 30000),
      "el espartano da la vuelta por los pasillos y llega");

  preparar_en(ENEMIGO_ESQUELETO, a, b);
  en->lo_busca = 1;
  ver(AVANZAR_HASTA(distancia(en->entidad.posicion, j.entidad.posicion) < 120.0f, 30000),
      "el esqueleto que lo vio tambien");

  preparar_en(ENEMIGO_ESQUELETO, a, b);
  en->lo_busca = 0;
  AVANZAR_HASTA(0, 2000);
  ver(distancia(en->entidad.posicion, a) < 1.0f, "el que nunca lo vio no lo busca");

  if (!celdas_tapadas(BUSCA_CELDAS + 2, 40, &a, &b)){
    ver(0, "hay dos celdas tapadas lejos de camino");
    return;
  }
  preparar_en(ENEMIGO_ESPARTANO, a, b);
  ver(AVANZAR_HASTA(en->animo == ANIMO_DEAMBULA, 200), "lejos de camino se da por vencido");
  ver(en->desinteres_ms > 0, "y se va sin buscarlo");
}

int main(void){
  laberinto_iniciar(&lab, 7);
  jugador_iniciar(&j, "Prueba", HABILIDADES_BASE, (Entity){.vidaMAX = VIDA, .vida = VIDA});
  int medio = (LAB_MAX_CELDAS / 2) * LAB_CELDA;
  for (int d = 0; d < 40 && !centro.x; d++){
    for (int c = medio - d; c <= medio + d; c++){
      if (zona_libre(&lab, c, medio, 8)) { centro = centro_de_tile(c, medio); break; }
    }
  }
  if (!centro.x){ printf("no hay lugar libre en la plaza\n"); return 1; }
  esqueleto_salta();
  rueda_manotea();
  fantasma_tira();
  espartano_pega();
  rodea_muros();
  printf(fallas ? "%d fallas\n" : "todo bien\n", fallas);
  return fallas != 0;
}
