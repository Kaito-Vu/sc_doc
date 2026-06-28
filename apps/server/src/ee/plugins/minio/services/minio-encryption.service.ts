import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

@Injectable()
export class MinioEncryptionService {
  private readonly algorithm = 'aes-256-cbc';

  encrypt(plaintext: string, masterKey?: string): string {
    const key = this.getDerivedKey(masterKey);
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  decrypt(encryptedData: string, masterKey?: string): string {
    const key = this.getDerivedKey(masterKey);
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');

    const decipher = createDecipheriv(this.algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private getDerivedKey(masterKey?: string): Buffer {
    const key = masterKey || process.env.MINIO_ENCRYPTION_KEY || 'default-minio-key';
    return scryptSync(key, 'salt', 32, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
  }
}
