# Delirio — Disparadores y alucinaciones

Documento de diseño del medidor de **delirio**. Completa la sección *Muerte y delirio* de [Mecanicas.md](Mecanicas.md).

Hoy el delirio solo sube al morir (+1). Este documento propone **más disparadores** y define **qué pasa cuando el delirio está alto**: voces, golpes en la puerta, gritos de fondo y otras alucinaciones.

> Todo lo que está acá es **propuesta**. Lo ya decidido en Mecanicas.md sigue mandando.

## La idea en una mirada

```
el cuerpo y la mente se desgastan → sube el delirio
delirio alto                      → el juego empieza a mentir (sonidos, sombras, el mapa)
el jugador duda                   → ¿es real o lo estoy imaginando?
dormir / comer / volver al equipo → baja el delirio
```

El delirio **no mata**. Asusta, confunde y hace perder tiempo. El peligro real viene de las malas decisiones que el jugador toma por culpa de una alucinación.

## ¿Qué factores pueden desencadenar un delirio?

Inspirado en lo que provoca delirio en la vida real: falta de sueño, deshidratación, hambre, dolor, aislamiento, oscuridad y sustos fuertes.

### Disparadores de golpe (suben al instante)

| Disparador | Delirio | Por qué |
|------------|---------|---------|
| Morir | +1 | Ya decidido en Mecanicas.md. |
| Ver morir a un compañero cerca | +0,5 | Trauma. Castiga dejar solo al equipo. |
| Recibir un golpe muy fuerte (más del 50 % de la vida de una vez) | +0,25 | Golpe en la cabeza. |
| Mirar a una medusa (primer boss) | +1 | Encaja con el mito: la mirada que enloquece. |
| Leer una runa maldita | +0,5 | Las runas responden preguntas, pero algunas mienten. |
| Escuchar el cuerno del minotauro | +1 a todos | El rugido sacude a todo el equipo. |
| Escapar con la vida muy baja (menos del 10 %) | +0,25 | Casi morir también deja marca. |

### Disparadores lentos (suben con el tiempo)

| Disparador | Ritmo propuesto | Por qué |
|------------|-----------------|---------|
| Agua en 0 (deshidratación) | +0,5 por noche | La sed causa confusión. |
| Comida en 0 (hambre) | +0,25 por noche | Debilidad y mareo. |
| Pasar la noche dentro del laberinto | +0,5 por noche | No se duerme, se pelea. |
| No dormir (varias noches seguidas sin pasar por la cama) | +0,5 por noche extra | Falta de sueño, el disparador más clásico. |
| Estar solo (sin compañeros cerca) mucho tiempo | +0,25 cada X minutos | Aislamiento. Jugar solo ya es más difícil. |
| Estar a oscuras (sin antorcha) | +0,25 cada X minutos | La oscuridad alimenta el miedo. |
| Estar perdido (mucho tiempo sin pasar por un lugar conocido o marcado en el mapa) | +0,25 | Desorientación. |

### Lo que lo baja

| Acción | Efecto |
|--------|--------|
| Dormir 2 noches en la base | Baja (ya decidido; falta definir cuánto). |
| Comer y beber con los medidores llenos | Frena los disparadores lentos. |
| Estar cerca del equipo | Frena el aislamiento y baja de a poco. |
| Fogata o antorcha encendida | Frena la oscuridad. |
| Objeto o hierba calmante (loot raro) | −1 al instante. |

## Niveles de delirio

Escala de 0 a 10. Las alucinaciones fuertes empiezan en el umbral ya pensado (6–7).

| Nivel | Estado | Qué pasa |
|-------|--------|----------|
| 0–2 | Lúcido | Nada. |
| 3–4 | Inquieto | Sonidos sueltos y raros de noche: pasos lejanos, un susurro. Muy poco frecuentes. |
| 5 | Nervioso | Sonidos más seguidos. Empieza a pasar también de día. |
| 6–7 | Alucinando | Voces, golpes en la puerta, gritos. Primeras alucinaciones visuales. Más lento y con más sueño (ya decidido). |
| 8–9 | Delirante | Alucinaciones que interactúan: falsos compañeros, falsos enemigos, el mapa miente. |
| 10 | Colapso | El personaje se desmaya y despierta en la base (como morir, pero sin sumar delirio). |

## Catálogo de alucinaciones

### Sonidos (la parte principal)

| Alucinación | Nivel mínimo | Cómo se juega |
|-------------|--------------|---------------|
| Pasos detrás del jugador | 3 | Se detienen cuando el jugador se da vuelta. |
| Susurros sin palabras | 3 | Bajos, en un solo oído (paneo izquierda/derecha). |
| Golpes en la puerta de la base | 6 | Golpes fuertes de noche. Si alguien abre, no hay nadie… casi siempre. |
| Alguien gritando de fondo | 6 | Un grito lejano dentro del laberinto, como si un compañero pidiera ayuda. |
| Voces que dicen el nombre del jugador | 6 | Usa el nombre del personaje. Muy efectivo. |
| Voz de un compañero que no está | 7 | "¡Vení, por acá!" desde un pasillo vacío. Puede llevar a una trampa o a enemigos. |
| Ronda de persas charlando que no existe | 7 | El jugador se esconde y espera a una ronda que nunca aparece. Pierde tiempo. |
| Rugido del minotauro sin haber soplado el cuerno | 8 | El susto más grande. Nunca pasa de verdad. |
| Llanto o risas de las medusas | 8 | Antes o después de haberlas vencido. |
| Silencio total | 9 | Se corta todo el audio unos segundos, incluso los sonidos reales. |

### Visuales

| Alucinación | Nivel mínimo | Cómo se juega |
|-------------|--------------|---------------|
| Sombras en el borde de la pantalla | 6 | Desaparecen si el jugador las mira de frente. |
| Falsos enemigos | 7 | Se ven igual que los reales. Al pegarles se deshacen en humo. |
| Muros que parecen moverse | 7 | Ondulan, pero el laberinto sigue fijo (no se rompe esa regla). |
| Falso compañero | 8 | Un aliado que camina hacia un lado y desaparece. |
| El mapa de notas miente | 8 | Aparecen marcas o palabras que el jugador no escribió ("NO VAYAS"). |
| Runas falsas | 8 | Dan pistas equivocadas. |
| Viñeta y colores corridos | 5 en adelante | Más fuerte cuanto más alto el delirio. |

### Del cuerpo

| Efecto | Nivel mínimo |
|--------|--------------|
| Más lento | 6 (ya decidido) |
| Más sueño | 6 (ya decidido) |
| Controles con leve retraso o tironeos | 8 |
| Ataque automático contra un compañero que se ve como enemigo | 9 (solo si hay fuego amigo) |

## Reglas de diseño

1. **La alucinación nunca hace daño directo.** El daño viene de lo que el jugador hace por creerle.
2. **Siempre hay una pista para darse cuenta.** Ejemplos: la alucinación no tiene sombra, el sonido no cambia con la distancia, los falsos enemigos no dejan huellas en la arena. El jugador atento aprende a distinguir.
3. **Mezclar con lo real.** De vez en cuando, el golpe en la puerta **sí** es un enemigo. Si nunca es real, el jugador deja de prestar atención.
4. **Cada jugador ve sus propias alucinaciones.** En equipo, uno escucha gritos y el otro no. Esto obliga a hablar: "¿vos también lo escuchaste?".
5. **No repetir seguido.** Un mismo evento no vuelve a salir hasta que pasen varios minutos.
6. **La noche manda.** De día casi no hay alucinaciones (salvo delirio 5 o más).

## Notas de implementación

- `jugador.delirio` hoy es un `int`. Para los disparadores chicos (+0,25) conviene guardarlo **en décimos o centésimos** (`int` de 0 a 1000) o pasarlo a `float`.
- **Programador de eventos**: cada cierto tiempo se tira un dado. La chance depende del nivel de delirio y de si es de noche. Si sale, se elige un evento del catálogo entre los permitidos para ese nivel y que no hayan salido hace poco.
- **Solo del lado del cliente**: las alucinaciones las ve un solo jugador, así que no tienen que pasar por el servidor (ver protocol/PROTOCOL.md). El servidor solo manda el valor del delirio.
- **Audio**: Web Audio API en el cliente, con paneo y volumen según una posición falsa en el mundo. Golpes y gritos con algo de eco para que suenen "lejos".
- **Falsos enemigos**: entidades marcadas como `alucinacion`, sin colisión ni daño, que se borran al recibir un golpe o al salir de pantalla.

## Accesibilidad

- Opción para **bajar la intensidad** de sustos y sonidos fuertes.
- Opción para **mostrar un aviso sutil** cuando un sonido es alucinación (para quien no quiera el susto).
- Evitar destellos rápidos de pantalla.

## Preguntas abiertas

- [ ] ¿Se suman los disparadores nuevos o el delirio sigue subiendo solo al morir?
- [ ] ¿Escala de 0 a 10 o se mantiene otra?
- [ ] ¿Qué pasa en delirio 10: desmayo, o algo peor?
- [ ] ¿Las alucinaciones son solo del jugador o el equipo puede verlas a veces?
- [ ] ¿Hay fuego amigo? (Afecta la alucinación de nivel 9.)
- [ ] ¿Qué tan seguido el golpe en la puerta es un enemigo real?
- [ ] ¿Existe el objeto calmante? ¿Dónde se consigue?
