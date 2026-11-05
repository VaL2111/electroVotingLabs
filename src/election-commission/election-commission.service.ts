import { CryptoService } from '../crypto/crypto.service';
import { PublicKey } from '../crypto/crypto.interfaces';
import { VoterRecord } from '../cec/cec.interface';
import {
  PublishedBallotPart,
  SignedBallotPartMessage,
  SignedBallotPayload,
} from '../voter/voter.interface';

export const EC1_TOKEN = 'EC1_SERVICE';
export const EC2_TOKEN = 'EC2_SERVICE';

export class ElectionCommissionService {
  private readonly registeredVoters: Map<string, PublicKey> = new Map();
  private readonly votedVoters: Set<string> = new Set();
  private readonly usedVoterIds: Set<string> = new Set();
  private readonly acceptedParts: PublishedBallotPart[] = [];

  constructor(
    public readonly commissionName: string,
    private readonly cryptoService: CryptoService,
  ) {}

  receiveVoterListFromCEC(voters: VoterRecord[]): void {
    for (const voter of voters) {
      this.registeredVoters.set(voter.fullName, { ...voter.publicKey });
    }
    console.log(
      `${this.commissionName}: Отримано від ЦВК список із ${voters.length} виборців`,
    );
  }

  processBallotPart(message: SignedBallotPartMessage): boolean {
    const voterPublicKey = this.registeredVoters.get(message.fullName);

    if (!voterPublicKey) {
      console.error(
        `${this.commissionName}: Виборець "${message.fullName}" відсутній у списку ЦВК`,
      );
      return false;
    }

    if (this.votedVoters.has(message.fullName)) {
      console.error(
        `${this.commissionName}: Виборець "${message.fullName}" вже надіслав частину бюлетеня`,
      );
      return false;
    }

    if (this.usedVoterIds.has(message.voterId)) {
      console.error(
        `${this.commissionName}: ID виборця "${message.voterId}" вже використовувався`,
      );
      return false;
    }

    const payload: SignedBallotPayload = {
      voterId: message.voterId,
      encryptedPart: message.encryptedPart.toString(),
    };
    const payloadJson = JSON.stringify(payload);
    const hash = this.cryptoService.customHash(payloadJson, voterPublicKey.n);

    const isValidSignature = this.cryptoService.verifySignature(
      hash,
      message.signature,
      voterPublicKey.e,
      voterPublicKey.n,
    );

    if (!isValidSignature) {
      console.error(
        `${this.commissionName}: Недійсний ЕЦП у повідомленні від "${message.fullName}"`,
      );
      return false;
    }

    this.votedVoters.add(message.fullName);
    this.usedVoterIds.add(message.voterId);
    this.acceptedParts.push({
      voterId: message.voterId,
      encryptedPart: message.encryptedPart,
    });

    console.log(
      `${this.commissionName}: Прийнято частину бюлетеня від "${message.fullName}" (ID: ${message.voterId})`,
    );
    return true;
  }

  publishBallotParts(): PublishedBallotPart[] {
    return this.acceptedParts.map((part) => ({ ...part }));
  }
}
