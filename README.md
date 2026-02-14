# 🖼️ Image Converter

![alt text](image.png)

Conversor de imagens profissional com interface moderna, desenvolvido com Electron e Sharp. Arraste, converta e otimize suas imagens em segundos.

## ✨ Funcionalidades

### Conversão
- 🔄 Conversão para **WebP**, **JPEG**, **PNG** ou manter formato original
- 📐 Redimensionamento automático com limite de tamanho máximo (4K, 2K, Full HD, HD, customizado)
- 🎚️ Controle de qualidade (10-100%)
- 📁 Processamento em lote — arraste pastas inteiras
- 🗂️ Opção de manter estrutura de pastas na saída

### Interface
- 🖱️ **Drag & Drop** — arraste imagens ou pastas direto na janela
- 🖼️ **Thumbnails** — pré-visualização de todas as imagens na lista
- 🔍 **Comparação antes/depois** — slider interativo com zoom (scroll, +/-, botões) e pan
- 📊 **Resultado detalhado** — economia de espaço por imagem e resumo geral
- 🔔 **Notificações toast** — feedback visual para todas as ações
- ↔️ **Painel redimensionável** — ajuste o tamanho da lista de imagens vs opções
- 📂 **Pasta Downloads como padrão** — sem necessidade de configurar saída
- 🗑️ **Modal de confirmação** — proteção contra remoção acidental

### Ícones & UI
- 🎨 Tema escuro com acento roxo gradient
- 📦 **Material Symbols** — ícones consistentes em toda a interface
- 💬 **Tooltips customizados** — substituem os tooltips nativos do sistema

## 🚀 Como usar

### Instalação

```bash
# Instalar dependências
bun install

# Executar o aplicativo
bun dev

# Build para Windows (portable)
bun run build:win

# Build para Linux
bun run build:linux
```

### Uso

1. **Arraste imagens ou pastas** direto na janela, ou use os botões "Adicionar"
2. **Configure as opções** no painel lateral:
   - **Formato**: WebP (recomendado), JPEG, PNG ou manter original
   - **Tamanho máximo**: Sem limite a 400px
   - **Qualidade**: Ajuste de 10% a 100%
   - **Estrutura de pastas**: Manter ou achatar
3. **Clique em "Converter"** e acompanhe o progresso
4. **Compare** o antes/depois clicando no thumbnail ou no botão 🔍
5. **Abra** a imagem convertida ou a pasta de saída direto pela interface

## 📦 Formatos suportados

| Entrada | Saída |
|---------|-------|
| JPEG (.jpg, .jpeg) | WebP (recomendado) |
| PNG (.png) | JPEG |
| WebP (.webp) | PNG |
| GIF (.gif) | — |
| BMP (.bmp) | — |
| TIFF (.tiff) | — |

## 🛠️ Tecnologias

- [Electron](https://www.electronjs.org/) — Framework para apps desktop
- [Sharp](https://sharp.pixelplumbing.com/) — Processamento de imagens de alta performance
- [Material Symbols](https://fonts.google.com/icons) — Ícones
- [electron-reloader](https://github.com/sindresorhus/electron-reloader) — Hot reload no desenvolvimento

## 📝 Licença

MIT © NovaData
