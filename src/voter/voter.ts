import { PrivateKey, PublicKey } from '../crypto/crypto.interfaces';
import { CryptoService } from '../crypto/crypto.service';
import { Ballot, PublishedBallot, SignedVotePayload } from './voter.interface';

export class Voter {
  public readonly publicKey: PublicKey;
  private readonly privateKey: PrivateKey;

  private ballotId: string | null = null;
  private rn: string | null = null;
  private chosenCandidate: string | null = null;

  constructor(
    public readonly fullName: string,
    private readonly cryptoService: CryptoService,
  ) {
    const keys = cryptoService.generateKeyPair();
    this.publicKey = keys.publicKey;
    this.privateKey = keys.privateKey;
  }

  setRn(rn: string): void {
    this.rn = rn;
  }

  prepareEncryptedVote(candidate: string, ecPublicKey: PublicKey): bigint[] {
    this.ballotId = this.cryptoService.generateRandomId();
    this.chosenCandidate = candidate;

    const ballot: Ballot = {
      id: this.ballotId,
      rn: this.rn,
      candidate,
    };

    const ballotJson = JSON.stringify(ballot);
    const ballotHash = this.cryptoService.customHash(
      ballotJson,
      this.privateKey.n,
    );

    const signature = this.cryptoService.sign(
      ballotHash,
      this.privateKey.d,
      this.privateKey.n,
    );

    const payload: SignedVotePayload = {
      ballot: ballotJson,
      signature: signature.toString(),
    };

    return this.cryptoService.encrypt(
      JSON.stringify(payload),
      ecPublicKey.e,
      ecPublicKey.n,
    );
  }

  verifyMyVote(publishBallots: PublishedBallot[]): boolean {
    if (!this.ballotId || !this.chosenCandidate) {
      console.error(`${this.fullName} ще не голосував`);
      return false;
    }

    const found = publishBallots.find((b) => b.id === this.ballotId);

    if (!found) {
      console.error(
        `${this.fullName}: бюлетень з id ${this.ballotId} відсутній у результатах`,
      );
      return false;
    }

    if (found.candidate !== this.chosenCandidate) {
      console.error(
        `${this.fullName}: голос підмінено. Очікувався ${this.chosenCandidate}, але записано ${found.candidate}`,
      );
      return false;
    }

    console.log(
      `${this.fullName}: голос за ${found.candidate} враховано коректно`,
    );
    return true;
  }
}
