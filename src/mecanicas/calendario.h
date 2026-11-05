// Mecanica del calendario lunar: que dia es, y como esta la luna.
//
// Un contador absoluto de dias, t, que empieza en 0 y da la vuelta a los 180:
// 6 meses de 30 dias. Avanza uno cada vez que termina una noche y amanece (lo
// hace reloj_avanzar, en mecanica.c). Con t alcanza para saber todo lo demas:
// calendario_fecha(t) lo calcula, no se guarda nada mas.
//
// El mes tiene tres tramos de 10 dias, y los dias no se numeran, se nombran:
//   1        Luna nueva
//   2 a 10   Segunda luz creciente ... Decima luz creciente
//   11 a 20  Primera luna llena ... Decima luna llena
//   21 a 29  Faltan nueve lunas ... Faltan dos lunas, Falta una luna
//   30       Viejo y nuevo (termina un mes y empieza el otro)
//
// Ojo: el tramo y `creciente` no dicen lo mismo. El tramo es el nombre del
// calendario (CRECIENTE es hasta el dia 10); `creciente` es de que lado esta
// la luz en la luna (crece hasta el dia 15, y del 16 en adelante mengua).
#ifndef CALENDARIO_H
#define CALENDARIO_H

#define CALENDARIO_MESES 6
#define CALENDARIO_DIAS_MES 30
#define CALENDARIO_DIAS (CALENDARIO_MESES * CALENDARIO_DIAS_MES) // el ciclo completo
#define CALENDARIO_DIAS_TRAMO 10
// El barco de velas negras llega el ultimo dia del Mes de Zeus.
#define CALENDARIO_DIA_BARCO 29

typedef enum tramo {
  TRAMO_CRECIENTE, TRAMO_LLENA, TRAMO_MENGUANTE
} Tramo;

typedef struct calendario {
  int t; // dia del ciclo: 0 a CALENDARIO_DIAS - 1
} Calendario;

// Todo lo que se sabe de un dia.
typedef struct fecha_lunar {
  int t;
  int mes;                // 0 a 5
  const char *nombre_mes; // "Mes de Zeus"
  int dia_del_mes;        // 1 a 30
  Tramo tramo;
  char nombre_dia[40];    // nombre largo: "Tercera luz creciente"
  char texto_hud[64];     // version corta: "Mes de Zeus · 3ª creciente"
  float fase;             // 0 a 1: 0 = luna nueva, 0.5 = luna llena
  float luminosidad;      // 0 = oscuridad total, 1 = luna llena
  int creciente;          // 1: iluminada a la derecha; 0: menguante, a la izquierda
  int frame;              // cuadro del spritesheet de 30 fases: 0 a 29
  int dias_hasta_barco;   // 0 = llega hoy
} FechaLunar;

void calendario_iniciar(Calendario *c);

// Pasa un dia. Al llegar a CALENDARIO_DIAS vuelve a 0.
void calendario_avanzar_dia(Calendario *c);

// Para probar: va directo al dia t (uno fuera del ciclo da la vuelta).
void calendario_fijar(Calendario *c, int t);

// Todo sobre el dia t (uno fuera del ciclo da la vuelta).
FechaLunar calendario_fecha(int t);

#endif
