# TikTok Interaktive

Experiencias interactivas para **TikTok Live**: el chat, los likes y los regalos controlan juegos en pantalla. Pensado para capturar el navegador con **TikTok Live Studio** desde PC.

Repositorio colaborativo: [github.com/EgallegosT/TiktokInteraktive](https://github.com/EgallegosT/TiktokInteraktive)

## Experiencias incluidas

| Ruta | Juego | Formato |
|------|-------|---------|
| `/race/` | Carrera de estrellas (`1` / `2`, likes, regalos) | 16:9 |
| `/bubbles/` | Arena de burbujas (`jugar`) | 16:9 |
| `/cofre/` | Cofre del Live (`cofre`) | 16:9 |
| `/dragon/` | Dragón del Live (`atacar`) | 16:9 |
| `/roblox/` | Arena Roblox Live (usuario Roblox) | 16:9 |
| `/rey/` | Rey de la colina (`rey` / `corona`) | 16:9 |
| `/crystal/` | Bola de cristal (preguntas en chat) | Banda superior |

Menú principal: `http://localhost:3000`

## Requisitos

- [Node.js](https://nodejs.org/) 18+
- Cuenta de TikTok con permiso para hacer live
- TikTok Live Studio (captura de ventana del navegador)

## Instalación

```bash
git clone https://github.com/EgallegosT/TiktokInteraktive.git
cd TiktokInteraktive
npm install
copy .env.example .env   # Windows
# cp .env.example .env   # macOS / Linux
```

Edita `.env` y configura tu usuario:

```env
TIKTOK_USERNAME=tu_usuario_sin_arroba
```

## Uso en cada live

1. Inicia tu transmisión en TikTok Live Studio.
2. Arranca el puente:

```bash
npm start
```

3. Abre `http://localhost:3000` y elige una experiencia.
4. En Live Studio: **Fuentes → Captura de ventana** → selecciona el navegador.
5. Coloca el overlay donde quieras (arriba, lateral, pantalla completa).

Para detener el servidor:

```bash
npm run stop
```

## Modo demo (sin estar en vivo)

En `.env`:

```env
DEMO_MODE=true
```

Cada juego tiene teclas de prueba (por ejemplo en carrera: `1`, `2`, `L`, `G`; en bola de cristal: `P`, `M`, `G`).

## Arquitectura

```
bridge/          → Conexión TikTok Live + WebSocket (8765) + HTTP (3000)
game/            → Frontends HTML/CSS/JS por experiencia
assets/          → Imágenes y recursos compartidos
scripts/         → Utilidades (stop, etc.)
```

El bridge recibe eventos de TikTok y los reenvía por WebSocket a todos los clientes conectados.

## Colaborar

¡Las contribuciones son bienvenidas! Lee [CONTRIBUTING.md](./CONTRIBUTING.md) para el flujo de ramas, convenciones y cómo añadir una nueva experiencia.

Resumen rápido:

1. Haz fork del repo.
2. Crea una rama: `feature/nombre-de-tu-juego` o `fix/descripcion`.
3. Desarrolla y prueba con `DEMO_MODE=true`.
4. Abre un Pull Request hacia `main`.

## Variables de entorno

Copia `.env.example` y ajusta lo que necesites. **No subas `.env`** (contiene tu usuario y configuración privada).

## Aviso legal

Usa [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector), un conector no oficial basado en ingeniería inversa. Puede dejar de funcionar si TikTok cambia su sistema. Úsalo bajo tu propia responsabilidad.

## Licencia

Proyecto abierto para colaboración comunitaria. Define la licencia definitiva en un issue o PR si el equipo lo decide.
