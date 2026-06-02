const WS_URL = `ws://${location.hostname || 'localhost'}:8765`;
const statusEl = document.getElementById('status');

function setStatus(text, ok) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `status-pill ${ok === true ? 'ok' : ok === false ? 'err' : ''}`;
}

function connectWs() {
  const ws = new WebSocket(WS_URL);
  ws.onopen = () => setStatus('Servidor listo', true);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'status' && msg.state === 'connected') setStatus('Live conectado', true);
      else if (msg.type === 'hello' && msg.connected) setStatus('Live conectado', true);
      else if (msg.type === 'status' && msg.state === 'error') setStatus('Sin live', false);
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => {
    setStatus('Servidor apagado — npm start', false);
    setTimeout(connectWs, 3000);
  };
}

function scaleStage() {
  const stage = document.getElementById('app');
  if (!stage) return;
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${scale})`;
}

scaleStage();
window.addEventListener('resize', scaleStage);
connectWs();
