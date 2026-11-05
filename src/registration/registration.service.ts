import { Injectable } from '@nestjs/common';
import { AnonymousVoterRecord } from './registration.interface';
import { PublicKey } from '../crypto/crypto.interfaces';
import { CryptoService } from '../crypto/crypto.service';

@Injectable()
export class RegistrationService {
  private readonly eligibleVoters: Set<string> = new Set();
  private readonly registeredVoters: Map<string, AnonymousVoterRecord> =
    new Map();

  constructor(private readonly cryptoService: CryptoService) {}

  addEligibleVoter(fullName: string): void {
    this.eligibleVoters.add(fullName);
    console.log(`${fullName} має право голосувати`);
  }

  registerVoter(fullName: string, publicKey: PublicKey): string | null {
    if (!this.eligibleVoters.has(fullName)) {
      console.error(`${fullName} НЕ МАЄ права голосувати`);
      return null;
    }

    if (this.registeredVoters.has(fullName)) {
      console.error(`${fullName} вже зареєстрований та МАЄ ПРАВО голосувати`);
      return null;
    }

    const rn = this.cryptoService.generateRandomId();
    this.registeredVoters.set(fullName, { rn, publicKey });

    console.log(`Зареєстровано виборця "${fullName}" та видано RN: ${rn}`);
    return rn;
  }

  getAnonymousRegistryForEC(): AnonymousVoterRecord[] {
    return Array.from(this.registeredVoters.values(), (record) => ({
      rn: record.rn,
      publicKey: { ...record.publicKey },
    }));
  }
}
