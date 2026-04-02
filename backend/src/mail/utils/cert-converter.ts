import { SmimeUtil } from './smime.util';
import * as path from 'path';

const p12Path = process.argv[2];
const password = process.argv[3];
const outputDir = process.argv[4] || './certs';

if (!p12Path || !password) {
  console.error(
    'Usage: ts-node cert-converter.ts <p12-file-path> <password> [output-dir]',
  );
  process.exit(1);
}

try {
  console.log('Converting P12 certificate...');
  const certData = SmimeUtil.loadFromP12(p12Path, password);

  SmimeUtil.savePemFiles(certData, outputDir);

  console.log('Certificate conversion successful!');
  console.log(
    `Private key saved to: ${path.join(outputDir, 'private-key.pem')}`,
  );
  console.log(
    `Certificate saved to: ${path.join(outputDir, 'certificate.pem')}`,
  );
  if (certData.chain) {
    console.log(
      `Certificate chain saved to: ${path.join(outputDir, 'chain.pem')}`,
    );
  }
} catch (error) {
  console.error('Error converting certificate:', error);
  process.exit(1);
}
