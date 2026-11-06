import { Test, TestingModule } from '@nestjs/testing';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import {
  EC1_TOKEN,
  ElectionCommissionService,
} from './election-commission.service';
import { Ec1Module } from './ec1.module';
import { Voter } from '../voter/voter';

describe('ElectionCommissionService (ВК-1 / ВК-2)', () => {
  let ecService: ElectionCommissionService;
  let cryptoService: CryptoService;
  let registeredVoter: Voter;

  const candidateId = 12;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CryptoModule, Ec1Module],
    }).compile();

    ecService = module.get<ElectionCommissionService>(EC1_TOKEN);
    cryptoService = module.get<CryptoService>(CryptoService);

    registeredVoter = new Voter('Іван Ф.', cryptoService);

    ecService.receiveVoterListFromCEC([
      {
        fullName: registeredVoter.fullName,
        publicKey: registeredVoter.publicKey,
      },
    ]);
  });

  it('Позитивний сценарій: перевіряє наявність виборця у списку та ЕЦП і зберігає зашифровану частину бюлетеня з ID', () => {
    const cecKeyPair = cryptoService.generateKeyPair();
    const [msgForEC1] = registeredVoter.prepareSplitVote(
      candidateId,
      cecKeyPair.publicKey,
    );

    expect(ecService.processBallotPart(msgForEC1)).toBe(true);
    expect(ecService.publishBallotParts()).toEqual([
      {
        voterId: msgForEC1.voterId,
        encryptedPart: msgForEC1.encryptedPart,
      },
    ]);
  });

  it('Негативний сценарій 1: відхиляє повідомлення, якщо виборець відсутній у списку', () => {
    const cecKeyPair = cryptoService.generateKeyPair();
    const unregisteredVoter = new Voter('stranger', cryptoService);
    const [msgForEC1] = unregisteredVoter.prepareSplitVote(
      candidateId,
      cecKeyPair.publicKey,
    );

    expect(ecService.processBallotPart(msgForEC1)).toBe(false);
    expect(ecService.publishBallotParts()).toHaveLength(0);
  });

  it('Негативний сценарій 2: відхиляє повідомлення з невалідним підписом', () => {
    const cecKeyPair = cryptoService.generateKeyPair();
    const imposter = new Voter(registeredVoter.fullName, cryptoService);
    const [forgedMsg] = imposter.prepareSplitVote(
      candidateId,
      cecKeyPair.publicKey,
    );

    expect(ecService.processBallotPart(forgedMsg)).toBe(false);
    expect(ecService.publishBallotParts()).toHaveLength(0);
  });
});
