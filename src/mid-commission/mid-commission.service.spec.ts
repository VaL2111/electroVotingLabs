import { Test, TestingModule } from '@nestjs/testing';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import { PublicKey } from '../crypto/crypto.interfaces';
import { RegistrationBureauModule } from '../registration-bureau/registration-bureau.module';
import { RegistrationBureauService } from '../registration-bureau/registration-bureau.service';
import {
  Lc1Module,
  Lc2Module,
  Lc3Module,
  Lc4Module,
} from '../low-commission/low-commission.module';
import {
  LC1_TOKEN,
  LC2_TOKEN,
  LC3_TOKEN,
  LC4_TOKEN,
  LowCommissionService,
} from '../low-commission/low-commission.service';
import { Mc1Module } from './mid-commission.module';
import { MC1_TOKEN, MidCommissionService } from './mid-commission.service';
import { Voter } from '../voter/voter';

describe('MidCommissionService (Виборча комісія середнього рівня)', () => {
  let mc1: MidCommissionService;
  let lc1: LowCommissionService;
  let lc2: LowCommissionService;
  let lcPublicKeys: PublicKey[];
  let bureauService: RegistrationBureauService;
  let cryptoService: CryptoService;
  let cecPublicKey: PublicKey;
  let voter: Voter;

  const candidateId = 210;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        CryptoModule,
        RegistrationBureauModule,
        Lc1Module,
        Lc2Module,
        Lc3Module,
        Lc4Module,
        Mc1Module,
      ],
    }).compile();

    mc1 = module.get<MidCommissionService>(MC1_TOKEN);
    lc1 = module.get<LowCommissionService>(LC1_TOKEN);
    lc2 = module.get<LowCommissionService>(LC2_TOKEN);
    const lc3 = module.get<LowCommissionService>(LC3_TOKEN);
    const lc4 = module.get<LowCommissionService>(LC4_TOKEN);
    lcPublicKeys = [lc1.publicKey, lc2.publicKey, lc3.publicKey, lc4.publicKey];

    bureauService = module.get<RegistrationBureauService>(
      RegistrationBureauService,
    );
    cryptoService = module.get<CryptoService>(CryptoService);
    cecPublicKey = cryptoService.generateKeyPair().publicKey;

    voter = new Voter('Іваненко І. І.', cryptoService);
    bureauService.addEligibleVoter(voter.fullName);
    const rn = bureauService.registerVoter(voter.fullName, voter.publicKey)!;
    voter.setRegistrationNumber(rn);

    const registry = bureauService.exportAnonymousRegistry();
    lc1.receiveVoterRegistry(registry, bureauService.publicKey);
    lc2.receiveVoterRegistry(registry, bureauService.publicKey);
  });

  it('Позитивний сценарій: перевіряє ЕЦП ВКН-1 та ВКН-2, звіряє множини voterId, гомоморфно перемножує частки та підписує результат', () => {
    const packets = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );
    lc1.submitEncryptedPacket(packets[0]);
    lc2.submitEncryptedPacket(packets[1]);

    const batch1 = lc1.exportSignedBatch();
    const batch2 = lc2.exportSignedBatch();

    const mcBatch = mc1.aggregateBatches(
      batch1,
      lc1.publicKey,
      batch2,
      lc2.publicKey,
      1,
      cecPublicKey,
    );

    expect(mcBatch).not.toBeNull();
    expect(mcBatch!.commissionName).toBe('ВКС-1');
    expect(mcBatch!.parts).toHaveLength(1);

    const expectedC12 = cryptoService.multiplyCiphertexts(
      batch1.parts[0].encryptedPart,
      batch2.parts[0].encryptedPart,
      cecPublicKey.n,
    );
    expect(mcBatch!.parts[0].encryptedPart).toBe(expectedC12);

    const payloadJson = JSON.stringify({
      commissionName: mcBatch!.commissionName,
      parts: mcBatch!.parts.map((p) => ({
        voterId: p.voterId,
        encryptedPart: p.encryptedPart.toString(),
      })),
    });
    const expectedHash = cryptoService.customHash(payloadJson, mc1.publicKey.n);
    expect(
      cryptoService.verifySignature(
        expectedHash,
        mcBatch!.signature,
        mc1.publicKey.e,
        mc1.publicKey.n,
      ),
    ).toBe(true);
  });

  it('Негативний сценарій: змінено шифротекст після підписання', () => {
    const packets = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );
    lc1.submitEncryptedPacket(packets[0]);
    lc2.submitEncryptedPacket(packets[1]);

    const batch1 = lc1.exportSignedBatch();
    const batch2 = lc2.exportSignedBatch();
    batch2.parts[0].encryptedPart += 1n;

    const result = mc1.aggregateBatches(
      batch1,
      lc1.publicKey,
      batch2,
      lc2.publicKey,
      1,
      cecPublicKey,
    );

    expect(result).toBeNull();
  });

  it('Негативний сценарій: кількість бюлетенів перевищує ліміт зареєстрованих у БР виборців', () => {
    const packets = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );
    lc1.submitEncryptedPacket(packets[0]);
    lc2.submitEncryptedPacket(packets[1]);

    const result = mc1.aggregateBatches(
      lc1.exportSignedBatch(),
      lc1.publicKey,
      lc2.exportSignedBatch(),
      lc2.publicKey,
      0,
      cecPublicKey,
    );

    expect(result).toBeNull();
  });

  it('Негативний сценарій: різна кількість записів', () => {
    const packets = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );
    lc1.submitEncryptedPacket(packets[0]);

    const result = mc1.aggregateBatches(
      lc1.exportSignedBatch(),
      lc1.publicKey,
      lc2.exportSignedBatch(),
      lc2.publicKey,
      1,
      cecPublicKey,
    );

    expect(result).toBeNull();
  });

  it('Негативний сценарій: розбіжність множин voterId між ВКН-1 та ВКН-2 при однаковій кількості записів', () => {
    const secondVoter = new Voter('Петренко П. П.', cryptoService);
    bureauService.addEligibleVoter(secondVoter.fullName);
    const rn2 = bureauService.registerVoter(
      secondVoter.fullName,
      secondVoter.publicKey,
    )!;
    secondVoter.setRegistrationNumber(rn2);

    const updatedRegistry = bureauService.exportAnonymousRegistry();
    lc1.receiveVoterRegistry(updatedRegistry, bureauService.publicKey);
    lc2.receiveVoterRegistry(updatedRegistry, bureauService.publicKey);

    const packetsVoter1 = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );
    const packetsVoter2 = secondVoter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );

    lc1.submitEncryptedPacket(packetsVoter1[0]);
    lc2.submitEncryptedPacket(packetsVoter2[1]);

    const result = mc1.aggregateBatches(
      lc1.exportSignedBatch(),
      lc1.publicKey,
      lc2.exportSignedBatch(),
      lc2.publicKey,
      2,
      cecPublicKey,
    );

    expect(result).toBeNull();
  });
});
