const { app, BrowserWindow, session, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

app.setPath('userData', path.join(app.getPath('appData'), 'NeuroEYE-Desktop'));

let nextServer;
let serverLogs = '';

function waitForServer(url, retries, callback) {
  http.get(url, () => callback()).on('error', () => {
    if (retries <= 0) {
      dialog.showErrorBox('Erro ao iniciar servidor NeuroEYE', serverLogs || 'Tempo esgotado na porta 3000.');
      app.quit();
      return;
    }
    setTimeout(() => waitForServer(url, retries - 1, callback), 500);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadURL('http://127.0.0.1:3000');
}

app.whenReady().then(() => {
  session.defaultSession.setDevicePermissionHandler((details) => {
    return details.deviceType === 'serial' || details.deviceType === 'usb';
  });

  if (!app.isPackaged) {
    const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    nextServer = spawn(cmd, ['run', 'dev'], { cwd: __dirname, shell: true });
  } else {
    const standaloneDir = path.join(process.resourcesPath, 'standalone');
    const serverScript = path.join(standaloneDir, 'server.js');
    nextServer = spawn(process.execPath, [serverScript], {
      cwd: standaloneDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: '3000',
        HOSTNAME: '127.0.0.1',
        AUTH_SECRET: 'chave-secreta-local-neuroeye-2026',
        DATABASE_URL: 'postgresql://neuroeye:neuroeye@127.0.0.1:5433/neuroeye?schema=public'
      }
    });

    nextServer.stdout.on('data', (data) => { serverLogs += data.toString(); });
    nextServer.stderr.on('data', (data) => { serverLogs += data.toString(); });
    nextServer.on('error', (err) => { serverLogs += '\nSpawn error: ' + err.message; });
  }

  waitForServer('http://127.0.0.1:3000', 60, createWindow);
});

app.on('window-all-closed', () => {
  if (nextServer) nextServer.kill();
  if (process.platform !== 'darwin') app.quit();
});