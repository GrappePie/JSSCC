# AudioWorklet: bloqueo de las pruebas resuelto

Fecha: 2026-09-08. PR #10. Motor: `pcm-research-20260908.3`.

## Causa comprobada y alcance de la corrección

El fallo de carga observado en el entorno de pruebas se resolvió actualizando Playwright de 1.55.0 a 1.56.0. No se reescribió el núcleo PCM ni se relajaron los límites o las aserciones de audio. El motor y la prueba de navegador son idénticos a los del PR que estaba bloqueado.

Es consistente con el defecto documentado en microsoft/playwright#37592: `audioWorklet.addModule()` se queda pendiente en Playwright 1.55. El mantenedor confirmó su corrección para 1.56. Esta conclusión corresponde al bloqueo reproducido en CI; no afirma que cualquier fallo de AudioWorklet en cualquier navegador tenga esa causa.

Fuentes primarias:
- https://github.com/microsoft/playwright/issues/37592
- https://github.com/microsoft/playwright/issues/37592#issuecomment-3361580696

## Experimento controlado

`tests/worklet_isolation.py` prueba cuatro módulos (mínimo, núcleo + mínimo, definición del procesador, núcleo + procesador) en contextos offline y realtime: ocho cargas en total.

- Playwright 1.55.0: las ocho cargas agotaron el límite de 3000 ms. Run 34266161199; artefacto 10071925027; SHA256 `124450f8793d16b6d6db8d0f18c9ff1c4f160d0e810c93d75208c9842235618d`.
- Playwright 1.56.0: las ocho cargas se resolvieron en 4.7-10 ms en esa ejecución. Run 34266428040; artefacto 10072009781; SHA256 `4da11fa700a16f2f8b163994cdda707658aeb9df8b829511670ceefe493722ac`.

El diagnóstico es observacional y guarda cada resultado. No sustituye a la suite de integración que sí falla si sus aserciones no se cumplen.

## Integración completa comprobada

Run https://github.com/GrappePie/JSSCC/actions/runs/34266430476 concluyó correctamente. Head `3d152ae4138aaf5ee0a6eda8d9b02074fc5bd41e`; merge ref probado `7475ad52c8d6094a4b5092f3eb24d910ae8100c0`.

Artefacto descargado e inspeccionado: 10072034707, SHA256 `6d44f43b939d584ae849e38429aa893961525a976e961d01ff4d26cdfcb43cab`.

| Suite | Aprobadas |
|---|---:|
| Node heredado | 49 |
| Node PCM, referencias nativas y acordes condicionados | 26 |
| Integración HTTP del motor anterior | 25 |
| Audio de referencia del motor anterior | 18 |
| AudioWorklet PCM + interfaz HTTP | 18 |

La suite PCM ahora recorre reproducción realtime, pausa, reanudación, seek, stop, botones del canvas, exportación WAV, drop y cambio entre motores. No se omitieron las comprobaciones que antes no llegaban a ejecutarse.

En una prueba offline de 22050 fotogramas estéreo a 44100 Hz (0.5 s, violín GM40), la salida real del AudioWorklet, el núcleo independiente y la exportación comparten exactamente las mismas muestras: error máximo 0. No se normalizó ni se sustituyó la síntesis. El pico medido fue 0.0390625.

El WAV generado por el botón de exportación tiene 175620 fotogramas, PCM16 estéreo a 44100 Hz. Se incluye cola de exportación; la duración de archivo no equivale al tiempo de nota.

Se verificó que estos archivos del artefacto probado coinciden byte a byte con el PR previo: `pcm-core.js`, `pcm-bridge.js`, `pcm-worklet.js`, `gxscc-exact-engine-v3.js` y `tests/pcm_browser.py`. Las correcciones de esta pasada son de infraestructura de pruebas y documentación.

## Límites que permanecen

El test realtime utiliza el AudioContext nativo de Chromium con salida silenciosa (`sinkId: {type: 'none'}`). No simula el reloj ni el procesador, pero tampoco prueba altavoces físicos, Opera/Firefox/Safari, todos los dispositivos, ni rendimiento sostenido en canciones densas.

La igualdad Worklet/núcleo valida la integración, no la equivalencia completa con GXSCC. Siguen vigentes los límites de `PCM_MATRIX_20260908.md`: 32 casos de ruido/estado sin igualdad demostrada, inicialización aleatoria y desfase de voces, historiales completos de control/release, rutas PC48/SysEx/filtro/detune, cambios de tempo y cobertura amplia de dispositivos.

Las referencias nativas de 992 fragmentos iniciales no se convierten en una afirmación de igualdad de canciones completas. Esta pasada no cambió el timbre calculado por el núcleo: desbloqueó su validación interactiva y permite evaluar su publicación.
