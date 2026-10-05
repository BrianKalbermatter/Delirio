// Tipos compartidos por todo el juego: entidades, items, direcciones y teclas.
// Cada mecanica incluye este archivo.
// E => Enemigo
// P => Personaje Principal

#ifndef ENTIDAD_H
#define ENTIDAD_H

// Teclas
#define KEY_W (1 << 0)
// 0001 = 1

#define KEY_S (1 << 1)
// 0010 = 2

#define KEY_A (1 << 2)
// 0100 = 4

#define KEY_D (1 << 3)
// 1000 = 8

// Agregar el mouse tambien -> Atacar y bloquear
// SPACE -> Rol adelante
// SHIFT -> Correr
// ALT -> Caminar


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
// Movimiento del personaje y enemigos
typedef struct movilidad {
  float x;
  float y;
} Direccion;

typedef enum estados {
  QUIETO, CAMINANDO, ATACANDO, CORRIENDO, MUERTO
} Estado;

 // TODO del personaje
 // TODO del enemigo

// Entidad para el enemigo y personaje:
typedef struct entidad{
  int vidaMAX;
  int vida;
  int danio;
  Items items;
  Direccion dir;
  Direccion posicion;
  Estado estados;
}Entity;

// Inventario (definido en entidad.c)
extern Items mochila_personaje;

#endif
