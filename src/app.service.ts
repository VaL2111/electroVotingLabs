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

    console.log('\n1. Ініціалізація списків у БР та ВК');
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

    console.log('\n2. Реєстрація виборців у БР та отримання RN');
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

    console.log('\n3. Передача анонімного реєстру RN від БР до ВК');
    const anonymousRegistry =
      this.registrationService.getAnonymousRegistryForEC();
    this.votingService.receiveVoterRegistryFromBR(anonymousRegistry);

    console.log('\n4. Голосування');
    const choices = [
      candidates[0],
      candidates[1],
      candidates[0],
      candidates[1],
      candidates[0],
    ];

    const ecPubKey = this.votingService.ecPublicKey;

    for (let i = 0; i < voters.length; i++) {
      console.log(
        `\nВиборець ${voters[i].fullName} голосує за "${choices[i]}":`,
      );
      const encryptedVote = voters[i].prepareEncryptedVote(
        choices[i],
        ecPubKey,
      );
      this.votingService.processBallot(encryptedVote);
    }

    console.log('\n5. Публікація результатів');
    this.votingService.publishResults();

    console.log('\n6. Перевірка виборцями власних голосів');
    const publishedBallots = this.votingService.getPublishedBallots();
    for (const voter of voters) {
      voter.verifyMyVote(publishedBallots);
    }
  }
}
