# Despliegue en un VPS

Esta guía sirve para cualquier servidor Linux con acceso por SSH (Debian, Ubuntu u otra distribución con systemd), en x86_64 o ARM64. Hay tres caminos:

| Camino                                                       | Cuándo elegirlo                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [A. Docker + Caddy](#a-docker--caddy-recomendado)            | Servidor nuevo y un dominio. HTTPS automático. **Recomendado.**        |
| [B. Docker detrás de tu proxy](#b-docker-detrás-de-tu-proxy) | El servidor ya tiene nginx o Caddy sirviendo otras webs.               |
| [C. Sin Docker](#c-sin-docker-node--systemd)                 | No quieres instalar Docker; la aplicación corre como servicio systemd. |

Al final hay apartados comunes: [actualizar](#actualizar), [copias de seguridad](#copias-de-seguridad), [uso sin dominio](#uso-sin-dominio-red-local-o-ip) y [problemas frecuentes](#problemas-frecuentes).

## Requisitos

- **Servidor:** 1 vCPU y 1 GB de RAM bastan para el día del bingo; la aplicación usa unos 150 MB. Los cartones se generan en el navegador de quien los descarga, no en el servidor.
- **Compilar** en el propio servidor necesita unos 2 GB de RAM. Con menos, [añade swap](#la-compilación-se-corta-o-el-servidor-se-queda-sin-memoria) o compila en tu ordenador.
- **Dominio** (recomendado): un registro DNS `A` apuntando a la IP del servidor, por ejemplo `bingo.tudominio.es`. Sin dominio también funciona, ver [uso sin dominio](#uso-sin-dominio-red-local-o-ip).
- **Puertos abiertos:** 22 (SSH), 80 y 443. Revisa también el cortafuegos del proveedor, si lo tiene en su panel.
- **Un usuario con `sudo`.** En algunos Debian entras como `root` y no hay `sudo`: instálalo con `apt install -y sudo` o quita `sudo` de las órdenes.

> **Una sola instancia.** La partida en directo vive en un único proceso. No lances varias réplicas ni la pongas detrás de un balanceador con varios servidores.

## Preparación común

### 1. Paquetes y cortafuegos

```bash
sudo apt update && sudo apt install -y ufw curl git rsync
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443
sudo ufw enable
```

### 2. Llevar el código al servidor

Antes de nada, confirma en git todos los cambios (`git add -A && git commit`). Tanto `git clone` como `git archive` solo llevan lo que está en un commit; si faltan `deploy/` o el `docker-compose.yml` actual, el despliegue no saldrá como describe esta guía.

Si el proyecto está en un repositorio remoto (GitHub, Gitea…), súbelo (`git push`) y en el servidor:

```bash
sudo mkdir -p /opt/bingo && sudo chown "$USER" /opt/bingo
git clone <url-del-repositorio> /opt/bingo
```

Si solo está en tu ordenador, empaqueta el último commit y súbelo (funciona igual en Windows, macOS y Linux):

```bash
git archive --format=tar.gz -o bingo.tar.gz HEAD
scp bingo.tar.gz usuario@servidor:/tmp/
```

Y en el servidor:

```bash
sudo mkdir -p /opt/bingo && sudo chown "$USER" /opt/bingo
tar xzf /tmp/bingo.tar.gz -C /opt/bingo
```

### 3. Variables de entorno

Crea `.env` con una clave y un secreto aleatorios:

```bash
cd /opt/bingo
cp .env.example .env
chmod 600 .env
sed -i "s|^NUXT_ADMIN_KEY=.*|NUXT_ADMIN_KEY=$(openssl rand -hex 16)|" .env
sed -i "s|^NUXT_SESSION_PASSWORD=.*|NUXT_SESSION_PASSWORD=$(openssl rand -base64 48)|" .env
grep NUXT_ADMIN_KEY .env   # apunta esta clave: es la que pide /panel
nano .env                  # el resto de variables, si las necesitas
```

| Variable                | Obligatoria | Qué es                                                                                                                                |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `NUXT_ADMIN_KEY`        | Sí          | Clave para entrar en `/panel`; es lo único que lo protege. Mientras esté vacía, el panel no deja entrar a nadie.                      |
| `NUXT_SESSION_PASSWORD` | Sí          | Secreto de 32 caracteres o más para firmar la cookie de sesión.                                                                       |
| `NUXT_DATA_DIR`         | No          | Carpeta de datos. No la definas: Docker usa siempre `/data` y el servicio systemd `/var/lib/bingo`.                                   |
| `BINGO_DOMAIN`          | Camino A    | Dominio para el certificado HTTPS de Caddy.                                                                                           |
| `BINGO_BIND`            | No          | Interfaz donde Docker publica la aplicación: `127.0.0.1` (por defecto, solo para un proxy local), la IP de una red local o `0.0.0.0`. |
| `BINGO_PORT`            | No          | Puerto publicado en el servidor (por defecto `3000`).                                                                                 |
| `TZ`                    | No          | Zona horaria del proceso (por defecto `Europe/Madrid`). Las horas del panel y del CSV salen en la zona del navegador que los abre.    |

> **Valores con `$`, `#` o espacios:** escríbelos entre comillas simples (`NUXT_ADMIN_KEY='...'`). Docker Compose interpreta `$` y, sin comillas, una clave como `abc$def` llegaría a la aplicación como `abc`. Las que genera `openssl` no dan problemas.

Si cambias `NUXT_ADMIN_KEY` o `NUXT_SESSION_PASSWORD`, todas las sesiones abiertas del panel se cierran. Es la forma de echar a alguien del panel.

## A. Docker + Caddy (recomendado)

Caddy hace de proxy, redirige `http://` a `https://`, pide el certificado HTTPS a Let's Encrypt y lo renueva solo.

1. **Instala Docker** (script oficial; incluye el plugin `docker compose`):

   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   ```

2. **Pon el dominio** en `.env` (además de la clave y el secreto):

   ```dotenv
   BINGO_DOMAIN=bingo.tudominio.es
   ```

   El registro DNS ya debe apuntar al servidor: Let's Encrypt lo comprueba al arrancar Caddy.

3. **Arranca:**

   ```bash
   cd /opt/bingo
   sudo docker compose --profile caddy up -d --build
   ```

   La primera compilación tarda unos minutos.

4. **Comprueba** (la primera vez Caddy tarda unos segundos en conseguir el certificado):

   ```bash
   sudo docker compose --profile caddy ps     # bingo debe salir "healthy"
   curl -fsS --retry 10 --retry-delay 3 --retry-all-errors https://bingo.tudominio.es/api/health
   ```

   Abre `https://bingo.tudominio.es/panel`, entra con la clave y copia los enlaces desde **Enlaces**.

Los datos quedan en el volumen de Docker `bingo_bingo_data` y los certificados en `bingo_caddy_data`.

Comandos útiles (desde `/opt/bingo`):

```bash
sudo docker compose --profile caddy logs -f bingo   # registros de la aplicación
sudo docker compose --profile caddy logs -f caddy   # registros del proxy y del certificado
sudo docker compose --profile caddy down            # parar (los datos se conservan)
```

> **Si editas `.env`**, aplica los cambios con `sudo docker compose --profile caddy up -d`. Un `restart` no vuelve a leer el archivo.

## B. Docker detrás de tu proxy

Usa este camino si el servidor ya tiene nginx o Caddy. La aplicación se publica solo en `127.0.0.1:3000` y tu proxy la sirve. Si el puerto 3000 ya está ocupado, pon otro libre en `.env` (`BINGO_PORT=3001`) y úsalo también en el proxy.

1. Instala Docker y prepara `.env` como en el camino A (no hace falta `BINGO_DOMAIN`).
2. Arranca solo la aplicación:

   ```bash
   cd /opt/bingo
   sudo docker compose up -d --build
   curl -fsS --retry 10 --retry-delay 1 --retry-all-errors http://127.0.0.1:3000/api/health
   ```

3. Configura el proxy.

   **nginx:** usa [`deploy/nginx/bingo.conf`](deploy/nginx/bingo.conf). Ya trae lo que hace falta para el directo, el tamaño del logo, la cookie segura y HSTS.

   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx   # si aún no están instalados
   sudo cp deploy/nginx/bingo.conf /etc/nginx/sites-available/bingo
   sudo sed -i 's/bingo.example.com/bingo.tudominio.es/' /etc/nginx/sites-available/bingo
   sudo ln -s /etc/nginx/sites-available/bingo /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx --redirect -d bingo.tudominio.es
   ```

   **Caddy instalado en el servidor:** añade el bloque de [`deploy/caddy/Caddyfile.host`](deploy/caddy/Caddyfile.host) a `/etc/caddy/Caddyfile` (sin borrar los sitios que ya tengas), cambia el dominio y ejecuta `sudo systemctl reload caddy`.

   **Otro proxy (Traefik, Apache, HAProxy…):** reenvía todo a `127.0.0.1:3000` y cumple estas condiciones:
   - **Sin búfer en el directo:** no almacenes en búfer ni comprimas la ruta `/api/live/stream` (Server-Sent Events), y dale un tiempo de espera de al menos un minuto.
   - **Protocolo real:** pon `X-Forwarded-Proto` con el protocolo de la petición (`https` o `http`), sustituyendo el que mande el cliente.
   - **IP del cliente:** añádela al final de `X-Forwarded-For`. La aplicación usa la última entrada para limitar los intentos de acceso al panel.
   - **Tamaño:** permite peticiones de hasta 3 MB, para subir el logo.
   - **HTTPS:** redirige `http://` a `https://`.

## C. Sin Docker (Node + systemd)

La aplicación compilada (`.output`) es autónoma: en el servidor solo hace falta Node.js 24.

1. **Instala Node.js 24** (repositorio de NodeSource; deja `node` en `/usr/bin/node`):

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt install -y nodejs
   node -v   # v24.15 o superior
   ```

2. **Compila**, en el servidor o en tu ordenador, dentro del proyecto:

   ```bash
   sudo npm install -g pnpm@12.10.1   # en tu ordenador puede no hacer falta sudo
   pnpm install --frozen-lockfile
   pnpm build
   ```

   Si compilaste en tu ordenador, empaqueta `.output` y súbelo. `.output` no lleva módulos nativos ni depende del sistema: puedes compilar en Windows, macOS o Linux. `tar` y `scp` vienen con los tres.

   ```bash
   tar czf bingo-output.tar.gz .output
   scp bingo-output.tar.gz usuario@servidor:/tmp/
   ```

3. **Instala** en el servidor. El proyecto debe estar en `/opt/bingo`, para tener a mano `deploy/` y `.env`:

   ```bash
   cd /opt/bingo
   # Solo si compilaste en tu ordenador:
   rm -rf .output && tar xzf /tmp/bingo-output.tar.gz -C /opt/bingo
   # Usuario del servicio y servicio:
   sudo useradd --system --home /opt/bingo --shell /usr/sbin/nologin bingo
   sudo cp deploy/systemd/bingo.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now bingo
   curl -fsS --retry 10 --retry-delay 1 --retry-all-errors -o /dev/null http://127.0.0.1:3000/api/live && echo OK
   ```

   La comprobación usa `/api/live`, que escribe en la carpeta de datos, para detectar también problemas de permisos.

   El servicio escucha en `127.0.0.1:3000` y guarda los datos en `/var/lib/bingo`. Lee `.env` como root, así que el archivo puede seguir siendo tuyo con permisos `600`. No definas en él `NUXT_DATA_DIR`, `HOST` ni `PORT`: tienen prioridad sobre el servicio.

4. **Proxy con HTTPS.** En un servidor nuevo, instala antes el proxy:
   - **nginx:** `sudo apt install -y nginx certbot python3-certbot-nginx` y sigue los pasos de nginx del [camino B](#b-docker-detrás-de-tu-proxy).
   - **Caddy:** instálalo con [su repositorio oficial](https://caddyserver.com/docs/install#debian-ubuntu-raspbian), pon el bloque de `deploy/caddy/Caddyfile.host` en `/etc/caddy/Caddyfile` con tu dominio y ejecuta `sudo systemctl reload caddy`.

Comandos útiles:

```bash
sudo journalctl -u bingo -f          # registros
sudo systemctl restart bingo         # reiniciar (también tras editar .env)
```

## Actualizar

Reiniciar no pierde nada: la partida en curso, el historial y el logo están en disco, y las pantallas se reconectan solas en unos segundos. Aun así, mejor no actualizar en mitad de una partida.

Repite la actualización cada mes aunque no cambies la aplicación: así recibes los parches de seguridad de Node.js y de Caddy.

**Docker (A y B):**

```bash
cd /opt/bingo
git pull                                            # o descomprime el nuevo bingo.tar.gz encima
sudo docker compose --profile caddy build --pull    # última imagen base de Node.js
sudo docker compose --profile caddy pull caddy      # última versión 2.10 de Caddy (solo camino A)
sudo docker compose --profile caddy up -d           # en el camino B: sin --profile caddy
sudo docker image prune -f                          # borra las imágenes antiguas
```

**Sin Docker (C):**

1. Actualiza el sistema, que incluye Node.js: `sudo apt update && sudo apt upgrade -y`.
2. Compila de nuevo y reemplaza `/opt/bingo/.output`, como en el paso 2 del camino C.
3. Reinicia: `sudo systemctl restart bingo`.

## Copias de seguridad

Todo está en una carpeta de archivos JSON: partida en curso, historial, conjuntos propios, lotes de cartones y logo.

> **Guarda las copias con cuidado.** Incluyen las semillas de los lotes, y con ellas se puede reconstruir cualquier cartón y saber cuál gana. Trátalas como la clave del panel.

**Docker:**

```bash
mkdir -m 700 -p ~/backups
sudo docker run --rm -v bingo_bingo_data:/data:ro -v ~/backups:/backup alpine \
  tar czf /backup/bingo-$(date +%F-%H%M).tar.gz -C /data .
```

Restaurar (para la aplicación, sustituye los datos y vuelve a arrancar):

```bash
cd /opt/bingo
sudo docker compose stop bingo
sudo docker run --rm -v bingo_bingo_data:/data -v ~/backups:/backup alpine \
  sh -c 'find /data -mindepth 1 -delete && tar xzf /backup/ARCHIVO.tar.gz -C /data && chown -R 1001:1001 /data'
sudo docker compose start bingo
```

**Sin Docker:**

```bash
mkdir -m 700 -p ~/backups
sudo tar czf ~/backups/bingo-$(date +%F-%H%M).tar.gz -C /var/lib/bingo .
```

Restaurar:

```bash
sudo systemctl stop bingo
sudo find /var/lib/bingo -mindepth 1 -delete
sudo tar xzf ~/backups/ARCHIVO.tar.gz -C /var/lib/bingo
sudo chown -R bingo:bingo /var/lib/bingo
sudo systemctl start bingo
```

**Copia diaria automática.** Crea la carpeta (`sudo mkdir -m 700 -p /root/backups`) y añade a `sudo crontab -e` la línea de tu camino, más la limpieza de copias de más de 30 días. En cron hay que escapar `%` como `\%`.

```cron
# Docker:
0 4 * * * docker run --rm -v bingo_bingo_data:/data:ro -v /root/backups:/backup alpine tar czf /backup/bingo-$(date +\%F).tar.gz -C /data .
# Sin Docker:
0 4 * * * tar czf /root/backups/bingo-$(date +\%F).tar.gz -C /var/lib/bingo .
# Ambos:
30 4 * * * find /root/backups -name 'bingo-*.tar.gz' -mtime +30 -delete
```

## Uso sin dominio (red local o IP)

Para un evento en una red local, o para probar sin dominio, publica la aplicación en la IP del servidor. Mejor en la de la red local (por ejemplo `192.168.1.20`) que en todas (`0.0.0.0`):

```dotenv
BINGO_BIND=192.168.1.20
BINGO_PORT=3000
```

```bash
cd /opt/bingo
sudo docker compose up -d --build
```

Y entra en `http://IP-DEL-SERVIDOR:3000`.

Sin Docker:

1. Cambia `HOST=127.0.0.1` por `HOST=0.0.0.0` en `/etc/systemd/system/bingo.service`.
2. Abre el puerto solo a tu red, porque el cortafuegos del paso 1 lo bloquea:

   ```bash
   sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
   ```

3. Reinicia el servicio:

   ```bash
   sudo systemctl daemon-reload && sudo systemctl restart bingo
   ```

> **Cuidado:**
>
> - **Sin cifrado:** sin HTTPS, la clave del panel y la cookie de sesión, que dura 14 días, viajan en claro. Úsalo solo en redes de confianza y, al terminar, cambia `NUXT_ADMIN_KEY` para cerrar las sesiones.
> - **Cortafuegos:** los puertos que publica Docker no pasan por `ufw`, así que `ufw` no los cierra.
> - **Al pasar a dominio,** borra `BINGO_BIND` y `BINGO_PORT` de `.env` y aplica los cambios con `sudo docker compose --profile caddy up -d` (sin `--profile caddy` en el camino B). Si no, la aplicación sigue accesible sin cifrar en el puerto 3000.

## Problemas frecuentes

#### La pantalla pública no cambia hasta que la recargo

El proxy está almacenando en búfer el directo. En nginx, la sección `location = /api/live/stream` de `deploy/nginx/bingo.conf` lo resuelve (`proxy_buffering off`). En otros proxies, desactiva el búfer y la compresión de esa ruta.

#### Aparece «Reconectando…» cada poco

El proxy corta las conexiones abiertas. La aplicación envía un latido cada 20 segundos: el tiempo de espera de lectura del proxy debe ser mayor (en nginx, `proxy_read_timeout 1h`).

#### Entro en el panel y me vuelve a pedir la clave

Pasa si entras por una dirección distinta de la que usaste al iniciar sesión: `http://` en vez de `https://`, la IP en vez del dominio, u otro subdominio. La cookie solo vale para esa dirección, y si se creó por HTTPS el navegador no la envía por `http://`.

También cierra todas las sesiones cambiar `NUXT_ADMIN_KEY` o `NUXT_SESSION_PASSWORD`. Si tu proxy envía siempre `X-Forwarded-Proto: https`, también en las peticiones por `http://`, corrígelo para que envíe el protocolo real (en nginx, `$scheme`).

#### «El panel no está configurado: define NUXT_ADMIN_KEY»

Falta la clave en `.env`, o el cambio no se ha aplicado. Desde `/opt/bingo`:

- **Docker:** `sudo docker compose --profile caddy up -d` (sin `--profile caddy` en el camino B). Un `restart` no basta.
- **Sin Docker:** `sudo systemctl restart bingo`.

#### Error 413 al subir el logo

El proxy limita el tamaño de las peticiones. En nginx, `client_max_body_size 3m;`.

#### Caddy no consigue el certificado

Mira los registros: `cd /opt/bingo && sudo docker compose --profile caddy logs caddy`. Las causas habituales:

- el DNS aún no apunta al servidor;
- los puertos 80 y 443 están cerrados en el cortafuegos del proveedor;
- otro servicio, como un nginx instalado, ya ocupa esos puertos.

#### Permiso denegado en `/data`

Pasa si cambias el volumen de Docker por una carpeta del servidor. El contenedor usa el usuario 1001, así que ejecuta `sudo chown -R 1001:1001 /ruta/de/la/carpeta`.

#### La compilación se corta o el servidor se queda sin memoria

La compilación necesita unos 2 GB. Añade swap:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Con Docker no hace falta nada más: la imagen ya amplía el límite de memoria de Node.js al compilar. Sin Docker, si el error es «JavaScript heap out of memory», compila así:

```bash
NODE_OPTIONS=--max-old-space-size=2048 pnpm build
```

O compila la imagen en tu ordenador y súbela ya hecha. Elige la arquitectura del servidor, no la de tu ordenador:

```bash
docker build --platform linux/amd64 -t bingo-full:latest .   # servidor ARM64: --platform linux/arm64
docker save -o bingo-image.tar bingo-full:latest
scp bingo-image.tar usuario@servidor:/tmp/
```

Y en el servidor, carga la imagen y arranca sin `--build`:

```bash
sudo docker load -i /tmp/bingo-image.tar && rm /tmp/bingo-image.tar
cd /opt/bingo && sudo docker compose --profile caddy up -d
```

#### Las horas del historial no coinciden

El panel y el CSV muestran las horas en la zona horaria del ordenador o móvil que los abre. Revisa la fecha, la hora y la zona horaria de ese dispositivo.

## Lista rápida

- [ ] DNS apuntando al servidor y puertos 80 y 443 abiertos.
- [ ] `.env` con `NUXT_ADMIN_KEY` y `NUXT_SESSION_PASSWORD` aleatorios, y permisos `600`.
- [ ] `https://tu-dominio/api/health` responde `{"ok":true}` y `http://tu-dominio` redirige a `https://`.
- [ ] Desde tu ordenador, `curl -m 5 http://IP-DEL-SERVIDOR:3000/api/health` falla: el puerto 3000 solo escucha en local.
- [ ] El panel abre por HTTPS y, en las herramientas de desarrollo del navegador (Aplicación → Cookies), la cookie `bingo-admin` sale marcada como **Secure**.
- [ ] La pantalla pública cambia sola al sacar una bola desde el panel.
- [ ] Hay copia de seguridad del volumen o de `/var/lib/bingo`.
