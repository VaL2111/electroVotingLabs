import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
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
} from './low-commission.module';
import {
  LC1_TOKEN,
  LC2_TOKEN,
  LC3_TOKEN,
  LC4_TOKEN,
  LowCommissionService,
} from './low-commission.service';
import { Voter } from '../voter/voter';

describe('LowCommissionService', () => {
  let lc1: LowCommissionService;
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
      ],
    }).compile();

    lc1 = module.get<LowCommissionService>(LC1_TOKEN);
    const lc2 = module.get<LowCommissionService>(LC2_TOKEN);
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
  });

  it('Позитивний сценарій: приймає реєстр із валідним ЕЦП БР, розшифровує пакет від Voter, відсікає RN та експортує підписаний батч', () => {
    const registry = bureauService.exportAnonymousRegistry();
    expect(lc1.receiveVoterRegistry(registry, bureauService.publicKey)).toBe(
      true,
    );

    const [packetForLc1] = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );
    expect(lc1.submitEncryptedPacket(packetForLc1)).toBe(true);

    const batch = lc1.exportSignedBatch();
    expect(batch.commissionName).toBe('ВКН-1');
    expect(batch.parts).toHaveLength(1);
    expect(batch.parts[0].voterId).toEqual(expect.any(String));

    const expectedJson = JSON.stringify({
      commissionName: batch.commissionName,
      parts: batch.parts.map((p) => ({
        voterId: p.voterId,
        encryptedPart: p.encryptedPart.toString(),
      })),
    });
    const expectedHash = cryptoService.customHash(
      expectedJson,
      lc1.publicKey.n,
    );
    expect(
      cryptoService.verifySignature(
        expectedHash,
        batch.signature,
        lc1.publicKey.e,
        lc1.publicKey.n,
      ),
    ).toBe(true);
  });

  it('Негативний сценарій: відхиляє реєстр виборців із підробленим ЕЦП БР', () => {
    const registry = bureauService.exportAnonymousRegistry();
    const forgedRegistry = {
      ...registry,
      signature: registry.signature + 1n,
    };

    expect(
      lc1.receiveVoterRegistry(forgedRegistry, bureauService.publicKey),
    ).toBe(false);
  });

  it('Негативний сценарій: відхиляє пакет виборця з невідомим RN', () => {
    lc1.receiveVoterRegistry(
      bureauService.exportAnonymousRegistry(),
      bureauService.publicKey,
    );

    const unregisteredVoter = new Voter('stranger', cryptoService);
    unregisteredVoter.setRegistrationNumber('fake-rn-999');
    const [packetForLc1] = unregisteredVoter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );

    expect(lc1.submitEncryptedPacket(packetForLc1)).toBe(false);
    expect(lc1.exportSignedBatch().parts).toHaveLength(0);
  });

  it('Негативний сценарій: блокує повторне голосування того самого виборця за тим самим RN', () => {
    lc1.receiveVoterRegistry(
      bureauService.exportAnonymousRegistry(),
      bureauService.publicKey,
    );

    const [firstPacket] = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );
    const [secondPacket] = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );

    expect(lc1.submitEncryptedPacket(firstPacket)).toBe(true);
    expect(lc1.submitEncryptedPacket(secondPacket)).toBe(false);
    expect(lc1.exportSignedBatch().parts).toHaveLength(1);
  });

  it('Негативний сценарій: блокує колізію voterId і не погашає RN виборця при відмові', () => {
    const secondVoter = new Voter('Петренко П. П.', cryptoService);
    bureauService.addEligibleVoter(secondVoter.fullName);
    const secondRn = bureauService.registerVoter(
      secondVoter.fullName,
      secondVoter.publicKey,
    )!;
    secondVoter.setRegistrationNumber(secondRn);

    lc1.receiveVoterRegistry(
      bureauService.exportAnonymousRegistry(),
      bureauService.publicKey,
    );

    jest
      .spyOn(cryptoService, 'generateRandomId')
      .mockReturnValueOnce('collision-voter-id')
      .mockReturnValueOnce('collision-voter-id')
      .mockReturnValueOnce('unique-voter-id-2');

    const [packet1] = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );
    const [packet2Collision] = secondVoter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );
    const [packet2Retry] = secondVoter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );

    expect(lc1.submitEncryptedPacket(packet1)).toBe(true);
    expect(lc1.submitEncryptedPacket(packet2Collision)).toBe(false);
    expect(lc1.submitEncryptedPacket(packet2Retry)).toBe(true);
    expect(lc1.exportSignedBatch().parts).toHaveLength(2);
  });

  it('Негативний сценарій: відхиляє пакет, якщо зловмисник вкрав чужий RN, але підписав своїм приватним ключем', () => {
    const stolenRn =
      bureauService.exportAnonymousRegistry().records[0].registrationNumber;

    lc1.receiveVoterRegistry(
      bureauService.exportAnonymousRegistry(),
      bureauService.publicKey,
    );

    const attacker = new Voter('stranger', cryptoService);
    attacker.setRegistrationNumber(stolenRn);
    const [forgedPacket] = attacker.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      lcPublicKeys,
    );

    expect(lc1.submitEncryptedPacket(forgedPacket)).toBe(false);
    expect(lc1.exportSignedBatch().parts).toHaveLength(0);
  });
});
