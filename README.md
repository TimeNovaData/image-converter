# 🖼️ Image Converter
![alt text](image.png)
Conversor de imagens com interface gráfica simples, desenvolvido com Electron e Sharp.

## ✨ Funcionalidades

- ✅ Conversão para **WebP**, **JPEG** ou **PNG**
- ✅ Opção de manter formato original
- ✅ Redimensionamento automático com limite de tamanho máximo
- ✅ Controle de qualidade (10-100%)
- ✅ Processamento em lote de pastas inteiras
- ✅ Relatório detalhado com economia de espaço
- ✅ Interface moderna e intuitiva

## 🚀 Como usar

### Instalação

```bash
# Instalar dependências
npm install

# Executar o aplicativo
npm start
```

### Uso

1. **Selecione a pasta de entrada** - Pasta com as imagens originais
2. **Selecione a pasta de saída** - Onde as imagens convertidas serão salvas
3. **Configure as opções**:
   - **Formato**: WebP (recomendado), JPEG, PNG ou manter original
   - **Tamanho máximo**: Limite em pixels (ex: 1920px para Full HD)
   - **Qualidade**: Ajuste de 10% a 100%
4. **Clique em "Converter Imagens"**

## 📦 Formatos suportados

### Entrada
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)
- GIF (.gif)
- BMP (.bmp)
- TIFF (.tiff)

### Saída
- WebP (recomendado para web)
- JPEG
- PNG

## 🛠️ Tecnologias

- [Electron](https://www.electronjs.org/) - Framework para apps desktop
- [Sharp](https://sharp.pixelplumbing.com/) - Processamento de imagens de alta performance

## 📝 Licença

MIT © NovaData
