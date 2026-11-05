import { Injectable } from '@nestjs/common';
import { CryptoService } from '../crypto/crypto.service';
import { PrivateKey, PublicKey } from '../crypto/crypto.interfaces';
import { AnonymousVoterRecord } from '../registration/registration.interface';
import {
  Ballot,
  PublishedBallot,
  SignedVotePayload,
} from '../voter/voter.interface';

@Injectable()
export class VotingService {
  public readonly ecPublicKey: PublicKey;
  private readonly ecPrivateKey: PrivateKey;

  private readonly candidates: string[] = [];
  private readonly validRns: Map<string, PublicKey> = new Map();
  private readonly usedRns: Set<string> = new Set();
  private readonly usedIds: Set<string> = new Set();
  private readonly votesCount: Map<string, number> = new Map();
  private readonly publishedBallots: PublishedBallot[] = [];

  constructor(private readonly cryptoService: CryptoService) {
    const keys = this.cryptoService.generateKeyPair();
    this.ecPublicKey = keys.publicKey;
    this.ecPrivateKey = keys.privateKey;
  }

  registerCandidate(fullName: string): void {
    this.candidates.push(fullName);
    this.votesCount.set(fullName, 0);
    console.log(`Зареєстровано кандидата: ${fullName}`);
  }

  receiveVoterRegistryFromBR(records: AnonymousVoterRecord[]): void {
    for (const record of records) {
      this.validRns.set(record.rn, record.publicKey);
    }
    console.log(
      `Отримано від БР список із ${records.length} дійсних RN та публічних ключів`,
    );
  }

  processBallot(encryptedBallot: bigint[]): boolean {
    try {
      const decrypted = this.cryptoService.decrypt(
        encryptedBallot,
        this.ecPrivateKey.d,
        this.ecPrivateKey.n,
      );

      const parsed = JSON.parse(decrypted) as SignedVotePayload;
      const ballot = JSON.parse(parsed.ballot) as Ballot;
      const signature = BigInt(parsed.signature);

      if (!ballot.rn || !this.validRns.has(ballot.rn)) {
        console.error(
          `Недійсний RN "${ballot.rn ?? 'відсутній'}" (немає у списку від БР)`,
        );
        return false;
      }

      if (this.usedRns.has(ballot.rn)) {
        console.error(`RN "${ballot.rn}" вже був використаний раніше`);
        return false;
      }

      if (this.usedIds.has(ballot.id)) {
        console.error(`ID бюлетеня "${ballot.id}" вже використовувався`);
        return false;
      }

      const voterPublicKey = this.validRns.get(ballot.rn)!;
      const hash = this.cryptoService.customHash(
        parsed.ballot,
        voterPublicKey.n,
      );
      const isValidSignature = this.cryptoService.verifySignature(
        hash,
        signature,
        voterPublicKey.e,
        voterPublicKey.n,
      );

      if (!isValidSignature) {
        console.error(
          `Недійсний ЕЦП для RN "${ballot.rn}" (порушена цілісність або чужий ключ)`,
        );
        return false;
      }

      const currentVotes = this.votesCount.get(ballot.candidate);
      if (currentVotes === undefined) {
        console.error(`Неіснуючий кандидат "${ballot.candidate}"`);
        return false;
      }

      this.usedRns.add(ballot.rn);
      this.usedIds.add(ballot.id);
      this.votesCount.set(ballot.candidate, currentVotes + 1);
      this.publishedBallots.push({
        id: ballot.id,
        candidate: ballot.candidate,
        signature: signature.toString(),
      });

      console.log(
        `Бюлетень прийнято (ID: ${ballot.id}, Кандидат: ${ballot.candidate})`,
      );
      return true;
    } catch {
      console.error(`Повідомлення пошкоджено або розшифрування не вдалося`);
      return false;
    }
  }

  getPublishedBallots(): PublishedBallot[] {
    return this.publishedBallots.map((b) => ({ ...b }));
  }

  publishResults(): void {
    console.log('ПІДСУМКИ ГОЛОСУВАННЯ (ВИБОРЧА КОМІСІЯ)');

    for (const [candidate, count] of this.votesCount.entries()) {
      console.log(`Кандидат ${candidate}: ${count} голосів`);
    }

    console.log('\nОпубліковані бюлетені (ID -> Кандидат | Підпис):');
    for (const b of this.publishedBallots) {
      console.log(`ID: ${b.id} -> ${b.candidate} (ЕЦП: ${b.signature})`);
    }

    let maxVotes = -1;
    let winners: string[] = [];
    for (const [candidate, count] of this.votesCount.entries()) {
      if (count > maxVotes) {
        maxVotes = count;
        winners = [candidate];
      } else if (count === maxVotes) {
        winners.push(candidate);
      }
    }

    console.log('--------------------------------------------');
    if (winners.length > 1) {
      console.log(`Нічия між: ${winners.join(', ')} (${maxVotes} голосів)`);
    } else {
      console.log(`Переможець: ${winners[0]} (${maxVotes} голосів)`);
    }
  }
}
