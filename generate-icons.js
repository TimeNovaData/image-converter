const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const svgPath = path.join(__dirname, 'icon.svg');
  const svgBuffer = fs.readFileSync(svgPath);
  
  console.log('🎨 Gerando ícones...\n');
  
  // Gerar PNG 512x512 (para Linux e uso geral)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(__dirname, 'icon.png'));
  console.log('✅ icon.png (512x512) criado');
  
  // Gerar ícones em múltiplos tamanhos para ICO
  const sizes = [16, 32, 48, 64, 128, 256];
  const icoImages = [];
  
  for (const size of sizes) {
    const buffer = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    icoImages.push({ size, buffer });
    console.log(`✅ Ícone ${size}x${size} gerado`);
  }
  
  // Para Windows, vamos criar um PNG 256x256 que o electron-builder converte para ICO
  await sharp(svgBuffer)
    .resize(256, 256)
    .png()
    .toFile(path.join(__dirname, 'icon-256.png'));
  console.log('✅ icon-256.png (256x256) criado para Windows');
  
  console.log('\n🎉 Ícones gerados com sucesso!');
  console.log('\n📝 Nota: O electron-builder converterá automaticamente o PNG para ICO no build.');
}

generateIcons().catch(console.error);
