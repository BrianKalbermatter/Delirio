#include "combate.h"

#include <stdio.h>

//p_p - es un puntero de personaje que puedo llamar despues para que haga algo luego.

//e_m - es un puntero de enemigo que puedo llamar despues para que haga algo luego.

int atacar(Entity *p_p, Entity *e_m){
  e_m->vida -= p_p->danio; // danio base
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
