import { Injectable } from '@nestjs/common';
import { CryptoService } from '../crypto/crypto.service';

export interface PublicKey {
  e: bigint;
  n: bigint;
}

export interface PrivateKey {
  d: bigint;
  n: bigint;
}

interface Ballot {
  id: string;
  candidate: string;
}

interface BallotSetData {
  ballots: Ballot[];
  hashes: bigint[];
  blindingFactors: { r: bigint; rInv: bigint }[];
  blindedHashes: bigint[];
}

interface RevealedSet {
  ballots: Ballot[];
  blindingFactors: bigint[];
}

interface PendingVerification {
  blindedSets: bigint[][];
  indicesToReveal: number[];
  unrevealedIndex: number;
}

export class Voter {
  public readonly fullName: string;
  private ballotSets: BallotSetData[] = [];
  private unrevealedIndex = -1;
  private unblindedSignatures: bigint[] = [];

  constructor(
    fullName: string,
    private readonly crypto: CryptoService,
  ) {
    this.fullName = fullName;
  }

  // Формує 10 наборів бюлетенів, хешує, маскує і повертає масив замаскованих наборів
  prepareBallotSets(
    candidates: string[],
    ecPublicKey: PublicKey,
    cheatAtIndex?: number,
  ): bigint[][] {
    this.ballotSets = [];

    for (let i = 0; i < 10; i++) {
      const id = Math.random().toString(36).substring(2, 12);

      // cheatAtIndex — для негативного сценарію
      const ballots: Ballot[] =
        cheatAtIndex === i
          ? candidates.map(() => ({ id, candidate: candidates[0] }))
          : candidates.map((candidate) => ({ id, candidate }));

      const hashes = ballots.map((b) =>
        this.crypto.customHash(JSON.stringify(b), ecPublicKey.n),
      );

      const blindingFactors = hashes.map(() =>
        this.crypto.generateBlindingFactor(ecPublicKey.n),
      );

      const blindedHashes = hashes.map((h, j) =>
        this.crypto.blindHash(
          h,
          blindingFactors[j].r,
          ecPublicKey.e,
          ecPublicKey.n,
        ),
      );

      this.ballotSets.push({ ballots, hashes, blindingFactors, blindedHashes });
    }

    return this.ballotSets.map((set) => set.blindedHashes);
  }

  // Розкриває 9 наборів, тобто повертає масив об'єктів
  // в свою чергу об'єкт складається з оригінальних бюлетенів + множники маскування
  revealSets(indicesToReveal: number[]): RevealedSet[] {
    this.unrevealedIndex = Array.from({ length: 10 }, (_, i) => i).find(
      (i) => !indicesToReveal.includes(i),
    )!;

    return indicesToReveal.map((i) => ({
      ballots: this.ballotSets[i].ballots,
      blindingFactors: this.ballotSets[i].blindingFactors.map((bf) => bf.r),
    }));
  }

  // Знімає маскування з отриманих сліпих підписів
  unblindSignatures(blindSignatures: bigint[], n: bigint): void {
    const set = this.ballotSets[this.unrevealedIndex];
    this.unblindedSignatures = blindSignatures.map((s, i) =>
      this.crypto.unblindSignature(s, set.blindingFactors[i].rInv, n),
    );
  }

  // Обирає бюлетень, шифрує {бюлетень, підпис} публічним ключем ВК
  castVote(candidateName: string, ecPublicKey: PublicKey): bigint[] {
    const set = this.ballotSets[this.unrevealedIndex];
    const candidateIndex = set.ballots.findIndex(
      (b) => b.candidate === candidateName,
    );

    const ballot = set.ballots[candidateIndex];
    const signature = this.unblindedSignatures[candidateIndex];

    const payload = JSON.stringify({
      ballot: JSON.stringify(ballot),
      signature: signature.toString(),
    });

    return this.crypto.encrypt(payload, ecPublicKey.e, ecPublicKey.n);
  }
}

@Injectable()
export class VotingService {
  public readonly ecPublicKey: PublicKey;
  private readonly ecPrivateKey: PrivateKey;

  private readonly candidates: string[] = [];
  private readonly registeredVoters: Set<string> = new Set();
  private readonly hasReceivedSignedSet: Set<string> = new Set();
  private readonly usedIds: Set<string> = new Set();
  private readonly votesCount: Map<string, number> = new Map();
  private readonly pendingVerifications: Map<string, PendingVerification> =
    new Map();
  private readonly publishedBallots: {
    id: string;
    candidate: string;
    signature: string;
  }[] = [];

  constructor(private readonly cryptoService: CryptoService) {
    const keys = this.cryptoService.generateKeyPair();
    this.ecPublicKey = keys.publicKey;
    this.ecPrivateKey = keys.privateKey;
  }

  registerCandidate(name: string): void {
    this.candidates.push(name);
    this.votesCount.set(name, 0);
    console.log(`[ВК] Зареєстровано кандидата: ${name}`);
  }

  registerVoter(name: string): void {
    this.registeredVoters.add(name);
    console.log(`[ВК] Зареєстровано виборця: ${name}`);
  }

  // Приймає замасковані хеші, обирає 9 для перевірки
  // Повертається масив індексів, тобто набори, які потрібно перевірити
  receiveBlindedHashes(
    voterName: string,
    blindedSets: bigint[][],
  ): number[] | null {
    if (!this.registeredVoters.has(voterName)) {
      console.error(`[ВІДХИЛЕНО] ${voterName} не зареєстрований`);
      return null;
    }
    if (this.hasReceivedSignedSet.has(voterName)) {
      console.error(`[ВІДХИЛЕНО] ${voterName} вже отримував підписаний набір`);
      return null;
    }

    const unrevealedIndex = Math.floor(Math.random() * 10);
    const indicesToReveal = Array.from({ length: 10 }, (_, i) => i).filter(
      (i) => i !== unrevealedIndex,
    );

    this.pendingVerifications.set(voterName, {
      blindedSets,
      indicesToReveal,
      unrevealedIndex,
    });

    console.log(
      `[ВК] Отримано 10 наборів від ${voterName}. Розкрити набори: [${indicesToReveal.join(
        ', ',
      )}]`,
    );
    return indicesToReveal;
  }

  // Перевіряє 9 наборів, підписує 10-й наосліп
  verifyAndSign(
    voterName: string,
    revealedSets: RevealedSet[],
  ): bigint[] | null {
    const pending = this.pendingVerifications.get(voterName);
    if (!pending) return null;

    const { blindedSets, indicesToReveal, unrevealedIndex } = pending;
    const { e, n } = this.ecPublicKey;

    for (let i = 0; i < indicesToReveal.length; i++) {
      const setIndex = indicesToReveal[i];
      const revealed = revealedSets[i];

      // Перевірка: кількість бюлетенів = кількість кандидатів
      if (revealed.ballots.length !== this.candidates.length) {
        console.error(
          `  [ВІДХИЛЕНО] Набір ${setIndex}: неправильна кількість бюлетенів`,
        );
        this.pendingVerifications.delete(voterName);
        return null;
      }

      // Перевірка: однаковий ID в наборі
      const ids = revealed.ballots.map((b) => b.id);
      if (new Set(ids).size !== 1) {
        console.error(
          `  [ВІДХИЛЕНО] Набір ${setIndex}: різні ID в одному наборі`,
        );
        this.pendingVerifications.delete(voterName);
        return null;
      }

      // Перевірка на кандидатів, що не зареєстровані
      const candidatesInSet = revealed.ballots.map((b) => b.candidate).sort();
      const expectedCandidates = [...this.candidates].sort();
      if (
        JSON.stringify(candidatesInSet) !== JSON.stringify(expectedCandidates)
      ) {
        console.error(
          `  [ВІДХИЛЕНО] Набір ${setIndex}: неправильний список кандидатів`,
        );
        this.pendingVerifications.delete(voterName);
        return null;
      }

      // Перевірка: замасковані хеші збігаються
      for (let j = 0; j < revealed.ballots.length; j++) {
        const hash = this.cryptoService.customHash(
          JSON.stringify(revealed.ballots[j]),
          n,
        );
        const expectedBlindedHash = this.cryptoService.blindHash(
          hash,
          revealed.blindingFactors[j],
          e,
          n,
        );

        if (expectedBlindedHash !== blindedSets[setIndex][j]) {
          console.error(
            `  [ВІДХИЛЕНО] Набір ${setIndex}, бюлетень ${j}: хеш не збігається`,
          );
          this.pendingVerifications.delete(voterName);
          return null;
        }
      }
    }

    // Всі 9 наборів коректні → підписуємо 10-й наосліп
    const blindSignatures = blindedSets[unrevealedIndex].map((blindedHash) =>
      this.cryptoService.sign(
        blindedHash,
        this.ecPrivateKey.d,
        this.ecPrivateKey.n,
      ),
    );

    this.hasReceivedSignedSet.add(voterName);
    this.pendingVerifications.delete(voterName);

    console.log(`[ВК] 9 наборів перевірено. Підписано 10-й набір наосліп`);
    return blindSignatures;
  }

  // Приймає анонімний бюлетень
  processAnonymousBallot(encryptedBallot: bigint[]): boolean {
    try {
      const decrypted = this.cryptoService.decrypt(
        encryptedBallot,
        this.ecPrivateKey.d,
        this.ecPrivateKey.n,
      );
      const parsed = JSON.parse(decrypted);
      const ballot: Ballot = JSON.parse(parsed.ballot);
      const signature = BigInt(parsed.signature);

      const hash = this.cryptoService.customHash(
        parsed.ballot,
        this.ecPublicKey.n,
      );
      const isValid = this.cryptoService.verifySignature(
        hash,
        signature,
        this.ecPublicKey.e,
        this.ecPublicKey.n,
      );

      if (!isValid) {
        console.error(`[ВІДХИЛЕНО] Недійсний підпис ВК`);
        return false;
      }

      if (this.usedIds.has(ballot.id)) {
        console.error(`[ВІДХИЛЕНО] ID "${ballot.id}" вже використовувався`);
        return false;
      }

      const currentVotes = this.votesCount.get(ballot.candidate);
      if (currentVotes === undefined) {
        console.error(`[ВІДХИЛЕНО] Неіснуючий кандидат "${ballot.candidate}"`);
        return false;
      }

      this.usedIds.add(ballot.id);
      this.votesCount.set(ballot.candidate, currentVotes + 1);
      this.publishedBallots.push({
        id: ballot.id,
        candidate: ballot.candidate,
        signature: signature.toString(),
      });

      console.log(
        `[УСПІХ] Анонімний бюлетень прийнято (ID: ${ballot.id}, Кандидат: ${ballot.candidate})`,
      );
      return true;
    } catch {
      console.error(
        `[ВІДХИЛЕНО] Бюлетень пошкоджено або розшифрування не вдалося`,
      );
      return false;
    }
  }

  publishResults(): void {
    console.log('\nПІДСУМКИ ГОЛОСУВАННЯ');

    for (const [candidate, count] of this.votesCount.entries()) {
      console.log(`Кандидат ${candidate}: ${count} голосів`);
    }

    console.log('\nОпубліковані бюлетені');
    for (const b of this.publishedBallots) {
      console.log(`ID: ${b.id} → ${b.candidate}`);
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
      console.log(`  Нічия між: ${winners.join(', ')} (${maxVotes} голосів)`);
    } else {
      console.log(`  Переможець: ${winners[0]} (${maxVotes} голосів)`);
    }
  }
}
