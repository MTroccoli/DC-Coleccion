# DC Vault — Guía de desarrollo

Aplicación web progresiva (PWA) para gestionar una colección personal de cómics DC Comics en orden cronológico de lectura.

## Estructura del proyecto

```
DC-Coleccion/
├── dc-vault.html     # App completa (single-file SPA)
├── api/
│   └── claude.js     # Serverless function (Vercel) — proxy Anthropic + ISBN lookup
├── manifest.json     # PWA manifest (home screen install)
├── vercel.json       # Routing y CORS headers para Vercel
└── icon.png          # Icono de la app
```

## Stack técnico

- **Frontend**: HTML/CSS/JS vanilla — todo en un único archivo `dc-vault.html`
- **Backend**: Vercel serverless function (`api/claude.js`)
- **Base de datos**: Supabase (tabla `coleccion`, fila `id=1`, campo `data` con array JSON)
- **Persistencia local**: `localStorage` bajo la clave `dcvault_v4`
- **Deploy**: Vercel en `https://dc-coleccion.vercel.app`
- **IA**: Anthropic API (Claude Haiku para autocompletado/sinopsis, Claude Sonnet para búsqueda de sagas)

## Configuración / variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `ANTHROPIC_API_KEY` | Vercel env vars | Clave API de Anthropic — nunca hardcoded |
| `SB.url` | `dc-vault.html` línea ~1177 | URL del proyecto Supabase |
| `SB.key` | `dc-vault.html` línea ~1178 | Anon key pública de Supabase |
| `VERCEL_PROXY` | `dc-vault.html` línea ~1175 | URL del proxy: `https://dc-coleccion.vercel.app/api/claude` |

## Datos del catálogo

### Estructura de un tomo (comic)

```js
{
  id: 'salvat-1' | 'x-crisis' | 'manual-1234567890',
  title: 'Batman: Año Uno',
  volume: 'Tapa Dura',
  edition: 'ECC',
  arc: '01 — Los Orígenes Post-Crisis',
  lore: 'canon' | 'tiein' | 'elseworlds' | 'origen',
  stars: 1-5,              // importancia en el canon
  order: 1.5,              // posición en la línea de tiempo (float)
  char: 'batman' | 'superman' | 'flash' | 'gl' | 'jla' | 'crisis' | 'ww' | 'titanes' | 'other',
  salvat: 1,               // número en colección Salvat (null si no aplica)
  issue: 'Batman #404-407',
  writer: 'Frank Miller',
  artist: 'David Mazzucchelli',
  year: 1986,
  isbn: '9788411012345',   // solo dígitos, sin guiones
  saga: 'Knightfall',      // null si no pertenece a saga
  owned: true,             // lo tiene físicamente
  read: false,             // lo ha leído
  synopsis: 'Texto…',      // generado por IA y cacheado en Supabase
}
```

### Fuentes de datos precargadas

- **`SALVAT_DATA`** (línea ~1095): 59 tomos de la colección Salvat. Array de tuplas `[nSalvat, title, arc, lore, stars, issue, char, order]`. Siempre se cargan con `owned:true`.
- **`EXTRA`** (línea ~1157): 14 tomos adicionales fuera de Salvat (ECC, Ovni, DC Black Label…).
- **`ERAS`** (línea ~1011): 6 eras de lectura con rangos de `order` para agrupar tomos.
- **`RESET_TOMES`** (línea ~1021): IDs de tomos que son "eventos de reseteo" de continuidad (Crisis, Flashpoint).

### Rangos de `order` por era

| Clave | Era | Rango | Notas |
|---|---|---|---|
| `EP` | Pre-Crisis | 0–199 | Solo contiene Crisis en Tierras Infinitas (order 100) |
| `E2` | La Era Clásica | 200–499 | Orígenes post-Crisis (200-249, `lore:'origen'`) + grandes arcos 80s-90s (250-499) |
| `E3` | Liga Moderna | 500–749 | |
| `E4` | Cierre pre-New 52 | 750–949 | Flashpoint al final (order 900) |
| `EW` | Elseworlds | 950–∞ | |

> No existe E1 como era separada. Los tomos de origen viven en E2 identificados con `lore: 'origen'`.

## Flujo de datos / sincronización

1. Al cargar: se muestra inmediatamente desde `localStorage` (o datos por defecto).
2. En paralelo: fetch a Supabase para obtener el estado más reciente.
3. Si Supabase tiene datos → sobrescribe localStorage y re-renderiza.
4. Cualquier cambio (owned, read, agregar, editar, borrar) → `saveState()` → guarda en `localStorage` + debounce de 1500 ms para sync a Supabase.
5. Si Supabase falla → modo offline con banner "Sin conexión — local".

La migración de campos (`migrateChars`) corrige `char` para tomos específicos con tags históricos incorrectos.

## Funciones de IA (`api/claude.js`)

### 1. Autocompletado de tomo (`doAutocomplete`)
- **Modelo**: `claude-haiku-4-5-20251001`
- **Input**: título del cómic
- **Output JSON**: `{title, volume, arc, lore, stars, order, char, writer, artist, year, saga, isbn, reason}`
- **Uso**: botón "Auto" en el formulario de agregar tomo

### 2. Búsqueda de saga (`buscarSaga`)
- **Modelo**: `claude-sonnet-4-5`
- **Input**: nombre de la saga
- **Output JSON**: `{saga, descripcion, char, arc, lore, tomos: [{titulo, order, year, writer, artist, issue, editoriales}]}`
- **Uso**: tab "Saga" en el modal de agregar

### 3. Sinopsis de tomo (`generateSynopsis`)
- **Modelo**: `claude-haiku-4-5-20251001`
- **Input**: título + año + issues del tomo
- **Output JSON**: `{synopsis}`
- **Uso**: al abrir el detail sheet de cualquier tomo; se cachea en el objeto y persiste en Supabase

### 4. Lookup por ISBN (`lookupISBN`)
- **No usa IA** — llama a Open Library primero, Google Books como respaldo
- **Input**: ISBN (10 o 13 dígitos)
- **Output**: `{found, title, year, publisher, authors, source}`

## Componentes UI principales

| Componente | Descripción |
|---|---|
| Header / Banner | Estadísticas globales (total, tengo, leídos, % progreso) |
| Filter bar | Filtros por estado (Todos/Tengo/No tengo/Sin leer) + lore + personaje |
| Era accordion | Tomos agrupados por era, colapsables |
| Saga accordion | Sub-agrupación dentro de una era para sagas multi-tomo |
| Comic card | Tarjeta con color-bar de personaje, logo SVG inline, estado owned/read, swipe-to-delete |
| FAB + | Abre modal para agregar tomo |
| Search overlay | Búsqueda por título, arco o ISBN |
| Add/Edit sheet | Modal bottom-sheet con formulario completo + tabs Tomo/Saga |
| Detail sheet | Vista detallada con sinopsis IA, links a tiendas, cambiar estado |

## Principio de orden: Lore DC, no publicación

**REGLA FUNDAMENTAL**: El campo `order` de cada tomo refleja **cuándo ocurre la historia en la continuidad DC**, no cuándo fue publicada.

- Batman: El Largo Halloween (publicado 1996-1997) va en order ~220 porque se ambienta en el Año 2-3 de Batman, antes que muchas historias publicadas en los 80s.
- Batman: Año Uno (1987) abre E2 en order 215 porque es el inicio de la carrera de Batman.
- Las historias de "Año Uno" de otros personajes se ubican en sus posiciones lore aunque hayan sido escritas décadas después.

Al agregar o reordenar tomos, siempre preguntar: **¿cuándo sucede esto en el universo DC?**, no ¿cuándo se publicó?

## Convenciones de desarrollo

- **No hay build step** — editar `dc-vault.html` directamente.
- **Despliegue**: `git push` a `main` → Vercel despliega automáticamente.
- **No agregar dependencias npm** — la función serverless usa solo `fetch` nativo (Node 18+).
- El campo `order` acepta decimales (ej: `13.1`, `43.5`) para intercalar tomos en la línea sin renumerar todo.
- Los IDs de tomos siguen el patrón: `salvat-N`, `x-nombre`, `manual-TIMESTAMP`.
- Los logos de personajes son SVGs inline generados por funciones en `HERO_LOGOS` — no son archivos externos.
- El anon key de Supabase es **pública por diseño** (Row Level Security configurado en el proyecto Supabase para permitir lectura/escritura autenticada con anon key).

## Supabase

- **Proyecto**: `bpkvotdzbbvkmqkvfxzz`
- **Tabla**: `coleccion`
- **Esquema**: `{ id: int, data: jsonb }` — fila única con `id=1`
- **Endpoint usado**: `POST /rest/v1/coleccion` con `Prefer: resolution=merge-duplicates`

## Comandos útiles

```bash
# Instalar Vercel CLI (solo una vez)
npm i -g vercel

# Desarrollo local con función serverless
vercel dev

# Ver logs de producción
vercel logs dc-coleccion.vercel.app
```
