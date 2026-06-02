# Guía de contribución

Gracias por querer sumar experiencias a **TikTok Interaktive**. Este documento explica cómo trabajar en equipo sin pisarnos los cambios.

## Flujo de trabajo (Git)

1. **Fork** del repositorio [EgallegosT/TiktokInteraktive](https://github.com/EgallegosT/TiktokInteraktive).
2. **Clona** tu fork:

```bash
git clone https://github.com/TU_USUARIO/TiktokInteraktive.git
cd TiktokInteraktive
npm install
copy .env.example .env
```

3. **Rama nueva** desde `main` (nunca commits directos a `main` en el repo principal):

```bash
git checkout main
git pull origin main
git checkout -b feature/mi-nueva-experiencia
```

### Convención de nombres de rama

| Prefijo | Uso |
|---------|-----|
| `feature/` | Nueva experiencia, mecánica o pantalla |
| `fix/` | Corrección de bug |
| `ui/` | Mejoras visuales sin cambiar lógica del bridge |
| `docs/` | Solo documentación |
| `refactor/` | Reorganización de código |

Ejemplos: `feature/encuesta-live`, `fix/crystal-cooldown`, `ui/race-overlay-legible`.

4. **Desarrolla** con `DEMO_MODE=true` en `.env`.
5. **Commit** claro en español o inglés (consistente en el PR):

```bash
git add .
git commit -m "feat(crystal): banner de mención más legible en stream"
```

6. **Push** a tu fork y abre un **Pull Request** hacia `main` del repo original.

## Qué incluir en un PR

- Descripción de qué hace el cambio y cómo probarlo.
- Captura o GIF del overlay en acción (si es UI).
- Teclas de demo documentadas si añades una experiencia nueva.
- Confirmación de que **no** incluiste `.env` ni secretos.

## Añadir una nueva experiencia

Checklist mínimo:

1. **Carpeta** `game/tu-juego/` con `index.html`, `css/`, `js/`.
2. **Canvas** documentado (16:9, 1:1, banda superior, etc.) y `scaleStage()` coherente.
3. **WebSocket**: escuchar eventos en el cliente; si necesitas eventos nuevos, extiende `bridge/index.js` (o un módulo en `bridge/`).
4. **Entrada en el menú** `game/index.html`.
5. **Variables opcionales** en `.env.example` si el bridge las usa.
6. **Modo demo** con teclas para probar sin live.

### Estructura recomendada del frontend

```
game/mi-juego/
  index.html
  css/style.css
  js/mi-juego.js    → import { createTts } from '../../race/js/tts.js' si usas voz
```

Conexión WebSocket típica:

```js
const ws = new WebSocket(`ws://${location.hostname || 'localhost'}:8765`);
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  // msg.type: hello, status, chat, like, gift, follow, ...
};
```

## Estilo de código

- JavaScript ES modules (`import` / `export`).
- Sin frameworks pesados: HTML + CSS + JS vanilla (como el resto del repo).
- Cambios **pequeños y enfocados**: un PR = una idea (nueva experiencia o un fix concreto).
- No reformatear archivos que no toques.

## Probar antes del PR

```bash
npm start
# Abre http://localhost:3000/tu-ruta/
# Con DEMO_MODE=true usa las teclas de prueba
```

Comprueba:

- [ ] El menú sigue cargando.
- [ ] WebSocket conecta (estado verde / demo).
- [ ] No hay errores en consola del navegador.
- [ ] `.env` no está en el commit (`git status`).

## Issues

Si tienes una idea pero no código aún, abre un **Issue** con:

- Nombre de la experiencia.
- Comandos del chat (ej. `votar rojo`).
- Formato de pantalla (16:9, banda superior, etc.).
- Boceto o referencia visual (opcional).

Así otros pueden tomar la rama `feature/...` sin duplicar trabajo.

## Dudas

Abre un Issue en GitHub o comenta en un PR existente. Priorizamos cambios que mejoren la legibilidad en live y la experiencia del viewer.
