const path = require("path");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");

console.log(dialog);

app.whenReady().then(() => {
  ipcMain.handle("folder:open", handleFolderOpen);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

async function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,

      enableRemoteModule: true,
      nodeIntegration: true,
    },
  });

  win.loadFile("index.html");
}
async function handleFolderOpen(event, type = "folder") {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    message: `Select ${type} path`,
    properties: ["openDirectory"],
  });

  if (canceled) return null;

  return filePaths[0];
}
