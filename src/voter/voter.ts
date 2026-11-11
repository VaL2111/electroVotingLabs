import { PrivateKey, PublicKey } from '../crypto/crypto.interfaces';
import { CryptoService } from '../crypto/crypto.service';
import { SignedBallotBatch, VoterPublicInfo } from './voter.interface';

export class Voter {
  public readonly publicKey: PublicKey;
  private readonly privateKey: PrivateKey;

  private votersList: VoterPublicInfo[] = [];
  private candidates: string[] = [];
  private rp1: string | null = null;
  private rp2: string | null = null;

  constructor(
    public readonly name: string,
    private readonly cryptoService: CryptoService,
  ) {
    const keys = cryptoService.generateKeyPair();
    this.publicKey = keys.publicKey;
    this.privateKey = keys.privateKey;
  }

  setElectionData(votersList: VoterPublicInfo[], candidates: string[]): void {
    this.votersList = votersList.map((v) => ({
      name: v.name,
      publicKey: { ...v.publicKey },
    }));
    this.candidates = [...candidates];
  }

  private encryptRound(
    data: string,
    encryptionOrder: VoterPublicInfo[],
    rp: string,
  ): string {
    let current = data;

    for (const voter of encryptionOrder) {
      if (voter.name === this.name) {
        current += rp;
      }
      current = this.cryptoService.encrypt(
        current,
        voter.publicKey.e,
        voter.publicKey.n,
      );
    }

    return current;
  }

  createEncryptedBallot(candidateName: string): string {
    if (!this.candidates.includes(candidateName)) {
      throw new Error(`Кандидат "${candidateName}" відсутній у списку`);
    }

    if (this.votersList.length === 0) {
      throw new Error('Список виборців не ініціалізовано');
    }

    this.rp1 = this.cryptoService.generateRandomId();
    this.rp2 = this.cryptoService.generateRandomId();

    const encryptionOrder = [...this.votersList].reverse();

    const round1Cipher = this.encryptRound(
      candidateName,
      encryptionOrder,
      this.rp1,
    );
    const round2Cipher = this.encryptRound(
      round1Cipher,
      encryptionOrder,
      this.rp2,
    );

    console.log(
      `Виборець ${this.name}: зашифрував бюлетень у 2 раунди (RP1=${this.rp1}, RP2=${this.rp2})`,
    );

    return round2Cipher;
  }

  private signBatch(ballots: string[]): SignedBallotBatch {
    const payloadJson = JSON.stringify(ballots);
    const hash = this.cryptoService.customHash(payloadJson, this.privateKey.n);
    const signature = this.cryptoService.sign(
      hash,
      this.privateKey.d,
      this.privateKey.n,
    );

    return {
      senderName: this.name,
      ballots,
      signature,
    };
  }

  private verifyBatchSignature(batch: SignedBallotBatch): boolean {
    const sender = this.votersList.find((v) => v.name === batch.senderName);
    if (!sender) {
      console.error(
        `Виборець ${this.name}: невідомий відправник набору "${batch.senderName}"`,
      );
      return false;
    }

    const payloadJson = JSON.stringify(batch.ballots);
    const hash = this.cryptoService.customHash(payloadJson, sender.publicKey.n);

    const isValid = this.cryptoService.verifySignature(
      hash,
      batch.signature,
      sender.publicKey.e,
      sender.publicKey.n,
    );

    if (!isValid) {
      console.error(
        `Виборець ${this.name}: недійсний ЕЦП від виборця ${batch.senderName}`,
      );
      return false;
    }

    return true;
  }

  processDecryptionStep(
    input: string[] | SignedBallotBatch,
    round: 1 | 2,
  ): SignedBallotBatch | null {
    const isInitialStep =
      round === 1 &&
      Array.isArray(input) &&
      this.votersList[0]?.name === this.name;

    if (!Array.isArray(input)) {
      if (!this.verifyBatchSignature(input)) {
        return null;
      }
    } else if (!isInitialStep) {
      console.error(
        `Виборець ${this.name}: очікувався підписаний набір бюлетенів із ЕЦП попереднього учасника`,
      );
      return null;
    }

    const incomingBallots = Array.isArray(input) ? input : input.ballots;

    if (incomingBallots.length !== this.votersList.length) {
      console.error(
        `Виборець ${this.name}: порушено кількість бюлетенів. Очікувалось ${this.votersList.length}, отримано ${incomingBallots.length}`,
      );
      return null;
    }

    const expectedRp = round === 1 ? this.rp2 : this.rp1;
    if (!expectedRp) {
      console.error(
        `Виборець ${this.name}: відсутній збережений RP для раунду ${round}`,
      );
      return null;
    }

    let foundOwnRp = false;
    const decryptedBallots: string[] = [];

    try {
      for (const ballot of incomingBallots) {
        const decrypted = this.cryptoService.decrypt(
          ballot,
          this.privateKey.d,
          this.privateKey.n,
        );

        if (!foundOwnRp && decrypted.endsWith(expectedRp)) {
          foundOwnRp = true;
          decryptedBallots.push(decrypted.slice(0, -expectedRp.length));
        } else {
          decryptedBallots.push(decrypted);
        }
      }
    } catch {
      console.error(
        `Виборець ${this.name}: помилка розшифрування бюлетенів у раунді ${round}`,
      );
      return null;
    }

    if (!foundOwnRp) {
      console.error(
        `Виборець ${this.name}: власний RP (${expectedRp}) не знайдено у раунді ${round}! Бюлетень втрачено або підмінено`,
      );
      return null;
    }

    const shuffledBallots = this.cryptoService.shuffle(decryptedBallots);
    const signedBatch = this.signBatch(shuffledBallots);

    console.log(
      `Виборець ${this.name} [Раунд ${round}]: перевірив набір, зняв шар RSA, видалив власний RP (${expectedRp}), перемішав і підписав ЕЦП`,
    );

    return signedBatch;
  }

  countVotes(openBallots: string[]): Record<string, number> | null {
    if (openBallots.length !== this.votersList.length) {
      console.error(
        `Виборець ${this.name}: некоректна кількість відкритих бюлетенів при підрахунку (${openBallots.length} замість ${this.votersList.length})`,
      );
      return null;
    }

    const tally: Record<string, number> = {};
    for (const candidate of this.candidates) {
      tally[candidate] = 0;
    }

    for (const vote of openBallots) {
      if (tally[vote] === undefined) {
        console.error(
          `Виборець ${this.name}: виявлено недійсний голос за невідомого кандидата "${vote}"`,
        );
        return null;
      }
      tally[vote]++;
    }

    return tally;
  }

  verifyResults(
    openBallots: string[],
    publishedResults: Record<string, number>,
  ): boolean {
    const ownTally = this.countVotes(openBallots);
    if (!ownTally) {
      return false;
    }

    for (const candidate of this.candidates) {
      if (ownTally[candidate] !== publishedResults[candidate]) {
        console.error(
          `Виборець ${this.name}: невідповідність підрахунку для "${candidate}"! Очікувалось ${ownTally[candidate]}, опубліковано ${publishedResults[candidate]}`,
        );
        return false;
      }
    }

    console.log(
      `Виборець ${this.name}: самостійний перерахунок підтвердив правильність результатів: ${JSON.stringify(ownTally)}`,
    );
    return true;
  }
}
