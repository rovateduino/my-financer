const { app, BrowserWindow, ipcMain } = require('electron');
const { fork } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const fs = require('fs');

// The admin tool shares the same database as the main "My Financer" app.
// Force the userData folder to match the main app so both executables
// work against the same data (tokens, launches, config).
const sharedAppName = app.isPackaged ? 'My Financer' : 'my-financer';
app.setPath('userData', path.join(app.getPath('appData'), sharedAppName));

function getDeviceId() {
  const deviceIdPath = path.join(app.getPath('userData'), 'device-id');
  try {
    let deviceId = fs.existsSync(deviceIdPath) ? fs.readFileSync(deviceIdPath, 'utf8').trim() : '';
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      fs.mkdirSync(path.dirname(deviceIdPath), { recursive: true });
      fs.writeFileSync(deviceIdPath, deviceId, 'utf8');
    }
    return deviceId;
  } catch {
    return crypto.randomUUID();
  }
}

ipcMain.on('my-financer:get-device-id', event => {
  event.returnValue = getDeviceId();
});

let PORT = Number(process.env.PORT || 3000);

function getServerPath() {
  if (process.defaultApp || !app.isPackaged) {
    return path.join(__dirname, '..', 'dist', 'server.cjs');
  }
  
  const resourcesPath = process.resourcesPath;
  
  // Tentar app.asar.unpacked primeiro (para quando asar está ativado)
  const unpackedPath = path.join(resourcesPath, 'app.asar.unpacked', 'dist', 'server.cjs');
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }
  
  // Tentar app.asar (para quando asar está ativado e arquivo está dentro do asar)
  const asarPath = path.join(resourcesPath, 'app.asar', 'dist', 'server.cjs');
  if (fs.existsSync(asarPath)) {
    return asarPath;
  }
  
  // Tentar diretório app (para quando asar está desativado)
  const appPath = path.join(resourcesPath, 'app', 'dist', 'server.cjs');
  if (fs.existsSync(appPath)) {
    return appPath;
  }
  
  // Fallback para qualquer um que existir
  return appPath;
}

const SERVER_PATH = getServerPath();

let serverProcess = null;
let mainWindow = null;
let ownsServerProcess = false;

function waitForServer() {
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://127.0.0.1:${PORT}`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        setTimeout(check, 500);
      });
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(check, 500);
      });
    };
    check();
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const tryReuseExistingServer = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const health = JSON.parse(body);
            if (res.statusCode === 200 && health.app === 'my-financer') {
              console.log(`Reusing existing local server on port ${PORT}`);
              resolve();
              return;
            }
          } catch {}
          startFreshServer();
        });
      });
      req.on('error', () => {
        startFreshServer();
      });
      req.setTimeout(1000, () => {
        req.destroy();
        startFreshServer();
      });
    };

    const startFreshServer = () => {
      console.log('Starting server from path:', SERVER_PATH);
      console.log('Is packaged:', app.isPackaged);
      console.log('Resources path:', process.resourcesPath);

      serverProcess = fork(SERVER_PATH, [], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          FINANCER_DATA_DIR: app.getPath('userData'),
          PORT: String(PORT)
        },
        stdio: 'pipe'
      });
      ownsServerProcess = true;

      let resolved = false;

      serverProcess.stdout.on('data', (data) => {
        const str = String(data);
        console.log(`[server] ${str}`);

        const m = str.match(/Running on http:\/\/[^:]+:(\d+)/);
        if (m && !resolved) {
          const detectedPort = Number(m[1]);
          if (detectedPort && detectedPort !== PORT) {
            console.log(`Detected server running on port ${detectedPort}, updating target port`);
            PORT = detectedPort;
          }
          resolved = true;
          resolve();
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.error(`[server] ${data}`);
      });

      serverProcess.on('exit', (code) => {
        console.log(`Server process exited with code ${code}`);
        ownsServerProcess = false;
        if (!resolved) reject(new Error('Server process exited before reporting readiness'));
      });

      // Fallback: probe the port if stdout detection doesn't happen shortly
      setTimeout(() => {
        if (!resolved) {
          waitForServer().then(() => {
            if (!resolved) {
              resolved = true;
              resolve();
            }
          }).catch(err => {
            if (!resolved) reject(err);
          });
        }
      }, 5000);
    };

    tryReuseExistingServer();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 900,
    minWidth: 640,
    minHeight: 700,
    icon: path.join(__dirname, '..', 'build', 'icons', 'win', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'My Financer Admin'
  });

  const targetUrl = `http://127.0.0.1:${PORT}/admin.html`;
  mainWindow.loadURL(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
  } catch (err) {
    console.error('Failed to start server:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess && ownsServerProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
