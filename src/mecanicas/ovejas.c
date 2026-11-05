#include "ovejas.h"

#include <math.h>

#define MANADAS 4
#define MANADA_MIN 3
#define SOLAS 5
#define LEJOS_DEL_INICIO 450.0f // al empezar, ninguna tan cerca del jugador
#define MANADA_RADIO 90.0f      // al empezar, tan juntas
#define MEDIO_PLAZA 1660.0f     // px desde el centro: de ahi no pasan (la plaza mide 1712)

#define VEL_PASEO 26.0f
#define VEL_HUIDA 125.0f        // el jugador camina a 110 y corre a 176

#define SE_ASUSTA 150.0f        // el jugador tan cerca: sale corriendo
#define CONTAGIO 240.0f         // las de su manada tan cerca se asustan con ella
#define SE_CALMA 320.0f         // ya lejos del jugador, para
#define HUYE_MIN_MS 1400.0f
#define SE_ALEJO 110.0f         // tan lejos de su manada, vuelve hacia ella
#define TRABADA 0.3f            // se movio menos que esto de lo que queria: busca otro lado

static unsigned int siguiente(Ovejas *o){
  unsigned int x = o->azar;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  o->azar = x;
  return x;
}

static float entre(Ovejas *o, float a, float b){
  return a + (b - a) * (float)(siguiente(o) % 10000) / 10000.0f;
}

static Direccion rumbo(float angulo){
  return (Direccion){cosf(angulo), sinf(angulo)};
}

static float distancia(Direccion a, Direccion b){
  return hypotf(a.x - b.x, a.y - b.y);
}

static Direccion hacia(Direccion desde, Direccion a){
  float d = distancia(desde, a);
  if (d < 0.01f) return (Direccion){1, 0};
  return (Direccion){(a.x - desde.x) / d, (a.y - desde.y) / d};
}

static Direccion girada(Direccion d, float angulo){
  float c = cosf(angulo), s = sinf(angulo);
  return (Direccion){d.x * c - d.y * s, d.x * s + d.y * c};
}

static int en_plaza(const Laberinto *lab, Direccion p){
  Direccion centro = laberinto_aparicion(lab);
  return fabsf(p.x - centro.x) < MEDIO_PLAZA && fabsf(p.y - centro.y) < MEDIO_PLAZA;
}

static void poner(Ovejas *o, Direccion lugar, int manada){
  if (o->cant >= OVEJAS_MAX) return;
  Oveja *ov = &o->lista[o->cant++];
  ov->posicion = lugar;
  ov->dir = rumbo(entre(o, 0, 6.2832f));
  ov->estado = OVEJA_PASTA;
  ov->tiempo_ms = entre(o, 500.0f, 6000.0f);
  ov->manada = manada;
}

// Un lugar libre de la plaza, lejos del inicio.
static Direccion lugar_libre(Ovejas *o, const Laberinto *lab){
  Direccion centro = laberinto_aparicion(lab);
  for (int intento = 0; intento < 400; intento++){
    Direccion p = {centro.x + entre(o, -MEDIO_PLAZA, MEDIO_PLAZA), centro.y + entre(o, -MEDIO_PLAZA, MEDIO_PLAZA)};
    if (distancia(p, centro) >= LEJOS_DEL_INICIO && laberinto_libre(lab, p)) return p;
  }
  return (Direccion){centro.x + LEJOS_DEL_INICIO, centro.y};
}

void ovejas_iniciar(Ovejas *o, const Laberinto *lab, unsigned int semilla){
  o->cant = 0;
  o->azar = semilla * 2654435761u + 1;
  if (o->azar == 0) o->azar = 1;
  for (int m = 0; m < MANADAS; m++){
    Direccion centro = lugar_libre(o, lab);
    int cuantas = MANADA_MIN + (int)(siguiente(o) % (OVEJAS_POR_MANADA - MANADA_MIN + 1));
    for (int k = 0; k < cuantas; k++){
      Direccion p = centro;
      for (int intento = 0; intento < 20; intento++){
        Direccion cerca = {centro.x + entre(o, -MANADA_RADIO, MANADA_RADIO), centro.y + entre(o, -MANADA_RADIO, MANADA_RADIO)};
        if (laberinto_libre(lab, cerca) && en_plaza(lab, cerca)){
          p = cerca;
          break;
        }
      }
      poner(o, p, m);
    }
  }
  // Cada una sola es una manada de una
  for (int k = 0; k < SOLAS; k++) poner(o, lugar_libre(o, lab), MANADAS + k);
}

static Direccion centro_de_manada(const Ovejas *o, int manada){
  Direccion suma = {0, 0};
  int n = 0;
  for (int i = 0; i < o->cant; i++){
    if (o->lista[i].manada != manada) continue;
    suma.x += o->lista[i].posicion.x;
    suma.y += o->lista[i].posicion.y;
    n++;
  }
  return (Direccion){suma.x / n, suma.y / n};
}

static void huir(Ovejas *o, Oveja *ov, Direccion jugador){
  Direccion lejos = hacia(jugador, ov->posicion);
  ov->dir = girada(lejos, entre(o, -0.5f, 0.5f)); // cada una un poco para su lado
  ov->estado = OVEJA_HUYE;
  ov->tiempo_ms = HUYE_MIN_MS;
}

// Lo que sigue cuando termina de pastar o de caminar.
static void decidir(Ovejas *o, Oveja *ov){
  if (ov->estado == OVEJA_PASTA){
    Direccion centro = centro_de_manada(o, ov->manada);
    ov->estado = OVEJA_CAMINA;
    ov->tiempo_ms = entre(o, 900.0f, 2800.0f);
    ov->dir = distancia(ov->posicion, centro) > SE_ALEJO ? hacia(ov->posicion, centro) : rumbo(entre(o, 0, 6.2832f));
  } else {
    ov->estado = OVEJA_PASTA;
    ov->tiempo_ms = entre(o, 2500.0f, 9000.0f);
  }
}

static void asustar(Ovejas *o, const Oveja *primera, Direccion jugador){
  for (int i = 0; i < o->cant; i++){
    Oveja *ov = &o->lista[i];
    if (ov->manada != primera->manada || ov->estado == OVEJA_HUYE) continue;
    if (distancia(ov->posicion, primera->posicion) <= CONTAGIO) huir(o, ov, jugador);
  }
}

void ovejas_actualizar(Ovejas *o, const Laberinto *lab, Direccion jugador, float dt_ms){
  for (int i = 0; i < o->cant; i++){
    Oveja *ov = &o->lista[i];
    float cerca = distancia(ov->posicion, jugador);
    if (cerca < SE_ASUSTA){
      if (ov->estado != OVEJA_HUYE){
        huir(o, ov, jugador);
        asustar(o, ov, jugador);
      }
      ov->tiempo_ms = HUYE_MIN_MS; // mientras lo tenga encima no para
    }

    ov->tiempo_ms -= dt_ms;
    if (ov->tiempo_ms <= 0){
      if (ov->estado != OVEJA_HUYE || cerca > SE_CALMA){
        if (ov->estado == OVEJA_HUYE) ov->estado = OVEJA_CAMINA; // de ahi, a pastar
        decidir(o, ov);
      } else {
        huir(o, ov, jugador); // todavia lo tiene cerca
      }
    }
    if (ov->estado == OVEJA_PASTA) continue;

    float paso = (ov->estado == OVEJA_HUYE ? VEL_HUIDA : VEL_PASEO) * dt_ms / 1000.0f;
    Direccion antes = ov->posicion;
    float movido = laberinto_mover(lab, &ov->posicion, ov->dir.x * paso, ov->dir.y * paso);
    if (!en_plaza(lab, ov->posicion)){
      ov->posicion = antes;
      movido = 0;
    }
    // Contra algo: prueba para un costado
    if (paso > 0 && movido < paso * TRABADA) ov->dir = girada(ov->dir, (siguiente(o) % 2 ? 1.0f : -1.0f) * entre(o, 0.9f, 1.5f));
  }
}
