# JSSCC Studio & Community

Estado del MVP: 2026-09-09.

## Frontend publicado en GitHub Pages

Entrada: `/JSSCC/studio.html`.

La página principal de JSSCC también muestra un botón `STUDIO / COMPOSE`.

### Composer funcional

- Piano roll editable por click/drag.
- 4 pistas iniciales: Pulse 1, Pulse 2, Triangle y Noise.
- BPM 20–400.
- 1–32 compases por patrón.
- Patrones A..Z y estructura de canción.
- Play, Stop y Loop.
- Preview WebAudio de square/triangle/saw/noise.
- Escalas y bloqueo de notas fuera de escala.
- Undo/Redo.
- Generadores simples de bajo, batería y arpegio.
- Humanización de velocity.
- Guardado de proyectos en `localStorage`.
- Exportación Standard MIDI File formato 1 mediante `js/midi-writer.js`.

### Community UI funcional en modo local

- `Explorar` con búsqueda y orden por nuevas/tendencias.
- Canciones demo.
- Publicar como privada, no listada o pública.
- Likes.
- Favoritos.
- Detalle de canción.
- Reproducción de preview.
- Remix que copia el proyecto y conserva `remixOf` + crédito al original.
- `Mi biblioteca` para proyectos y favoritos.

El adaptador está aislado en `js/community-adapter.js`. La UI de `studio.js` no depende de Supabase directamente, de modo que el adaptador local puede reemplazarse por un adaptador remoto sin reescribir el compositor.

## Tests

`tests/studio-regressions.cjs` valida:

1. El MIDI generado es formato 1 y puede ser leído por el parser MIDI de JSSCC.
2. El tempo exportado coincide con el BPM del proyecto.
3. Guardar -> publicar no pierde el proyecto editable.
4. Favoritos funcionan.
5. Remix conserva referencia/crédito.

Workflow: `.github/workflows/studio-regression.yml`.

## Base comunitaria provisionada

Se habilitó PostgreSQL/Supabase gratuito dentro del proyecto Lovable existente `jsscc-sequence-bridge`. La función del bridge de Online Sequencer permanece separada; las tablas comunitarias sólo comparten el proyecto de infraestructura.

Tablas:

- `profiles`
- `songs`
- `likes`
- `favorites`

### `songs`

Incluye:

- autor
- título y descripción
- BPM y escala
- duración
- `private | unlisted | public`
- `project_json` (máx. 512 KiB)
- MIDI Base64 opcional (máx. 2 MiB decodificado)
- hasta 8 tags
- `remix_of`
- plays / likes_count / remixes_count
- timestamps

### Seguridad

RLS está habilitado. El acceso directo a `songs` está limitado al propietario. El descubrimiento público y la lectura de no-listadas se realizan mediante RPC controladas, evitando que las canciones no listadas aparezcan al enumerar la tabla.

Los emails de Auth no forman parte de `profiles` y no se exponen por las funciones comunitarias.

### RPC disponibles

- `community_list_songs(sort, limit, offset, q)`
- `community_get_song(id)`
- `community_record_play(id)`
- `community_toggle_like(id)`
- `community_toggle_favorite(id)`
- `community_create_remix(id, title, visibility)`
- `community_my_favorites(limit)`
- `community_user_songs(username, limit)`
- `community_get_profile(username)`

`community_list_songs` sólo devuelve canciones públicas. `community_get_song` permite públicas/no-listadas y privadas del propietario autenticado.

Los contadores de likes y remixes se mantienen con triggers de DB.

## Pendiente para multiusuario real

La base ya existe, pero el frontend no dispone todavía de la URL pública + anon key de Supabase ni de la configuración de redirects de Auth. Esos valores públicos deben obtenerse desde la configuración del proyecto; no deben inventarse ni sustituirse por service-role keys.

Cuando estén disponibles:

1. Añadir un `SupabaseCommunityAdapter` que implemente la misma interfaz que `LocalCommunity`.
2. Habilitar magic-link/OTP para iniciar sesión.
3. Configurar redirect de Auth hacia `https://grappepie.github.io/JSSCC/studio.html`.
4. Cambiar el badge `Modo local` a la sesión real.
5. Sincronizar proyectos locales del usuario bajo acción explícita.

Hasta entonces el Studio es completamente utilizable sin cuenta y no envía proyectos musicales a ningún servidor.
