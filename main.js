const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const sharp = require('sharp')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#1a1a2e'
  })

  mainWindow.loadFile('index.html')
  
  // Descomente para abrir DevTools
  // mainWindow.webContents.openDevTools()
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Handler para abrir pasta no Explorer
ipcMain.handle('open-folder', async (event, folderPath) => {
  const { shell } = require('electron')
  if (folderPath && fs.existsSync(folderPath)) {
    shell.openPath(folderPath)
    return true
  }
  return false
})

// Handler para selecionar pasta de entrada
ipcMain.handle('select-input-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  return result.filePaths[0] || null
})

// Handler para selecionar pasta de saída
ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  })
  return result.filePaths[0] || null
})

// Handler para processar imagens
ipcMain.handle('process-images', async (event, options) => {
  const { inputFolder, outputFolder, format, maxSize, quality } = options
  
  try {
    // Criar pasta de saída se não existir
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true })
    }

    const images = getImagesFromFolder(inputFolder)
    const results = []
    
    for (let i = 0; i < images.length; i++) {
      const imagePath = images[i]
      const result = await processImage(imagePath, outputFolder, format, maxSize, quality)
      results.push(result)
      
      // Enviar progresso
      mainWindow.webContents.send('progress', {
        current: i + 1,
        total: images.length,
        file: result.fileName
      })
    }
    
    return { success: true, results }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

function getImagesFromFolder(folder, resultado = []) {
  const arquivos = fs.readdirSync(folder)
  
  arquivos.forEach(arquivo => {
    const caminho = path.join(folder, arquivo)
    const stat = fs.statSync(caminho)
    
    if (stat && stat.isDirectory()) {
      getImagesFromFolder(caminho, resultado)
    } else {
      const ext = path.extname(arquivo).toLowerCase()
      if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'].includes(ext)) {
        resultado.push(caminho)
      }
    }
  })
  
  return resultado
}

async function processImage(imagePath, outputFolder, format, maxSize, quality) {
  const fileName = path.basename(imagePath)
  const nameWithoutExt = path.parse(fileName).name
  const originalExt = path.extname(fileName).toLowerCase()
  
  // Determinar extensão de saída
  let outputExt = originalExt
  if (format === 'webp') {
    outputExt = '.webp'
  } else if (format === 'jpg') {
    outputExt = '.jpg'
  } else if (format === 'png') {
    outputExt = '.png'
  }
  // format === 'original' mantém a extensão original
  
  const outputPath = path.join(outputFolder, nameWithoutExt + outputExt)
  
  // Obter tamanho original
  const statsOriginal = fs.statSync(imagePath)
  const originalSize = statsOriginal.size
  
  try {
    const metadata = await sharp(imagePath).metadata()
    let { width, height } = metadata
    
    // Redimensionar se necessário
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
    
    let sharpInstance = sharp(imagePath)
    
    if (needsResize) {
      sharpInstance = sharpInstance.resize(width, height)
    }
    
    // Aplicar formato
    if (format === 'webp') {
      sharpInstance = sharpInstance.webp({ 
        effort: 6, 
        lossless: false, 
        quality: quality || 90,
        smartSubsample: true 
      })
    } else if (format === 'jpg') {
      sharpInstance = sharpInstance.jpeg({ quality: quality || 90 })
    } else if (format === 'png') {
      sharpInstance = sharpInstance.png({ compressionLevel: 9 })
    } else {
      // Manter formato original
      if (originalExt === '.webp') {
        sharpInstance = sharpInstance.webp({ quality: quality || 90 })
      } else if (originalExt === '.jpg' || originalExt === '.jpeg') {
        sharpInstance = sharpInstance.jpeg({ quality: quality || 90 })
      } else if (originalExt === '.png') {
        sharpInstance = sharpInstance.png({ compressionLevel: 9 })
      }
    }
    
    await sharpInstance.toFile(outputPath)
    
    // Obter tamanho do arquivo convertido
    const statsConverted = fs.statSync(outputPath)
    const convertedSize = statsConverted.size
    
    return {
      fileName,
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
      success: false,
      error: error.message
    }
  }
}
