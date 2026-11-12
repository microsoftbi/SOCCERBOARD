const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = 8123;
const URL_APP = `http://127.0.0.1:${PORT}/`;

let backend = null;
let win = null;

/** 数据目录：开发态直接用项目 server/data，打包后放到用户数据目录（首次启动从内置种子复制） */
function resolveDataDir() {
  if (!app.isPackaged) {
    const dev = path.join(__dirname, '..', 'server', 'data');
    if (fs.existsSync(dev)) return dev;
  }
  const dir = path.join(app.getPath('userData'), 'data');
  const seed = path.join(process.resourcesPath, 'seed');
  if (!fs.existsSync(path.join(dir, 'soccerboard.db')) && fs.existsSync(seed)) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.cpSync(seed, dir, { recursive: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveBackend() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'soccerboard-server')
    : path.join(__dirname, 'build', 'soccerboard-server');
}

function resolveWebDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'web')
    : path.join(__dirname, '..', 'app', 'dist');
}

function startBackend() {
  const bin = resolveBackend();
  if (!fs.existsSync(bin)) throw new Error(`未找到后端程序：${bin}\n请先运行 desktop/build.sh`);
  backend = spawn(bin, [], {
    env: {
      ...process.env,
      SOCCERBOARD_DATA_DIR: resolveDataDir(),
      SOCCERBOARD_WEB_DIR: resolveWebDir(),
      SOCCERBOARD_PORT: String(PORT),
    },
    stdio: 'ignore',
  });
  backend.on('exit', () => {
    backend = null;
  });
}

function probe() {
  return new Promise((resolve) => {
    const req = http.get(`${URL_APP}api/library`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitBackend(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'SOCCERBOARD',
    backgroundColor: '#0a0f0d',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
  });
  await win.loadURL(URL_APP);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      startBackend();
      if (!(await waitBackend())) throw new Error('后端启动超时');
      await createWindow();
    } catch (err) {
      dialog.showErrorBox('SOCCERBOARD 启动失败', String(err && err.message ? err.message : err));
      app.quit();
    }
  });

  app.on('activate', () => {
    if (!win && backend) void createWindow();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('will-quit', () => {
    if (backend) backend.kill('SIGTERM');
  });
}
