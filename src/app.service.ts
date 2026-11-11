import { Injectable, OnModuleInit } from '@nestjs/common';
import { CryptoService } from './crypto/crypto.service';
import { Voter } from './voter/voter';
import { SignedBallotBatch, VoterPublicInfo } from './voter/voter.interface';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private readonly cryptoService: CryptoService) {}

  onModuleInit() {
    this.runSimulation();
  }

  runSimulation() {
    console.log('СИМУЛЯЦІЯ ПРОТОКОЛУ');

    console.log(
      '\n1. Формування списку кандидатів, виборців (A..E) та обмін відкритими ключами RSA',
    );
    const candidates = ['Зеленський В. В.', 'Порошенко П. О.'];
    const voterNames = ['A', 'B', 'C', 'D', 'E'];

    const voters = voterNames.map(
      (name) => new Voter(name, this.cryptoService),
    );

    const sharedVotersList: VoterPublicInfo[] = voters.map((voter) => ({
      name: voter.name,
      publicKey: voter.publicKey,
    }));

    for (const voter of voters) {
      voter.setElectionData(sharedVotersList, candidates);
    }

    console.log(
      `Зареєстровано виборців: ${sharedVotersList.map((v) => v.name).join(' -> ')}`,
    );
    console.log(`Кандидати: ${candidates.join(', ')}`);

    console.log(
      '\n2. Формування бюлетенів та 2 раунди багатошарового шифрування (порядок E -> D -> C -> B -> A)',
    );
    const choices = [
      candidates[0],
      candidates[1],
      candidates[0],
      candidates[1],
      candidates[0],
    ];

    const initialEncryptedBallots: string[] = [];
    for (let i = 0; i < voters.length; i++) {
      const encryptedBallot = voters[i].createEncryptedBallot(choices[i]);
      initialEncryptedBallots.push(encryptedBallot);
    }

    console.log(
      '\n3. Перший раунд розшифрування та перемішування (порядок A -> B -> C -> D -> E)',
    );
    let currentBatch: SignedBallotBatch | null = null;

    for (let i = 0; i < voters.length; i++) {
      const input = i === 0 ? initialEncryptedBallots : currentBatch!;
      currentBatch = voters[i].processDecryptionStep(input, 1);

      if (!currentBatch) {
        console.error('Голосування перервано у Раунді 1 розшифрування!');
        return;
      }
    }

    console.log(
      '\n4. Другий раунд розшифрування та перемішування (передача від E до A, порядок A -> B -> C -> D -> E)',
    );
    for (let i = 0; i < voters.length; i++) {
      currentBatch = voters[i].processDecryptionStep(currentBatch!, 2);

      if (!currentBatch) {
        console.error('Голосування перервано у Раунді 2 розшифрування!');
        return;
      }
    }

    console.log(
      '\n5. Публікація відкритих бюлетенів виборцем E та незалежна перевірка підрахунку всіма учасниками',
    );
    const lastVoter = voters[voters.length - 1];
    const publishedOpenBallots = currentBatch!.ballots;

    console.log(
      `Опубліковані відкриті бюлетені: ${JSON.stringify(publishedOpenBallots)}`,
    );

    const publishedTally = lastVoter.countVotes(publishedOpenBallots);
    if (!publishedTally) {
      console.error('Помилка підрахунку голосів виборцем E!');
      return;
    }

    console.log(`Підрахунок виборця ${lastVoter.name}:`);
    for (const [candidate, count] of Object.entries(publishedTally)) {
      console.log(`  ${candidate}: ${count} голосів`);
    }

    console.log('\nСамостійна перевірка результатів іншими виборцями:');
    for (let i = 0; i < voters.length - 1; i++) {
      voters[i].verifyResults(publishedOpenBallots, publishedTally);
    }
  }
}
