// CONFIG: substitua com sua URL de implantação do Apps Script e token secreto
const DEPLOY_URL = "https://script.google.com/macros/s/AKfycbygb1wBtCv7WITzdy2pcVZ703PbDAC9o7b4MiUCaabG078vOZot8cfT-wLNdRV8oZzhVA/exec";
const FRONTEND_TOKEN = "Ingressos2025#A1";

// Tabs
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tabcontent').forEach(tc => tc.classList.remove('active'));
  const tab = btn.dataset.tab;
  btn.classList.add('active');
  document.getElementById(tab).classList.add('active');
}));

// utilitário p/ ler arquivo
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// utilitário para escapar HTML
function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// função de POST com debug
async function postJsonDebug(payload) {
  try {
    const res = await fetch(DEPLOY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await res.text(); // pega o corpo sempre como texto
    try {
      const json = JSON.parse(text);
      return { ok: true, json, httpCode: res.status, raw: text };
    } catch (e) {
      return { ok: false, error: 'Resposta não é JSON', httpCode: res.status, raw: text };
    }
  } catch (err) {
    return { ok: false, error: 'Erro de rede: ' + err.toString() };
  }
}

// --- GERAR INGRESSO ---
const generateBtn = document.getElementById('generateBtn');
generateBtn.addEventListener('click', async () => {
  const name = document.getElementById('name').value.trim();
  const value = document.getElementById('value').value.trim();
  const type = document.getElementById('type').value;
  const file = document.getElementById('receipt').files[0];
  const msg = document.getElementById('generateMsg');
  msg.innerHTML = '';
  if (!name || !value) { msg.innerHTML = '<span class="err">Preencha nome e valor</span>'; return; }

  let base64 = '';
  if (file) { base64 = await readFileAsDataURL(file); }

  msg.innerHTML = 'Enviando...';
  const payload = { token: FRONTEND_TOKEN, action: 'generate', name, value, type, comprovante: base64 };
  const debug = await postJsonDebug(payload);

  if (!debug.ok) {
    msg.innerHTML = `<div class="err">Erro: ${debug.error || 'unknown'} (HTTP ${debug.httpCode || ''})<pre style="white-space:pre-wrap;max-height:200px;overflow:auto">${escapeHtml(debug.raw || '')}</pre></div>`;
    return;
  }

  const data = debug.json;
  if (data.ok) {
    msg.innerHTML = `<div class="ok">Ingresso gerado: <b>${data.codigo}</b></div><div><a href="${data.pdfUrl}" target="_blank">Abrir PDF</a></div>`;
  } else {
    msg.innerHTML = `<div class="err">Erro (JSON): ${data.error || JSON.stringify(data)}</div>`;
  }
});

// --- SCANNER ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const scanResult = document.getElementById('scanResult');
const restartBtn = document.getElementById('restartScan');
let scanning = false;

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    await video.play();
    scanning = true;
    requestAnimationFrame(tick);
  } catch (e) {
    scanResult.innerHTML = `<div class="err">Erro câmera: ${e.message}</div>`;
  }
}

function tick() {
  if (!scanning) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height);
    if (code && code.data) { scanning = false; handleCode(code.data); return; }
  }
  requestAnimationFrame(tick);
}

async function handleCode(codigo) {
  scanResult.innerHTML = 'Validando...';
  const debug = await postJsonDebug({ token: FRONTEND_TOKEN, action: 'validate', codigo });

  if (!debug.ok) {
    scanResult.innerHTML = `<div class="err">Erro: ${debug.error} (HTTP ${debug.httpCode || ''})<pre style="white-space:pre-wrap;max-height:200px;overflow:auto">${escapeHtml(debug.raw || '')}</pre></div>`;
    return;
  }

  const data = debug.json;
  if (data.ok && data.status === 'OK') {
    scanResult.innerHTML = `<div class="ok">🎉 INGRESSO CONFIRMADO</div><div>${data.nome} — ${data.tipo} — R$ ${data.valor}</div>`;
  } else if (data.status === 'USADO') {
    scanResult.innerHTML = `<div class="err">❌ INGRESSO JÁ UTILIZADO</div>`;
  } else {
    scanResult.innerHTML = `<div class="err">⚠️ CÓDIGO NÃO ENCONTRADO</div>`;
    setTimeout(() => { scanning = true; requestAnimationFrame(tick); }, 1200);
  }
}

restartBtn.addEventListener('click', () => { scanResult.innerHTML = ''; scanning = true; requestAnimationFrame(tick); restartBtn.style.display = 'none'; });

startCamera();
