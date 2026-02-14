const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const sharp = require('sharp')

try { require('electron-reloader')(module) } catch {}

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp']

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 650,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0f0f1a'
  })

  mainWindow.loadFile('index.html')
  // mainWindow.webContents.openDevTools()
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ── IPC Handlers ─────────────────────────────────────────

// Retorna o caminho da pasta Downloads do usuário
ipcMain.handle('get-downloads-path', () => {
  return app.getPath('downloads')
})

// Abre um arquivo no aplicativo padrão do SO
ipcMain.handle('open-file', async (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    await shell.openPath(filePath)
    return true
  }
  return false
})

// Abre uma pasta no Explorer
ipcMain.handle('open-folder', async (_event, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) {
    shell.openPath(folderPath)
    return true
  }
  return false
})

// Mostra item no Explorer (seleciona o arquivo)
ipcMain.handle('show-item-in-folder', async (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath)
    return true
  }
  return false
})

// Selecionar pasta de saída
ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  })
  return result.filePaths[0] || null
})

// Selecionar imagens via dialog
ipcMain.handle('select-images', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'] }
    ]
  })
  if (result.canceled) return []
  return result.filePaths.map(fp => ({
    path: fp,
    name: path.basename(fp),
    size: fs.statSync(fp).size
  }))
})

// Selecionar pasta e retornar imagens nela
ipcMain.handle('select-folder-images', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return { folder: null, images: [] }
  const folder = result.filePaths[0]
  const images = getImagesFromFolder(folder).map(fp => ({
    path: fp,
    name: path.basename(fp),
    size: fs.statSync(fp).size,
    relativePath: path.relative(folder, fp)
  }))
  return { folder, images }
})

// Recebe array de paths (arquivos e/ou pastas) → retorna lista de imagens
ipcMain.handle('resolve-dropped-paths', async (_event, paths) => {
  const images = []
  const sourceFolders = []

  for (const p of paths) {
    try {
      const stat = fs.statSync(p)
      if (stat.isDirectory()) {
        sourceFolders.push(p)
        const found = getImagesFromFolder(p)
        for (const fp of found) {
          images.push({
            path: fp,
            name: path.basename(fp),
            size: fs.statSync(fp).size,
            relativePath: path.relative(p, fp),
            sourceFolder: p
          })
        }
      } else {
        const ext = path.extname(p).toLowerCase()
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          images.push({
            path: p,
            name: path.basename(p),
            size: stat.size,
            relativePath: path.basename(p),
            sourceFolder: path.dirname(p)
          })
        }
      }
    } catch (err) {
      // ignora arquivos inacessíveis
    }
  }

  return { images, sourceFolders }
})

// Gera thumbnail base64 de uma imagem (150×150)
ipcMain.handle('get-thumbnail', async (_event, imagePath) => {
  try {
    const buffer = await sharp(imagePath)
      .resize(150, 150, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 60 })
      .toBuffer()
    return 'data:image/jpeg;base64,' + buffer.toString('base64')
  } catch {
    return null
  }
})

// Gera imagem maior para comparação (max 1200px)
ipcMain.handle('get-full-image', async (_event, imagePath) => {
  try {
    const meta = await sharp(imagePath).metadata()
    const maxDim = 1200
    const resizeOpts = {}
    if (meta.width > maxDim || meta.height > maxDim) {
      resizeOpts.width = maxDim
      resizeOpts.height = maxDim
      resizeOpts.fit = 'inside'
    }
    const buffer = await sharp(imagePath)
      .resize(resizeOpts.width ? resizeOpts : undefined)
      .jpeg({ quality: 90 })
      .toBuffer()
    return 'data:image/jpeg;base64,' + buffer.toString('base64')
  } catch {
    return null
  }
})

// ── Processar imagens ────────────────────────────────────
ipcMain.handle('process-images', async (_event, options) => {
  const { files, outputFolder, format, maxSize, quality, keepStructure } = options

  try {
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true })
    }

    const results = []

    for (let i = 0; i < files.length; i++) {
      const fileInfo = files[i]
      const imagePath = fileInfo.path
      const sourceFolder = fileInfo.sourceFolder || path.dirname(imagePath)
      const result = await processImage(imagePath, sourceFolder, outputFolder, format, maxSize, quality, keepStructure)
      results.push(result)

      mainWindow.webContents.send('progress', {
        current: i + 1,
        total: files.length,
        file: result.fileName,
        filePath: imagePath,
        result
      })
    }

    return { success: true, results }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// ── Helpers ──────────────────────────────────────────────

function getImagesFromFolder(folder, resultado = []) {
  try {
    const arquivos = fs.readdirSync(folder)
    for (const arquivo of arquivos) {
      const caminho = path.join(folder, arquivo)
      try {
        const stat = fs.statSync(caminho)
        if (stat.isDirectory()) {
          getImagesFromFolder(caminho, resultado)
        } else {
          const ext = path.extname(arquivo).toLowerCase()
          if (SUPPORTED_EXTENSIONS.includes(ext)) {
            resultado.push(caminho)
          }
        }
      } catch { /* skip inaccessible */ }
    }
  } catch { /* skip inaccessible folder */ }
  return resultado
}

async function processImage(imagePath, sourceFolder, outputFolder, format, maxSize, quality, keepStructure) {
  const fileName = path.basename(imagePath)
  const nameWithoutExt = path.parse(fileName).name
  const originalExt = path.extname(fileName).toLowerCase()

  let outputExt = originalExt
  if (format === 'webp') outputExt = '.webp'
  else if (format === 'jpg') outputExt = '.jpg'
  else if (format === 'png') outputExt = '.png'

  let finalOutputFolder = outputFolder
  if (keepStructure) {
    const relativePath = path.relative(sourceFolder, path.dirname(imagePath))
    if (relativePath && relativePath !== '.') {
      finalOutputFolder = path.join(outputFolder, relativePath)
      if (!fs.existsSync(finalOutputFolder)) {
        fs.mkdirSync(finalOutputFolder, { recursive: true })
      }
    }
  }

  const outputPath = path.join(finalOutputFolder, nameWithoutExt + outputExt)
  const originalSize = fs.statSync(imagePath).size

  try {
    const metadata = await sharp(imagePath).metadata()
    let { width, height } = metadata

    let needsResize = false
    if (maxSize && (width > maxSize || height > maxSize)) {
      needsResize = true
      if (width > height) {
        height = Math.round((maxSize / width) * height)
        width = maxSize
      } else {
        width = Math.round((maxSize / height) * width)
        height = maxSize
      }
    }

    let inst = sharp(imagePath)
    if (needsResize) inst = inst.resize(width, height)

    if (format === 'webp') {
      inst = inst.webp({ effort: 6, lossless: false, quality: quality || 90, smartSubsample: true })
    } else if (format === 'jpg') {
      inst = inst.jpeg({ quality: quality || 90 })
    } else if (format === 'png') {
      inst = inst.png({ compressionLevel: 9 })
    } else {
      if (originalExt === '.webp') inst = inst.webp({ quality: quality || 90 })
      else if (['.jpg', '.jpeg'].includes(originalExt)) inst = inst.jpeg({ quality: quality || 90 })
      else if (originalExt === '.png') inst = inst.png({ compressionLevel: 9 })
    }

    await inst.toFile(outputPath)

    const convertedSize = fs.statSync(outputPath).size

    return {
      fileName,
      inputPath: imagePath,
      outputPath,
      outputFileName: nameWithoutExt + outputExt,
      originalSize,
      convertedSize,
      saved: originalSize - convertedSize,
      savedPercent: ((originalSize - convertedSize) / originalSize * 100).toFixed(2),
      resized: needsResize,
      newWidth: width,
      newHeight: height,
      success: true
    }
  } catch (error) {
    return {
      fileName,
      inputPath: imagePath,
      outputPath: null,
      success: false,
      error: error.message
    }
  }
}
