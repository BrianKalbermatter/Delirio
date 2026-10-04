// Mecanica del tiempo: el reloj del juego.
//
// El tiempo mueve todo lo demas (ver concept/Mecanicas.md):
//   - Ciclo de DIA -> TARDE -> NOCHE. Dia (con su tarde) 34 min, noche 26 min.
//   - Las puertas de la plaza estan abiertas de dia (y a la tarde) y cerradas
//     de noche. Ese es el patron siempre, desde el principio. Se cierran de a
//     poco en los ultimos CIERRE_PUERTAS_MS de la tarde y se abren de a poco
//     en los primeros APERTURA_PUERTAS_MS del dia.
//   - Amanece y anochece de a poco: reloj_luz() va de 0 (noche) a 1 (dia).
//   - El laberinto crece por primera vez a los 30 segundos, y despues cada vez
//     que cae la noche, durante los primeros DIAS_DE_CRECIMIENTO dias.
//   - Mas adelante: gasta agua y comida.
//
// Tiempo -> a medida que pasa el tiempo, el laberinto se hace mas extenso. Cuando se para? cuando el jugador vence a las hermanas medusas, luego el laberinto avanaza extendiendose a la Etapa 2, derrotar a otro jefe, asi... hasta que llegue el laberinto Etapa 6. Aca es cuando el laberinto llega a su fase final, tenes todo lo necesario.Dependiendo de que tanto exploraste vas a poder saber donde va a estar el MINOTAURO, ultimo jefe. Lo derrotas y se te abrira la puerta para que puedas escapar.
#ifndef MECANICA_H
#define MECANICA_H

#define MINUTO_MS 60000.0f
#define SEGUNDO_MS 1000.0f

// 1 = tiempos de prueba: dia de 10 s y noche de 10 s, para ver el mecanismo.
// 0 = tiempos del juego: dia de 34 min (con su tarde) y noche de 26 min.
#define TIEMPO_DE_PRUEBA 1

// Duracion de cada fase, en milisegundos de juego (la pausa no cuenta).
#if TIEMPO_DE_PRUEBA
#define DURACION_DIA_MS      (6 * SEGUNDO_MS)  // dia pleno
#define DURACION_TARDE_MS    (4 * SEGUNDO_MS)  // va oscureciendo y se cierran las puertas
#define DURACION_NOCHE_MS    (10 * SEGUNDO_MS)
#define DURACION_AMANECER_MS (2 * SEGUNDO_MS)  // primeros segundos del dia: va aclarando
#define CIERRE_PUERTAS_MS    (3 * SEGUNDO_MS)  // las puertas tardan 3 s en cerrarse
#define APERTURA_PUERTAS_MS  (2 * SEGUNDO_MS)  // y 2 s en abrirse
#define PRIMERA_EXPANSION_MS (5 * SEGUNDO_MS)  // el laberinto crece a los 5 s de empezar
#else
#define DURACION_DIA_MS      (28 * MINUTO_MS)
#define DURACION_TARDE_MS    (6 * MINUTO_MS)
#define DURACION_NOCHE_MS    (26 * MINUTO_MS)
#define DURACION_AMANECER_MS (4 * MINUTO_MS)
#define CIERRE_PUERTAS_MS    (90 * SEGUNDO_MS)
#define APERTURA_PUERTAS_MS  (30 * SEGUNDO_MS)
#define PRIMERA_EXPANSION_MS (30 * SEGUNDO_MS) // el laberinto crece a los 30 segundos de empezar
#endif
#define DIAS_DE_CRECIMIENTO 6          // despues crece cada anochecer, hasta el dia 6

typedef enum fase {
  FASE_DIA, FASE_TARDE, FASE_NOCHE
} Fase;

typedef struct reloj {
  float ms_total;      // tiempo de juego desde el inicio
  int dia;             // 1, 2, 3...
  Fase fase;
  float ms_en_fase;    // cuanto lleva la fase actual
  int expansiones;     // cuantas veces crecio el laberinto
  int primera_expansion_hecha;
} Reloj;

// Lo que paso en un paso del reloj. Se combinan como bits:
//   if (eventos & EVENTO_EXPANSION) ...
#define EVENTO_CAMBIO_FASE (1 << 0)
#define EVENTO_NUEVO_DIA   (1 << 1)
#define EVENTO_EXPANSION   (1 << 2)
#define EVENTO_ANOCHECER   (1 << 3)

void reloj_iniciar(Reloj *r);

// Avanza el reloj dt_ms milisegundos. Devuelve los eventos que ocurrieron.
int reloj_avanzar(Reloj *r, float dt_ms);

// Milisegundos que faltan para la proxima expansion del laberinto,
// o -1 si ya no va a crecer mas.
float reloj_proxima_expansion(const Reloj *r);

// Milisegundos que faltan para que termine la fase actual.
float reloj_restante_fase(const Reloj *r);

// Cuanta luz de dia hay: 0 = noche cerrada, 1 = pleno dia.
float reloj_luz(const Reloj *r);

// Las puertas de la plaza estan abiertas, aunque sea un poco (de dia y a la tarde).
int reloj_compuertas_abiertas(const Reloj *r);

// Cuanto estan abiertas las puertas: 1 = del todo, 0 = cerradas.
float reloj_apertura_puertas(const Reloj *r);

// Milisegundos que faltan para que las puertas se cierren (si estan abiertas)
// o se abran (si estan cerradas).
float reloj_proximo_cambio_compuertas(const Reloj *r);

const char *reloj_nombre_fase(Fase f);

// Para probar: salta a `antes_ms` milisegundos antes de que las puertas
// empiecen a cerrarse (en la tarde del dia actual).
void reloj_saltar_a_cierre(Reloj *r, float antes_ms);

#endif
