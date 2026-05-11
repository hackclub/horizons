import * as forge from 'node-forge';
import * as fs from 'fs';

export interface SmimeCertificate {
  privateKey: string;
  certificate: string;
  chain?: string[];
}

export class SmimeUtil {
  private privateKey: forge.pki.PrivateKey;
  private certificate: forge.pki.Certificate;
  private chain: forge.pki.Certificate[] = [];

  constructor(certData: SmimeCertificate) {
    this.privateKey = forge.pki.privateKeyFromPem(certData.privateKey);
    this.certificate = forge.pki.certificateFromPem(certData.certificate);

    if (certData.chain) {
      this.chain = certData.chain.map((cert) =>
        forge.pki.certificateFromPem(cert),
      );
    }
  }

  static loadFromP12(p12Path: string, password: string): SmimeCertificate {
    const p12Buffer = fs.readFileSync(p12Path);
    const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = bags[forge.pki.oids.certBag];

    const keyBags = p12.getBags({
      bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
    });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];

    if (!certBag || certBag.length === 0) {
      throw new Error('No certificate found in P12 file');
    }

    if (!keyBag || keyBag.length === 0) {
      throw new Error('No private key found in P12 file');
    }

    const certificate = certBag[0].cert;
    const privateKey = keyBag[0].key;

    if (!certificate || !privateKey) {
      throw new Error(
        'Failed to extract certificate or private key from P12 file',
      );
    }

    const chain: string[] = [];
    if (certBag.length > 1) {
      for (let i = 1; i < certBag.length; i++) {
        const cert = certBag[i].cert;
        if (cert) {
          chain.push(forge.pki.certificateToPem(cert));
        }
      }
    }

    return {
      privateKey: forge.pki.privateKeyToPem(privateKey),
      certificate: forge.pki.certificateToPem(certificate),
      chain: chain.length > 0 ? chain : undefined,
    };
  }

  static savePemFiles(certData: SmimeCertificate, outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(`${outputDir}/private-key.pem`, certData.privateKey);
    fs.writeFileSync(`${outputDir}/certificate.pem`, certData.certificate);

    if (certData.chain && certData.chain.length > 0) {
      fs.writeFileSync(`${outputDir}/chain.pem`, certData.chain.join('\n'));
    }
  }

  createDetachedSignature(message: string): string {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(message, 'utf8');

    p7.addCertificate(this.certificate);
    this.chain.forEach((cert) => p7.addCertificate(cert));

    p7.addSigner({
      key: this.privateKey as any,
      certificate: this.certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data,
        },
        {
          type: forge.pki.oids.messageDigest,
        },
        {
          type: forge.pki.oids.signingTime,
          value: new Date().toISOString(),
        },
      ],
    });

    p7.sign({ detached: true });

    return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
  }

  signAndEncrypt(
    message: string,
    recipientCert?: forge.pki.Certificate,
  ): string {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(message, 'utf8');

    p7.addCertificate(this.certificate);
    this.chain.forEach((cert) => p7.addCertificate(cert));

    p7.addSigner({
      key: this.privateKey as any,
      certificate: this.certificate,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType,
          value: forge.pki.oids.data,
        },
        {
          type: forge.pki.oids.messageDigest,
        },
        {
          type: forge.pki.oids.signingTime,
          value: new Date().toISOString(),
        },
      ],
    });

    p7.sign();

    if (recipientCert) {
      const p7Encrypted = forge.pkcs7.createEnvelopedData();
      p7Encrypted.content = forge.util.createBuffer(
        forge.asn1.toDer(p7.toAsn1()).getBytes(),
      );
      p7Encrypted.addRecipient(recipientCert);
      p7Encrypted.encrypt();

      return forge.util.encode64(
        forge.asn1.toDer(p7Encrypted.toAsn1()).getBytes(),
      );
    }

    return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
  }
}
