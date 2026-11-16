import { CryptoService } from '../crypto/crypto.service';
import { PrivateKey, PublicKey } from '../crypto/crypto.interfaces';
import {
  BallotPartPayload,
  PublishedBallotPart,
  SignedCommissionBatch,
  SignedVoterPacket,
  SignedVoterRegistry,
} from '../common/protocol.interfaces';

export const LC1_TOKEN = 'LC1_SERVICE';
export const LC2_TOKEN = 'LC2_SERVICE';
export const LC3_TOKEN = 'LC3_SERVICE';
export const LC4_TOKEN = 'LC4_SERVICE';

export class LowCommissionService {
  public readonly publicKey: PublicKey;
  private readonly privateKey: PrivateKey;

  private readonly voterRegistry: Map<string, PublicKey> = new Map();
  private readonly usedRegistrationNumbers: Set<string> = new Set();
  private readonly usedVoterIds: Set<string> = new Set();
  private readonly acceptedParts: PublishedBallotPart[] = [];

  constructor(
    public readonly commissionName: string,
    private readonly cryptoService: CryptoService,
  ) {
    const keys = this.cryptoService.generateKeyPair();
    this.publicKey = keys.publicKey;
    this.privateKey = keys.privateKey;
  }

  receiveVoterRegistry(
    registry: SignedVoterRegistry,
    bureauPublicKey: PublicKey,
  ): boolean {
    if (registry.records.length !== registry.totalRegistered) {
      console.error(
        `${this.commissionName}: невідповідність кількості записів у реєстрі БР (${registry.records.length} !== ${registry.totalRegistered})`,
      );
      return false;
    }

    const payloadJson = JSON.stringify({
      totalRegistered: registry.totalRegistered,
      records: registry.records.map((r) => ({
        registrationNumber: r.registrationNumber,
        e: r.publicKey.e.toString(),
        n: r.publicKey.n.toString(),
      })),
    });
    const hash = this.cryptoService.customHash(payloadJson, bureauPublicKey.n);
    const isValid = this.cryptoService.verifySignature(
      hash,
      registry.signature,
      bureauPublicKey.e,
      bureauPublicKey.n,
    );

    if (!isValid) {
      console.error(`${this.commissionName}: недійсний ЕЦП БР`);
      return false;
    }

    this.voterRegistry.clear();
    for (const record of registry.records) {
      this.voterRegistry.set(record.registrationNumber, {
        ...record.publicKey,
      });
    }

    console.log(`${this.commissionName}: прийнято та перевірено реєстр БР)`);
    return true;
  }

  submitEncryptedPacket(encryptedPacket: bigint[]): boolean {
    let packet: SignedVoterPacket;
    try {
      const decryptedJson = this.cryptoService.decryptText(
        encryptedPacket,
        this.privateKey.d,
        this.privateKey.n,
      );
      packet = JSON.parse(decryptedJson) as SignedVoterPacket;
    } catch {
      console.error(
        `${this.commissionName}: помилка розшифрування або парсингу вхідного пакета`,
      );
      return false;
    }

    if (
      !packet ||
      typeof packet.voterId !== 'string' ||
      typeof packet.registrationNumber !== 'string' ||
      typeof packet.encryptedPart !== 'string' ||
      typeof packet.signature !== 'string'
    ) {
      console.error(
        `${this.commissionName}: некоректний формат пакета виборця`,
      );
      return false;
    }

    const voterPublicKey = this.voterRegistry.get(packet.registrationNumber);
    if (!voterPublicKey) {
      console.error(
        `${this.commissionName}: невідомий реєстраційний номер RN "${packet.registrationNumber}"`,
      );
      return false;
    }

    if (this.usedRegistrationNumbers.has(packet.registrationNumber)) {
      console.error(
        `${this.commissionName}: повторне голосування за RN "${packet.registrationNumber}"`,
      );
      return false;
    }

    if (this.usedVoterIds.has(packet.voterId)) {
      console.error(
        `${this.commissionName}: анонімний voterId "${packet.voterId}" ВЖЕ використовувався`,
      );
      return false;
    }

    const payload: BallotPartPayload = {
      voterId: packet.voterId,
      registrationNumber: packet.registrationNumber,
      encryptedPart: packet.encryptedPart,
    };
    const payloadJson = JSON.stringify(payload);
    const hash = this.cryptoService.customHash(payloadJson, voterPublicKey.n);

    let signatureBigInt: bigint;
    let encryptedPartBigInt: bigint;
    try {
      signatureBigInt = BigInt(packet.signature);
      encryptedPartBigInt = BigInt(packet.encryptedPart);
    } catch {
      console.error(
        `${this.commissionName}: некоректні числові дані підпису або частки бюлетеня`,
      );
      return false;
    }

    const isValidSignature = this.cryptoService.verifySignature(
      hash,
      signatureBigInt,
      voterPublicKey.e,
      voterPublicKey.n,
    );

    if (!isValidSignature) {
      console.error(
        `${this.commissionName}: недійсний ЕЦП виборця для RN "${packet.registrationNumber}"`,
      );
      return false;
    }

    this.usedRegistrationNumbers.add(packet.registrationNumber);
    this.usedVoterIds.add(packet.voterId);
    this.acceptedParts.push({
      voterId: packet.voterId,
      encryptedPart: encryptedPartBigInt,
    });

    console.log(
      `${this.commissionName}: прийнято частку бюлетеня для voterId "${packet.voterId}"`,
    );
    return true;
  }

  exportSignedBatch(): SignedCommissionBatch {
    const shuffledParts: PublishedBallotPart[] = this.cryptoService
      .shuffle(this.acceptedParts)
      .map((part) => ({ ...part }));

    const payloadJson = JSON.stringify({
      commissionName: this.commissionName,
      parts: shuffledParts.map((part) => ({
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

    return {
      commissionName: this.commissionName,
      parts: shuffledParts,
      signature,
    };
  }
}
