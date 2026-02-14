// ═══════════════════════════════════════════════════════
//  Image Converter — Renderer
// ═══════════════════════════════════════════════════════

// ── DOM refs ─────────────────────────────────────────
const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

const dropZone = $('#dropZone')
const dragOverlay = $('#dragOverlay')
const imageListWrapper = $('#imageListWrapper')
const imageList = $('#imageList')
const imageCountBadge = $('#imageCount')
const selectionInfo = $('#selectionInfo')

const btnAddImages = $('#btnAddImages')
const btnAddFolder = $('#btnAddFolder')
const btnAddMore = $('#btnAddMore')
const btnClearAll = $('#btnClearAll')
const btnRemoveConverted = $('#btnRemoveConverted')
const btnConvert = $('#btnConvert')
const btnSelectOutput = $('#btnSelectOutput')
const btnOpenOutput = $('#btnOpenOutput')
const btnOpenOutputBar = $('#btnOpenOutputBar')

const outputFolderEl = $('#outputFolder')
const formatEl = $('#format')
const maxSizeEl = $('#maxSize')
const customSizeEl = $('#customSize')
const qualityEl = $('#quality')
const qualityValueEl = $('#qualityValue')
const keepStructureEl = $('#keepStructure')

const globalProgress = $('#globalProgress')
const globalProgressFill = $('#globalProgressFill')
const globalProgressText = $('#globalProgressText')

const summaryPanel = $('#summaryPanel')
const summaryContent = $('#summaryContent')

const toastContainer = $('#toastContainer')

// ── State ────────────────────────────────────────────
let outputFolder = ''
let images = [] // { id, path, name, size, sourceFolder, relativePath, status, result, thumbLoaded }
let nextId = 1
let isConverting = false

// ── Init ─────────────────────────────────────────────
async function init() {
  // Set Downloads as default output
  try {
    outputFolder = await window.electronAPI.getDownloadsPath()
    outputFolderEl.value = outputFolder
  } catch { /* fallback: empty */ }

  setupEvents()
}

init()

// ── Event Setup ──────────────────────────────────────
function setupEvents() {
  // Drag & drop on entire body
  let dragCounter = 0
  document.body.addEventListener('dragenter', (e) => {
    e.preventDefault()
    dragCounter++
    dragOverlay.classList.add('active')
  })
  document.body.addEventListener('dragleave', (e) => {
    e.preventDefault()
    dragCounter--
    if (dragCounter <= 0) {
      dragCounter = 0
      dragOverlay.classList.remove('active')
    }
  })
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  })
  document.body.addEventListener('drop', async (e) => {
    e.preventDefault()
    dragCounter = 0
    dragOverlay.classList.remove('active')

    const paths = []
    for (const file of e.dataTransfer.files) {
      if (file.path) paths.push(file.path)
    }
    if (paths.length === 0) return

    const { images: found } = await window.electronAPI.resolveDroppedPaths(paths)
    addImages(found)
  })

  // Also allow drop directly on the drop zone
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropZone.classList.add('drag-hover')
  })
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-hover')
  })
  dropZone.addEventListener('drop', () => {
    dropZone.classList.remove('drag-hover')
  })

  // Add images via dialog
  btnAddImages.addEventListener('click', async () => {
    const found = await window.electronAPI.selectImages()
    if (found.length) addImages(found)
  })

  // Add more images (toolbar button)
  btnAddMore.addEventListener('click', async () => {
    const found = await window.electronAPI.selectImages()
    if (found.length) addImages(found)
  })

  // Add folder via dialog
  btnAddFolder.addEventListener('click', async () => {
    const { folder, images: found } = await window.electronAPI.selectFolderImages()
    if (found.length) addImages(found)
  })

  // Output folder
  btnSelectOutput.addEventListener('click', async () => {
    const folder = await window.electronAPI.selectOutputFolder()
    if (folder) {
      outputFolder = folder
      outputFolderEl.value = folder
    }
  })

  btnOpenOutput.addEventListener('click', () => {
    if (outputFolder) window.electronAPI.openFolder(outputFolder)
  })

  btnOpenOutputBar.addEventListener('click', () => {
    if (outputFolder) window.electronAPI.openFolder(outputFolder)
  })

  // Clear / remove
  btnClearAll.addEventListener('click', () => {
    images = []
    nextId = 1
    renderAll()
    summaryPanel.style.display = 'none'
    btnRemoveConverted.style.display = 'none'
    toast('Lista limpa', 'info')
  })

  btnRemoveConverted.addEventListener('click', () => {
    const count = images.filter(img => img.status === 'success').length
    if (count === 0) return
    showConfirm(
      'Remover convertidas?',
      `${count} imagem(ns) convertida(s) serão removidas da lista (os arquivos não serão deletados).`,
      'Remover',
      () => {
        images = images.filter(img => img.status !== 'success')
        renderAll()
        toast(`${count} imagem(ns) removida(s)`, 'info')
        if (!images.some(img => img.status === 'success')) {
          btnRemoveConverted.style.display = 'none'
        }
      }
    )
  })

  // Options
  maxSizeEl.addEventListener('change', () => {
    customSizeEl.style.display = maxSizeEl.value === 'custom' ? 'block' : 'none'
    if (maxSizeEl.value === 'custom') customSizeEl.focus()
  })

  qualityEl.addEventListener('input', () => {
    qualityValueEl.textContent = qualityEl.value
  })

  // Convert
  btnConvert.addEventListener('click', startConversion)

  // Progress listener
  window.electronAPI.onProgress((data) => {
    const { current, total, filePath, result } = data
    const pct = (current / total) * 100

    globalProgressFill.style.width = `${pct}%`
    globalProgressText.textContent = `${current}/${total} — ${data.file}`

    // Update the specific card
    const img = images.find(i => i.path === filePath)
    if (img && result) {
      img.status = result.success ? 'success' : 'error'
      img.result = result
      updateCard(img)
    }
  })
}

// ── Add images to state ──────────────────────────────
function addImages(found) {
  let added = 0
  for (const f of found) {
    // Dedupe by path
    if (images.some(i => i.path === f.path)) continue
    images.push({
      id: nextId++,
      path: f.path,
      name: f.name,
      size: f.size,
      sourceFolder: f.sourceFolder || '',
      relativePath: f.relativePath || f.name,
      status: 'pending', // pending | success | error
      result: null,
      thumbLoaded: false
    })
    added++
  }

  if (added === 0) {
    toast('Imagens já estão na lista', 'info')
    return
  }

  toast(`${added} imagem(ns) adicionada(s)`, 'success')
  renderAll()
}

// ── Render ───────────────────────────────────────────
function renderAll() {
  const hasImages = images.length > 0

  dropZone.style.display = hasImages ? 'none' : 'flex'
  imageListWrapper.style.display = hasImages ? 'flex' : 'none'

  imageCountBadge.textContent = `${images.length} imagem${images.length !== 1 ? 's' : ''}`
  updateSelectionInfo()
  updateConvertButton()

  // Rebuild list
  imageList.innerHTML = ''
  for (const img of images) {
    imageList.appendChild(createCard(img))
  }

  // Lazy-load thumbnails
  loadThumbnails()
}

function updateSelectionInfo() {
  if (images.length === 0) {
    selectionInfo.textContent = 'Nenhuma imagem adicionada'
  } else {
    const totalSize = images.reduce((s, i) => s + i.size, 0)
    selectionInfo.textContent = `${images.length} imagem${images.length !== 1 ? 's' : ''} · ${formatBytes(totalSize)}`
  }
}

function updateConvertButton() {
  const pendingCount = images.filter(i => i.status === 'pending').length
  btnConvert.disabled = pendingCount === 0 || !outputFolder || isConverting
}

// ── Card creation ────────────────────────────────────
function createCard(img) {
  const card = document.createElement('div')
  card.className = 'image-card'
  card.dataset.id = img.id
  if (img.status === 'success') card.classList.add('converted')
  if (img.status === 'error') card.classList.add('error')

  // Thumbnail
  const thumb = document.createElement('div')
  thumb.className = 'card-thumb'
  if (img.thumbLoaded && img.thumbSrc) {
    thumb.innerHTML = `<img src="${img.thumbSrc}" alt="">`
  } else {
    thumb.innerHTML = '<div class="skeleton"></div>'
  }
  if (img.status === 'success' && img.result?.outputPath) {
    thumb.style.cursor = 'pointer'
    thumb.dataset.tooltip = 'Comparar antes/depois'
    thumb.addEventListener('click', (e) => {
      e.stopPropagation()
      openCompare(img)
    })
  }

  // Info
  const info = document.createElement('div')
  info.className = 'card-info'

  const nameEl = document.createElement('div')
  nameEl.className = 'card-name'
  nameEl.textContent = img.name
  nameEl.dataset.tooltip = img.path
  nameEl.dataset.tooltipPos = 'bottom'

  const meta = document.createElement('div')
  meta.className = 'card-meta'
  meta.innerHTML = `<span>${formatBytes(img.size)}</span>`

  if (img.status === 'success' && img.result) {
    const r = img.result
    meta.innerHTML += ` → <span>${formatBytes(r.convertedSize)}</span>`
    const saving = r.saved
    const pct = Math.abs(parseFloat(r.savedPercent))
    const cls = saving >= 0 ? 'card-savings' : 'card-savings negative'
    const sign = saving >= 0 ? '-' : '+'
    meta.innerHTML += ` <span class="${cls}">${sign}${pct}%</span>`
  }

  info.appendChild(nameEl)
  info.appendChild(meta)

  // Status badge
  const status = document.createElement('div')
  status.className = 'card-status'
  if (img.status === 'pending') {
    status.classList.add('pending')
    status.textContent = 'Pendente'
  } else if (img.status === 'success') {
    status.classList.add('success')
    status.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px">check_circle</span> Convertido'
  } else {
    status.classList.add('fail')
    status.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px">error</span> Erro'
    status.dataset.tooltip = img.result?.error || ''
  }

  // Actions
  const actions = document.createElement('div')
  actions.className = 'card-actions'

  // Open converted image
  if (img.status === 'success' && img.result?.outputPath) {
    const btnCompare = createTinyBtn('compare', 'Comparar antes/depois', () => {
      openCompare(img)
    })
    const btnOpen = createTinyBtn('description', 'Abrir imagem', () => {
      window.electronAPI.openFile(img.result.outputPath)
    })
    const btnFolder = createTinyBtn('folder_open', 'Abrir pasta', () => {
      window.electronAPI.showItemInFolder(img.result.outputPath)
    })
    actions.appendChild(btnCompare)
    actions.appendChild(btnOpen)
    actions.appendChild(btnFolder)
  }

  // Remove button
  const btnRemove = createTinyBtn('close', 'Remover da lista', () => {
    images = images.filter(i => i.id !== img.id)
    renderAll()
  })
  btnRemove.classList.add('danger')
  actions.appendChild(btnRemove)

  card.appendChild(thumb)
  card.appendChild(info)
  card.appendChild(status)
  card.appendChild(actions)

  return card
}

function createTinyBtn(iconName, tooltipText, onClick) {
  const btn = document.createElement('button')
  btn.className = 'btn-tiny'
  btn.innerHTML = `<span class="material-symbols-rounded">${iconName}</span>`
  btn.dataset.tooltip = tooltipText
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })
  return btn
}

// ── Update a single card in-place ────────────────────
function updateCard(img) {
  const existing = imageList.querySelector(`[data-id="${img.id}"]`)
  if (!existing) return
  const newCard = createCard(img)
  // Preserve thumb if already loaded
  existing.replaceWith(newCard)
  if (img.status === 'success') {
    newCard.classList.add('converted-pulse')
  }
  updateSelectionInfo()
  updateConvertButton()
}

// ── Thumbnails async ─────────────────────────────────
async function loadThumbnails() {
  for (const img of images) {
    if (img.thumbLoaded) continue
    img.thumbLoaded = true

    // Don't await — fire and forget per thumb
    window.electronAPI.getThumbnail(img.path).then(src => {
      if (src) {
        img.thumbSrc = src
        const card = imageList.querySelector(`[data-id="${img.id}"]`)
        if (card) {
          const thumbEl = card.querySelector('.card-thumb')
          thumbEl.innerHTML = `<img src="${src}" alt="">`
        }
      }
    }).catch(() => {})
  }
}

// ── Conversion ───────────────────────────────────────
async function startConversion() {
  if (isConverting) return

  const pendingImages = images.filter(i => i.status === 'pending')
  if (pendingImages.length === 0) return
  if (!outputFolder) {
    toast('Selecione uma pasta de saída', 'error')
    return
  }

  isConverting = true
  btnConvert.disabled = true
  btnConvert.innerHTML = '<span class="loading"></span> Convertendo...'

  globalProgress.style.display = 'flex'
  globalProgressFill.style.width = '0%'
  globalProgressText.textContent = 'Iniciando...'
  summaryPanel.style.display = 'none'

  // Determine max size
  let maxSize = null
  if (maxSizeEl.value === 'custom') {
    maxSize = customSizeEl.value ? parseInt(customSizeEl.value) : null
  } else if (maxSizeEl.value) {
    maxSize = parseInt(maxSizeEl.value)
  }

  const options = {
    files: pendingImages.map(i => ({
      path: i.path,
      sourceFolder: i.sourceFolder
    })),
    outputFolder,
    format: formatEl.value,
    maxSize,
    quality: parseInt(qualityEl.value),
    keepStructure: keepStructureEl.checked
  }

  try {
    const result = await window.electronAPI.processImages(options)

    if (result.success) {
      showSummary(result.results)
      const successCount = result.results.filter(r => r.success).length
      toast(`${successCount} imagem(ns) convertida(s) com sucesso!`, 'success')
      btnRemoveConverted.style.display = 'inline-flex'
    } else {
      toast('Erro ao processar: ' + result.error, 'error')
    }
  } catch (error) {
    toast('Erro: ' + error.message, 'error')
  } finally {
    isConverting = false
    btnConvert.disabled = false
    btnConvert.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      Converter
    `
    globalProgress.style.display = 'none'
    updateConvertButton()
  }
}

// ── Summary ──────────────────────────────────────────
function showSummary(results) {
  const ok = results.filter(r => r.success)
  const fail = results.filter(r => !r.success)
  const totalOrig = ok.reduce((s, r) => s + r.originalSize, 0)
  const totalConv = ok.reduce((s, r) => s + r.convertedSize, 0)
  const saved = totalOrig - totalConv
  const pct = totalOrig > 0 ? ((saved / totalOrig) * 100).toFixed(1) : 0

  summaryPanel.style.display = 'block'
  summaryContent.innerHTML = `
    <div class="summary-row"><span class="label">Convertidas</span><span class="value green">${ok.length}</span></div>
    ${fail.length ? `<div class="summary-row"><span class="label">Erros</span><span class="value red">${fail.length}</span></div>` : ''}
    <div class="summary-row"><span class="label">Tamanho original</span><span class="value">${formatBytes(totalOrig)}</span></div>
    <div class="summary-row"><span class="label">Tamanho final</span><span class="value">${formatBytes(totalConv)}</span></div>
    <div class="summary-row"><span class="label">Economia</span><span class="value ${saved >= 0 ? 'green' : 'red'}">${saved >= 0 ? '-' : '+'}${formatBytes(Math.abs(saved))} (${pct}%)</span></div>
  `
}

// ── Confirm Modal ────────────────────────────────────
function showConfirm(title, message, okText, onConfirm) {
  const modal = $('#confirmModal')
  const titleEl = $('#confirmTitle')
  const msgEl = $('#confirmMessage')
  const btnOk = $('#confirmOk')
  const btnCancel = $('#confirmCancel')

  titleEl.textContent = title
  msgEl.textContent = message
  btnOk.textContent = okText
  modal.style.display = 'flex'

  function close() {
    modal.style.display = 'none'
    btnOk.removeEventListener('click', handleOk)
    btnCancel.removeEventListener('click', close)
    modal.removeEventListener('click', handleBackdrop)
    document.removeEventListener('keydown', handleEsc)
  }

  function handleOk() {
    close()
    onConfirm()
  }

  function handleBackdrop(e) {
    if (e.target === modal) close()
  }

  function handleEsc(e) {
    if (e.key === 'Escape') close()
  }

  btnOk.addEventListener('click', handleOk)
  btnCancel.addEventListener('click', close)
  modal.addEventListener('click', handleBackdrop)
  document.addEventListener('keydown', handleEsc)

  btnCancel.focus()
}

// ── Toast ────────────────────────────────────────────
function toast(message, type = 'info') {
  const icons = { success: 'check_circle', error: 'error', info: 'info' }
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.innerHTML = `<span class="material-symbols-rounded toast-icon">${icons[type] || 'info'}</span><span>${message}</span>`
  toastContainer.appendChild(el)

  setTimeout(() => {
    el.remove()
  }, 3500)
}

// ── Resize Handle ────────────────────────────────────
;(function initResize() {
  const handle = document.getElementById('resizeHandle')
  const panel = document.getElementById('panelOptions')
  if (!handle || !panel) return

  let isResizing = false
  let startX = 0
  let startWidth = 0

  handle.addEventListener('mousedown', (e) => {
    isResizing = true
    startX = e.clientX
    startWidth = panel.offsetWidth
    handle.classList.add('active')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return
    const diff = startX - e.clientX
    const newWidth = Math.min(500, Math.max(220, startWidth + diff))
    panel.style.width = newWidth + 'px'
  })

  document.addEventListener('mouseup', () => {
    if (!isResizing) return
    isResizing = false
    handle.classList.remove('active')
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })
})()

// ── Compare Modal ────────────────────────────────────
;(function initCompareModal() {
  const overlay = document.getElementById('compareModal')
  const container = document.getElementById('compareContainer')
  const loading = document.getElementById('compareLoading')
  const beforeDiv = document.getElementById('compareBefore')
  const beforeImg = document.getElementById('compareBeforeImg')
  const afterImg = document.getElementById('compareAfter')
  const slider = document.getElementById('compareSlider')
  const closeBtn = document.getElementById('compareClose')
  const titleEl = document.getElementById('compareTitle')
  const origSizeEl = document.getElementById('compareOrigSize')
  const convSizeEl = document.getElementById('compareConvSize')
  const savingsEl = document.getElementById('compareSavings')
  const zoomInBtn = document.getElementById('compareZoomIn')
  const zoomOutBtn = document.getElementById('compareZoomOut')
  const zoomResetBtn = document.getElementById('compareZoomReset')
  const zoomLevelEl = document.getElementById('compareZoomLevel')

  if (!overlay) return

  let isDragging = false
  let sliderPct = 50
  let zoom = 1
  let panX = 0
  let panY = 0
  let isPanning = false
  let panStartX = 0
  let panStartY = 0
  let panStartPanX = 0
  let panStartPanY = 0
  let imgW = 0 // computed render width for both images
  let imgH = 0 // computed render height for both images
  const MIN_ZOOM = 0.5
  const MAX_ZOOM = 8

  function setSlider(pct) {
    sliderPct = Math.max(2, Math.min(98, pct))
    beforeDiv.style.width = sliderPct + '%'
    slider.style.left = sliderPct + '%'
  }

  function setZoom(newZoom, centerX, centerY) {
    const oldZoom = zoom
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
    zoomLevelEl.textContent = Math.round(zoom * 100) + '%'

    // Adjust pan so zoom centers on pointer position
    if (centerX !== undefined && centerY !== undefined) {
      const rect = container.getBoundingClientRect()
      const cx = centerX - rect.left - rect.width / 2
      const cy = centerY - rect.top - rect.height / 2
      panX = cx - (cx - panX) * (zoom / oldZoom)
      panY = cy - (cy - panY) * (zoom / oldZoom)
    }

    positionImages()
  }

  function resetZoom() {
    zoom = 1
    panX = 0
    panY = 0
    zoomLevelEl.textContent = '100%'
    positionImages()
  }

  function computeImageSize() {
    const rect = container.getBoundingClientRect()
    const cw = rect.width
    const ch = rect.height

    // Use the original image's natural aspect ratio as the reference
    const nw = beforeImg.naturalWidth || 1
    const nh = beforeImg.naturalHeight || 1
    const aspect = nw / nh

    // Fit to container
    if (cw / ch > aspect) {
      // Container is wider than image aspect — height is the constraint
      imgH = ch
      imgW = ch * aspect
    } else {
      // Container is taller — width is the constraint
      imgW = cw
      imgH = cw / aspect
    }
  }

  function positionImages() {
    const rect = container.getBoundingClientRect()
    const cw = rect.width
    const ch = rect.height

    // Center point with pan offset
    const cx = cw / 2 + panX
    const cy = ch / 2 + panY

    // Scaled dimensions
    const sw = imgW * zoom
    const sh = imgH * zoom

    // Top-left corner of the image in container coords
    const imgLeft = cx - sw / 2
    const imgTop = cy - sh / 2

    // After image: position absolutely in container
    afterImg.style.cssText = `position:absolute; width:${sw}px; height:${sh}px; left:${imgLeft}px; top:${imgTop}px;`

    // Before image: positioned in the .compare-before clip div
    // The clip div starts at left:0 and has width = sliderPct%
    // We need the image at the same visual position, so offset by -clipDiv.left (which is 0)
    // The image left in clip-div coords = imgLeft (since clip div left = 0)
    beforeImg.style.cssText = `position:absolute; width:${sw}px; height:${sh}px; left:${imgLeft}px; top:${imgTop}px;`

    container.style.cursor = zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'ew-resize'
  }

  container.addEventListener('mousedown', (e) => {
    if (zoom > 1 && !e.target.closest('.compare-slider-handle')) {
      // Pan mode when zoomed in
      isPanning = true
      panStartX = e.clientX
      panStartY = e.clientY
      panStartPanX = panX
      panStartPanY = panY
      container.style.cursor = 'grabbing'
      e.preventDefault()
      return
    }
    isDragging = true
    const rect = container.getBoundingClientRect()
    setSlider(((e.clientX - rect.left) / rect.width) * 100)
  })
  container.addEventListener('mousemove', (e) => {
    if (isPanning) {
      panX = panStartPanX + (e.clientX - panStartX)
      panY = panStartPanY + (e.clientY - panStartY)
      positionImages()
      return
    }
    if (!isDragging) return
    const rect = container.getBoundingClientRect()
    setSlider(((e.clientX - rect.left) / rect.width) * 100)
  })
  document.addEventListener('mouseup', () => {
    isDragging = false
    if (isPanning) {
      isPanning = false
      container.style.cursor = zoom > 1 ? 'grab' : 'ew-resize'
    }
  })

  // Wheel zoom
  container.addEventListener('wheel', (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setZoom(zoom * (1 + delta), e.clientX, e.clientY)
  }, { passive: false })

  // Touch support
  container.addEventListener('touchstart', (e) => {
    isDragging = true
    const rect = container.getBoundingClientRect()
    setSlider(((e.touches[0].clientX - rect.left) / rect.width) * 100)
  }, { passive: true })
  container.addEventListener('touchmove', (e) => {
    if (!isDragging) return
    const rect = container.getBoundingClientRect()
    setSlider(((e.touches[0].clientX - rect.left) / rect.width) * 100)
  }, { passive: true })
  container.addEventListener('touchend', () => { isDragging = false })

  closeBtn.addEventListener('click', closeCompare)
  zoomInBtn.addEventListener('click', () => setZoom(zoom * 1.3))
  zoomOutBtn.addEventListener('click', () => setZoom(zoom / 1.3))
  zoomResetBtn.addEventListener('click', resetZoom)
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCompare()
    if (e.key === '+' || e.key === '=') setZoom(zoom * 1.3)
    if (e.key === '-') setZoom(zoom / 1.3)
    if (e.key === '0') resetZoom()
  })

  function closeCompare() {
    overlay.style.display = 'none'
    beforeImg.src = ''
    afterImg.src = ''
    resetZoom()
  }

  window._openCompare = async function(img) {
    if (!img.result?.outputPath) return

    overlay.style.display = 'flex'
    overlay.focus()
    loading.style.display = 'flex'
    beforeImg.style.opacity = '0'
    afterImg.style.opacity = '0'

    titleEl.textContent = img.name
    origSizeEl.textContent = 'Original: ' + formatBytes(img.size)
    convSizeEl.textContent = 'Convertida: ' + formatBytes(img.result.convertedSize)
    const saving = img.result.saved
    const pct = Math.abs(parseFloat(img.result.savedPercent))
    const sign = saving >= 0 ? '-' : '+'
    savingsEl.textContent = sign + pct + '%'
    savingsEl.style.color = saving >= 0 ? 'var(--success)' : 'var(--error)'

    setSlider(50)
    resetZoom()

    try {
      const [origSrc, convSrc] = await Promise.all([
        window.electronAPI.getFullImage(img.path),
        window.electronAPI.getFullImage(img.result.outputPath)
      ])

      if (!origSrc || !convSrc) {
        toast('Não foi possível carregar as imagens para comparação', 'error')
        closeCompare()
        return
      }

      beforeImg.src = origSrc
      afterImg.src = convSrc

      // Wait for images to load before showing
      await Promise.all([
        new Promise(r => { beforeImg.onload = r }),
        new Promise(r => { afterImg.onload = r })
      ])

      loading.style.display = 'none'
      beforeImg.style.opacity = '1'
      afterImg.style.opacity = '1'

      computeImageSize()
      positionImages()
    } catch {
      toast('Erro ao carregar imagens', 'error')
      closeCompare()
    }
  }

  window.addEventListener('resize', () => {
    if (overlay.style.display !== 'none') {
      computeImageSize()
      positionImages()
    }
  })
})()

function openCompare(img) {
  if (window._openCompare) window._openCompare(img)
}

// ── Utils ────────────────────────────────────────────
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = Math.abs(bytes)
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  return size.toFixed(unit === 0 ? 0 : 2) + ' ' + units[unit]
}
