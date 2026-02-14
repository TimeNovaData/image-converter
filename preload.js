const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Pastas
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),

  // Arquivos
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  selectImages: () => ipcRenderer.invoke('select-images'),
  selectFolderImages: () => ipcRenderer.invoke('select-folder-images'),

  // Drag & drop
  resolveDroppedPaths: (paths) => ipcRenderer.invoke('resolve-dropped-paths', paths),

  // Thumbnails
  getThumbnail: (imagePath) => ipcRenderer.invoke('get-thumbnail', imagePath),
  getFullImage: (imagePath) => ipcRenderer.invoke('get-full-image', imagePath),

  // Conversão
  processImages: (options) => ipcRenderer.invoke('process-images', options),
  onProgress: (callback) => {
    ipcRenderer.removeAllListeners('progress')
    ipcRenderer.on('progress', (_event, data) => callback(data))
  }
})
