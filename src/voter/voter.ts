import { PrivateKey, PublicKey } from '../crypto/crypto.interfaces';
import { CryptoService } from '../crypto/crypto.service';
import {
  BallotPartPayload,
  PublishedBallotPart,
  PublishedFinalBallot,
  SignedVoterPacket,
} from '../common/protocol.interfaces';

export class Voter {
  public readonly publicKey: PublicKey;
  private readonly privateKey: PrivateKey;

  private registrationNumber: string | null = null;
  private voterId: string | null = null;
  private chosenCandidateId: number | null = null;
  private encryptedFactors: bigint[] = [];

  constructor(
    public readonly fullName: string,
    private readonly cryptoService: CryptoService,
  ) {
    const keys = this.cryptoService.generateKeyPair();
    this.publicKey = keys.publicKey;
    this.privateKey = keys.privateKey;
  }

  setRegistrationNumber(registrationNumber: string): void {
    if (!registrationNumber.trim()) {
      throw new Error('RN не може бути порожнім');
    }
    this.registrationNumber = registrationNumber.trim();
  }

  createEncryptedBallotPackets(
    candidateId: number,
    cecPublicKey: PublicKey,
    lowCommissionPublicKeys: PublicKey[],
  ): bigint[][] {
    if (!this.registrationNumber) {
      throw new Error(`Виборець "${this.fullName}" не має RN`);
    }

    this.voterId = this.cryptoService.generateRandomId();
    this.chosenCandidateId = candidateId;

    const factors = this.cryptoService.splitIntoFactors(candidateId);
    this.encryptedFactors = factors.map((factor) =>
      this.cryptoService.encryptNumber(factor, cecPublicKey.e, cecPublicKey.n),
    );

    return this.encryptedFactors.map((encryptedFactor, index) => {
      const payload: BallotPartPayload = {
        voterId: this.voterId!,
        registrationNumber: this.registrationNumber!,
        encryptedPart: encryptedFactor.toString(),
      };

      const hash = this.cryptoService.customHash(
        JSON.stringify(payload),
        this.publicKey.n,
      );
      const signature = this.cryptoService.sign(
        hash,
        this.privateKey.d,
        this.privateKey.n,
      );

      const signedPacket: SignedVoterPacket = {
        ...payload,
        signature: signature.toString(),
      };

      const lcPubKey = lowCommissionPublicKeys[index];
      return this.cryptoService.encryptText(
        JSON.stringify(signedPacket),
        lcPubKey.e,
        lcPubKey.n,
      );
    });
  }

  verifyVoteInPublishedData(
    lowCommissionParts: PublishedBallotPart[][],
    midCommissionParts: PublishedBallotPart[][],
    finalBallots: PublishedFinalBallot[],
    cecPublicKey: PublicKey,
  ): boolean {
    if (
      !this.voterId ||
      this.chosenCandidateId === null ||
      this.encryptedFactors.length !== 4
    ) {
      console.error(
        `Виборець "${this.fullName}": неможливо перевірити голос до формування бюлетеня`,
      );
      return false;
    }

    for (let i = 0; i < lowCommissionParts.length; i++) {
      const record = lowCommissionParts[i].find(
        (part) => part.voterId === this.voterId,
      );
      if (!record || record.encryptedPart !== this.encryptedFactors[i]) {
        console.error(
          `Виборець "${this.fullName}": виявлено відсутність або підміну у ВКН-${i + 1}`,
        );
        return false;
      }
    }

    for (let i = 0; i < midCommissionParts.length; i++) {
      const expectedProduct = this.cryptoService.multiplyCiphertexts(
        this.encryptedFactors[i * 2],
        this.encryptedFactors[i * 2 + 1],
        cecPublicKey.n,
      );
      const record = midCommissionParts[i].find(
        (part) => part.voterId === this.voterId,
      );
      if (!record || record.encryptedPart !== expectedProduct) {
        console.error(
          `Виборець "${this.fullName}": виявлено відсутність або підміну у ВКС-${i + 1}`,
        );
        return false;
      }
    }

    const finalRecord = finalBallots.find(
      (ballot) => ballot.voterId === this.voterId,
    );
    if (!finalRecord || finalRecord.candidateId !== this.chosenCandidateId) {
      console.error(
        `Виборець "${this.fullName}": голос відсутній або спотворений у фінальному протоколі ЦВК`,
      );
      return false;
    }

    console.log(
      `Виборець "${this.fullName}": успішно перевірив незмінність свого голосу на ВСІХ рівнях`,
    );
    return true;
  }
}
