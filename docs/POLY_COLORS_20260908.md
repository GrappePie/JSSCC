# Colores de POLY en GXSCC B236E

Fecha: 2026-09-08. Interfaz web: `ui-live-20260908.2`.

## Significado comprobado

POLY representa el número de voces simultáneas por canal. No es una escala de volumen, velocidad de nota, carga de CPU o error de saturación. Los colores avanzan de rojo a amarillo conforme aumenta el conteo. El último color agrupa seis o más voces; no limita la polifonía del motor a seis.

| Voces del canal | Color del original | RGB hexadecimal |
|---:|---|---|
| 0 | Apagado, marrón oscuro | `#5c1f09` |
| 1 | Rojo oscuro | `#b50000` |
| 2 | Rojo anaranjado | `#ef2f00` |
| 3 | Naranja | `#ff6c00` |
| 4 | Ámbar | `#ff9f00` |
| 5 | Amarillo dorado | `#ffcc00` |
| 6 o más | Amarillo claro | `#ffff3c` |

Por ejemplo, tres notas melódicas que suenan simultáneamente en el mismo canal dan tres voces y el indicador naranja. Una melodía puede acumular voces por solapamiento mientras las notas previas aún terminan. El conteo no siempre equivale al número de teclas: el README original documenta dos voces para la tarola del modo SCC.

## Evidencia estática reproducible del original

Se inspeccionó el ejecutable contenido en el ZIP aportado, sin ejecutarlo ni modificarlo en esta pasada. SHA-256: `1eeeecf6ff72f34841983e05579114159748c70d0b3725d85af3301004992f7a`.

- En `0x402192–0x40219a`, el recorrido de las voces activas incrementa el contador `snapshot + 0x580 + canal*4`.
- En `0x40a695`, el dibujante lee ese mismo contador. En `0x40a6a7–0x40a6b1` lo acota a seis.
- En `0x40a6b1–0x40a6cf`, elige un rectángulo de 16x10 píxeles del atlas: `x = 36 + 18*min(conteo,6)`, `y = 650`, y lo copia al indicador de ese canal.
- En `0x409aec–0x409af7`, se carga para ese atlas el recurso BITMAP 133, idioma 1041. Su DIB es de 640x2095, 8 bits y sin compresión.
- Los RGB de la tabla se obtuvieron del interior de esos siete sprites, no se eligieron visualmente ni se dedujeron de las capturas del usuario.

La entrega de evidencia contiene `inspect_poly_colors.py` (biblioteca estándar de Python), que comprueba el SHA, las instrucciones relevantes y el recurso, y `poly-colors-b236e.json` con el resultado. El script admite el ZIP o EXE original como entrada; no incluye el EXE ni redistribuye el atlas.

## Corrección web y alcance

La versión web anterior solo usaba el color claro de la paleta para una voz y blanco para varias. Ahora usa los seis colores activos del original, y el color de apagado de la paleta elegida. Los colores activos se conservan incluso al cambiar de tema para no perder su significado.

Se mantiene el breve destello de 65 ms introducido anteriormente para hacer visibles percusiones cortas. Por eso puede mantenerse un color un instante tras cambiar el conteo real; esto es suavizado visual, no una nota adicional. No se afirma equivalencia temporal exacta con el refresco del programa de Windows.

Solo cambia la selección de color y la versión del módulo visual. El núcleo, datos, lector MIDI, procesador AudioWorklet y telemetría no se modifican. Las pruebas nuevas cubren los siete colores, el límite visual seis-plus, paletas y píxeles de un MIDI sintético real con 0 a 7 voces por canal. Los resultados de ejecución deben consultarse en el CI terminado, no inferirse de la presencia de estas pruebas.
