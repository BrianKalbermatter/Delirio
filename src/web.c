// Puente con el navegador: traduce las funciones del juego (juego.h) a
// funciones que JavaScript puede llamar. NO tiene logica ni estado propio:
// todo eso esta en main.c y en mecanicas/.
//
// Entre C y JavaScript solo viajan numeros (int y float) y textos (const char *).
//
// Cada cuadro, el navegador hace:
//   1. web_ir_a(x, y)          -> mientras el boton esta apretado: el punto del
//                                 MUNDO donde apunta el mouse
//   2. web_actualizar(dt_ms)   -> un paso de juego
//   3. web_jugador_*(), web_hab_*() y web_reloj_*()  -> para dibujar
// Y cuando se aprieta una tecla de habilidad: web_usar(h) o web_mantener(h, 0/1).

#include <emscripten/emscripten.h>

#include "juego.h"

EMSCRIPTEN_KEEPALIVE void web_iniciar(int semilla) { juego_iniciar((unsigned int)semilla); }
EMSCRIPTEN_KEEPALIVE void web_ir_a(float x, float y) { juego_ir_a(x, y); }
EMSCRIPTEN_KEEPALIVE void web_actualizar(float dt_ms) { juego_actualizar(dt_ms); }

// Habilidades: el numero es HabilidadId (mecanicas/jugador.h)
EMSCRIPTEN_KEEPALIVE void web_usar(int h) { juego_usar_habilidad(h); }
EMSCRIPTEN_KEEPALIVE void web_mantener(int h, int apretada) { juego_mantener_habilidad(h, apretada); }
EMSCRIPTEN_KEEPALIVE int web_hab_cantidad(void) { return HAB_CANTIDAD; }
EMSCRIPTEN_KEEPALIVE const char *web_hab_nombre(int h) {
  const Jugador *j = juego_jugador_completo();
  // Antes de web_iniciar el jugador no tiene tabla todavia (NULL)
  if (!j->habilidades || h < 0 || h >= HAB_CANTIDAD) return "?";
  return j->habilidades[h].nombre;
}
EMSCRIPTEN_KEEPALIVE int web_hab_activa(int h) { return jugador_activa(juego_jugador_completo(), h); }
EMSCRIPTEN_KEEPALIVE float web_hab_recarga(int h) { return jugador_recarga_restante(juego_jugador_completo(), h); }

// Jugador
EMSCRIPTEN_KEEPALIVE float web_jugador_x(void) { return juego_jugador()->posicion.x; }
EMSCRIPTEN_KEEPALIVE float web_jugador_y(void) { return juego_jugador()->posicion.y; }
EMSCRIPTEN_KEEPALIVE float web_jugador_dir_x(void) { return juego_jugador()->dir.x; }
EMSCRIPTEN_KEEPALIVE float web_jugador_dir_y(void) { return juego_jugador()->dir.y; }
EMSCRIPTEN_KEEPALIVE int web_jugador_estado(void) { return juego_jugador()->estados; }
EMSCRIPTEN_KEEPALIVE int web_jugador_muertes(void) { return juego_jugador_completo()->muertes; }
EMSCRIPTEN_KEEPALIVE int web_jugador_delirio(void) { return juego_jugador_completo()->delirio; }
EMSCRIPTEN_KEEPALIVE int web_jugador_vida(void) { return juego_jugador()->vida; }
EMSCRIPTEN_KEEPALIVE int web_jugador_vida_max(void) { return juego_jugador()->vidaMAX; }
// Las mejoras en el orden de MejoraId (mecanicas/jugador.h)
EMSCRIPTEN_KEEPALIVE void web_cargar_progreso(int nivel, int experiencia, int vida, int movilidad, int salto_doble,
                                               int recoleccion, int construccion) {
  int mejoras[MEJORA_CANTIDAD] = {[MEJORA_VIDA] = vida, [MEJORA_MOVILIDAD] = movilidad,
                                  [MEJORA_SALTO_DOBLE] = salto_doble, [MEJORA_RECOLECCION] = recoleccion,
                                  [MEJORA_CONSTRUCCION] = construccion};
  juego_cargar_progreso(nivel, experiencia, mejoras);
}
EMSCRIPTEN_KEEPALIVE int web_mejorar(int m) { return juego_mejorar(m); }
// Nivel de construccion (1..5): que se puede fabricar
EMSCRIPTEN_KEEPALIVE int web_jugador_construccion(void) { return jugador_nivel_construccion(juego_jugador_completo()); }
EMSCRIPTEN_KEEPALIVE void web_escudo(int si) { juego_escudo(si); }
EMSCRIPTEN_KEEPALIVE void web_armadura(int si) { juego_armadura(si); }
EMSCRIPTEN_KEEPALIVE void web_teletransportar(float x, float y) { juego_teletransportar(x, y); }
EMSCRIPTEN_KEEPALIVE int web_mejora(int m) { return juego_jugador_completo()->mejoras[m]; }
EMSCRIPTEN_KEEPALIVE int web_mejora_tope(int m) { return MEJORA_TOPE[m]; }
EMSCRIPTEN_KEEPALIVE int web_jugador_puntos(void) { return jugador_puntos(juego_jugador_completo()); }
EMSCRIPTEN_KEEPALIVE int web_jugador_saltos(void) { return juego_jugador_completo()->saltos; }
EMSCRIPTEN_KEEPALIVE int web_jugador_nivel(void) { return juego_jugador_completo()->nivel; }
EMSCRIPTEN_KEEPALIVE int web_jugador_experiencia(void) { return juego_jugador_completo()->experiencia; }
EMSCRIPTEN_KEEPALIVE int web_jugador_experiencia_nivel(void) {
  return jugador_experiencia_nivel(juego_jugador_completo()->nivel);
}
EMSCRIPTEN_KEEPALIVE void web_curar(int vida) { juego_curar(vida); }

// Enemigos: el navegador recorre los ENEMIGOS_MAX huecos y dibuja los activos
EMSCRIPTEN_KEEPALIVE int web_enemigos_max(void) { return ENEMIGOS_MAX; }
static const Enemigo *enemigo(int i) { return &juego_enemigos()->lista[i]; }
EMSCRIPTEN_KEEPALIVE int web_enemigo_activo(int i) { return enemigo(i)->activo; }
// Lo que suelta al morir: Botin (mecanicas/enemigos.h) y cuantas monedas
EMSCRIPTEN_KEEPALIVE int web_enemigo_botin(int i) { return enemigo(i)->botin; }
EMSCRIPTEN_KEEPALIVE int web_enemigo_monedas(int i) { return enemigo(i)->monedas; }
// El arma en la mano (ArmaEnemigo) y si la suelta al morir
EMSCRIPTEN_KEEPALIVE int web_enemigo_arma(int i) { return enemigo(i)->arma; }
EMSCRIPTEN_KEEPALIVE int web_enemigo_suelta_arma(int i) { return enemigo(i)->suelta_arma; }
EMSCRIPTEN_KEEPALIVE float web_enemigo_x(int i) { return enemigo(i)->entidad.posicion.x; }
EMSCRIPTEN_KEEPALIVE float web_enemigo_y(int i) { return enemigo(i)->entidad.posicion.y; }
EMSCRIPTEN_KEEPALIVE float web_enemigo_mira_x(int i) { return enemigo(i)->mira.x; }
EMSCRIPTEN_KEEPALIVE float web_enemigo_mira_y(int i) { return enemigo(i)->mira.y; }
EMSCRIPTEN_KEEPALIVE float web_enemigo_dir_x(int i) { return enemigo(i)->entidad.dir.x; }
EMSCRIPTEN_KEEPALIVE float web_enemigo_dir_y(int i) { return enemigo(i)->entidad.dir.y; }
EMSCRIPTEN_KEEPALIVE int web_enemigo_estado(int i) { return enemigo(i)->entidad.estados; }
EMSCRIPTEN_KEEPALIVE int web_enemigo_clavado(int i) { return enemigo(i)->clavado; }
EMSCRIPTEN_KEEPALIVE int web_enemigo_animo(int i) { return enemigo(i)->animo; }
EMSCRIPTEN_KEEPALIVE int web_enemigo_vida(int i) { return enemigo(i)->entidad.vida; }
EMSCRIPTEN_KEEPALIVE int web_enemigo_vida_max(int i) { return enemigo(i)->entidad.vidaMAX; }
EMSCRIPTEN_KEEPALIVE float web_enemigo_golpeado(int i) { return enemigo(i)->golpeado_ms; }
// Con quien anda: su ronda (0..RONDAS_MAX-1), RONDAS_MAX + su manada, o -1
EMSCRIPTEN_KEEPALIVE int web_enemigo_grupo(int i) { return enemigos_grupo(juego_enemigos(), i); }
EMSCRIPTEN_KEEPALIVE int web_enemigo_habla(int i) { return enemigos_habla(juego_enemigos(), i); }
// En que arbusto esta (-1: en ninguno)
// Jefes: cuanto mas grande se dibuja (1 = un espartano comun), de que sala
// es jefe (Zona; 0 = no es jefe) y cuanto cargo el golpe (0..1)
EMSCRIPTEN_KEEPALIVE float web_enemigo_escala(int i) { return enemigos_escala(juego_enemigos(), i); }
EMSCRIPTEN_KEEPALIVE int web_enemigo_jefe(int i) { return enemigo(i)->jefe; }
EMSCRIPTEN_KEEPALIVE float web_enemigo_carga(int i) { return enemigos_carga(juego_enemigos(), i); }
// El hueco del jefe que pelea con el jugador (-1: ninguno)
EMSCRIPTEN_KEEPALIVE int web_jefe_combate(void) { return juego_enemigos()->combate; }
EMSCRIPTEN_KEEPALIVE int web_jefes_vencidos(void) { return juego_jefes_vencidos(); }
EMSCRIPTEN_KEEPALIVE void web_cargar_jefes_vencidos(int v) { juego_cargar_jefes_vencidos(v); }
EMSCRIPTEN_KEEPALIVE int web_jugador_quemaduras(void) { return juego_quemaduras(); }
// 1 mientras los enemigos todavia no entran a la plaza (el primer dia)
EMSCRIPTEN_KEEPALIVE int web_tregua(void) { return juego_tregua(); }
EMSCRIPTEN_KEEPALIVE int web_enemigo_tipo(int i) { return enemigo(i)->tipo; }
EMSCRIPTEN_KEEPALIVE float web_enemigo_naciendo(int i) { return enemigo(i)->naciendo_ms; }
EMSCRIPTEN_KEEPALIVE int web_enemigo_tirado(int i) { return enemigo(i)->tirado; }

// Hogueras: una por ronda. La vida esta en su hueco de la lista de enemigos
static const Ronda *ronda(int k) { return &juego_enemigos()->rondas[k]; }
EMSCRIPTEN_KEEPALIVE int web_hogueras_cant(void) { return juego_enemigos()->cant_rondas; }
EMSCRIPTEN_KEEPALIVE float web_hoguera_x(int k) { return ronda(k)->centro.x; }
EMSCRIPTEN_KEEPALIVE float web_hoguera_y(int k) { return ronda(k)->centro.y; }
EMSCRIPTEN_KEEPALIVE int web_hoguera_apagada(int k) { return ronda(k)->apagada; }
EMSCRIPTEN_KEEPALIVE int web_hoguera_vida(int k) { return enemigo(ronda(k)->hoguera)->entidad.vida; }
EMSCRIPTEN_KEEPALIVE int web_hoguera_vida_max(int k) { return enemigo(ronda(k)->hoguera)->entidad.vidaMAX; }
EMSCRIPTEN_KEEPALIVE float web_hoguera_golpeada(int k) { return enemigo(ronda(k)->hoguera)->golpeado_ms; }
EMSCRIPTEN_KEEPALIVE int web_hogueras_apagadas(void) { return juego_hogueras_apagadas(); }
EMSCRIPTEN_KEEPALIVE void web_cargar_hogueras(int apagadas) { juego_cargar_hogueras(apagadas); }

// Sombras de los espiritus: el navegador recorre los TIROS_MAX huecos
EMSCRIPTEN_KEEPALIVE int web_tiros_max(void) { return TIROS_MAX; }
EMSCRIPTEN_KEEPALIVE int web_tiro_activo(int i) { return juego_enemigos()->tiros[i].activo; }
EMSCRIPTEN_KEEPALIVE float web_tiro_x(int i) { return juego_enemigos()->tiros[i].posicion.x; }
EMSCRIPTEN_KEEPALIVE float web_tiro_y(int i) { return juego_enemigos()->tiros[i].posicion.y; }

EMSCRIPTEN_KEEPALIVE int web_enemigo_arbusto(int i) {
  return arbustos_en(&juego_enemigos()->arbustos, enemigo(i)->entidad.posicion);
}

// Ovejas: las lee el navegador en cada cuadro
static const Oveja *oveja(int i) { return &juego_ovejas()->lista[i]; }
EMSCRIPTEN_KEEPALIVE int web_ovejas_cant(void) { return juego_ovejas()->cant; }
EMSCRIPTEN_KEEPALIVE float web_oveja_x(int i) { return oveja(i)->posicion.x; }
EMSCRIPTEN_KEEPALIVE float web_oveja_y(int i) { return oveja(i)->posicion.y; }
EMSCRIPTEN_KEEPALIVE float web_oveja_dir_x(int i) { return oveja(i)->dir.x; }
EMSCRIPTEN_KEEPALIVE int web_oveja_estado(int i) { return oveja(i)->estado; }

// Arbustos: fijos desde web_iniciar
static const Arbusto *arbusto(int i) { return &juego_enemigos()->arbustos.lista[i]; }
EMSCRIPTEN_KEEPALIVE int web_arbustos_cant(void) { return juego_enemigos()->arbustos.cant; }
EMSCRIPTEN_KEEPALIVE float web_arbusto_x(int i) { return arbusto(i)->centro.x; }
EMSCRIPTEN_KEEPALIVE float web_arbusto_y(int i) { return arbusto(i)->centro.y; }
EMSCRIPTEN_KEEPALIVE float web_arbusto_radio(int i) { return arbusto(i)->radio; }
// En que arbusto esta el jugador (-1: en ninguno), y si esta escondido en el
EMSCRIPTEN_KEEPALIVE int web_jugador_arbusto(void) {
  return arbustos_en(&juego_enemigos()->arbustos, juego_jugador()->posicion);
}
EMSCRIPTEN_KEEPALIVE int web_jugador_escondido(void) { return enemigos_jugador_escondido(juego_enemigos()); }
// Cuantas veces pego solo (sube con cada golpe; mira hacia web_jugador_dir_*)
EMSCRIPTEN_KEEPALIVE int web_jugador_auto_ataques(void) { return juego_auto_ataques(); }
EMSCRIPTEN_KEEPALIVE int web_jugador_objetivo(void) { return juego_auto_objetivo(); }

// Destino (para verificar desde el navegador que el click llego a C)
EMSCRIPTEN_KEEPALIVE int web_hay_destino(void) { return juego_hay_destino(); }
EMSCRIPTEN_KEEPALIVE float web_destino_x(void) { return juego_destino().x; }
EMSCRIPTEN_KEEPALIVE float web_destino_y(void) { return juego_destino().y; }

// Laberinto: el navegador vuelve a leer la grilla cuando cambia la version
EMSCRIPTEN_KEEPALIVE int web_lab_version(void) { return juego_laberinto()->version; }
EMSCRIPTEN_KEEPALIVE int web_lab_tiles(void) { return LAB_TILES; }
EMSCRIPTEN_KEEPALIVE int web_lab_tile(void) { return LAB_TILE; }
EMSCRIPTEN_KEEPALIVE int web_lab_muro(int col, int fila) { return laberinto_es_muro(juego_laberinto(), col, fila); }
EMSCRIPTEN_KEEPALIVE int web_lab_puerta(int col, int fila) { return laberinto_es_puerta(juego_laberinto(), col, fila); }
// Zonas de los jefes (Zona en mecanicas/laberinto.h): la que mas pesa en el
// suelo del tile, y cuanto (0..1)
EMSCRIPTEN_KEEPALIVE int web_lab_zona(int col, int fila) { return laberinto_zona(juego_laberinto(), col, fila, 0); }
EMSCRIPTEN_KEEPALIVE float web_lab_influencia(int col, int fila) {
  float peso;
  laberinto_zona(juego_laberinto(), col, fila, &peso);
  return peso;
}
EMSCRIPTEN_KEEPALIVE int web_lab_lava(int col, int fila) { return laberinto_es_lava(juego_laberinto(), col, fila); }
// El hueco de la plaza: 1 si el tile toca su parte solida, y su dibujo en
// pixeles (parte: 0 x, 1 y, 2 ancho, 3 alto)
EMSCRIPTEN_KEEPALIVE int web_lab_hueco(int col, int fila) {
  return laberinto_toca_hueco(juego_laberinto(), (RectPx){col * (float)LAB_TILE, fila * (float)LAB_TILE, LAB_TILE, LAB_TILE});
}
EMSCRIPTEN_KEEPALIVE float web_lab_hueco_dibujo(int parte) {
  RectPx r = laberinto_hueco_px(juego_laberinto());
  return parte == 0 ? r.x : parte == 1 ? r.y : parte == 2 ? r.ancho : r.alto;
}
EMSCRIPTEN_KEEPALIVE int web_lab_puerta_minotauro(int col, int fila) {
  return laberinto_es_puerta_minotauro(juego_laberinto(), col, fila);
}
EMSCRIPTEN_KEEPALIVE float web_lab_guarida_x(void) { return laberinto_guarida(juego_laberinto()).x; }
EMSCRIPTEN_KEEPALIVE float web_lab_guarida_y(void) { return laberinto_guarida(juego_laberinto()).y; }
EMSCRIPTEN_KEEPALIVE int web_lab_guarida_abierta(void) { return juego_laberinto()->salas[ZONA_MINOTAURO].tallada; }
EMSCRIPTEN_KEEPALIVE float web_lab_apertura(void) { return juego_laberinto()->apertura; }
// Caja solida (una roca grande) en pixeles del mundo: devuelve su numero
// (-1 si ya no entran mas), para quitarla con web_lab_quitar_obstaculo
EMSCRIPTEN_KEEPALIVE int web_lab_obstaculo(float x, float y, float ancho, float alto) {
  return juego_agregar_obstaculo(x, y, ancho, alto);
}
EMSCRIPTEN_KEEPALIVE void web_lab_quitar_obstaculo(int i) { juego_quitar_obstaculo(i); }
// Hoja `hoja` (0..1) de la puerta `i` (0..3): dato 0 = x, 1 = y, 2 = ancho, 3 = alto (pixeles)
EMSCRIPTEN_KEEPALIVE float web_lab_hoja(int i, int hoja, int dato) {
  RectPx hojas[2];
  laberinto_hojas(juego_laberinto(), i, hojas);
  float valores[4] = {hojas[hoja].x, hojas[hoja].y, hojas[hoja].ancho, hojas[hoja].alto};
  return valores[dato];
}

// Reloj
EMSCRIPTEN_KEEPALIVE float web_reloj_ms_total(void) { return juego_reloj()->ms_total; }
EMSCRIPTEN_KEEPALIVE void web_cargar_partida(float reloj_ms, float x, float y) { juego_cargar_partida(reloj_ms, x, y); }
EMSCRIPTEN_KEEPALIVE int web_reloj_dia(void) { return juego_reloj()->dia; }
EMSCRIPTEN_KEEPALIVE int web_reloj_fase(void) { return juego_reloj()->fase; }
EMSCRIPTEN_KEEPALIVE float web_reloj_restante_ms(void) { return reloj_restante_fase(juego_reloj()); }
EMSCRIPTEN_KEEPALIVE int web_reloj_expansiones(void) { return juego_reloj()->expansiones; }
EMSCRIPTEN_KEEPALIVE float web_reloj_proxima_expansion_ms(void) { return reloj_proxima_expansion(juego_reloj()); }
EMSCRIPTEN_KEEPALIVE float web_reloj_luz(void) { return reloj_luz(juego_reloj()); }
EMSCRIPTEN_KEEPALIVE float web_reloj_sol(void) { return reloj_sol(juego_reloj()); }
EMSCRIPTEN_KEEPALIVE void web_velocidad_tiempo(float factor) { juego_velocidad_tiempo(factor); }
EMSCRIPTEN_KEEPALIVE void web_prueba_puertas(void) { juego_prueba_puertas(); }
EMSCRIPTEN_KEEPALIVE int web_lanzar(float dx, float dy, float fuerza, int probar) { return juego_lanzar(dx, dy, fuerza, probar); }
EMSCRIPTEN_KEEPALIVE float web_lanza_impacto_x(void) { return juego_lanza_impacto().x; }
EMSCRIPTEN_KEEPALIVE float web_lanza_impacto_y(void) { return juego_lanza_impacto().y; }
EMSCRIPTEN_KEEPALIVE float web_lanza_cae_x(void) { return juego_lanza_cae().x; }
EMSCRIPTEN_KEEPALIVE float web_lanza_cae_y(void) { return juego_lanza_cae().y; }
EMSCRIPTEN_KEEPALIVE void web_desclavar(int i) { juego_desclavar(i); }
EMSCRIPTEN_KEEPALIVE void web_lanzando(int si) { juego_lanzando(si); }
EMSCRIPTEN_KEEPALIVE int web_reloj_compuertas(void) { return reloj_compuertas_abiertas(juego_reloj()); }
EMSCRIPTEN_KEEPALIVE float web_reloj_cambio_compuertas_ms(void) { return reloj_proximo_cambio_compuertas(juego_reloj()); }

// Calendario lunar (mecanicas/calendario.h)
EMSCRIPTEN_KEEPALIVE int web_calendario_t(void) { return juego_fecha()->t; }
EMSCRIPTEN_KEEPALIVE int web_calendario_mes(void) { return juego_fecha()->mes; }
EMSCRIPTEN_KEEPALIVE const char *web_calendario_nombre_mes(void) { return juego_fecha()->nombre_mes; }
EMSCRIPTEN_KEEPALIVE int web_calendario_dia_del_mes(void) { return juego_fecha()->dia_del_mes; }
EMSCRIPTEN_KEEPALIVE int web_calendario_tramo(void) { return juego_fecha()->tramo; }
EMSCRIPTEN_KEEPALIVE const char *web_calendario_nombre_dia(void) { return juego_fecha()->nombre_dia; }
EMSCRIPTEN_KEEPALIVE const char *web_calendario_texto_hud(void) { return juego_fecha()->texto_hud; }
EMSCRIPTEN_KEEPALIVE float web_calendario_fase(void) { return juego_fecha()->fase; }
EMSCRIPTEN_KEEPALIVE float web_calendario_luminosidad(void) { return juego_fecha()->luminosidad; }
EMSCRIPTEN_KEEPALIVE int web_calendario_creciente(void) { return juego_fecha()->creciente; }
EMSCRIPTEN_KEEPALIVE int web_calendario_frame(void) { return juego_fecha()->frame; }
EMSCRIPTEN_KEEPALIVE int web_calendario_dias_hasta_barco(void) { return juego_fecha()->dias_hasta_barco; }
EMSCRIPTEN_KEEPALIVE void web_calendario_avanzar_dia(void) { juego_calendario_avanzar_dia(); }
EMSCRIPTEN_KEEPALIVE void web_calendario_fijar(int t) { juego_calendario_fijar(t); }

// Medusa de prueba (barra de vida arriba a la izquierda)
EMSCRIPTEN_KEEPALIVE int web_medusa_vida(void) { return juego_medusa()->vida; }
EMSCRIPTEN_KEEPALIVE int web_medusa_vida_max(void) { return juego_medusa()->vidaMAX; }
EMSCRIPTEN_KEEPALIVE void web_reset(void) { juego_reiniciar(); }
