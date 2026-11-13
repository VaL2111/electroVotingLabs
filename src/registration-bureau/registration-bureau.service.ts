import { Injectable } from '@nestjs/common';
import { CryptoService } from '../crypto/crypto.service';
import { PrivateKey, PublicKey } from '../crypto/crypto.interfaces';
import {
  AnonymousVoterRecord,
  SignedVoterRegistry,
} from '../common/protocol.interfaces';

@Injectable()
export class RegistrationBureauService {
  public readonly publicKey: PublicKey;
  private readonly privateKey: PrivateKey;

  private readonly eligibleVoters: Set<string> = new Set();
  private readonly registeredVoters: Set<string> = new Set();
  private readonly anonymousRegistry: Map<string, PublicKey> = new Map();

  constructor(private readonly cryptoService: CryptoService) {
    const keys = this.cryptoService.generateKeyPair();
    this.publicKey = keys.publicKey;
    this.privateKey = keys.privateKey;
  }

  addEligibleVoter(fullName: string): void {
    const normalizedName = fullName.trim();
    if (!normalizedName) {
      throw new Error('ПІБ виборця не може бути порожнім');
    }
    this.eligibleVoters.add(normalizedName);
  }

  registerVoter(fullName: string, voterPublicKey: PublicKey): string | null {
    const normalizedName = fullName.trim();

    if (!this.eligibleVoters.has(normalizedName)) {
      console.error(`БР: особа "${normalizedName}" НЕ МАЄ права голосу`);
      return null;
    }

    if (this.registeredVoters.has(normalizedName)) {
      console.error(
        `БР: виборець "${normalizedName}" ВЖЕ зареєстрований та МАЄ право голосу`,
      );
      return null;
    }

    const registrationNumber = this.cryptoService.generateRandomId();

    this.registeredVoters.add(normalizedName);
    this.anonymousRegistry.set(registrationNumber, { ...voterPublicKey });

    console.log(
      `БР: виборця "${normalizedName}" зареєстровано та видано анонімний RN`,
    );
    return registrationNumber;
  }

  exportAnonymousRegistry(): SignedVoterRegistry {
    const records: AnonymousVoterRecord[] = Array.from(
      this.anonymousRegistry.entries(),
      ([registrationNumber, publicKey]) => ({
        registrationNumber,
        publicKey: { ...publicKey },
      }),
    );
    const totalRegistered = records.length;

    const payloadJson = JSON.stringify({
      totalRegistered,
      records: records.map((r) => ({
        registrationNumber: r.registrationNumber,
        e: r.publicKey.e.toString(),
        n: r.publicKey.n.toString(),
      })),
    });
    const hash = this.cryptoService.customHash(payloadJson, this.publicKey.n);
    const signature = this.cryptoService.sign(
      hash,
      this.privateKey.d,
      this.privateKey.n,
    );

    return {
      records,
      totalRegistered,
      signature,
    };
  }
}
