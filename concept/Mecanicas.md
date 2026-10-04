# Delirio — Mecánicas

Juego de supervivencia en un laberinto, inspirado en *Maze Runner*. El equipo queda atrapado frente a un laberinto aleatorio que crece con el tiempo. Para sobrevivir hay que salir a buscar agua y comida. Para ganar hay que vencer al minotauro.

## El juego en una mirada

```
INICIO    → laberinto aleatorio y chico, el cuerno junto a la puerta
MEDIO     → salir a buscar recursos, morir, delirar, dormir, crecer
            las medusas (primer boss) → loot más fuerte
FINAL     → el jugador decide cuándo soplar el cuerno
VICTORIA  → vencer al minotauro y salir del laberinto
```

## Los cuatro factores

Tres medidores y un reloj que los mueve.

| Factor | Tipo | Qué hace |
|--------|------|----------|
| Agua | Medidor | Baja sola con el tiempo. |
| Comida | Medidor | Baja sola con el tiempo. |
| Delirio | Medidor | Sube solo al morir. Con valores altos, alucinaciones de noche. |
| Tiempo | Reloj | Hace avanzar todo lo demás: gasta recursos y hace crecer el laberinto. |

Los cuatro están conectados. Ninguna decisión es gratis:

```
morir        → +1 delirio
dormir       → baja el delirio, pero pasa el tiempo
el tiempo    → gasta agua y comida
sin recursos → hay que salir al laberinto → se puede morir → +1 delirio
```

## Día y noche

- Las compuertas se abren **un solo rato, a la tarde**.
- Después se cierran y empieza la noche. **La noche dura más que el día.**
- Los corredores eligen:
  - **Volver** a la base antes del cierre: más seguro, menos botín.
  - **Quedarse** adentro toda la noche: pelear, juntar materiales y recursos, memorizar el laberinto.
- Las mejoras que se consiguen permiten aguantar noches enteras.

## El equipo

Jugar en equipo requiere estrategia. Jugar solo es más difícil.

| Rol | Tarea |
|-----|-------|
| Corredor / explorador | Entra al laberinto, busca recursos, loot, runas y rutas. |
| Base | Cuida la comida, el agua, la casa y el equipamiento. |

Con el tiempo, todo se deteriora: la comida, el agua, la casa y el equipamiento. Esa es la presión del rol de base.

## Muerte y delirio

- Al morir, dentro o fuera del laberinto:
  - El personaje reaparece en la base **sin loot**.
  - Hay que volver a buscar lo perdido (como en Minecraft).
  - El delirio sube **+1**.
- Con delirio alto (entre 6 y 7), el personaje **alucina de noche**: se mueve más lento o tiene más sueño.
- El delirio **baja durmiendo 2 noches**. El costo: se pierde tiempo, y mientras se duerme se gastan el agua y la comida.

## El laberinto

- **Aleatorio**: cada partida genera un laberinto distinto (generación procedural). Una semilla permite repetir el mismo laberinto para pruebas.
- **Fijo**: durante una partida los muros no se mueven.
- **Crece**: cada 30 segundos aumenta de tamaño. Cuanto más crece, más trabas tiene.
- No es posible quedarse en la base para siempre: sin salir, se muere de hambre y de sed.

## Mapa de notas

- El jugador tiene un mapa en el que puede **dibujar y escribir con el mouse**.
- Sirve para anotar rutas y todo lo que haya que tener en cuenta.
- Como el laberinto no cambia de forma, lo anotado sigue siendo válido.

## Runas y pistas

En el camino aparecen runas y pistas que responden las preguntas del jugador, sobre todo la más importante: **¿por dónde ir?**

## Enemigos y bosses

Hay 10 tipos de enemigos, con distinto nivel de agresividad e inteligencia. Todos comparten la misma estructura base.

### Primera etapa

| Nivel | Enemigo | Comportamiento |
|-------|---------|----------------|
| 1 | Básico | No sabe nada ni piensa nada. |
| 2 | Persa | Tiene un arma. Piensa, pero es torpe y débil: no tiene escudo, pelea desnudo. |
| 3 | Medusas | Primer boss. Hermanas sin juicio por estar atrapadas. Vencerlas da loot mucho más fuerte. |

### Persas

Tres variantes, según el arma:

| Variante | Arma |
|----------|------|
| Arquero | Dispara flechas. |
| Lancero | Lanza jabalinas y pega con una lanza a dos manos. |
| Espadachín | Pelea con espada. |

Con el paso del tiempo aparecen persas más fuertes, que sueltan mejor loot.

### Personalidad del nivel 1

- No piensa: se mueve **al azar**, sin pensar en morir. Por eso es torpe.
- Igual golpea y hace lo que hace cualquier enemigo: **sobrevivir**.
- Actúa **con miedo**, sin ganas de matar: se esconde más y es más curioso.
- No va directo al jugador: toma **rutas más largas**, como si quisiera alejarse a propósito.
- Al final ataca al personaje, porque necesita sobrevivir.
- **Oportunista**: mientras los demás enemigos se lanzan a atacar, él se queda atrás y ataca solo cuando ve una oportunidad.

### Cantidad de enemigos

- Aparecen **500 enemigos por jugador**. Con 5 jugadores: 500 × 5 = 2500.
- Cada jefe vencido multiplica la cantidad:

| Momento | Multiplicador | Total (5 jugadores) |
|---------|---------------|---------------------|
| Inicio | — | 2.500 |
| Primer jefe | × 5 | 12.500 |
| Siguiente jefe | × 3 | 37.500 |
| Último jefe antes del minotauro | × 2 | 75.000 |

- Algunos enemigos **esperan en las puertas** del laberinto para atacar.
- **Rango de visión**: un enemigo solo persigue al jugador si lo ve. Fuera de ese rango, se queda esperando.
- **Aparición progresiva**: los totales no aparecen de golpe. Solo hay entre **80 y 200 enemigos activos** a la vez, y solo cuando el jugador sale a explorar. Los que no están cerca no se dibujan ni se procesan.

### Enemigos que evolucionan

- La IA de los enemigos **se vuelve más inteligente** a medida que pasa el tiempo.
- Los enemigos también **sobreviven**: arman **campamentos** y levantan **construcciones** dentro del laberinto.

### Boss final

| Enemigo | Rol |
|---------|-----|
| Minotauro | Boss final y secreto del juego. |

### El cuerno del minotauro

- El minotauro aparece **cuando el jugador quiere**.
- Se invoca con un **cuerno que está cerca de la puerta**, disponible desde el inicio de la partida.
- La decisión de cuándo soplarlo acompaña toda la partida:

| Momento | Ventaja | Riesgo |
|---------|---------|--------|
| Temprano | Laberinto chico, minotauro cerca | Personaje débil |
| Tarde | Personaje fuerte y equipado | Laberinto enorme y lleno de trabas |

- **Vencer al minotauro gana la partida** y permite salir del laberinto.

## Preguntas abiertas

- [ ] ¿Cuánto baja el delirio con 2 noches de sueño: −1 o vuelve a 0?
- [ ] ¿Umbral exacto de alucinaciones: 6 o 7?
- [ ] ¿Qué tan rápido bajan el agua y la comida?
- [ ] ¿Cuánto crece el laberinto cada 30 segundos?
- [ ] ¿El mapa de notas es compartido por el equipo o es de cada jugador?
- [ ] Los persas fuertes que aparecen con el tiempo, ¿son nivel 3 como las medusas? ¿"Nivel" mide la dificultad o la calidad del loot?
