// Pruebas del calendario lunar. Se corren con: bash tests/calendario.sh [mes]
//
// Los nombres estan escritos a mano, uno por uno, a proposito: si salieran de
// la misma regla que calendario.c, la prueba no probaria nada.

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../src/mecanicas/calendario.h"
#include "../src/mecanicas/mecanica.h"

#define DURACION_VUELTA_MS (DURACION_DIA_MS + DURACION_TARDE_MS + DURACION_NOCHE_MS)

static const char *const MESES[] = {
  "Mes de Zeus", "Mes de Deukos", "Mes de Sfagianes",
  "Mes de Lapatos", "Mes de Dipsios", "Mes de Klareon",
};

static const struct { const char *largo, *corto; } DIAS[] = {
  {"Luna nueva", "luna nueva"},
  {"Segunda luz creciente", "2ª creciente"},
  {"Tercera luz creciente", "3ª creciente"},
  {"Cuarta luz creciente", "4ª creciente"},
  {"Quinta luz creciente", "5ª creciente"},
  {"Sexta luz creciente", "6ª creciente"},
  {"Séptima luz creciente", "7ª creciente"},
  {"Octava luz creciente", "8ª creciente"},
  {"Novena luz creciente", "9ª creciente"},
  {"Décima luz creciente", "10ª creciente"},
  {"Primera luna llena", "1ª llena"},
  {"Segunda luna llena", "2ª llena"},
  {"Tercera luna llena", "3ª llena"},
  {"Cuarta luna llena", "4ª llena"},
  {"Quinta luna llena", "5ª llena"},
  {"Sexta luna llena", "6ª llena"},
  {"Séptima luna llena", "7ª llena"},
  {"Octava luna llena", "8ª llena"},
  {"Novena luna llena", "9ª llena"},
  {"Décima luna llena", "10ª llena"},
  {"Faltan nueve lunas", "faltan 9"},
  {"Faltan ocho lunas", "faltan 8"},
  {"Faltan siete lunas", "faltan 7"},
  {"Faltan seis lunas", "faltan 6"},
  {"Faltan cinco lunas", "faltan 5"},
  {"Faltan cuatro lunas", "faltan 4"},
  {"Faltan tres lunas", "faltan 3"},
  {"Faltan dos lunas", "faltan 2"},
  {"Falta una luna", "falta 1"},
  {"Viejo y nuevo", "viejo y nuevo"},
};

static int pruebas, fallas;

static void probar(int bien, const char *que, int t){
  pruebas++;
  if (bien) return;
  fallas++;
  printf("FALLA: %s (t = %d)\n", que, t);
}

static int casi(float a, float b){ return fabsf(a - b) < 0.0001f; }

static void imprimir_mes(int mes){
  static const char *const TRAMOS[] = {"CRECIENTE", "LLENA", "MENGUANTE"};
  printf("%s\n\n", MESES[mes]);
  printf("%-4s %-4s %-10s %-24s %-34s %-6s %-6s %-10s %-6s %s\n",
         "t", "dia", "tramo", "nombre", "hud", "fase", "luz", "luna", "frame", "barco");
  for (int d = 0; d < CALENDARIO_DIAS_MES; d++){
    FechaLunar f = calendario_fecha(mes * CALENDARIO_DIAS_MES + d);
    // %-Ns cuenta bytes, y los acentos y la ª ocupan dos: se compensa a mano
    int extra_nombre = strstr(f.nombre_dia, "é") != NULL;
    int extra_hud = (strstr(f.texto_hud, "ª") != NULL) + (strstr(f.texto_hud, "·") != NULL);
    printf("%-4d %-4d %-10s %-*s %-*s %-6.3f %-6.3f %-10s %-6d %d\n",
           f.t, f.dia_del_mes, TRAMOS[f.tramo], 24 + extra_nombre, f.nombre_dia, 34 + extra_hud, f.texto_hud,
           f.fase, f.luminosidad, f.creciente ? "creciente" : "menguante", f.frame, f.dias_hasta_barco);
  }
  printf("\n");
}

// Las 180 fechas contra la spec.
static void probar_fechas(void){
  for (int t = 0; t < CALENDARIO_DIAS; t++){
    FechaLunar f = calendario_fecha(t);
    int mes = t / 30, dia = t % 30 + 1;
    char hud[64];
    snprintf(hud, sizeof hud, "%s · %s", MESES[mes], DIAS[dia - 1].corto);
    double fase = (dia - 1) / 30.0;

    probar(f.t == t, "t", t);
    probar(f.mes == mes, "mes", t);
    probar(strcmp(f.nombre_mes, MESES[mes]) == 0, "nombre del mes", t);
    probar(f.dia_del_mes == dia, "dia del mes", t);
    probar(f.tramo == (dia <= 10 ? TRAMO_CRECIENTE : dia <= 20 ? TRAMO_LLENA : TRAMO_MENGUANTE), "tramo", t);
    probar(strcmp(f.nombre_dia, DIAS[dia - 1].largo) == 0, "nombre largo", t);
    probar(strcmp(f.texto_hud, hud) == 0, "texto del HUD", t);
    probar(casi(f.fase, (float)fase), "fase", t);
    probar(casi(f.luminosidad, (float)((1 - cos(2 * 3.14159265358979 * fase)) / 2)), "luminosidad", t);
    probar(f.creciente == (fase < 0.5), "creciente", t);
    probar(f.frame == dia - 1, "frame", t);
    probar(f.dias_hasta_barco == (29 - t + 180) % 180, "dias hasta el barco", t);
  }

  // Los casos que nombra la spec, con sus valores
  probar(calendario_fecha(0).luminosidad == 0.0f, "dia 1: oscuridad total", 0);
  probar(calendario_fecha(15).luminosidad == 1.0f, "dia 16: luna llena", 15);
  probar(calendario_fecha(15).fase == 0.5f, "dia 16: fase 0.5", 15);
  probar(calendario_fecha(14).creciente && !calendario_fecha(15).creciente, "cambia de lado el dia 16", 15);
  probar(strcmp(calendario_fecha(2).texto_hud, "Mes de Zeus · 3ª creciente") == 0, "ejemplo del HUD", 2);
  probar(calendario_fecha(29).dias_hasta_barco == 0, "el barco llega hoy", 29);
  probar(calendario_fecha(28).dias_hasta_barco == 1, "el barco llega manana", 28);
  probar(calendario_fecha(30).dias_hasta_barco == 179, "el barco ya paso", 30);
  probar(calendario_fecha(0).dias_hasta_barco == 29, "el barco desde el inicio", 0);
  probar(calendario_fecha(180).t == 0 && calendario_fecha(-1).t == 179, "t fuera del ciclo", 180);
}

static void probar_contador(void){
  Calendario c;
  calendario_iniciar(&c);
  probar(c.t == 0, "empieza en 0", c.t);
  for (int i = 0; i < CALENDARIO_DIAS - 1; i++) calendario_avanzar_dia(&c);
  probar(c.t == 179, "llega a 179", c.t);
  calendario_avanzar_dia(&c);
  probar(c.t == 0, "a los 180 vuelve a 0", c.t);

  calendario_fijar(&c, 42);
  probar(c.t == 42, "fijar", c.t);
  calendario_fijar(&c, 181);
  probar(c.t == 1, "fijar por encima del ciclo", c.t);
  calendario_fijar(&c, -1);
  probar(c.t == 179, "fijar por debajo del ciclo", c.t);
}

// El enganche con el reloj: pasa un dia cuando amanece, y solo entonces.
static void probar_reloj(void){
  Reloj r;
  reloj_iniciar(&r);
  probar(r.calendario.t == 0 && r.dia == 1, "el reloj arranca en t = 0", r.calendario.t);

  // Hasta el anochecer no pasa nada
  while (r.fase != FASE_NOCHE) reloj_avanzar(&r, SEGUNDO_MS);
  probar(r.calendario.t == 0, "anochecer no avanza el calendario", r.calendario.t);

  // Con el amanecer, si
  while (r.fase == FASE_NOCHE) reloj_avanzar(&r, SEGUNDO_MS);
  probar(r.calendario.t == 1 && r.dia == 2, "amanecer avanza un dia", r.calendario.t);

  // Un paso que cruza tres amaneceres cuenta los tres
  reloj_avanzar(&r, 3 * DURACION_VUELTA_MS);
  probar(r.calendario.t == 4 && r.dia == 5, "un paso largo cuenta todos los dias", r.calendario.t);

  // El ciclo entero: `dia` sigue contando, t da la vuelta
  reloj_iniciar(&r);
  for (int i = 0; i < CALENDARIO_DIAS; i++) reloj_avanzar(&r, DURACION_VUELTA_MS);
  probar(r.dia == 181 && r.calendario.t == 0, "el calendario da la vuelta con el reloj", r.calendario.t);

  // Cargar una partida repite el reloj: el calendario se recupera solo
  reloj_iniciar(&r);
  reloj_avanzar(&r, 40 * DURACION_VUELTA_MS);
  probar(r.calendario.t == r.dia - 1, "t sale del reloj al cargar", r.calendario.t);
}

int main(int argc, char **argv){
  int mes = argc > 1 ? atoi(argv[1]) : 0;
  if (mes < 0 || mes >= CALENDARIO_MESES){
    printf("El mes va de 0 a %d\n", CALENDARIO_MESES - 1);
    return 2;
  }
  imprimir_mes(mes);
  probar_fechas();
  probar_contador();
  probar_reloj();
  printf("calendario: %d pruebas, %d fallas\n", pruebas, fallas);
  return fallas > 0;
}
