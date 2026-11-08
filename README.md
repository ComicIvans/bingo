# Bingo

Aplicación web para organizar bingos: genera cartones personalizados en PDF y dirige partidas en directo con una pantalla pública, un tablero para voluntarios y un panel de administración.

Une y mejora dos proyectos anteriores: `bingo` (generador de cartones con Puppeteer) y `bingo-web` (partida en directo con Socket.IO). La imposición de cartones en folios a doble cara sigue el esquema del proyecto `qr` de CREUP.

## Vistas

| Ruta         | Para quién                 | Qué hace                                                                                                                  |
| ------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/`          | Público (proyector o TV)   | Muestra el elemento que acaba de salir, los anteriores, el recuento y los anuncios de línea y bingo.                      |
| `/tablero`   | Voluntarios                | Todos los elementos del conjunto, con los que ya han salido marcados, para comprobar cartones a mano desde el móvil.      |
| `/generador` | Organización (público)     | Diseña los cartones, los previsualiza y descarga el PDF. Todo se genera en el navegador.                                  |
| `/panel`     | Administración (con clave) | Empieza y controla la partida, comprueba cartones por código, guarda el historial, gestiona conjuntos, el logo y enlaces. |

## Funciones

**Generador de cartones**

- Formatos: clásico de 90 bolas (3 × 9, 5 por fila, columnas por decenas), americano de 75 (5 × 5 con casilla libre opcional) y rejilla personalizada.
- Conjuntos: números, tabla periódica y símbolos de ciencias, y conjuntos propios creados en el panel o importados desde un CSV.
- Diseño: tamaño del cartón, márgenes, colores, bordes, fuentes (23 familias incluidas y fuentes propias en TTF/OTF), cabecera y pie con texto, imágenes o el código del cartón, casilla libre y reverso con imagen, logo y textos.
- Vista previa exacta: la previsualización dibuja los mismos glifos, en las mismas posiciones, que el PDF.
- PDF: un cartón por página o varios por folio (A4, A3, A5, SRA3, Carta, Legal, Tabloide o tamaño personalizado), con margen, separación, marcas de corte y el reverso en la página siguiente, colocada en espejo para imprimir a doble cara.
- Cada cartón lleva un código (`K3F9-042`). Si generas los cartones con la sesión del panel iniciada, el lote queda registrado y el panel puede comprobar cualquier cartón; si no, puedes descargar la ficha del lote e importarla después.

**Partida en directo**

- Sorteo en el servidor con aleatoriedad criptográfica, o marcado manual si usáis un bombo físico.
- La pantalla pública muestra el símbolo, el nombre o ambos, según la partida. Con «nombre», el público oye o lee «Hidrógeno» y busca «H» en su cartón.
- Anuncios de línea, bingo o mensajes libres en la pantalla pública.
- Actualización en tiempo real (Server-Sent Events) y estado guardado en disco: la partida sobrevive a un reinicio.
- Historial de partidas con nombre, fechas, secuencia de elementos y ganadores, exportable a CSV.

## Puesta en marcha

Requisitos: Node.js 24.15 o superior y pnpm 12.

```bash
pnpm install
```

Copia `.env.example` a `.env` y define al menos la clave del panel:

```dotenv
NUXT_ADMIN_KEY=una-clave-larga
NUXT_SESSION_PASSWORD=un-secreto-de-al-menos-32-caracteres
NUXT_DATA_DIR=./.data/bingo
```

Servidor de desarrollo en `http://localhost:3000`:

```bash
pnpm dev
```

Compilación y arranque en producción (el servidor compilado no lee `.env` por sí solo):

```bash
pnpm build
node --env-file=.env .output/server/index.mjs
```

### Despliegue en un servidor

La guía [DESPLIEGUE.md](DESPLIEGUE.md) explica paso a paso cómo publicarlo en cualquier VPS: con Docker y HTTPS automático (Caddy), con Docker detrás de un nginx que ya tengas, o sin Docker como servicio systemd. También cubre actualizaciones, copias de seguridad y problemas frecuentes. Los archivos de ejemplo están en `deploy/`.

Con Docker y un dominio que ya apunte al servidor, basta con:

```bash
cp .env.example .env && chmod 600 .env   # define NUXT_ADMIN_KEY, NUXT_SESSION_PASSWORD y BINGO_DOMAIN
sudo docker compose --profile caddy up -d --build
```

## Desarrollo

- `pnpm test`: pruebas del motor de cartones (validez, unicidad y reproducibilidad de los cartones, códigos, línea y bingo, imposición a doble cara).
- `node scripts/render-sample.ts`: genera PDFs de ejemplo con el motor real y los pasa a PNG en `tests/output/` para revisarlos a ojo.
- `node scripts/check-glyphs.ts`: comprueba que todas las etiquetas de los conjuntos incluidos se pueden dibujar con las fuentes.
- `pnpm fonts:fetch`: vuelve a descargar las fuentes de `public/fonts` desde Google Fonts.

El motor de cartones está en `shared/cards/` y lo usan tanto el navegador (vista previa y PDF en un Web Worker) como el servidor (comprobación de cartones). Los contratos de la API están documentados en `shared/types/api.ts`.

## Licencia

[GPL-3.0-or-later](LICENSE). © Iván Salido Cobo.

Las fuentes de `public/fonts` tienen su propia licencia (SIL Open Font License o Apache 2.0); los textos están en `public/fonts/licenses`.
