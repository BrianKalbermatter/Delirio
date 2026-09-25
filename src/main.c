// E => Enemigo
// P => Personaje Principal

#include <stdio.h>

// Teclas
#define KEY_W (1 << 0)
// 0001 = 1

#define KEY_S (1 << 1)
// 0010 = 2

#define KEY_A (1 << 2)
// 0100 = 4

#define KEY_D (1 << 3)
// 1000 = 8

// Agregar el mouse tambien


// Dibujado de cuadros para el inventario y para la seleccion de armas del usuario hacia el personaje.

// ########

// Personaje:
typedef struct atributo{ // Nombre al Struct
  
}P_atributo; // Alias

typedef struct habilidades{
  // ataque_critico
  // ataque_largo
  // ataque_rapido
  // correr  
}P_habilidades;

// Fisica de los items en el lugar -> suavizado de movimiento

// Armas que se pueden agarrar
typedef struct recoleccion_suelo{
  int escudo;
  int espada_larga;
  int lanza;
  int arco;
  int flecha;
}Arma;
// Utilizacion de armas
typedef struct objetos{
  const char *nombre; // Nombre del arma
  int damage; // danio
  Arma arma; // arma o lo que sea que tenga en la mano
} Items;
//###############################
// Movimiento del personaje
typedef struct movilidad {
  float x;
  float y;
} Direccion;

typedef enum estados {
  QUIETO, CAMINANDO, ATACANDO, CORRIENDO
} Estado;







// Vida del personaje
typedef struct personaje{
  int vidaMax;
  int vida;
  int atacarEnemigo;
  Items items;
  Direccion dir;  
}P_personaje;

// Clases de Personajes

// Vida de un enemigo
typedef struct enemigo_medusa{
  int vidaMax;
  int vida;
  int atacarPersonaje;
} E_medusa;


// Inventario
Items mochila_personaje = {
    .nombre = "inventario",
    .damage = 10,
  
    .arma = {
    .escudo = 0,
    .espada_larga = 5  
  }
};// -> inicializador designado.















//p_p - es un puntero de personaje que puedo llamar despues para que haga algo luego.

//e_m - es un puntero de enemigo que puedo llamar despues para que haga algo luego.  

int atacar(P_personaje *p_p, E_medusa *e_m){
  e_m->vida -= p_p->atacarEnemigo; // danio base
  e_m->vida -= p_p->items.damage; // Danio del objeto que tenga en la mano
  if (e_m->vida <= 0)
  {
    e_m->vida = 0;
    printf("Has matado a una medusa");
  }
  else{
    printf("Medusa sobrevive!"); // No se muere
  }
  return e_m->vida; //Esto sirve para despues colocar la barra de la vida      
}
// Damage, cuando va a punios
/*
1. Contraataque de la medusa: va en el ciclo del juego, afuera de atacar.
2. Equipar un arma: el momento en que se carga items.damage.
3. Las ventanillas de web.c para la dirección, y después los sprites, que es lo que preguntaste al principio.
*/









// Movilidad del personaje
// Puedo usar los bits como un interruptor
//    bit 0 = w, bit 1 = s, bit 2 = a, bit 3 = d
void P_movimiento_personaje(P_personaje *p ,int teclas){
  
  Direccion dir = {0, 0}; // x y
  p->dir.x = 0;
  p->dir.y = 0;
  
  if (teclas & KEY_W) dir.y -= 1;

  if (teclas & KEY_S) dir.y += 1;

  if (teclas & KEY_A) dir.x -= 1;

  if (teclas & KEY_D) dir.x += 1;

}

























// Carga de sprite del laberinto
// Expansion de del laberinto, despues de la 3ra Oleada de enemigos

// Colocar los muros
// minimapa

//    























int main(void){
  
}
