const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectInputFolder: () => ipcRenderer.invoke('select-input-folder'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  processImages: (options) => ipcRenderer.invoke('process-images', options),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  onProgress: (callback) => ipcRenderer.on('progress', (event, data) => callback(data))
})
