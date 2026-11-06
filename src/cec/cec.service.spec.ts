import { Test, TestingModule } from '@nestjs/testing';
import { CecService } from './cec.service';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import { Voter } from '../voter/voter';

describe('CecService (ЦВК)', () => {
  let cecService: CecService;
  let cryptoService: CryptoService;
  let voter: Voter;

  let candidate1Id: number;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CryptoModule],
      providers: [CecService],
    }).compile();

    cecService = module.get<CecService>(CecService);
    cryptoService = module.get<CryptoService>(CryptoService);

    const c1 = cecService.registerCandidate('Зеленський В. В.');
    cecService.registerCandidate('Порошенко П. О.');
    candidate1Id = c1.id;

    voter = new Voter('Іван Ф.', cryptoService);
    cecService.registerVoter(voter.fullName, voter.publicKey);
  });

  it('Позитивний сценарій: об’єднує дві зашифровані частини бюлетеня гомоморфним множенням та відновлює початковий ID кандидата', () => {
    const [msgForEC1, msgForEC2] = voter.prepareSplitVote(
      candidate1Id,
      cecService.cecPublicKey,
    );

    cecService.tallyResults(
      [{ voterId: msgForEC1.voterId, encryptedPart: msgForEC1.encryptedPart }],
      [{ voterId: msgForEC2.voterId, encryptedPart: msgForEC2.encryptedPart }],
    );

    expect(cecService.getPublishedFinalBallots()).toEqual([
      {
        voterId: msgForEC1.voterId,
        candidateId: candidate1Id,
      },
    ]);
  });

  it('Негативний сценарій: відхиляє бюлетень, якщо одна з ВК змінила свою частину і розшифроване значення не відповідає жодному кандидату', () => {
    const [msgForEC1, msgForEC2] = voter.prepareSplitVote(
      candidate1Id,
      cecService.cecPublicKey,
    );

    const tamperedEncryptedPart1 = cryptoService.encrypt(
      7n,
      cecService.cecPublicKey.e,
      cecService.cecPublicKey.n,
    );

    cecService.tallyResults(
      [{ voterId: msgForEC1.voterId, encryptedPart: tamperedEncryptedPart1 }],
      [{ voterId: msgForEC2.voterId, encryptedPart: msgForEC2.encryptedPart }],
    );

    expect(cecService.getPublishedFinalBallots()).toHaveLength(0);
  });
});
