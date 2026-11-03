import { Injectable, OnModuleInit } from '@nestjs/common';
import { VotingService, Voter } from './voting/voting.service';
import { CryptoService } from './crypto/crypto.service';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    private readonly votingService: VotingService,
    private readonly cryptoService: CryptoService,
  ) {}

  onModuleInit() {
    this.runSimulation();
  }

  private runFullProtocol(
    voter: Voter,
    candidateChoice: string,
    candidates: string[],
    cheatAtIndex?: number,
  ): boolean {
    const ecPubKey = this.votingService.ecPublicKey;

    // Формування 10 наборів
    const blindedSets = voter.prepareBallotSets(
      candidates,
      ecPubKey,
      cheatAtIndex,
    );

    // Надсилання до ВК, отримання індексів для розкриття
    const indicesToReveal = this.votingService.receiveBlindedHashes(
      voter.fullName,
      blindedSets,
    );
    if (!indicesToReveal) return false;

    // Розкриття 9 наборів
    const revealed = voter.revealSets(indicesToReveal);

    // Перевірка ВК + сліпий підпис 10-го набору
    const blindSignatures = this.votingService.verifyAndSign(
      voter.fullName,
      revealed,
    );
    if (!blindSignatures) return false;

    // Зняття маскування
    voter.unblindSignatures(blindSignatures, ecPubKey.n);

    // Голосування
    const encryptedBallot = voter.castVote(candidateChoice, ecPubKey);

    // Обробка анонімного бюлетеня
    return this.votingService.processAnonymousBallot(encryptedBallot);
  }

  runSimulation() {
    console.log('\n');
    console.log('Симуляція протоколу е-голосування зі сліпими підписами');

    // Реєстрація кандидатів та виборців
    const candidates = ['Зеленський В. В.', 'Порошенко П. О.'];
    candidates.forEach((c) => this.votingService.registerCandidate(c));

    const voterNames = [
      'Іван Ф.',
      'Леся У.',
      'Тарас Ш.',
      'Михайло К.',
      'Григорій С.',
    ];
    voterNames.forEach((name) => this.votingService.registerVoter(name));

    const voters = voterNames.map(
      (name) => new Voter(name, this.cryptoService),
    );

    console.log('\nПОЗИТИВНІ СЦЕНАРІЇ: 5 виборців голосують');

    const choices = [
      candidates[0],
      candidates[1],
      candidates[0],
      candidates[1],
      candidates[0],
    ];

    for (let i = 0; i < voters.length; i++) {
      console.log(`\nВиборець: ${voters[i].fullName} → ${choices[i]}`);
      this.runFullProtocol(voters[i], choices[i], candidates);
    }

    console.log('\n\nНЕГАТИВНІ СЦЕНАРІЇ');

    console.log(
      '\nСпроба надіслати другий бюлетень з того ж набору (Іван Ф.):',
    );
    const secondBallot = voters[0].castVote(
      candidates[1],
      this.votingService.ecPublicKey,
    );
    this.votingService.processAnonymousBallot(secondBallot);

    console.log('\nСпроба повторно отримати підписаний набір (Іван Ф.):');
    const blindedAgain = voters[0].prepareBallotSets(
      candidates,
      this.votingService.ecPublicKey,
    );
    this.votingService.receiveBlindedHashes(voters[0].fullName, blindedAgain);

    console.log('\nВК виявляє некоректно сформований набір серед 9:');
    const cheaterName = 'Шахрай О.';
    this.votingService.registerVoter(cheaterName);
    const cheater = new Voter(cheaterName, this.cryptoService);
    this.runFullProtocol(cheater, candidates[0], candidates, 0);

    this.votingService.publishResults();
  }
}
