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
const btnCancelConversion = $('#btnCancelConversion')
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

const searchInput = $('#searchInput')
const sortSelect = $('#sortSelect')
const btnThemeToggle = $('#btnThemeToggle')
const themeDropdown = $('#themeDropdown')
const filePrefixEl = $('#filePrefix')
const fileSuffixEl = $('#fileSuffix')
const stripMetadataEl = $('#stripMetadata')

// ── State ────────────────────────────────────────────
let outputFolder = ''
let images = [] // { id, path, name, size, sourceFolder, relativePath, status, result, thumbLoaded }
let nextId = 1
let isConverting = false

// ── Theme helpers ────────────────────────────────────
function applyTheme(themeName) {
  if (themeName === 'nord') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', themeName)
  }
  localStorage.setItem('theme', themeName)
  // Update active state in dropdown
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === themeName)
  })
}

// ── Init ─────────────────────────────────────────────
async function init() {
  // Set Downloads as default output
  try {
    outputFolder = await window.electronAPI.getDownloadsPath()
    outputFolderEl.value = outputFolder
  } catch { /* fallback: empty */ }

  // Restore theme from localStorage
  const savedTheme = localStorage.getItem('theme') || 'nord'
  applyTheme(savedTheme)

  setupEvents()
}

init()

// ── Initialize Choices.js on selects ─────────────────
let choicesFormat, choicesMaxSize, choicesSort
if (typeof Choices !== 'undefined') {
  const choicesConfig = {
    searchEnabled: false,
    shouldSort: false,
    itemSelectText: '',
    placeholder: false,
    allowHTML: false,
  }

  if (formatEl) {
    choicesFormat = new Choices(formatEl, { ...choicesConfig })
  }
  if (maxSizeEl) {
    choicesMaxSize = new Choices(maxSizeEl, { ...choicesConfig })
  }
  if (sortSelect) {
    choicesSort = new Choices(sortSelect, { ...choicesConfig })
  }
}

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
    imagePathSet.clear()
    thumbQueue = []
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
        const removed = images.filter(img => img.status === 'success')
        removed.forEach(img => imagePathSet.delete(img.path))
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

  // Cancel conversion
  if (btnCancelConversion) {
    btnCancelConversion.addEventListener('click', async () => {
      if (isConverting) {
        await window.electronAPI.cancelConversion()
        toast('Conversão cancelada', 'info')
      }
    })
  }

  // Progress listener
  window.electronAPI.onProgress((data) => {
    if (data.cancelled) return

    const { current, total, filePath, result } = data
    const pct = (current / total) * 100

    globalProgressFill.style.width = `${pct}%`
    globalProgressText.textContent = `${current}/${total} — ${data.file}`

    // Update the specific card
    const img = images.find(i => i.path === filePath)
    if (img && result) {
      img.status = result.success ? 'success' : 'error'
      img.result = result
      // Remove converting class
      const card = imageList.querySelector(`[data-id="${img.id}"]`)
      if (card) card.classList.remove('converting')
      updateCard(img)
    }
  })

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', async (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return

    if (e.ctrlKey && e.key === 'v') {
      e.preventDefault()
      try {
        const clipImg = await window.electronAPI.pasteFromClipboard()
        if (clipImg) {
          addImages([clipImg])
          toast('Imagem colada da área de transferência', 'success')
        } else {
          toast('Nenhuma imagem na área de transferência', 'info')
        }
      } catch { toast('Erro ao colar imagem', 'error') }
    }

    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault()
      const found = await window.electronAPI.selectImages()
      if (found.length) addImages(found)
    }

    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault()
      startConversion()
    }
  })

  // ── Theme selector ──
  if (btnThemeToggle && themeDropdown) {
    btnThemeToggle.addEventListener('click', (e) => {
      e.stopPropagation()
      themeDropdown.classList.toggle('open')
    })
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        applyTheme(btn.dataset.theme)
        themeDropdown.classList.remove('open')
      })
    })
    document.addEventListener('click', () => themeDropdown.classList.remove('open'))
  }

  // ── Search / filter ──
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applySearchFilter()
    })
  }

  // ── Sort ──
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      applySortAndRender()
    })
  }
}

// ── Add images to state ──────────────────────────────
const imagePathSet = new Set() // fast dedupe lookup

function addImages(found) {
  let added = 0
  for (const f of found) {
    if (imagePathSet.has(f.path)) continue
    imagePathSet.add(f.path)
    images.push({
      id: nextId++,
      path: f.path,
      name: f.name,
      size: f.size,
      sourceFolder: f.sourceFolder || '',
      relativePath: f.relativePath || f.name,
      status: 'pending',
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

  // Rebuild list with DocumentFragment (single DOM reflow)
  const frag = document.createDocumentFragment()
  for (const img of images) {
    frag.appendChild(createCard(img))
  }
  imageList.innerHTML = ''
  imageList.appendChild(frag)

  // Apply search filter if active
  applySearchFilter()

  // Lazy-load thumbnails in batches
  loadThumbnails()
}

function applySearchFilter() {
  const query = (searchInput ? searchInput.value : '').toLowerCase().trim()
  const cards = imageList.querySelectorAll('.image-card')
  cards.forEach(card => {
    const id = parseInt(card.dataset.id)
    const img = images.find(i => i.id === id)
    if (!img) return
    if (query && !img.name.toLowerCase().includes(query)) {
      card.style.display = 'none'
    } else {
      card.style.display = ''
    }
  })
}

function applySortAndRender() {
  const val = sortSelect ? sortSelect.value : 'added'
  switch (val) {
    case 'name-asc':
      images.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'name-desc':
      images.sort((a, b) => b.name.localeCompare(a.name))
      break
    case 'size-asc':
      images.sort((a, b) => a.size - b.size)
      break
    case 'size-desc':
      images.sort((a, b) => b.size - a.size)
      break
    case 'status':
      const order = { error: 0, pending: 1, success: 2 }
      images.sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1))
      break
    default: // 'added' — keep insertion order (id)
      images.sort((a, b) => a.id - b.id)
  }
  renderAll()
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

  // Names container
  const namesRow = document.createElement('div')
  namesRow.className = 'card-names'

  if (img.status === 'success' && img.result?.outputFileName) {
    // Converted: show old name (muted, behind) → arrow → new name (primary, front)
    const oldName = document.createElement('span')
    oldName.className = 'card-name-old'
    oldName.textContent = img.name
    oldName.dataset.tooltip = 'Abrir pasta original'
    oldName.addEventListener('click', (e) => {
      e.stopPropagation()
      window.electronAPI.showItemInFolder(img.path)
    })

    const arrow = document.createElement('span')
    arrow.className = 'card-name-arrow material-symbols-rounded'
    arrow.textContent = 'arrow_forward'

    const newName = document.createElement('span')
    newName.className = 'card-name-new'
    newName.textContent = img.result.outputFileName
    newName.dataset.tooltip = 'Abrir pasta de saída'
    newName.addEventListener('click', (e) => {
      e.stopPropagation()
      window.electronAPI.showItemInFolder(img.result.outputPath)
    })

    namesRow.appendChild(oldName)
    namesRow.appendChild(arrow)
    namesRow.appendChild(newName)
  } else {
    // Pending/error: just the original name, clickable
    const nameEl = document.createElement('span')
    nameEl.className = 'card-name'
    nameEl.textContent = img.name
    nameEl.dataset.tooltip = 'Abrir pasta'
    nameEl.addEventListener('click', (e) => {
      e.stopPropagation()
      window.electronAPI.showItemInFolder(img.path)
    })
    namesRow.appendChild(nameEl)
  }

  const meta = document.createElement('div')
  meta.className = 'card-meta'
  meta.innerHTML = `<span>${formatBytes(img.size)}</span>`

  if (img.status === 'success' && img.result) {
    const r = img.result
    meta.innerHTML += ` <span class="material-symbols-rounded" style="font-size:14px">arrow_forward</span> <span>${formatBytes(r.convertedSize)}</span>`
    const saving = r.saved
    const pct = Math.abs(parseFloat(r.savedPercent))
    const cls = saving >= 0 ? 'card-savings' : 'card-savings negative'
    const sign = saving >= 0 ? '-' : '+'
    meta.innerHTML += ` <span class="${cls}">${sign}${pct}%</span>`
  }

  const pathEl = document.createElement('div')
  pathEl.className = 'card-path'
  pathEl.textContent = shortenPath(img.path)

  info.appendChild(namesRow)
  info.appendChild(pathEl)
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
    const btnOpen = createTinyBtn('open_in_new', 'Abrir imagem', () => {
      window.electronAPI.openFile(img.result.outputPath)
    })
    actions.appendChild(btnCompare)
    actions.appendChild(btnOpen)
  }

  // Remove button
  const btnRemove = createTinyBtn('close', 'Remover da lista', () => {
    imagePathSet.delete(img.path)
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

// ── Thumbnails async (batched to avoid flooding IPC) ─
let thumbQueue = []
let thumbLoading = false
const THUMB_BATCH_SIZE = 4

async function loadThumbnails() {
  // Queue up images that need thumbnails
  for (const img of images) {
    if (img.thumbLoaded) continue
    img.thumbLoaded = true
    thumbQueue.push(img)
  }
  processThumbQueue()
}

async function processThumbQueue() {
  if (thumbLoading) return
  thumbLoading = true

  while (thumbQueue.length > 0) {
    const batch = thumbQueue.splice(0, THUMB_BATCH_SIZE)
    await Promise.all(batch.map(async (img) => {
      try {
        const src = await window.electronAPI.getThumbnail(img.path)
        if (src) {
          img.thumbSrc = src
          const card = imageList.querySelector(`[data-id="${img.id}"]`)
          if (card) {
            const thumbEl = card.querySelector('.card-thumb')
            thumbEl.innerHTML = `<img src="${src}" alt="">`
          }
        }
      } catch { /* skip */ }
    }))
  }

  thumbLoading = false
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

  // Mark all pending cards as converting
  pendingImages.forEach(img => {
    const card = imageList.querySelector(`[data-id="${img.id}"]`)
    if (card) card.classList.add('converting')
  })

  const options = {
    files: pendingImages.map(i => ({
      path: i.path,
      sourceFolder: i.sourceFolder
    })),
    outputFolder,
    format: formatEl.value,
    maxSize,
    quality: parseInt(qualityEl.value),
    keepStructure: keepStructureEl.checked,
    prefix: filePrefixEl ? filePrefixEl.value : '',
    suffix: fileSuffixEl ? fileSuffixEl.value : '',
    stripMetadata: stripMetadataEl ? stripMetadataEl.checked : false
  }

  try {
    const result = await window.electronAPI.processImages(options)

    if (result.cancelled) {
      // Remove converting class from remaining pending cards
      images.filter(i => i.status === 'pending').forEach(img => {
        const card = imageList.querySelector(`[data-id="${img.id}"]`)
        if (card) card.classList.remove('converting')
      })
      if (result.results && result.results.length > 0) {
        const successCount = result.results.filter(r => r.success).length
        if (successCount > 0) {
          showSummary(result.results)
          btnRemoveConverted.style.display = 'inline-flex'
        }
      }
    } else if (result.success) {
      showSummary(result.results)
      const successCount = result.results.filter(r => r.success).length
      toast(`${successCount} imagem(ns) convertida(s) com sucesso!`, 'success')
      btnRemoveConverted.style.display = 'inline-flex'

      // Native notification when window is not focused
      try {
        const focused = await window.electronAPI.isWindowFocused()
        if (!focused) {
          await window.electronAPI.showNotification({
            title: 'Conversão concluída',
            body: `${successCount} imagem(ns) convertida(s) com sucesso!`
          })
        }
      } catch { /* ignore */ }
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

// ── Tooltip system (body-level, escapes stacking contexts) ──
;(function initTooltips() {
  const tip = document.createElement('div')
  tip.className = 'tooltip'
  const arrow = document.createElement('div')
  arrow.className = 'tooltip-arrow'
  tip.appendChild(arrow)
  document.body.appendChild(tip)

  let currentTarget = null
  let showTimer = null

  function show(el) {
    const text = el.getAttribute('data-tooltip')
    if (!text) return
    tip.childNodes.forEach(n => { if (n !== arrow) n.remove() })
    tip.insertBefore(document.createTextNode(text), arrow)

    // Reset classes
    tip.classList.remove('tooltip-top', 'tooltip-bottom', 'visible')

    // Position above by default
    tip.style.left = '0px'
    tip.style.top = '0px'
    tip.style.display = 'block'

    const rect = el.getBoundingClientRect()
    const tipRect = tip.getBoundingClientRect()
    const pos = el.getAttribute('data-tooltip-pos')

    let top, left
    left = rect.left + rect.width / 2 - tipRect.width / 2

    if (pos === 'bottom' || rect.top - tipRect.height - 8 < 0) {
      // Below
      top = rect.bottom + 8
      tip.classList.add('tooltip-bottom')
    } else {
      // Above
      top = rect.top - tipRect.height - 8
      tip.classList.add('tooltip-top')
    }

    // Keep within viewport horizontally
    if (left < 4) left = 4
    if (left + tipRect.width > window.innerWidth - 4) left = window.innerWidth - tipRect.width - 4

    tip.style.left = left + 'px'
    tip.style.top = top + 'px'

    // Update arrow position relative to tooltip
    const arrowLeft = rect.left + rect.width / 2 - left
    arrow.style.left = arrowLeft + 'px'
    arrow.style.transform = 'translateX(-50%)'

    requestAnimationFrame(() => tip.classList.add('visible'))
  }

  function hide() {
    clearTimeout(showTimer)
    tip.classList.remove('visible')
    currentTarget = null
  }

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tooltip]')
    if (!el || el === currentTarget) return
    hide()
    currentTarget = el
    showTimer = setTimeout(() => show(el), 200)
  })

  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest('[data-tooltip]')
    if (el && el === currentTarget) hide()
  })

  // Hide on scroll or resize
  document.addEventListener('scroll', hide, true)
  window.addEventListener('resize', hide)
})()

// ── Utils ────────────────────────────────────────────
function shortenPath(fullPath) {
  const sep = fullPath.includes('/') ? '/' : '\\'
  const parts = fullPath.split(sep)
  parts.pop() // remove filename
  if (parts.length <= 3) return parts.join(sep)
  return parts[0] + sep + '...' + sep + parts.slice(-2).join(sep)
}

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

// ── Lottie Drop Zone Icon ───────────────────────────
;(function initLottieDropIcon() {
  const el = document.getElementById('lottieDropIcon')
  const zone = document.getElementById('dropZone')
  if (!el || !zone || typeof lottie === 'undefined') return

  const imgData = {"v":"5.7.4","fr":30,"ip":0,"op":30,"w":500,"h":500,"nm":"image Loading 2","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"Shape Layer 10","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[124,214,0],"ix":2,"l":2},"a":{"a":0,"k":[-91,91,0],"ix":1,"l":2},"s":{"a":0,"k":[70,70,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-91,91],[-91,181.75]],"c":false},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tm","s":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":9,"s":[0]},{"t":14,"s":[100]}],"ix":1},"e":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":4,"s":[0]},{"t":9,"s":[100]}],"ix":2},"o":{"a":0,"k":0,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false},{"ty":"st","c":{"a":0,"k":[0.949,0.898,0.984,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":7,"ix":5},"lc":2,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":4,"op":14,"st":4,"bm":0},{"ddd":0,"ind":2,"ty":4,"nm":"Shape Layer 9","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[372,214,0],"ix":2,"l":2},"a":{"a":0,"k":[-91,91,0],"ix":1,"l":2},"s":{"a":0,"k":[70,70,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-91,91],[-91,181.75]],"c":false},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tm","s":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":11,"s":[0]},{"t":16,"s":[100]}],"ix":1},"e":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":6,"s":[0]},{"t":11,"s":[100]}],"ix":2},"o":{"a":0,"k":0,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false},{"ty":"st","c":{"a":0,"k":[0.949,0.898,0.984,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":7,"ix":5},"lc":2,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":6,"op":16,"st":6,"bm":0},{"ddd":0,"ind":3,"ty":4,"nm":"Shape Layer 8","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[172,369,0],"ix":2,"l":2},"a":{"a":0,"k":[-91,91,0],"ix":1,"l":2},"s":{"a":0,"k":[70,70,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-91,91],[-91,181.75]],"c":false},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tm","s":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":21,"s":[0]},{"t":26,"s":[100]}],"ix":1},"e":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":16,"s":[0]},{"t":21,"s":[100]}],"ix":2},"o":{"a":0,"k":0,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false},{"ty":"st","c":{"a":0,"k":[0.949,0.898,0.984,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":9,"ix":5},"lc":2,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":16,"op":26,"st":16,"bm":0},{"ddd":0,"ind":4,"ty":4,"nm":"Shape Layer 3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[172,369,0],"ix":2,"l":2},"a":{"a":0,"k":[-91,91,0],"ix":1,"l":2},"s":{"a":0,"k":[70,70,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-91,91],[-91,181.75]],"c":false},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tm","s":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":11,"s":[0]},{"t":16,"s":[100]}],"ix":1},"e":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":6,"s":[0]},{"t":11,"s":[100]}],"ix":2},"o":{"a":0,"k":0,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false},{"ty":"st","c":{"a":0,"k":[0.949,0.898,0.984,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":9,"ix":5},"lc":2,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":6,"op":16,"st":6,"bm":0},{"ddd":0,"ind":5,"ty":4,"nm":"Shape Layer 7","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[321,373,0],"ix":2,"l":2},"a":{"a":0,"k":[-91,91,0],"ix":1,"l":2},"s":{"a":0,"k":[70,70,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-91,91],[-91,181.75]],"c":false},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tm","s":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":24,"s":[0]},{"t":29,"s":[100]}],"ix":1},"e":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":19,"s":[0]},{"t":24,"s":[100]}],"ix":2},"o":{"a":0,"k":0,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false},{"ty":"st","c":{"a":0,"k":[0.949,0.898,0.984,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":7,"ix":5},"lc":2,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":19,"op":29,"st":19,"bm":0},{"ddd":0,"ind":6,"ty":4,"nm":"Shape Layer 1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[321,373,0],"ix":2,"l":2},"a":{"a":0,"k":[-91,91,0],"ix":1,"l":2},"s":{"a":0,"k":[70,70,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-91,91],[-91,181.75]],"c":false},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tm","s":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":12,"s":[0]},{"t":17,"s":[100]}],"ix":1},"e":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":7,"s":[0]},{"t":12,"s":[100]}],"ix":2},"o":{"a":0,"k":0,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false},{"ty":"st","c":{"a":0,"k":[0.949,0.898,0.984,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":7,"ix":5},"lc":2,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":7,"op":17,"st":7,"bm":0},{"ddd":0,"ind":7,"ty":4,"nm":"Layer 3","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":1,"k":[{"i":{"x":0,"y":1},"o":{"x":0.182,"y":0},"t":0,"s":[250,250,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.829,"y":1},"o":{"x":0.156,"y":0},"t":23,"s":[250,231,0],"to":[0,0,0],"ti":[0,0,0]},{"t":30,"s":[250,250,0]}],"ix":2,"l":2},"a":{"a":0,"k":[231.307,235.606,0],"ix":1,"l":2},"s":{"a":0,"k":[81,81,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[-12.451,0],[0,-12.451],[12.451,0],[0,12.451]],"o":[[12.451,0],[0,12.451],[-12.451,0],[0,-12.451]],"v":[[0,-22.545],[22.545,0],[0,22.545],[-22.545,0]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"gf","o":{"a":0,"k":100,"ix":10},"r":1,"bm":0,"g":{"p":7,"k":{"a":0,"k":[0,1,0.851,0.271,0.152,1,0.827,0.257,0.304,1,0.804,0.243,0.58,1,0.741,0.206,0.856,1,0.678,0.169,0.928,1,0.659,0.157,1,1,0.639,0.145],"ix":9}},"s":{"a":0,"k":[-21.698,-7.222],"ix":5},"e":{"a":0,"k":[16.356,17.624],"ix":6},"t":1,"nm":"Gradient Fill 1","mn":"ADBE Vector Graphic - G-Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[179.644,182.376],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 1","np":2,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0],[8.782,0],[0,0],[0,0],[0,0],[-8.71,-10.59]],"o":[[0,0],[0,8.782],[0,0],[0,0],[0,0],[8.71,-10.59],[0,0]],"v":[[90.71,7.017],[90.71,46.939],[74.806,62.836],[-90.71,62.836],[-47.248,10.01],[6.143,-54.893],[39.782,-54.893]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"gf","o":{"a":0,"k":100,"ix":10},"r":1,"bm":0,"g":{"p":3,"k":{"a":0,"k":[0,0,0.976,0.765,0.5,0.131,0.759,0.882,1,0.263,0.541,1],"ix":9}},"s":{"a":0,"k":[21.052,-62.542],"ix":5},"e":{"a":0,"k":[22.192,59.606],"ix":6},"t":1,"nm":"Gradient Fill 1","mn":"ADBE Vector Graphic - G-Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[247.808,264.394],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 1","np":2,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0],[0,8.781],[0,0],[0,0],[-8.716,-10.596],[0,0]],"o":[[0,0],[-8.782,0],[0,0],[0,0],[8.71,-10.596],[0,0],[0,0]],"v":[[59.962,40.376],[-44.059,40.376],[-59.962,24.479],[-59.962,-0.349],[-33.57,-32.428],[0.069,-32.428],[16.502,-12.45]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"gf","o":{"a":0,"k":100,"ix":10},"r":1,"bm":0,"g":{"p":3,"k":{"a":0,"k":[0,0,0.976,0.765,0.5,0.131,0.759,0.882,1,0.263,0.541,1],"ix":9}},"s":{"a":0,"k":[-16.22,-32.931],"ix":5},"e":{"a":0,"k":[-12.059,48.146],"ix":6},"t":1,"nm":"Gradient Fill 1","mn":"ADBE Vector Graphic - G-Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[184.059,286.854],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 2","np":2,"cix":2,"bm":0,"ix":2,"mn":"ADBE Vector Group","hd":false},{"ty":"tr","p":{"a":0,"k":[184.059,286.854],"ix":2},"a":{"a":0,"k":[184.059,286.854],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 2","np":2,"cix":2,"bm":0,"ix":2,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[8.78,0],[0,0],[0,8.78],[0,0],[-8.78,0],[0,0],[0,-8.78],[0,0]],"o":[[0,0],[-8.78,0],[0,0],[0,-8.78],[0,0],[8.78,0],[0,0],[0,8.78]],"v":[[91.311,91.623],[-91.31,91.623],[-107.209,75.725],[-107.209,-75.725],[-91.31,-91.623],[91.311,-91.623],[107.209,-75.725],[107.209,75.725]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"gf","o":{"a":0,"k":100,"ix":10},"r":1,"bm":0,"g":{"p":3,"k":{"a":0,"k":[0,0.263,0.541,1,0.5,0.347,0.331,0.959,1,0.431,0.122,0.918],"ix":9}},"s":{"a":0,"k":[-69.571,-94.854],"ix":5},"e":{"a":0,"k":[208.693,206.393],"ix":6},"t":1,"nm":"Gradient Fill 1","mn":"ADBE Vector Graphic - G-Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[231.307,235.607],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 3","np":2,"cix":2,"bm":0,"ix":3,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0],[0,10.491],[0,0],[-10.491,0],[0,0],[0,-10.491],[0,0],[10.491,0]],"o":[[0,0],[-10.491,0],[0,0],[0,-10.491],[0,0],[10.491,0],[0,0],[0,10.491],[0,0]],"v":[[109.098,109.472],[-109.098,109.472],[-128.093,90.476],[-128.093,-90.476],[-109.098,-109.472],[109.098,-109.472],[128.093,-90.476],[128.093,90.476],[109.098,109.472]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"gf","o":{"a":0,"k":100,"ix":10},"r":1,"bm":0,"g":{"p":3,"k":{"a":0,"k":[0,0.973,0.965,0.984,0.5,0.955,0.914,0.984,1,0.937,0.863,0.984],"ix":9}},"s":{"a":0,"k":[-126.626,-107.831],"ix":5},"e":{"a":0,"k":[122.693,102.394],"ix":6},"t":1,"nm":"Gradient Fill 1","mn":"ADBE Vector Graphic - G-Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[231.307,235.606],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 4","np":2,"cix":2,"bm":0,"ix":4,"mn":"ADBE Vector Group","hd":false},{"ty":"tr","p":{"a":0,"k":[231.307,235.606],"ix":2},"a":{"a":0,"k":[231.307,235.606],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":0,"op":1500,"st":0,"bm":0},{"ddd":0,"ind":8,"ty":4,"nm":"Shape Layer 6","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[273,330,0],"ix":2,"l":2},"a":{"a":0,"k":[-91,91,0],"ix":1,"l":2},"s":{"a":0,"k":[70,70,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-91,91],[-91,181.75]],"c":false},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tm","s":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":22,"s":[0]},{"t":27,"s":[100]}],"ix":1},"e":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":17,"s":[0]},{"t":22,"s":[100]}],"ix":2},"o":{"a":0,"k":0,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false},{"ty":"st","c":{"a":0,"k":[0.949,0.898,0.984,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":9,"ix":5},"lc":2,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":17,"op":27,"st":17,"bm":0},{"ddd":0,"ind":9,"ty":4,"nm":"Shape Layer 2","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[273,339,0],"ix":2,"l":2},"a":{"a":0,"k":[-91,91,0],"ix":1,"l":2},"s":{"a":0,"k":[70,70,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-91,91],[-91,181.75]],"c":false},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tm","s":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":10,"s":[0]},{"t":15,"s":[100]}],"ix":1},"e":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":5,"s":[0]},{"t":10,"s":[100]}],"ix":2},"o":{"a":0,"k":0,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false},{"ty":"st","c":{"a":0,"k":[0.949,0.898,0.984,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":9,"ix":5},"lc":2,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":5,"op":15,"st":5,"bm":0},{"ddd":0,"ind":10,"ty":4,"nm":"Shape Layer 5","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[211,330,0],"ix":2,"l":2},"a":{"a":0,"k":[-91,91,0],"ix":1,"l":2},"s":{"a":0,"k":[70,70,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-91,91],[-91,181.75]],"c":false},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tm","s":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":25,"s":[0]},{"t":30,"s":[100]}],"ix":1},"e":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":20,"s":[0]},{"t":25,"s":[100]}],"ix":2},"o":{"a":0,"k":0,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false},{"ty":"st","c":{"a":0,"k":[0.949,0.898,0.984,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":7,"ix":5},"lc":2,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":20,"op":30,"st":20,"bm":0},{"ddd":0,"ind":11,"ty":4,"nm":"Shape Layer 4","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[211,339,0],"ix":2,"l":2},"a":{"a":0,"k":[-91,91,0],"ix":1,"l":2},"s":{"a":0,"k":[70,70,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,0]],"o":[[0,0],[0,0]],"v":[[-91,91],[-91,181.75]],"c":false},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"tm","s":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":12,"s":[0]},{"t":17,"s":[100]}],"ix":1},"e":{"a":1,"k":[{"i":{"x":[0.18],"y":[1]},"o":{"x":[0.333],"y":[0]},"t":7,"s":[0]},{"t":12,"s":[100]}],"ix":2},"o":{"a":0,"k":0,"ix":3},"m":1,"ix":2,"nm":"Trim Paths 1","mn":"ADBE Vector Filter - Trim","hd":false},{"ty":"st","c":{"a":0,"k":[0.949,0.898,0.984,1],"ix":3},"o":{"a":0,"k":100,"ix":4},"w":{"a":0,"k":7,"ix":5},"lc":2,"lj":1,"ml":4,"bm":0,"nm":"Stroke 1","mn":"ADBE Vector Graphic - Stroke","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Shape 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":7,"op":17,"st":7,"bm":0}],"markers":[]}

  const dropAnim = lottie.loadAnimation({
    container: el,
    renderer: 'svg',
    loop: true,
    autoplay: false,
    animationData: imgData
  })

  zone.addEventListener('mouseenter', () => dropAnim.play())
  zone.addEventListener('mouseleave', () => dropAnim.goToAndStop(0, true))
})()

// ── Lottie Cat Animation ─────────────────────────────
;(function initLottieCat() {
  const container = document.getElementById('lottieCat')
  const panelImages = document.querySelector('.panel-images')
  if (!container || !panelImages || typeof lottie === 'undefined') return

  const catData = {"v":"5.1.13","fr":25,"ip":0,"op":77,"w":1440,"h":2560,"nm":"appy_present","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":2,"ty":3,"nm":"Nul 1","sr":1,"ks":{"o":{"a":0,"k":0,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"n":"0p833_0p833_0p167_0p167","t":11,"s":[578,3266,0],"e":[578,2556,0],"to":[0,0,0],"ti":[0,0,0]},{"t":24}],"ix":2},"a":{"a":0,"k":[0,0,0],"ix":1},"s":{"a":0,"k":[183,183,100],"ix":6}},"ao":0,"ip":11,"op":386,"st":11,"bm":0},{"ddd":0,"ind":5,"ty":4,"nm":"ojo izq Silhouettes","parent":2,"sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"n":"0p833_0p833_0p167_0p167","t":30,"s":[-26.17,-70.771,0],"e":[-49.121,-84.978,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"n":"0p833_0p833_0p167_0p167","t":35,"s":[-49.121,-84.978,0],"e":[-22.891,-84.978,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"n":"0p833_0p833_0p167_0p167","t":62,"s":[-22.891,-84.978,0],"e":[-26.17,-70.771,0],"to":[0,0,0],"ti":[0,0,0]},{"t":67}],"ix":2},"a":{"a":0,"k":[48.044,48.045,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,-26.397],[-26.396,0],[0,26.396],[26.396,0]],"o":[[0,26.396],[26.396,-0.001],[0,-26.396],[-26.397,0]],"v":[[-47.794,0],[-0.001,47.794],[47.794,-0.001],[0,-47.794]],"c":true},"ix":2},"nm":"Trac\u00e9 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[0.129,0.129,0.129,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"nm":"Fond 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[48.044,48.045],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transformer "}],"nm":"Groupe 1","np":2,"cix":2,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":0,"op":375,"st":0,"bm":0},{"ddd":0,"ind":6,"ty":4,"nm":"ojo der Silhouettes","parent":2,"sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"n":"0p833_0p833_0p167_0p167","t":30,"s":[172.758,-68.586,0],"e":[166.201,-82.794,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"n":"0p833_0p833_0p167_0p167","t":35,"s":[166.201,-82.794,0],"e":[194.616,-83.887,0],"to":[0,0,0],"ti":[0,0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"n":"0p833_0p833_0p167_0p167","t":62,"s":[194.616,-83.887,0],"e":[172.758,-68.586,0],"to":[0,0,0],"ti":[0,0,0]},{"t":67}],"ix":2},"a":{"a":0,"k":[48.045,48.044,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,-26.397],[-26.396,0],[0,26.396],[26.396,0]],"o":[[0,26.396],[26.396,-0.001],[0,-26.396],[-26.396,0]],"v":[[-47.794,0],[-0.001,47.794],[47.794,-0.001],[-0.001,-47.794]],"c":true},"ix":2},"nm":"Trac\u00e9 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[0.129,0.129,0.129,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"nm":"Fond 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[48.045,48.045],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transformer "}],"nm":"Groupe 1","np":2,"cix":2,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":0,"op":375,"st":0,"bm":0},{"ddd":0,"ind":7,"ty":4,"nm":"Calque 1 Silhouettes","parent":2,"sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[-0.076,109.585,0],"ix":2},"a":{"a":0,"k":[335.986,508.493,0],"ix":1},"s":{"a":0,"k":[100,100,100],"ix":6}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[-6.088,0],[0,-6.092],[-10.139,0],[0,10.136],[-0.003,0.101],[0,0.101],[0,0],[0,6.128],[-15.059,0],[0,-8.292],[9.56,-4.428],[0,0],[0.003,-0.1],[0,-0.101],[-10.139,0],[0,10.136],[-6.088,0],[0,-6.093],[22.296,0],[7.381,7.842],[11.591,0],[0,22.3]],"o":[[6.09,0],[0,10.137],[10.14,0],[0,-0.101],[-0.003,-0.1],[0,0],[-9.56,-4.429],[0,-8.291],[15.06,0],[0,6.128],[0,0],[0,0.101],[0.003,0.101],[0,10.136],[10.14,0],[0,-6.093],[6.089,0],[0,22.3],[-11.59,0.001],[-7.381,7.842],[-22.296,0],[0,-6.093]],"v":[[-58.824,-3.369],[-47.795,7.659],[-29.412,26.043],[-11.029,7.659],[-10.999,7.363],[-11.029,7.068],[-11.029,-13.26],[-27.266,-33.089],[0,-48.102],[27.268,-33.089],[11.03,-13.26],[11.03,7.068],[10.999,7.363],[11.03,7.659],[29.412,26.042],[47.794,7.659],[58.824,-3.37],[69.853,7.659],[29.412,48.101],[0,35.329],[-29.412,48.102],[-69.853,7.66]],"c":true},"ix":2},"nm":"Trac\u00e9 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[0.427,0.427,0.427,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"nm":"Fond 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[407.717,410.813],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transformer "}],"nm":"Groupe 1","np":2,"cix":2,"ix":1,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,-37.008],[-37.009,0.001],[0,37.008],[37.008,0]],"o":[[0,37.008],[37.007,0],[0,-37.008],[-37.008,0]],"v":[[-67.008,0],[0,67.008],[67.008,-0.001],[0,-67.009]],"c":true},"ix":2},"nm":"Trac\u00e9 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[1,0.824,0.082,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"nm":"Fond 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[299.261,329.23],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transformer "}],"nm":"Groupe 2","np":2,"cix":2,"ix":2,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,-37.008],[-37.008,0.001],[0,37.008],[37.008,0]],"o":[[0,37.008],[37.008,0],[0,-37.008],[-37.008,0]],"v":[[-67.009,0],[0,67.008],[67.009,-0.001],[0,-67.009]],"c":true},"ix":2},"nm":"Trac\u00e9 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[1,0.824,0.082,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"nm":"Fond 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[516.174,329.229],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transformer "}],"nm":"Groupe 3","np":2,"cix":2,"ix":3,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[25.902,-23.233],[0,0],[0,0],[0,0],[0.05,-34.794],[0,0],[0.392,62.222],[31.775,0.045],[0.153,-0.002],[-0.203,-31.985],[-65.704,-8.654],[-2.494,-0.004],[-1.219,0.076],[0,0],[-22.658,50.5],[0,41.875],[0,0],[0,0],[0,0]],"o":[[0.05,-34.794],[0,0],[0,0],[0,0],[-25.836,-23.307],[0,0],[-19.955,-21.872],[-0.202,-31.831],[-0.155,0],[-31.984,0.202],[1.205,190.77],[2.539,0.336],[1.233,0.002],[0,0],[58.93,0.084],[13.454,-23.624],[0,0],[0,0],[0,0],[0,0]],"v":[[335.687,-454.416],[268.651,-484.394],[156.972,-384.219],[-1.722,-384.443],[-113.113,-484.937],[-180.235,-455.147],[-181.228,361.501],[-219.71,240.436],[-277.529,182.891],[-277.988,182.891],[-335.533,241.171],[-144.049,507.373],[-136.498,507.877],[-132.831,507.714],[181.211,508.159],[313.547,422.599],[334.642,325.355],[334.996,26.531],[334.974,26.531],[335,26.531]],"c":true},"ix":2},"nm":"Trac\u00e9 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[1,1,1,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"nm":"Fond 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[335.986,508.494],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transformer "}],"nm":"Groupe 4","np":2,"cix":2,"ix":4,"mn":"ADBE Vector Group","hd":false}],"ip":0,"op":375,"st":0,"bm":0}],"markers":[]}

  lottie.loadAnimation({
    container,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: catData
  })

  // Random delay between 3s and 15s, then peek once
  const delay = 3000 + Math.random() * 12000
  const catContainer = document.getElementById('lottieCatContainer')
  if (catContainer) {
    setTimeout(() => {
      catContainer.classList.add('cat-peek')
      // Clean up after animation ends
      catContainer.addEventListener('animationend', () => {
        catContainer.classList.remove('cat-peek')
      }, { once: true })
    }, delay)
  }
})()

// ── Image Preview on Thumbnail Hover ─────────────────
;(function initPreviewPopup() {
  const popup = document.getElementById('previewPopup')
  const popupImg = document.getElementById('previewPopupImg')
  if (!popup || !popupImg) return

  let hoverTimer = null
  let currentPath = null

  imageList.addEventListener('mouseover', (e) => {
    const thumb = e.target.closest('.card-thumb')
    if (!thumb) return

    const card = thumb.closest('.image-card')
    if (!card) return

    const img = images.find(i => String(i.id) === card.dataset.id)
    if (!img || !img.path) return

    // Don't re-fetch same image
    if (currentPath === img.path && popup.classList.contains('visible')) return

    clearTimeout(hoverTimer)
    hoverTimer = setTimeout(async () => {
      try {
        currentPath = img.path
        const dataUrl = await window.electronAPI.getFullImage(img.path)
        if (dataUrl && currentPath === img.path) {
          popupImg.src = dataUrl
          popup.classList.add('visible')
          positionPopup(thumb)
        }
      } catch { /* ignore */ }
    }, 300)
  })

  imageList.addEventListener('mouseout', (e) => {
    const thumb = e.target.closest('.card-thumb')
    if (!thumb) return

    clearTimeout(hoverTimer)
    popup.classList.remove('visible')
    currentPath = null
    popupImg.src = ''
  })

  function positionPopup(thumb) {
    const rect = thumb.getBoundingClientRect()
    const popupW = 320
    const popupH = 320

    let left = rect.right + 12
    let top = rect.top

    // If goes off right edge, show on left side
    if (left + popupW > window.innerWidth) {
      left = rect.left - popupW - 12
    }

    // If goes off bottom
    if (top + popupH > window.innerHeight) {
      top = window.innerHeight - popupH - 12
    }

    if (top < 12) top = 12

    popup.style.left = `${left}px`
    popup.style.top = `${top}px`
  }
})()
