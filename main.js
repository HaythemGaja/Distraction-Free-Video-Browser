const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// Linux video decoding & uninterrupted background media flags
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

function createWindow () {
  Menu.setApplicationMenu(null); // No system menu bar

  const win = new BrowserWindow({
    width: 1420,
    height: 900,
    icon: path.join(__dirname, 'icon.svg'), // Custom App Icon
    autoHideMenuBar: true,
    webPreferences: {
      webviewTag: true,
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  });

  win.setMenuBarVisibility(false);

  const desktopUserAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  win.webContents.setUserAgent(desktopUserAgent);

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
