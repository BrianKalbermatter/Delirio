#include "mecanica.h"

static float duracion_fase(Fase f){
  switch (f){
    case FASE_DIA:   return DURACION_DIA_MS;
    case FASE_TARDE: return DURACION_TARDE_MS;
    case FASE_NOCHE: return DURACION_NOCHE_MS;
  }
  return DURACION_DIA_MS;
}

void reloj_iniciar(Reloj *r){
  r->ms_total = 0;
  r->dia = 1;
  r->fase = FASE_DIA;
  // Arranca con el dia ya claro, no en el amanecer
  r->ms_en_fase = DURACION_AMANECER_MS;
  r->expansiones = 0;
  r->primera_expansion_hecha = 0;
}

// El laberinto crece al anochecer de los primeros DIAS_DE_CRECIMIENTO dias.
static int crece_esta_noche(const Reloj *r){
  return r->dia <= DIAS_DE_CRECIMIENTO;
}

int reloj_avanzar(Reloj *r, float dt_ms){
  int eventos = 0;
  r->ms_total += dt_ms;

  // Primera expansion: a los 30 segundos de empezar
  if (!r->primera_expansion_hecha && r->ms_total >= PRIMERA_EXPANSION_MS){
    r->primera_expansion_hecha = 1;
    r->expansiones++;
    eventos |= EVENTO_EXPANSION;
  }

  // Fases: un while y no un if, por si dt_ms es tan grande que salta mas de una
  r->ms_en_fase += dt_ms;
  while (r->ms_en_fase >= duracion_fase(r->fase)){
    r->ms_en_fase -= duracion_fase(r->fase);
    eventos |= EVENTO_CAMBIO_FASE;
    switch (r->fase){
      case FASE_DIA:
        r->fase = FASE_TARDE;
        break;
      case FASE_TARDE:
        r->fase = FASE_NOCHE;
        eventos |= EVENTO_ANOCHECER;
        if (crece_esta_noche(r)){
          r->expansiones++;
          eventos |= EVENTO_EXPANSION;
        }
        break;
      case FASE_NOCHE:
        r->fase = FASE_DIA;
        r->dia++;
        eventos |= EVENTO_NUEVO_DIA;
        break;
    }
  }

  return eventos;
}

float reloj_proxima_expansion(const Reloj *r){
  if (!r->primera_expansion_hecha) return PRIMERA_EXPANSION_MS - r->ms_total;

  // Cuanto falta para el proximo anochecer, y de que dia es
  float hasta_noche;
  int dia_de_esa_noche = r->dia;
  switch (r->fase){
    case FASE_DIA:   hasta_noche = reloj_restante_fase(r) + DURACION_TARDE_MS; break;
    case FASE_TARDE: hasta_noche = reloj_restante_fase(r); break;
    default:         // ya es de noche: la proxima es la de manana
      hasta_noche = reloj_restante_fase(r) + DURACION_DIA_MS + DURACION_TARDE_MS;
      dia_de_esa_noche++;
      break;
  }
  return dia_de_esa_noche <= DIAS_DE_CRECIMIENTO ? hasta_noche : -1;
}

float reloj_restante_fase(const Reloj *r){
  return duracion_fase(r->fase) - r->ms_en_fase;
}

float reloj_luz(const Reloj *r){
  switch (r->fase){
    case FASE_DIA: // aclara durante el amanecer, despues pleno dia
      return r->ms_en_fase < DURACION_AMANECER_MS ? r->ms_en_fase / DURACION_AMANECER_MS : 1.0f;
    case FASE_TARDE: // oscurece de a poco
      return 1.0f - r->ms_en_fase / DURACION_TARDE_MS;
    case FASE_NOCHE:
      return 0.0f;
  }
  return 1.0f;
}

int reloj_compuertas_abiertas(const Reloj *r){
  return r->fase != FASE_NOCHE;
}

float reloj_apertura_puertas(const Reloj *r){
  switch (r->fase){
    case FASE_DIA: // se abren al empezar el dia
      return r->ms_en_fase < APERTURA_PUERTAS_MS ? r->ms_en_fase / APERTURA_PUERTAS_MS : 1.0f;
    case FASE_TARDE: { // se cierran al final de la tarde
      float restante = reloj_restante_fase(r);
      return restante < CIERRE_PUERTAS_MS ? restante / CIERRE_PUERTAS_MS : 1.0f;
    }
    case FASE_NOCHE:
      return 0.0f;
  }
  return 1.0f;
}

float reloj_proximo_cambio_compuertas(const Reloj *r){
  switch (r->fase){
    case FASE_DIA:   return reloj_restante_fase(r) + DURACION_TARDE_MS; // se cierran al anochecer
    case FASE_TARDE: return reloj_restante_fase(r);
    default:         return reloj_restante_fase(r);                     // se abren al amanecer
  }
}

void reloj_saltar_a_cierre(Reloj *r, float antes_ms){
  r->fase = FASE_TARDE;
  r->ms_en_fase = DURACION_TARDE_MS - CIERRE_PUERTAS_MS - antes_ms;
  if (r->ms_en_fase < 0) r->ms_en_fase = 0;
}

const char *reloj_nombre_fase(Fase f){
  switch (f){
    case FASE_DIA:   return "DIA";
    case FASE_TARDE: return "TARDE";
    case FASE_NOCHE: return "NOCHE";
  }
  return "?";
}
