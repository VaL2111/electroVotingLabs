import { Injectable } from '@nestjs/common';

@Injectable()
export class CryptoService {
  public extGCD(a: bigint, b: bigint): { gcd: bigint; x: bigint; y: bigint } {
    let old_r = a;
    let r = b;
    let old_x = 1n;
    let x = 0n;
    let old_y = 0n;
    let y = 1n;

    while (r !== 0n) {
      const quotient = old_r / r;

      const temp_r = r;
      r = old_r - quotient * r;
      old_r = temp_r;

      const temp_x = x;
      x = old_x - quotient * x;
      old_x = temp_x;

      const temp_y = y;
      y = old_y - quotient * y;
      old_y = temp_y;
    }

    return { gcd: old_r, x: old_x, y: old_y };
  }

  public modExp(base: bigint, exp: bigint, modulus: bigint): bigint {
    if (modulus === 1n) return 0n;
    let result = 1n;
    base = base % modulus;

    while (exp > 0n) {
      if (exp % 2n === 1n) {
        result = (result * base) % modulus;
      }
      exp = exp / 2n;
      base = (base * base) % modulus;
    }
    return result;
  }

  private generatePrime(min: number, max: number): bigint {
    while (true) {
      const num = Math.floor(Math.random() * (max - min + 1)) + min;
      if (this.isPrime(num)) return BigInt(num);
    }
  }

  private isPrime(num: number): boolean {
    if (num < 2) return false;
    for (let i = 2; i <= Math.sqrt(num); i++) {
      if (num % i === 0) return false;
    }
    return true;
  }

  public generateKeyPair() {
    const p = this.generatePrime(100, 500);
    let q: bigint;
    do {
      q = this.generatePrime(100, 500);
    } while (q === p);

    const n = p * q;

    const phi = (p - 1n) * (q - 1n);

    let e = 3n;
    while (this.extGCD(e, phi).gcd !== 1n) {
      e += 2n;
    }

    const { x } = this.extGCD(e, phi);
    const d = ((x % phi) + phi) % phi;

    return {
      publicKey: { e, n },
      privateKey: { d, n },
    };
  }

  public customHash(message: string, n: bigint): bigint {
    let h = 0n;
    for (let i = 0; i < message.length; i++) {
      const m_i = BigInt(message.charCodeAt(i));
      h = ((h + m_i) * (h + m_i)) % n;
    }
    return h;
  }

  public encrypt(message: string, e: bigint, n: bigint): bigint[] {
    const cipher: bigint[] = [];
    for (let i = 0; i < message.length; i++) {
      const m = BigInt(message.charCodeAt(i));
      cipher.push(this.modExp(m, e, n));
    }
    return cipher;
  }

  public decrypt(cipher: bigint[], d: bigint, n: bigint): string {
    let message = '';
    for (const c of cipher) {
      const m = this.modExp(c, d, n);
      message += String.fromCharCode(Number(m));
    }
    return message;
  }

  public sign(hash: bigint, d: bigint, n: bigint): bigint {
    return this.modExp(hash, d, n);
  }

  public verifySignature(
    hash: bigint,
    signature: bigint,
    e: bigint,
    n: bigint,
  ): boolean {
    const hc = this.modExp(signature, e, n);
    return hc === hash;
  }

  public generateBlindingFactor(n: bigint): { r: bigint; rInv: bigint } {
    while (true) {
      const r = BigInt(Math.floor(Math.random() * (Number(n) - 3)) + 2);
      const { gcd, x } = this.extGCD(r, n);
      if (gcd === 1n) {
        const rInv = ((x % n) + n) % n;
        return { r, rInv };
      }
    }
  }

  public blindHash(hash: bigint, r: bigint, e: bigint, n: bigint): bigint {
    const re = this.modExp(r, e, n);
    return (hash * re) % n;
  }

  public unblindSignature(blindSig: bigint, rInv: bigint, n: bigint): bigint {
    return (blindSig * rInv) % n;
  }
}
