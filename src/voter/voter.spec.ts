import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import { Voter } from './voter';
import { SignedBallotBatch, VoterPublicInfo } from './voter.interface';

describe('Протокол Е-голосування без виборчої комісії', () => {
  let cryptoService: CryptoService;
  let voters: Voter[];
  let initialEncryptedBallots: string[];

  const candidates = ['Зеленський В. В.', 'Порошенко П. О.'];
  const voterNames = ['A', 'B', 'C', 'D', 'E'];
  let choices: string[];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CryptoModule],
    }).compile();

    cryptoService = module.get<CryptoService>(CryptoService);

    voters = voterNames.map((name) => new Voter(name, cryptoService));

    const sharedVotersList: VoterPublicInfo[] = voters.map((voter) => ({
      name: voter.name,
      publicKey: voter.publicKey,
    }));

    for (const voter of voters) {
      voter.setElectionData(sharedVotersList, candidates);
    }

    choices = [
      candidates[0],
      candidates[1],
      candidates[0],
      candidates[1],
      candidates[0],
    ];

    initialEncryptedBallots = voters.map((voter, index) =>
      voter.createEncryptedBallot(choices[index]),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Контроль кількості бюлетенів на етапах обробки', () => {
    it('Позитивний сценарій: приймає набір, якщо кількість бюлетенів відповідає кількості виборців (5)', () => {
      const batchAfterA = voters[0].processDecryptionStep(
        initialEncryptedBallots,
        1,
      );

      expect(batchAfterA).not.toBeNull();
      expect(batchAfterA?.ballots).toHaveLength(5);
    });

    it('Негативний сценарій: виявляє видалення одного з бюлетенів (4 замість 5)', () => {
      const errorSpy = jest.spyOn(console, 'error');
      const ballotsWithRemovedOne = initialEncryptedBallots.slice(0, 4);

      const result = voters[0].processDecryptionStep(ballotsWithRemovedOne, 1);

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        'Виборець A: порушено кількість бюлетенів. Очікувалось 5, отримано 4',
      );
    });

    it('Негативний сценарій: виявляє додавання зайвого бюлетеня (6 замість 5)', () => {
      const errorSpy = jest.spyOn(console, 'error');
      const ballotsWithExtraOne = [
        ...initialEncryptedBallots,
        initialEncryptedBallots[0],
      ];

      const result = voters[0].processDecryptionStep(ballotsWithExtraOne, 1);

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        'Виборець A: порушено кількість бюлетенів. Очікувалось 5, отримано 6',
      );
    });
  });

  describe('2. Перевірка ЕЦП набору бюлетенів під час передачі між учасниками', () => {
    it('Позитивний сценарій: наступний виборець B успішно перевіряє ЕЦП попереднього учасника A', () => {
      const batchFromA = voters[0].processDecryptionStep(
        initialEncryptedBallots,
        1,
      );
      expect(batchFromA).not.toBeNull();

      const batchFromB = voters[1].processDecryptionStep(batchFromA!, 1);
      expect(batchFromB).not.toBeNull();
      expect(batchFromB?.senderName).toBe('B');
    });

    it('Негативний сценарій: виявляє неправильний ЕЦП набору бюлетенів під час передачі від A до B', () => {
      const errorSpy = jest.spyOn(console, 'error');
      const batchFromA = voters[0].processDecryptionStep(
        initialEncryptedBallots,
        1,
      );

      const forgedBatch: SignedBallotBatch = {
        ...batchFromA!,
        signature: batchFromA!.signature + 1n,
      };

      const result = voters[1].processDecryptionStep(forgedBatch, 1);

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        'Виборець B: недійсний ЕЦП від виборця A',
      );
    });
  });

  describe('3. Перевірка наявності та видалення власного RP у 1-му та 2-му раундах розшифрування', () => {
    it('Позитивний сценарій: кожен виборець успішно знаходить та видаляє власний RP2 у 1-му раунді та RP1 у 2-му раунді', () => {
      let currentBatch: SignedBallotBatch | null = null;

      for (let i = 0; i < voters.length; i++) {
        const input = i === 0 ? initialEncryptedBallots : currentBatch!;
        currentBatch = voters[i].processDecryptionStep(input, 1);
        expect(currentBatch).not.toBeNull();
      }

      for (let i = 0; i < voters.length; i++) {
        currentBatch = voters[i].processDecryptionStep(currentBatch!, 2);
        expect(currentBatch).not.toBeNull();
      }
    });

    it('Негативний сценарій (Раунд 1): виявляє відсутній або неправильний RP2, якщо бюлетень виборця підмінили', () => {
      const errorSpy = jest.spyOn(console, 'error');

      const tamperedBallots = [...initialEncryptedBallots];
      tamperedBallots[0] = initialEncryptedBallots[1];

      const result = voters[0].processDecryptionStep(tamperedBallots, 1);

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Виборець A: власний RP ('),
      );
    });

    it('Негативний сценарій (Раунд 2): виявляє відсутній або неправильний RP1 у другому раунді розшифрування', () => {
      const errorSpy = jest.spyOn(console, 'error');

      let currentBatch: SignedBallotBatch | null = null;
      for (let i = 0; i < voters.length; i++) {
        const input = i === 0 ? initialEncryptedBallots : currentBatch!;
        currentBatch = voters[i].processDecryptionStep(input, 1);
      }

      voters[0].createEncryptedBallot(candidates[0]);

      const resultInRound2 = voters[0].processDecryptionStep(currentBatch!, 2);

      expect(resultInRound2).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Виборець A: власний RP ('),
      );
    });
  });

  describe('4. Отримання відкритих бюлетенів, підрахунок голосів та перевірка результату всіма учасниками', () => {
    it('Позитивний сценарій: після 2 раундів розшифрування всі 5 учасників отримують однаковий та правильний результат підрахунку', () => {
      let currentBatch: SignedBallotBatch | null = null;

      for (let i = 0; i < voters.length; i++) {
        const input = i === 0 ? initialEncryptedBallots : currentBatch!;
        currentBatch = voters[i].processDecryptionStep(input, 1);
      }

      for (let i = 0; i < voters.length; i++) {
        currentBatch = voters[i].processDecryptionStep(currentBatch!, 2);
      }

      const publishedOpenBallots = currentBatch!.ballots;
      expect([...publishedOpenBallots].sort()).toEqual([...choices].sort());

      const lastVoter = voters[voters.length - 1];
      const publishedTally = lastVoter.countVotes(publishedOpenBallots);

      expect(publishedTally).toEqual({
        [candidates[0]]: 3,
        [candidates[1]]: 2,
      });

      for (const voter of voters) {
        expect(voter.countVotes(publishedOpenBallots)).toEqual(publishedTally);
        expect(voter.verifyResults(publishedOpenBallots, publishedTally!)).toBe(
          true,
        );
      }
    });

    it('Негативний сценарій: виборець виявляє сфальсифікований результат підрахунку голосів', () => {
      const errorSpy = jest.spyOn(console, 'error');
      const openBallots = [...choices];

      const fakeTally = {
        [candidates[0]]: 1,
        [candidates[1]]: 4,
      };

      const isVerified = voters[0].verifyResults(openBallots, fakeTally);

      expect(isVerified).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        `Виборець A: невідповідність підрахунку для "${candidates[0]}"! Очікувалось 3, опубліковано 1`,
      );
    });
  });
});
