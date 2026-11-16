import { Injectable } from '@nestjs/common';
import { CryptoService } from '../crypto/crypto.service';
import { PrivateKey, PublicKey } from '../crypto/crypto.interfaces';
import {
  Candidate,
  ElectionResults,
  PublishedFinalBallot,
  SignedCommissionBatch,
} from '../common/protocol.interfaces';

@Injectable()
export class CecService {
  public readonly publicKey: PublicKey;
  private readonly privateKey: PrivateKey;

  private readonly compositeIdsPool = [210, 300, 420, 600, 840];
  private readonly candidates: Map<number, string> = new Map();

  constructor(private readonly cryptoService: CryptoService) {
    const keys = this.cryptoService.generateKeyPair();
    this.publicKey = keys.publicKey;
    this.privateKey = keys.privateKey;
  }

  registerCandidate(fullName: string): Candidate {
    const normalizedName = fullName.trim();
    if (!normalizedName) {
      throw new Error('ПІБ кандидата не може бути порожнім');
    }

    if (this.candidates.size >= this.compositeIdsPool.length) {
      throw new Error('Вичерпано пул ідентифікаторів кандидатів');
    }

    for (const existingName of this.candidates.values()) {
      if (existingName === normalizedName) {
        throw new Error(`Кандидат "${normalizedName}" вже зареєстрований`);
      }
    }

    const id = this.compositeIdsPool[this.candidates.size];
    this.candidates.set(id, normalizedName);

    console.log(`ЦВК: зареєстровано кандидата "${normalizedName}" з ID: ${id}`);
    return { id, fullName: normalizedName };
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

  tallyElection(
    mc1Batch: SignedCommissionBatch,
    mc1PublicKey: PublicKey,
    mc2Batch: SignedCommissionBatch,
    mc2PublicKey: PublicKey,
    maxRegisteredVoters: number,
  ): ElectionResults | null {
    if (!this.verifyBatchSignature(mc1Batch, mc1PublicKey)) {
      console.error(`ЦВК: недійсний ЕЦП від "${mc1Batch.commissionName}"`);
      return null;
    }

    if (!this.verifyBatchSignature(mc2Batch, mc2PublicKey)) {
      console.error(`ЦВК: недійсний ЕЦП від "${mc2Batch.commissionName}"`);
      return null;
    }

    if (
      mc1Batch.parts.length > maxRegisteredVoters ||
      mc2Batch.parts.length > maxRegisteredVoters
    ) {
      console.error(
        `ЦВК: кількість бюлетенів перевищує ліміт зареєстрованих виборців БР (${maxRegisteredVoters})`,
      );
      return null;
    }

    if (mc1Batch.parts.length !== mc2Batch.parts.length) {
      console.error(
        `ЦВК: різна кількість бюлетенів між "${mc1Batch.commissionName}" (${mc1Batch.parts.length}) та "${mc2Batch.commissionName}" (${mc2Batch.parts.length})`,
      );
      return null;
    }

    const mc1Map = new Map<string, bigint>();
    for (const part of mc1Batch.parts) {
      if (mc1Map.has(part.voterId)) {
        console.error(
          `ЦВК: виявлено дублікат voterId "${part.voterId}" у батчі "${mc1Batch.commissionName}"`,
        );
        return null;
      }
      mc1Map.set(part.voterId, part.encryptedPart);
    }

    const seenInMc2 = new Set<string>();
    for (const part2 of mc2Batch.parts) {
      if (seenInMc2.has(part2.voterId)) {
        console.error(
          `ЦВК: виявлено дублікат voterId "${part2.voterId}" у батчі "${mc2Batch.commissionName}"`,
        );
        return null;
      }
      seenInMc2.add(part2.voterId);

      if (!mc1Map.has(part2.voterId)) {
        console.error(
          `ЦВК: відсутня друга половина бюлетеня для voterId "${part2.voterId}" між "${mc1Batch.commissionName}" та "${mc2Batch.commissionName}"`,
        );
        return null;
      }
    }

    const tally: Record<number, number> = {};
    for (const candidateId of this.candidates.keys()) {
      tally[candidateId] = 0;
    }

    const ballots: PublishedFinalBallot[] = [];
    const invalidVoterIds: string[] = [];

    for (const part2 of mc2Batch.parts) {
      const part1Encrypted = mc1Map.get(part2.voterId)!;

      const totalCipher = this.cryptoService.multiplyCiphertexts(
        part1Encrypted,
        part2.encryptedPart,
        this.publicKey.n,
      );

      const decryptedId = Number(
        this.cryptoService.decryptNumber(
          totalCipher,
          this.privateKey.d,
          this.publicKey.n,
        ),
      );

      if (!this.candidates.has(decryptedId)) {
        console.error(
          `ЦВК: бюлетень voterId "${part2.voterId}" відхилено - розшифроване значення ${decryptedId} не відповідає жодному кандидату`,
        );
        invalidVoterIds.push(part2.voterId);
        continue;
      }

      tally[decryptedId]++;
      ballots.push({
        voterId: part2.voterId,
        candidateId: decryptedId,
      });

      console.log(
        `ЦВК: бюлетень voterId "${part2.voterId}" успішно об'єднано та зараховано за кандидата ID ${decryptedId} (${this.candidates.get(decryptedId)})`,
      );
    }

    const payloadJson = JSON.stringify({
      tally,
      ballots,
      invalidVoterIds,
    });
    const hash = this.cryptoService.customHash(payloadJson, this.publicKey.n);
    const signature = this.cryptoService.sign(
      hash,
      this.privateKey.d,
      this.privateKey.n,
    );

    return {
      tally,
      ballots,
      invalidVoterIds,
      signature,
    };
  }
}
