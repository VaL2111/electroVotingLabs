import { CryptoService } from '../crypto/crypto.service';
import { PrivateKey, PublicKey } from '../crypto/crypto.interfaces';
import {
  PublishedBallotPart,
  SignedCommissionBatch,
} from '../common/protocol.interfaces';

export const MC1_TOKEN = 'MC1_SERVICE';
export const MC2_TOKEN = 'MC2_SERVICE';

export class MidCommissionService {
  public readonly publicKey: PublicKey;
  private readonly privateKey: PrivateKey;

  constructor(
    public readonly commissionName: string,
    private readonly cryptoService: CryptoService,
  ) {
    const keys = this.cryptoService.generateKeyPair();
    this.publicKey = keys.publicKey;
    this.privateKey = keys.privateKey;
  }

  private verifyBatchSignature(
    batch: SignedCommissionBatch,
    senderPublicKey: PublicKey,
  ): boolean {
    const payloadJson = JSON.stringify({
      commissionName: batch.commissionName,
      parts: batch.parts.map((part) => ({
        voterId: part.voterId,
        encryptedPart: part.encryptedPart.toString(),
      })),
    });
    const hash = this.cryptoService.customHash(payloadJson, senderPublicKey.n);

    return this.cryptoService.verifySignature(
      hash,
      batch.signature,
      senderPublicKey.e,
      senderPublicKey.n,
    );
  }

  aggregateBatches(
    batch1: SignedCommissionBatch,
    lc1PublicKey: PublicKey,
    batch2: SignedCommissionBatch,
    lc2PublicKey: PublicKey,
    maxRegisteredVoters: number,
    cecPublicKey: PublicKey,
  ): SignedCommissionBatch | null {
    if (!this.verifyBatchSignature(batch1, lc1PublicKey)) {
      console.error(
        `${this.commissionName}: недійсний ЕЦП від "${batch1.commissionName}"`,
      );
      return null;
    }

    if (!this.verifyBatchSignature(batch2, lc2PublicKey)) {
      console.error(
        `${this.commissionName}: недійсний ЕЦП від "${batch2.commissionName}"`,
      );
      return null;
    }

    if (
      batch1.parts.length > maxRegisteredVoters ||
      batch2.parts.length > maxRegisteredVoters
    ) {
      console.error(
        `${this.commissionName}: кількість бюлетенів перевищує ліміт зареєстрованих виборців БР (${maxRegisteredVoters})`,
      );
      return null;
    }

    if (batch1.parts.length !== batch2.parts.length) {
      console.error(
        `${this.commissionName}: різна кількість бюлетенів між "${batch1.commissionName}" (${batch1.parts.length}) та "${batch2.commissionName}" (${batch2.parts.length})`,
      );
      return null;
    }

    const batch1Map = new Map<string, bigint>();
    for (const part of batch1.parts) {
      if (batch1Map.has(part.voterId)) {
        console.error(
          `${this.commissionName}: виявлено дублікат voterId "${part.voterId}" у батчі "${batch1.commissionName}"`,
        );
        return null;
      }
      batch1Map.set(part.voterId, part.encryptedPart);
    }

    const seenInBatch2 = new Set<string>();
    const aggregatedParts: PublishedBallotPart[] = [];

    for (const part2 of batch2.parts) {
      if (seenInBatch2.has(part2.voterId)) {
        console.error(
          `${this.commissionName}: виявлено дублікат voterId "${part2.voterId}" у батчі "${batch2.commissionName}"`,
        );
        return null;
      }
      seenInBatch2.add(part2.voterId);

      const part1Encrypted = batch1Map.get(part2.voterId);
      if (part1Encrypted === undefined) {
        console.error(
          `${this.commissionName}: відсутня парна частка для voterId "${part2.voterId}" між "${batch1.commissionName}" та "${batch2.commissionName}"`,
        );
        return null;
      }

      const encryptedProduct = this.cryptoService.multiplyCiphertexts(
        part1Encrypted,
        part2.encryptedPart,
        cecPublicKey.n,
      );

      aggregatedParts.push({
        voterId: part2.voterId,
        encryptedPart: encryptedProduct,
      });
    }

    const payloadJson = JSON.stringify({
      commissionName: this.commissionName,
      parts: aggregatedParts.map((part) => ({
        voterId: part.voterId,
        encryptedPart: part.encryptedPart.toString(),
      })),
    });
    const hash = this.cryptoService.customHash(payloadJson, this.publicKey.n);
    const signature = this.cryptoService.sign(
      hash,
      this.privateKey.d,
      this.privateKey.n,
    );

    console.log(
      `${this.commissionName}: успішно зведено та гомоморфно перемножено ${aggregatedParts.length} часток від "${batch1.commissionName}" та "${batch2.commissionName}"`,
    );

    return {
      commissionName: this.commissionName,
      parts: aggregatedParts,
      signature,
    };
  }
}
