// Elementos do DOM
const inputFolderEl = document.getElementById('inputFolder')
const outputFolderEl = document.getElementById('outputFolder')
const btnSelectInput = document.getElementById('btnSelectInput')
const btnSelectOutput = document.getElementById('btnSelectOutput')
const btnOpenInput = document.getElementById('btnOpenInput')
const btnOpenOutput = document.getElementById('btnOpenOutput')
const btnConvert = document.getElementById('btnConvert')
const formatEl = document.getElementById('format')
const maxSizeEl = document.getElementById('maxSize')
const customSizeEl = document.getElementById('customSize')
const qualityEl = document.getElementById('quality')
const qualityValueEl = document.getElementById('qualityValue')
const keepStructureEl = document.getElementById('keepStructure')
const progressSection = document.getElementById('progressSection')
const progressFill = document.getElementById('progressFill')
const progressText = document.getElementById('progressText')
const resultsSection = document.getElementById('resultsSection')
const resultsBody = document.getElementById('resultsBody')
const summaryEl = document.getElementById('summary')

// Estado
let inputFolder = ''
let outputFolder = ''

// Event Listeners
btnSelectInput.addEventListener('click', async () => {
  const folder = await window.electronAPI.selectInputFolder()
  if (folder) {
    inputFolder = folder
    inputFolderEl.value = folder
    btnOpenInput.disabled = false
    checkCanConvert()
  }
})

btnSelectOutput.addEventListener('click', async () => {
  const folder = await window.electronAPI.selectOutputFolder()
  if (folder) {
    outputFolder = folder
    outputFolderEl.value = folder
    btnOpenOutput.disabled = false
    checkCanConvert()
  }
})

// Abrir pastas no Explorer
btnOpenInput.addEventListener('click', () => {
  if (inputFolder) window.electronAPI.openFolder(inputFolder)
})

btnOpenOutput.addEventListener('click', () => {
  if (outputFolder) window.electronAPI.openFolder(outputFolder)
})

// Tamanho personalizado
maxSizeEl.addEventListener('change', () => {
  if (maxSizeEl.value === 'custom') {
    customSizeEl.style.display = 'block'
    customSizeEl.focus()
  } else {
    customSizeEl.style.display = 'none'
  }
})

qualityEl.addEventListener('input', () => {
  qualityValueEl.textContent = qualityEl.value
})

btnConvert.addEventListener('click', startConversion)

// Verificar se pode converter
function checkCanConvert() {
  btnConvert.disabled = !(inputFolder && outputFolder)
}

// Iniciar conversão
async function startConversion() {
  btnConvert.disabled = true
  btnConvert.innerHTML = '<span class="loading"></span> Processando...'
  
  progressSection.style.display = 'block'
  resultsSection.style.display = 'none'
  progressFill.style.width = '0%'
  progressText.textContent = 'Iniciando conversão...'
  
  // Determinar tamanho máximo
  let maxSize = null
  if (maxSizeEl.value === 'custom') {
    maxSize = customSizeEl.value ? parseInt(customSizeEl.value) : null
  } else if (maxSizeEl.value) {
    maxSize = parseInt(maxSizeEl.value)
  }

  const options = {
    inputFolder,
    outputFolder,
    format: formatEl.value,
    maxSize,
    quality: parseInt(qualityEl.value),
    keepStructure: keepStructureEl.checked
  }
  
  try {
    const result = await window.electronAPI.processImages(options)
    
    if (result.success) {
      showResults(result.results)
    } else {
      alert('Erro ao processar imagens: ' + result.error)
    }
  } catch (error) {
    alert('Erro: ' + error.message)
  } finally {
    btnConvert.disabled = false
    btnConvert.innerHTML = '🚀 Converter Imagens'
  }
}

// Listener de progresso
window.electronAPI.onProgress((data) => {
  const percent = (data.current / data.total) * 100
  progressFill.style.width = `${percent}%`
  progressText.textContent = `Processando ${data.current}/${data.total}: ${data.file}`
})

// Mostrar resultados
function showResults(results) {
  progressSection.style.display = 'none'
  resultsSection.style.display = 'block'
  
  // Calcular estatísticas
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  const totalOriginal = successful.reduce((sum, r) => sum + r.originalSize, 0)
  const totalConverted = successful.reduce((sum, r) => sum + r.convertedSize, 0)
  const totalSaved = totalOriginal - totalConverted
  const percentSaved = totalOriginal > 0 ? ((totalSaved / totalOriginal) * 100).toFixed(1) : 0
  
  // Mostrar sumário
  summaryEl.innerHTML = `
    <div class="summary-item">
      <div class="value">${results.length}</div>
      <div class="label">Total de Imagens</div>
    </div>
    <div class="summary-item">
      <div class="value" style="color: var(--success)">${successful.length}</div>
      <div class="label">Convertidas</div>
    </div>
    <div class="summary-item">
      <div class="value" style="color: var(--error)">${failed.length}</div>
      <div class="label">Erros</div>
    </div>
    <div class="summary-item">
      <div class="value">${formatBytes(totalOriginal)}</div>
      <div class="label">Tamanho Original</div>
    </div>
    <div class="summary-item">
      <div class="value">${formatBytes(totalConverted)}</div>
      <div class="label">Tamanho Final</div>
    </div>
    <div class="summary-item">
      <div class="value ${totalSaved >= 0 ? 'saved-positive' : 'saved-negative'}">
        ${totalSaved >= 0 ? '-' : '+'}${formatBytes(Math.abs(totalSaved))} (${percentSaved}%)
      </div>
      <div class="label">Economia</div>
    </div>
  `
  
  // Mostrar tabela de resultados
  resultsBody.innerHTML = results.map(r => {
    if (r.success) {
      const savedClass = r.saved >= 0 ? 'saved-positive' : 'saved-negative'
      const savedSign = r.saved >= 0 ? '-' : '+'
      return `
        <tr>
          <td title="${r.fileName}">${truncate(r.outputFileName, 30)}</td>
          <td>${formatBytes(r.originalSize)}</td>
          <td>${formatBytes(r.convertedSize)}</td>
          <td class="${savedClass}">${savedSign}${formatBytes(Math.abs(r.saved))} (${Math.abs(r.savedPercent)}%)</td>
          <td class="status-success">✅ ${r.resized ? `Redimensionado` : 'OK'}</td>
        </tr>
      `
    } else {
      return `
        <tr>
          <td title="${r.fileName}">${truncate(r.fileName, 30)}</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
          <td class="status-error">❌ ${r.error}</td>
        </tr>
      `
    }
  }).join('')
}

// Utilitários
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = Math.abs(bytes)
  let unit = 0
  
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  
  return size.toFixed(2) + ' ' + units[unit]
}

function truncate(str, length) {
  if (str.length <= length) return str
  return str.substring(0, length - 3) + '...'
}
