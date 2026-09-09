
import fs from 'fs';
import path from 'path';
import pngToIco from 'png-to-ico';

const inputPath = path.join(process.cwd(), 'my-financer-icon-1024.png');
const outputPath = path.join(process.cwd(), 'build', 'icons', 'win', 'icon.ico');

async function main() {
  try {
    const icoBuffer = await pngToIco(inputPath);
    fs.writeFileSync(outputPath, icoBuffer);
    console.log('Ícone gerado com sucesso em', outputPath);
  } catch (error) {
    console.error('Erro ao gerar ícone:', error);
    process.exit(1);
  }
}

main();
