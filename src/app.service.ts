import { Injectable, OnModuleInit } from '@nestjs/common';
import { VotingService } from './voting/voting.service';
import { CryptoService } from './crypto/crypto.service';
import { RegistrationService } from './registration/registration.service';
import { Voter } from './voter/voter';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly votingService: VotingService,
    private readonly cryptoService: CryptoService,
  ) {}

  onModuleInit() {
    this.runSimulation();
  }

  runSimulation() {
    console.log('СИМУЛЯЦІЯ ПРОТОКОЛУ Е-ГОЛОСУВАННЯ');

    console.log('Ініціалізація списків у БР та ВК');
    const candidates = ['Зеленський В. В.', 'Порошенко П. О.'];
    candidates.forEach((c) => this.votingService.registerCandidate(c));

    const voterNames = [
      'Іван Ф.',
      'Леся У.',
      'Тарас Ш.',
      'Михайло К.',
      'Григорій С.',
    ];
    voterNames.forEach((name) =>
      this.registrationService.addEligibleVoter(name),
    );

    console.log('\nРеєстрація виборців у БР та отримання RN');
    const voters = voterNames.map(
      (name) => new Voter(name, this.cryptoService),
    );

    for (const voter of voters) {
      const rn = this.registrationService.registerVoter(
        voter.fullName,
        voter.publicKey,
      );
      if (rn) {
        voter.setRn(rn);
      }
    }

    console.log('\nНЕГАТИВНІ СЦЕНАРІЇ (БР)');
    console.log('1) Спроба незареєстрованої у списку особи отримати RN:');
    const outsider = new Voter('Стороння Особа', this.cryptoService);
    this.registrationService.registerVoter(
      outsider.fullName,
      outsider.publicKey,
    );

    console.log('2) Спроба виборця (Іван Ф.) повторно отримати RN:');
    this.registrationService.registerVoter(
      voters[0].fullName,
      voters[0].publicKey,
    );

    console.log('\nПередача реєстру RN від БР до ВК');
    const anonymousRegistry =
      this.registrationService.getAnonymousRegistryForEC();
    this.votingService.receiveVoterRegistryFromBR(anonymousRegistry);

    console.log('\nГолосування (Позитивні сценарії)');
    const choices = [
      candidates[0],
      candidates[1],
      candidates[0],
      candidates[1],
      candidates[0],
    ];

    const ecPubKey = this.votingService.ecPublicKey;

    for (let i = 0; i < 4; i++) {
      console.log(
        `\nВиборець ${voters[i].fullName} голосує за "${choices[i]}":`,
      );
      const encryptedVote = voters[i].prepareEncryptedVote(
        choices[i],
        ecPubKey,
      );
      this.votingService.processBallot(encryptedVote);
    }

    console.log('\nНЕГАТИВНІ СЦЕНАРІЇ (ВК)');

    console.log('\n1) Відхилення бюлетеня з невалідним RN:');
    const invalidRnVote = voters[0].prepareEncryptedVote(
      candidates[0],
      ecPubKey,
      { customRn: '00000000-fake-rn-0000' },
    );
    this.votingService.processBallot(invalidRnVote);

    console.log(
      '\n2) Відхилення бюлетеня з уже використаним RN (повторне голосування Іван Ф.):',
    );
    const duplicateRnVote = voters[0].prepareEncryptedVote(
      candidates[1],
      ecPubKey,
    );
    this.votingService.processBallot(duplicateRnVote);

    console.log(
      '\n3) Відхилення бюлетеня з ID, який уже був використаний іншим бюлетенем:',
    );
    const usedId = voters[0].getBallotId()!;
    const duplicateIdVote = voters[4].prepareEncryptedVote(
      choices[4],
      ecPubKey,
      { customId: usedId },
    );
    this.votingService.processBallot(duplicateIdVote);

    console.log('\n4) Відхилення повідомлення з неправильним ЕЦП:');
    const fakeKeyPair = this.cryptoService.generateKeyPair();
    const invalidSigVote = voters[4].prepareEncryptedVote(
      choices[4],
      ecPubKey,
      { customPrivateKey: fakeKeyPair.privateKey },
    );
    this.votingService.processBallot(invalidSigVote);

    console.log(
      `\nЗавершення чесного голосування 5-го виборця (${voters[4].fullName} -> "${choices[4]}"):`,
    );
    const validFifthVote = voters[4].prepareEncryptedVote(choices[4], ecPubKey);
    this.votingService.processBallot(validFifthVote);

    this.votingService.publishResults();

    console.log('Перевірка виборцями власних голосів (Позитивний сценарій)');
    const publishedBallots = this.votingService.getPublishedBallots();
    for (const voter of voters) {
      voter.verifyMyVote(publishedBallots);
    }

    console.log(
      '\nНЕГАТИВНИЙ СЦЕНАРІЙ: Підміна голосу в опублікованих результатах',
    );
    const targetVoter = voters[0];
    this.votingService.tamperPublishedBallot(
      targetVoter.getBallotId()!,
      candidates[1],
    );
    const tamperedBallots = this.votingService.getPublishedBallots();
    targetVoter.verifyMyVote(tamperedBallots);
  }
}
