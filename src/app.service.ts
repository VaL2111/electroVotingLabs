import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CryptoService } from './crypto/crypto.service';
import { RegistrationBureauService } from './registration-bureau/registration-bureau.service';
import {
  LC1_TOKEN,
  LC2_TOKEN,
  LC3_TOKEN,
  LC4_TOKEN,
  LowCommissionService,
} from './low-commission/low-commission.service';
import {
  MC1_TOKEN,
  MC2_TOKEN,
  MidCommissionService,
} from './mid-commission/mid-commission.service';
import { CecService } from './cec/cec.service';
import { Voter } from './voter/voter';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly lowCommissions: LowCommissionService[];

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly bureauService: RegistrationBureauService,
    @Inject(LC1_TOKEN) private readonly lc1: LowCommissionService,
    @Inject(LC2_TOKEN) private readonly lc2: LowCommissionService,
    @Inject(LC3_TOKEN) private readonly lc3: LowCommissionService,
    @Inject(LC4_TOKEN) private readonly lc4: LowCommissionService,
    @Inject(MC1_TOKEN) private readonly mc1: MidCommissionService,
    @Inject(MC2_TOKEN) private readonly mc2: MidCommissionService,
    private readonly cecService: CecService,
  ) {
    this.lowCommissions = [this.lc1, this.lc2, this.lc3, this.lc4];
  }

  onModuleInit(): void {
    this.runSimulation();
  }

  runSimulation(): void {
    console.log('СИМУЛЯЦІЯ ПРОТОКОЛУ\n');

    console.log(
      'Етап 1: ініціалізація кандидатів у ЦВК та списку виборців у БР',
    );
    const candidate1 = this.cecService.registerCandidate('Зеленський В. В.');
    const candidate2 = this.cecService.registerCandidate('Порошенко П. О.');

    const voterNames = [
      'Іваненко І. І.',
      'Петренко П. П.',
      'Сидоренко С. С.',
      'Коваленко К. К.',
      'Мельник М. М.',
    ];
    for (const name of voterNames) {
      this.bureauService.addEligibleVoter(name);
    }

    console.log(
      '\nЕтап 2: реєстрація виборців у БР та передача реєстру до ВКН 1..4',
    );
    const voters = voterNames.map(
      (name) => new Voter(name, this.cryptoService),
    );

    for (const voter of voters) {
      const rn = this.bureauService.registerVoter(
        voter.fullName,
        voter.publicKey,
      );
      if (!rn) {
        console.error(`Помилка реєстрації виборця "${voter.fullName}"`);
        return;
      }
      voter.setRegistrationNumber(rn);
    }

    const signedRegistry = this.bureauService.exportAnonymousRegistry();
    for (const lc of this.lowCommissions) {
      const accepted = lc.receiveVoterRegistry(
        signedRegistry,
        this.bureauService.publicKey,
      );
      if (!accepted) {
        console.error(`${lc.commissionName} відхилила реєстр БР`);
        return;
      }
    }

    console.log('\nЕтап 3-4: подання часток бюлетенів у ВКН 1..4');
    const choices = [
      candidate1.id,
      candidate2.id,
      candidate1.id,
      candidate2.id,
      candidate1.id,
    ];
    const lcPublicKeys = this.lowCommissions.map((lc) => lc.publicKey);

    voters.forEach((voter, voterIndex) => {
      const packets = voter.createEncryptedBallotPackets(
        choices[voterIndex],
        this.cecService.publicKey,
        lcPublicKeys,
      );

      packets.forEach((packet, lcIndex) => {
        this.lowCommissions[lcIndex].submitEncryptedPacket(packet);
      });
    });

    const lcBatches = this.lowCommissions.map((lc) => lc.exportSignedBatch());

    console.log('\nЕтап 5: Проміжне гомоморфне об’єднання у ВКС-1 та ВКС-2');
    const mc1Batch = this.mc1.aggregateBatches(
      lcBatches[0],
      this.lc1.publicKey,
      lcBatches[1],
      this.lc2.publicKey,
      signedRegistry.totalRegistered,
      this.cecService.publicKey,
    );
    const mc2Batch = this.mc2.aggregateBatches(
      lcBatches[2],
      this.lc3.publicKey,
      lcBatches[3],
      this.lc4.publicKey,
      signedRegistry.totalRegistered,
      this.cecService.publicKey,
    );

    if (!mc1Batch || !mc2Batch) {
      console.error('Помилка агрегації на рівні комісій середнього рівня');
      return;
    }

    console.log(
      '\nЕтап 6: фінальне об’єднання, розшифрування та підрахунок голосів у ЦВК',
    );
    const results = this.cecService.tallyElection(
      mc1Batch,
      this.mc1.publicKey,
      mc2Batch,
      this.mc2.publicKey,
      signedRegistry.totalRegistered,
    );

    if (!results) {
      console.error('Помилка фінального підрахунку голосів у ЦВК');
      return;
    }

    console.log('\nПідсумковий протокол ЦВК:');
    console.log(
      `${candidate1.fullName} (ID: ${candidate1.id}): ${results.tally[candidate1.id]} голосів`,
    );
    console.log(
      `${candidate2.fullName} (ID: ${candidate2.id}): ${results.tally[candidate2.id]} голосів`,
    );
    console.log(`Недійсних бюлетенів: ${results.invalidVoterIds.length}`);

    console.log('\nЕтап 7: наскрізна перевірка результатів кожним виборцем');
    const publishedLcParts = lcBatches.map((batch) => batch.parts);
    const publishedMcParts = [mc1Batch.parts, mc2Batch.parts];

    for (const voter of voters) {
      voter.verifyVoteInPublishedData(
        publishedLcParts,
        publishedMcParts,
        results.ballots,
        this.cecService.publicKey,
      );
    }
  }
}
