// Datos iniciales de las entidades.
#include "entidad.h"

// Inventario
Items mochila_personaje = {
    .nombre = "inventario",
    .damage = 10,
    //.habilidades = 4, // 1 => Ataque ligero
                        // 2 => Habilidad de apollo para el equipo, para el propio personaje
                        // 3 => Habilidad de parri
                        // 4 => Ulti, habilidad especial
    .arma = {
    .escudo = 0,
    .espada_larga = 5
  }
};// -> inicializador designado.
