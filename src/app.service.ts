import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CryptoService } from './crypto/crypto.service';
import { CecService } from './cec/cec.service';
import {
  EC1_TOKEN,
  EC2_TOKEN,
  ElectionCommissionService,
} from './election-commission/election-commission.service';
import { Voter } from './voter/voter';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    private readonly cecService: CecService,
    @Inject(EC1_TOKEN)
    private readonly ec1Service: ElectionCommissionService,
    @Inject(EC2_TOKEN)
    private readonly ec2Service: ElectionCommissionService,
    private readonly cryptoService: CryptoService,
  ) {}

  onModuleInit() {
    this.runSimulation();
  }

  runSimulation() {
    console.log('СИМУЛЯЦІЯ ПРОТОКОЛУ');

    console.log('\n1. Реєстрація кандидатів та виборців у ЦВК');
    const candidate1 = this.cecService.registerCandidate('Зеленський В. В.');
    const candidate2 = this.cecService.registerCandidate('Порошенко П. О.');

    const voterNames = [
      'Іван Ф.',
      'Леся У.',
      'Тарас Ш.',
      'Михайло К.',
      'Григорій С.',
    ];
    const voters = voterNames.map(
      (name) => new Voter(name, this.cryptoService),
    );

    for (const voter of voters) {
      this.cecService.registerVoter(voter.fullName, voter.publicKey);
    }

    console.log('\n2. Передача списку виборців від ЦВК до ВК-1 та ВК-2');
    const voterList = this.cecService.getVoterListForEC();
    this.ec1Service.receiveVoterListFromCEC(voterList);
    this.ec2Service.receiveVoterListFromCEC(voterList);

    console.log(
      '\n3. Голосування: поділ ID кандидата на множники та відправка частин у ВК-1 і ВК-2',
    );
    const choices = [
      candidate1.id,
      candidate2.id,
      candidate1.id,
      candidate2.id,
      candidate1.id,
    ];

    for (let i = 0; i < voters.length; i++) {
      const [msgForEC1, msgForEC2] = voters[i].prepareSplitVote(
        choices[i],
        this.cecService.cecPublicKey,
      );
      this.ec1Service.processBallotPart(msgForEC1);
      this.ec2Service.processBallotPart(msgForEC2);
    }

    console.log(
      '\n4. Публікація частин бюлетенів комісіями ВК-1 та ВК-2 і перевірка виборцями',
    );
    const ec1Published = this.ec1Service.publishBallotParts();
    const ec2Published = this.ec2Service.publishBallotParts();

    for (const voter of voters) {
      voter.verifyPublishedParts(ec1Published, ec2Published);
    }

    console.log(
      '\n5. Гомоморфне об’єднання частин, розшифрування та підрахунок голосів у ЦВК',
    );
    this.cecService.tallyResults(ec1Published, ec2Published);
    this.cecService.publishResults();

    console.log(
      '\n6. Перевірка виборцями фінальних розшифрованих бюлетенів ЦВК',
    );
    const finalBallots = this.cecService.getPublishedFinalBallots();
    for (const voter of voters) {
      voter.verifyFinalVote(finalBallots);
    }
  }
}
