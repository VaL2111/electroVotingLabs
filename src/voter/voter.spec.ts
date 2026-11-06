import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import { Voter } from './voter';
import { SignedBallotPartMessage } from './voter.interface';

describe('Voter', () => {
  let cryptoService: CryptoService;
  let voter: Voter;
  let msgForEC1: SignedBallotPartMessage;
  let msgForEC2: SignedBallotPartMessage;

  const voterName = 'Іван Ф.';
  const chosenCandidateId = 12;
  const fakeCandidateId = 18;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CryptoModule],
    }).compile();

    cryptoService = module.get<CryptoService>(CryptoService);
    voter = new Voter(voterName, cryptoService);

    const cecKeyPair = cryptoService.generateKeyPair();
    [msgForEC1, msgForEC2] = voter.prepareSplitVote(
      chosenCandidateId,
      cecKeyPair.publicKey,
    );
  });

  describe('Перевірка опублікованих частин у ВК-1 та ВК-2 (verifyPublishedParts)', () => {
    it('Позитивний сценарій: підтверджує, що ВК-1 та ВК-2 опублікували саме ті зашифровані частини бюлетеня, які виборець їм передав', () => {
      const result = voter.verifyPublishedParts(
        [{ voterId: msgForEC1.voterId, encryptedPart: msgForEC1.encryptedPart }],
        [{ voterId: msgForEC2.voterId, encryptedPart: msgForEC2.encryptedPart }],
      );

      expect(result).toBe(true);
    });

    it('Негативний сценарій: виявляє підміну зашифрованої частини бюлетеня в одній із ВК', () => {
      const errorSpy = jest.spyOn(console, 'error');
      const tamperedPart = msgForEC1.encryptedPart + 1n;

      const result = voter.verifyPublishedParts(
        [{ voterId: msgForEC1.voterId, encryptedPart: tamperedPart }],
        [{ voterId: msgForEC2.voterId, encryptedPart: msgForEC2.encryptedPart }],
      );

      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        `${voterName}: ВК-1 опублікувала змінену частину бюлетеня! Очікувалось ${msgForEC1.encryptedPart}, отримано ${tamperedPart}`,
      );
    });
  });

  describe('Перевірка фінального відновленого бюлетеня у ЦВК (verifyFinalVote)', () => {
    it('Позитивний сценарій: підтверджує, що після об’єднання частин ЦВК опублікувала правильний відновлений бюлетень', () => {
      const result = voter.verifyFinalVote([
        { voterId: msgForEC1.voterId, candidateId: chosenCandidateId },
      ]);

      expect(result).toBe(true);
    });

    it('Негативний сценарій: виявляє невідповідність опублікованого ЦВК відновленого бюлетеня зробленому вибору', () => {
      const errorSpy = jest.spyOn(console, 'error');

      const result = voter.verifyFinalVote([
        { voterId: msgForEC1.voterId, candidateId: fakeCandidateId },
      ]);

      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        `${voterName}: фінальний голос у ЦВК підмінено! Очікувався кандидат ID ${chosenCandidateId}, але записано ${fakeCandidateId}`,
      );
    });
  });
});
