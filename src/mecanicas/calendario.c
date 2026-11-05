#include "calendario.h"

#include <math.h>
#include <stdio.h>

#define PI 3.14159265358979f

static const char *const MESES[CALENDARIO_MESES] = {
  "Mes de Zeus", "Mes de Deukos", "Mes de Sfagianes",
  "Mes de Lapatos", "Mes de Dipsios", "Mes de Klareon",
};

static const char *const ORDINALES[] = {
  "Primera", "Segunda", "Tercera", "Cuarta", "Quinta",
  "Sexta", "Séptima", "Octava", "Novena", "Décima",
};

static const char *const NUMEROS[] = {
  "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
};

// Cualquier t cae adentro del ciclo, tambien uno negativo.
static int dentro_del_ciclo(int t){
  return (t % CALENDARIO_DIAS + CALENDARIO_DIAS) % CALENDARIO_DIAS;
}

void calendario_iniciar(Calendario *c){
  c->t = 0;
}

void calendario_avanzar_dia(Calendario *c){
  c->t = dentro_del_ciclo(c->t + 1);
}

void calendario_fijar(Calendario *c, int t){
  c->t = dentro_del_ciclo(t);
}

static void nombrar_dia(FechaLunar *f){
  char corto[24];
  int d = f->dia_del_mes;
  int faltan = CALENDARIO_DIAS_MES - d;

  if (d == 1){
    snprintf(f->nombre_dia, sizeof f->nombre_dia, "Luna nueva");
    snprintf(corto, sizeof corto, "luna nueva");
  } else if (d == CALENDARIO_DIAS_MES){
    snprintf(f->nombre_dia, sizeof f->nombre_dia, "Viejo y nuevo");
    snprintf(corto, sizeof corto, "viejo y nuevo");
  } else if (f->tramo == TRAMO_CRECIENTE){
    snprintf(f->nombre_dia, sizeof f->nombre_dia, "%s luz creciente", ORDINALES[d - 1]);
    snprintf(corto, sizeof corto, "%dª creciente", d);
  } else if (f->tramo == TRAMO_LLENA){
    int n = d - CALENDARIO_DIAS_TRAMO;
    snprintf(f->nombre_dia, sizeof f->nombre_dia, "%s luna llena", ORDINALES[n - 1]);
    snprintf(corto, sizeof corto, "%dª llena", n);
  } else if (faltan == 1){
    snprintf(f->nombre_dia, sizeof f->nombre_dia, "Falta una luna");
    snprintf(corto, sizeof corto, "falta 1");
  } else {
    snprintf(f->nombre_dia, sizeof f->nombre_dia, "Faltan %s lunas", NUMEROS[faltan - 1]);
    snprintf(corto, sizeof corto, "faltan %d", faltan);
  }

  snprintf(f->texto_hud, sizeof f->texto_hud, "%s · %s", f->nombre_mes, corto);
}

FechaLunar calendario_fecha(int t){
  FechaLunar f;
  f.t = dentro_del_ciclo(t);
  f.mes = f.t / CALENDARIO_DIAS_MES;
  f.nombre_mes = MESES[f.mes];
  f.dia_del_mes = f.t % CALENDARIO_DIAS_MES + 1;
  f.tramo = (Tramo)((f.dia_del_mes - 1) / CALENDARIO_DIAS_TRAMO);
  nombrar_dia(&f);

  f.fase = (float)(f.dia_del_mes - 1) / CALENDARIO_DIAS_MES;
  f.luminosidad = (1.0f - cosf(2.0f * PI * f.fase)) / 2.0f;
  f.creciente = f.fase < 0.5f;
  f.frame = f.dia_del_mes - 1;
  f.dias_hasta_barco = (CALENDARIO_DIA_BARCO - f.t + CALENDARIO_DIAS) % CALENDARIO_DIAS;
  return f;
}
