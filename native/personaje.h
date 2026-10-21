// El personaje como lo muestra el cliente: la posicion, la direccion y el
// estado vienen del nucleo en C cada frame; aca solo se agrega la
// presentacion (que animacion, el giro suave entre direcciones) y la camara
// que lo sigue. Mismo comportamiento que character.ts, facing.ts y
// camera.ts del cliente web.
#ifndef NATIVO_PERSONAJE_H
#define NATIVO_PERSONAJE_H

// Anillo horario visto en pantalla, empezando a la derecha. "front" mira a
// la camara. Los nombres son los de los tags de la hoja.
enum { DIR_DERECHA, DIR_ABAJO_DER, DIR_FRENTE, DIR_ABAJO_IZQ,
       DIR_IZQUIERDA, DIR_ARRIBA_IZQ, DIR_ESPALDA, DIR_ARRIBA_DER, DIRECCIONES };

const char *direccion_nombre(int d);
int direccion_de_vector(float x, float y);     // +y es abajo
void direccion_vector(int d, float *x, float *y);

typedef enum { MOV_QUIETO, MOV_CAMINA, MOV_CORRE, MOV_MUERTO } Movimiento;

typedef struct {
  float x, y;            // pies, px de mundo
  Movimiento movimiento;
  int mira, mira_objetivo;
  float reloj_giro_ms;
  int pivotando;
  float mover_x, mover_y; // hacia donde lo mueve el nucleo
} Personaje;

// Estado del nucleo (enum estados de src/entidad.h) a lo que se ve.
void personaje_iniciar(Personaje *p, float x, float y);
// `mirar` != 0: mira al punto (mx, my) medido desde `desde_y` (el centro del
// cuerpo, no los pies). Si no, mira hacia donde camina.
void personaje_sincronizar(Personaje *p, float x, float y, float dir_x, float dir_y,
                           int estado, float dt_ms, int mirar, float mx, float my, float desde_y);
// Tag de la animacion actual, ej. "walk_down_left". En `buf`.
const char *personaje_tag(const Personaje *p, char *buf, int largo);
int personaje_en_reversa(const Personaje *p);

typedef struct {
  float x, y;            // punto del mundo en el centro de la pantalla
  float adelanto_x, adelanto_y;
  float ancho, alto;     // de la vista, px
} Camara;

void camara_seguir(Camara *c, float x, float y, int mira, float dt_ms);
// La vista nunca muestra lo que hay mas alla del mundo. `sobre_arriba` deja
// ver por encima de y = 0, donde se dibujan los muros de la primera fila.
void camara_limitar(Camara *c, float ancho_mundo, float alto_mundo, float sobre_arriba);

#endif
