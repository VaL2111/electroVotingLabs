import { PrivateKey, PublicKey } from '../crypto/crypto.interfaces';
import { CryptoService } from '../crypto/crypto.service';
import {
  PublishedBallotPart,
  PublishedFinalBallot,
  SignedBallotPartMessage,
  SignedBallotPayload,
} from './voter.interface';

export class Voter {
  public readonly publicKey: PublicKey;
  private readonly privateKey: PrivateKey;

  private voterId: string | null = null;
  private chosenCandidateId: number | null = null;
  private encryptedPart1: bigint | null = null;
  private encryptedPart2: bigint | null = null;

  constructor(
    public readonly fullName: string,
    private readonly cryptoService: CryptoService,
  ) {
    const keys = cryptoService.generateKeyPair();
    this.publicKey = keys.publicKey;
    this.privateKey = keys.privateKey;
  }

  private splitIntoFactors(candidateId: number): [bigint, bigint] {
    const pairs: [number, number][] = [];

    for (let i = 2; i < candidateId; i++) {
      if (candidateId % i === 0) {
        pairs.push([i, candidateId / i]);
      }
    }

    if (pairs.length === 0) {
      throw new Error(
        `ID кандидата ${candidateId} є простим числом і не ділиться на нетривіальні множники`,
      );
    }

    const randomIndex = Math.floor(Math.random() * pairs.length);
    const [m1, m2] = pairs[randomIndex];

    return [BigInt(m1), BigInt(m2)];
  }

  private createSignedMessage(
    voterId: string,
    encryptedPart: bigint,
  ): SignedBallotPartMessage {
    const payload: SignedBallotPayload = {
      voterId,
      encryptedPart: encryptedPart.toString(),
    };

    const payloadJson = JSON.stringify(payload);
    const hash = this.cryptoService.customHash(payloadJson, this.privateKey.n);
    const signature = this.cryptoService.sign(
      hash,
      this.privateKey.d,
      this.privateKey.n,
    );

    return {
      fullName: this.fullName,
      voterId,
      encryptedPart,
      signature,
    };
  }

  prepareSplitVote(
    candidateId: number,
    cecPublicKey: PublicKey,
  ): [SignedBallotPartMessage, SignedBallotPartMessage] {
    this.voterId = this.cryptoService.generateRandomId();
    this.chosenCandidateId = candidateId;

    const [factor1, factor2] = this.splitIntoFactors(candidateId);

    this.encryptedPart1 = this.cryptoService.encrypt(
      factor1,
      cecPublicKey.e,
      cecPublicKey.n,
    );
    this.encryptedPart2 = this.cryptoService.encrypt(
      factor2,
      cecPublicKey.e,
      cecPublicKey.n,
    );

    const messageForEC1 = this.createSignedMessage(
      this.voterId,
      this.encryptedPart1,
    );
    const messageForEC2 = this.createSignedMessage(
      this.voterId,
      this.encryptedPart2,
    );

    return [messageForEC1, messageForEC2];
  }

  verifyPublishedParts(
    ec1Published: PublishedBallotPart[],
    ec2Published: PublishedBallotPart[],
  ): boolean {
    if (
      !this.voterId ||
      this.encryptedPart1 === null ||
      this.encryptedPart2 === null
    ) {
      console.error(`${this.fullName} ще не голосував`);
      return false;
    }

    const part1 = ec1Published.find((p) => p.voterId === this.voterId);
    const part2 = ec2Published.find((p) => p.voterId === this.voterId);

    if (!part1 || !part2) {
      console.error(
        `${this.fullName}: частина бюлетеня з ID ${this.voterId} відсутня у списках ВК`,
      );
      return false;
    }

    if (part1.encryptedPart !== this.encryptedPart1) {
      console.error(
        `${this.fullName}: ВК-1 опублікувала змінену частину бюлетеня! Очікувалось ${this.encryptedPart1}, отримано ${part1.encryptedPart}`,
      );
      return false;
    }

    if (part2.encryptedPart !== this.encryptedPart2) {
      console.error(
        `${this.fullName}: ВК-2 опублікувала змінену частину бюлетеня! Очікувалось ${this.encryptedPart2}, отримано ${part2.encryptedPart}`,
      );
      return false;
    }

    console.log(
      `${this.fullName}: обидві частини бюлетеня у ВК-1 та ВК-2 опубліковані без змін`,
    );
    return true;
  }

  verifyFinalVote(finalBallots: PublishedFinalBallot[]): boolean {
    if (!this.voterId || this.chosenCandidateId === null) {
      console.error(`${this.fullName} ще не голосував`);
      return false;
    }

    const found = finalBallots.find((b) => b.voterId === this.voterId);

    if (!found) {
      console.error(
        `${this.fullName}: фінальний бюлетень з ID ${this.voterId} відсутній у результатах ЦВК`,
      );
      return false;
    }

    if (found.candidateId !== this.chosenCandidateId) {
      console.error(
        `${this.fullName}: фінальний голос у ЦВК підмінено! Очікувався кандидат ID ${this.chosenCandidateId}, але записано ${found.candidateId}`,
      );
      return false;
    }

    console.log(
      `${this.fullName}: фінальний голос за кандидата ID ${found.candidateId} у ЦВК враховано коректно`,
    );
    return true;
  }
}
