import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import { Voter } from './voter';
import { PublishedBallot } from './voter.interface';

describe('Voter', () => {
  let cryptoService: CryptoService;
  let voter: Voter;

  const voterName = 'Іван Ф.';
  const chosenCandidate = 'Зеленський В. В.';
  const fakeCandidate = 'Порошенко П. О.';
  const mockedBallotId = '11111111-2222-4333-8444-555555555555';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CryptoModule],
    }).compile();

    cryptoService = module.get<CryptoService>(CryptoService);
    voter = new Voter(voterName, cryptoService);
    voter.setRn('valid-rn-uuid');

    jest
      .spyOn(cryptoService, 'generateRandomId')
      .mockReturnValue(mockedBallotId);

    const ecKeyPair = cryptoService.generateKeyPair();
    voter.prepareEncryptedVote(chosenCandidate, ecKeyPair.publicKey);
  });

  it('Позитивний сценарій: знаходить власний ID у списку ВК і підтверджує правильність вибору', () => {
    const publishedBallots: PublishedBallot[] = [
      {
        id: mockedBallotId,
        candidate: chosenCandidate,
        signature: '12345',
      },
    ];

    expect(voter.verifyMyVote(publishedBallots)).toBe(true);
  });

  it('Негативний сценарій: виявляє підміну кандидата в опублікованому бюлетені', () => {
    const errorSpy = jest.spyOn(console, 'error');
    const publishedBallots: PublishedBallot[] = [
      {
        id: mockedBallotId,
        candidate: fakeCandidate,
        signature: '12345',
      },
    ];

    expect(voter.verifyMyVote(publishedBallots)).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      `${voterName}: голос підмінено. Очікувався ${chosenCandidate}, але записано ${fakeCandidate}`,
    );
  });

  it('Негативний сценарій: виявляє відсутність власного ID в опублікованих результатах', () => {
    const errorSpy = jest.spyOn(console, 'error');
    const publishedBallots: PublishedBallot[] = [];

    expect(voter.verifyMyVote(publishedBallots)).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      `${voterName}: бюлетень з id ${mockedBallotId} відсутній у результатах`,
    );
  });
});
