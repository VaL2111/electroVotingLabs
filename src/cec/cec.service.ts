import { Injectable } from '@nestjs/common';
import { CryptoService } from '../crypto/crypto.service';
import { PrivateKey, PublicKey } from '../crypto/crypto.interfaces';
import { Candidate, VoterRecord } from './cec.interface';
import {
  PublishedBallotPart,
  PublishedFinalBallot,
} from '../voter/voter.interface';

@Injectable()
export class CecService {
  public readonly cecPublicKey: PublicKey;
  private readonly cecPrivateKey: PrivateKey;

  private readonly compositeIdsPool = [12, 18, 24, 36, 48];
  private readonly candidates: Map<number, string> = new Map();
  private readonly registeredVoters: Map<string, PublicKey> = new Map();
  private readonly votesCount: Map<number, number> = new Map();
  private readonly publishedFinalBallots: PublishedFinalBallot[] = [];

  constructor(private readonly cryptoService: CryptoService) {
    const keys = this.cryptoService.generateKeyPair();
    this.cecPublicKey = keys.publicKey;
    this.cecPrivateKey = keys.privateKey;
  }

  registerCandidate(fullName: string): Candidate {
    const id = this.compositeIdsPool[this.candidates.size];
    this.candidates.set(id, fullName);
    this.votesCount.set(id, 0);
    console.log(`ЦВК: Зареєстровано кандидата "${fullName}" з ID: ${id}`);
    return { id, fullName };
  }

  registerVoter(fullName: string, publicKey: PublicKey): boolean {
    if (this.registeredVoters.has(fullName)) {
      console.error(`ЦВК: Виборець "${fullName}" вже зареєстрований`);
      return false;
    }

    this.registeredVoters.set(fullName, { ...publicKey });
    console.log(`ЦВК: Зареєстровано виборця "${fullName}"`);
    return true;
  }

  getVoterListForEC(): VoterRecord[] {
    return Array.from(
      this.registeredVoters.entries(),
      ([fullName, publicKey]) => ({
        fullName,
        publicKey: { ...publicKey },
      }),
    );
  }

  tallyResults(
    ec1Parts: PublishedBallotPart[],
    ec2Parts: PublishedBallotPart[],
  ): void {
    const ec2Map = new Map<string, bigint>(
      ec2Parts.map((part) => [part.voterId, part.encryptedPart]),
    );

    for (const part1 of ec1Parts) {
      const part2Encrypted = ec2Map.get(part1.voterId);

      if (part2Encrypted === undefined) {
        console.error(
          `ЦВК: Відсутня друга частина бюлетеня для ID "${part1.voterId}"`,
        );
        continue;
      }

      const combinedCipher = this.cryptoService.multiplyCiphertexts(
        part1.encryptedPart,
        part2Encrypted,
        this.cecPublicKey.n,
      );

      const decryptedCandidateId = Number(
        this.cryptoService.decrypt(
          combinedCipher,
          this.cecPrivateKey.d,
          this.cecPrivateKey.n,
        ),
      );

      if (!this.candidates.has(decryptedCandidateId)) {
        console.error(
          `ЦВК: Бюлетень (ID: ${part1.voterId}) відхилено — розшифроване значення ${decryptedCandidateId} не відповідає жодному кандидату`,
        );
        continue;
      }

      const currentCount = this.votesCount.get(decryptedCandidateId) ?? 0;
      this.votesCount.set(decryptedCandidateId, currentCount + 1);
      this.publishedFinalBallots.push({
        voterId: part1.voterId,
        candidateId: decryptedCandidateId,
      });

      console.log(
        `ЦВК: Бюлетень (ID: ${part1.voterId}) успішно об'єднано та враховано за кандидата ID ${decryptedCandidateId} (${this.candidates.get(decryptedCandidateId)})`,
      );
    }
  }

  getPublishedFinalBallots(): PublishedFinalBallot[] {
    return this.publishedFinalBallots.map((b) => ({ ...b }));
  }

  publishResults(): void {
    console.log('\nПІДСУМКИ ГОЛОСУВАННЯ (ЦВК)');

    for (const [id, fullName] of this.candidates.entries()) {
      const count = this.votesCount.get(id) ?? 0;
      console.log(`Кандидат ${fullName} (ID: ${id}): ${count} голосів`);
    }

    console.log(
      '\nОпубліковані відновлені бюлетені (Voter ID -> Candidate ID):',
    );
    for (const b of this.publishedFinalBallots) {
      const candidateName = this.candidates.get(b.candidateId);
      console.log(
        `ID: ${b.voterId} -> Кандидат ID: ${b.candidateId} (${candidateName})`,
      );
    }
  }
}
