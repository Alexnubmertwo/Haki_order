const { app, BrowserWindow, Menu, dialog, ipcMain, shell, net } = require('electron');
const fs = require('fs');
const path = require('path');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let serverUrl = '';
let errorShown = false;
let coldRetries = 0;

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');

// Не даём бесплатному серверу засыпать: лёгкий запрос раз в 4 минуты, пока приложение открыто.
function keepAlive() {
  if (!serverUrl) return;
  try {
    const r = net.request({ method: 'GET', url: serverUrl.replace(/\/+$/, '') + '/css/extra.css?ka=' + Date.now() });
    r.on('response', (resp) => resp.on('data', () => {}));
    r.on('error', () => {});
    r.end();
  } catch (e) {}
}
setInterval(keepAlive, 4 * 60 * 1000);

// ---------- настройки (адрес сервера) ----------
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');

function readCfg() {
  try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; }
}

function saveCfg(cfg) {
  fs.mkdirSync(path.dirname(cfgFile()), { recursive: true });
  fs.writeFileSync(cfgFile(), JSON.stringify(cfg));
}

function defaultUrl() {
  try { return fs.readFileSync(path.join(__dirname, 'default-url.txt'), 'utf8').trim(); } catch (e) { return ''; }
}

function normalize(raw) {
  let u = (raw || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

// ---------- диалог ввода текста ----------
let promptCounter = 0;

function askText(parent, message, def) {
  return new Promise((resolve) => {
    const channel = 'haki-prompt-result-' + (++promptCounter);
    let finished = false;
    const done = (value) => {
      if (finished) return;
      finished = true;
      ipcMain.removeAllListeners(channel);
      resolve(value);
    };

    const w = new BrowserWindow({
      width: 480,
      height: 230,
      parent: parent || undefined,
      modal: !!parent,
      resizable: false,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      title: 'Haki POS',
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    w.removeMenu();

    const data = JSON.stringify({ message, def, channel }).replace(/</g, '\\u003c');
    const html = `<!doctype html><meta charset="utf-8">
<style>
 body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:18px;background:#fff;color:#111}
 p{margin:0 0 12px;white-space:pre-wrap;font-size:14px}
 input{width:100%;box-sizing:border-box;padding:8px;font-size:15px}
 .row{text-align:right;margin-top:16px}
 button{padding:6px 18px;font-size:14px;margin-left:8px}
</style>
<p id="m"></p><input id="i" autofocus>
<div class="row"><button id="c">Отмена</button><button id="o">OK</button></div>
<script>
 const {ipcRenderer}=require('electron');
 const D=${data};
 const m=document.getElementById('m'),i=document.getElementById('i');
 m.textContent=D.message; i.value=D.def; i.focus(); i.select();
 document.getElementById('o').onclick=()=>ipcRenderer.send(D.channel,i.value);
 document.getElementById('c').onclick=()=>ipcRenderer.send(D.channel,null);
 i.onkeydown=(e)=>{ if(e.key==='Enter') document.getElementById('o').click(); if(e.key==='Escape') document.getElementById('c').click(); };
</script>`;

    ipcMain.once(channel, (_e, value) => {
      done(value);
      if (!w.isDestroyed()) w.close();
    });
    w.on('closed', () => done(null));
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });
}

// window.prompt из страницы приходит сюда синхронно
ipcMain.on('haki-prompt', (event, message, def) => {
  askText(win, message, def).then((value) => { event.returnValue = value; });
});

// ---------- сервер ----------
function loadServer() {
  errorShown = false;
  if (win && serverUrl) {
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      '<body style="margin:0;background:#0f1115;color:#aab;font:18px Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">Подключение к серверу…</body>'));
    win.loadURL(serverUrl);
    keepAlive();
  }
}

async function changeServer() {
  const value = await askText(win, 'Адрес сервера (например, https://haki-xxxx.onrender.com):', serverUrl);
  if (value === null) return false;
  const u = normalize(value);
  if (!u) return false;
  serverUrl = u;
  saveCfg({ url: u });
  loadServer();
  return true;
}

function showConnectionError() {
  if (errorShown || !win) return;
  errorShown = true;
  dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Нет связи с сервером',
    message: 'Нет связи с сервером',
    detail: 'Проверьте интернет. Если сервер только что проснулся, подождите минуту и повторите.',
    buttons: ['Повторить', 'Сменить адрес', 'Выход'],
    defaultId: 0,
    cancelId: 0
  }).then(async (r) => {
    errorShown = false;
    if (r.response === 0) loadServer();
    else if (r.response === 1) { errorShown = false; if (!(await changeServer())) loadServer(); }
    else app.quit();
  });
}

// ---------- окно ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    title: 'Haki POS',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });
  win.maximize();
  win.show();

  const sameHost = (url) => {
    try { return new URL(url).host === new URL(serverUrl).host; } catch (e) { return false; }
  };

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (sameHost(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!sameHost(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    // сервер мог просто просыпаться: тихо повторяем несколько раз
    if (coldRetries < 6) { coldRetries++; setTimeout(() => { if (win && serverUrl) win.loadURL(serverUrl); }, 5000); }
    else { coldRetries = 0; showConnectionError(); }
  });
  win.webContents.on('did-finish-load', () => { coldRetries = 0; });
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{
    label: 'Haki',
    submenu: [
      { label: 'Обновить', accelerator: 'F5', click: () => win && win.reload() },
      { label: 'Сменить адрес сервера', accelerator: 'CmdOrCtrl+Shift+S', click: () => changeServer() },
      { label: 'Полный экран', role: 'togglefullscreen' },
      { role: 'zoomIn', label: 'Увеличить' },
      { role: 'zoomOut', label: 'Уменьшить' },
      { role: 'resetZoom', label: 'Масштаб 100%' },
      { type: 'separator' },
      { role: 'quit', label: 'Выход' }
    ]
  }]));
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(async () => {
  serverUrl = normalize(readCfg().url || defaultUrl());
  buildMenu();
  createWindow();
  if (!serverUrl) {
    const ok = await changeServer();
    if (!ok) { app.quit(); return; }
  } else {
    loadServer();
  }
});

app.on('window-all-closed', () => app.quit());
