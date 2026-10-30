// Memory-only desktop shell, derived from Luke-os's Electron shell.
const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const root = path.join(__dirname, '..');
const port = process.env.LUKE_PORT || '5051';
const origin = `http://127.0.0.1:${port}`;
let backend, window;
function ready() {
  return new Promise(resolve => {
    const req = http.get(origin + '/api/status', res => {
      let text = ''; res.on('data', d => text += d);
      res.on('end', () => { try { resolve(JSON.parse(text).app === 'luke-memory'); } catch { resolve(false); } });
    });
    req.on('error', () => resolve(false)); req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}
async function start() {
  if (!(await ready())) {
    const candidates = [process.env.LUKE_PYTHON, path.join(root, '.venv', 'bin', 'python'),
      path.join(root, '.venv', 'Scripts', 'python.exe')].filter(Boolean);
    const python = candidates.find(p => fs.existsSync(p)) || 'python3';
    backend = spawn(python, [path.join(root, 'backend', 'app.py')], { cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, stdio: 'inherit' });
    backend.on('error', () => dialog.showErrorBox('Python could not start', 'Follow the Python environment setup in README.md.'));
    for (let i = 0; i < 40 && !(await ready()); i++) await new Promise(resolve => setTimeout(resolve, 250));
    if (!(await ready())) throw new Error('Luke backend did not become ready. Check the terminal and Python setup.');
  }
  window = new BrowserWindow({ width: 1180, height: 800, minWidth: 760, minHeight: 600,
    title: 'Luke Memory', backgroundColor: '#111510',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  await window.loadURL(origin);
}
app.whenReady().then(start).catch(error => { dialog.showErrorBox('Luke Memory', error.message); app.quit(); });
app.on('before-quit', () => backend?.kill());
app.on('window-all-closed', () => app.quit());
