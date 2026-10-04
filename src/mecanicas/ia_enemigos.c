#include "ia_enemigos.h"

#include <stdio.h>
#include <stdlib.h>

#include "../entidad.h"

// falta terminar esto lo de la ia de enemigos!
//########################################################
// IA enemigos NIVEL 1
int ia_enemigos(void){
  switch (rand() % 4){ // Elije un numero 0..3
    case 0:
      printf("Moviendose a la arriba\n");
      return KEY_W;

    case 1:
      printf("Moviendose abajo\n");
      return KEY_S;

    case 2:
      printf("Moviendose a la izquieda\n");
      return KEY_A;
    case 3:
      printf("Moviendose a la derecha\n");
      return KEY_D;
  }
  return 0;
}
