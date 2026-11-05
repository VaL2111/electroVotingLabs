import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { VotingService } from './voting.service';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import { Voter } from '../voter/voter';

describe('VotingService', () => {
  let votingService: VotingService;
  let cryptoService: CryptoService;
  let voter1: Voter;
  let voter2: Voter;

  const candidate1 = 'Зеленський В. В.';
  const candidate2 = 'Порошенко П. О.';
  const validRn1 = '11111111-1111-4111-8111-111111111111';
  const validRn2 = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CryptoModule],
      providers: [VotingService],
    }).compile();

    votingService = module.get<VotingService>(VotingService);
    cryptoService = module.get<CryptoService>(CryptoService);

    votingService.registerCandidate(candidate1);
    votingService.registerCandidate(candidate2);

    voter1 = new Voter('Іван Ф.', cryptoService);
    voter1.setRn(validRn1);

    voter2 = new Voter('Леся У.', cryptoService);
    voter2.setRn(validRn2);

    votingService.receiveVoterRegistryFromBR([
      { rn: validRn1, publicKey: voter1.publicKey },
      { rn: validRn2, publicKey: voter2.publicKey },
    ]);
  });

  it('Позитивний сценарій: приймає валідний бюлетень, позначає RN як використаний і зберігає голос разом з ID', () => {
    const expectedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    jest
      .spyOn(cryptoService, 'generateRandomId')
      .mockReturnValueOnce(expectedId);

    const encryptedBallot = voter1.prepareEncryptedVote(
      candidate1,
      votingService.ecPublicKey,
    );

    expect(votingService.processBallot(encryptedBallot)).toBe(true);
    expect(votingService.getPublishedBallots()).toEqual([
      {
        id: expectedId,
        candidate: candidate1,
        signature: expect.any(String),
      },
    ]);
  });

  it('Негативний сценарій: невалідний RN', () => {
    const unregisteredVoter = new Voter('stranger', cryptoService);
    unregisteredVoter.setRn('99999999-9999-4999-8999-999999999999');

    const encryptedBallot = unregisteredVoter.prepareEncryptedVote(
      candidate1,
      votingService.ecPublicKey,
    );

    expect(votingService.processBallot(encryptedBallot)).toBe(false);
    expect(votingService.getPublishedBallots()).toHaveLength(0);
  });

  it('Негативний сценарій: вже використаний RN', () => {
    const firstBallot = voter1.prepareEncryptedVote(
      candidate1,
      votingService.ecPublicKey,
    );
    const secondBallot = voter1.prepareEncryptedVote(
      candidate2,
      votingService.ecPublicKey,
    );

    expect(votingService.processBallot(firstBallot)).toBe(true);
    expect(votingService.processBallot(secondBallot)).toBe(false);
    expect(votingService.getPublishedBallots()).toHaveLength(1);
  });

  it('Негативний сценарій: вже використаний бюлетень із ID', () => {
    const duplicateId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    jest.spyOn(cryptoService, 'generateRandomId').mockReturnValue(duplicateId);

    const firstBallot = voter1.prepareEncryptedVote(
      candidate1,
      votingService.ecPublicKey,
    );
    const secondBallotWithSameId = voter2.prepareEncryptedVote(
      candidate2,
      votingService.ecPublicKey,
    );

    expect(votingService.processBallot(firstBallot)).toBe(true);
    expect(votingService.processBallot(secondBallotWithSameId)).toBe(false);
    expect(votingService.getPublishedBallots()).toHaveLength(1);
  });

  it('Негативний сценарій: неправильний ЕЦП', () => {
    const imposter = new Voter('stranger', cryptoService);
    imposter.setRn(validRn1);

    const forgedBallot = imposter.prepareEncryptedVote(
      candidate2,
      votingService.ecPublicKey,
    );

    expect(votingService.processBallot(forgedBallot)).toBe(false);
    expect(votingService.getPublishedBallots()).toHaveLength(0);
  });
});
