import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import { PublicKey } from '../crypto/crypto.interfaces';
import { RegistrationBureauModule } from '../registration-bureau/registration-bureau.module';
import { RegistrationBureauService } from '../registration-bureau/registration-bureau.service';
import {
  Lc1Module,
  Lc2Module,
  Lc3Module,
  Lc4Module,
} from '../low-commission/low-commission.module';
import {
  LC1_TOKEN,
  LC2_TOKEN,
  LC3_TOKEN,
  LC4_TOKEN,
  LowCommissionService,
} from '../low-commission/low-commission.service';
import { Mc1Module, Mc2Module } from '../mid-commission/mid-commission.module';
import {
  MC1_TOKEN,
  MC2_TOKEN,
  MidCommissionService,
} from '../mid-commission/mid-commission.service';
import { CecModule } from './cec.module';
import { CecService } from './cec.service';
import { Voter } from '../voter/voter';

describe('CecService', () => {
  let cecService: CecService;
  let mc1: MidCommissionService;
  let mc2: MidCommissionService;
  let lcs: LowCommissionService[];
  let lcPublicKeys: PublicKey[];
  let bureauService: RegistrationBureauService;
  let cryptoService: CryptoService;

  let candidate1Id: number;
  let candidate2Id: number;
  let voter: Voter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        CryptoModule,
        RegistrationBureauModule,
        Lc1Module,
        Lc2Module,
        Lc3Module,
        Lc4Module,
        Mc1Module,
        Mc2Module,
        CecModule,
      ],
    }).compile();

    cecService = module.get<CecService>(CecService);
    mc1 = module.get<MidCommissionService>(MC1_TOKEN);
    mc2 = module.get<MidCommissionService>(MC2_TOKEN);
    lcs = [
      module.get<LowCommissionService>(LC1_TOKEN),
      module.get<LowCommissionService>(LC2_TOKEN),
      module.get<LowCommissionService>(LC3_TOKEN),
      module.get<LowCommissionService>(LC4_TOKEN),
    ];
    lcPublicKeys = lcs.map((lc) => lc.publicKey);

    bureauService = module.get<RegistrationBureauService>(
      RegistrationBureauService,
    );
    cryptoService = module.get<CryptoService>(CryptoService);

    candidate1Id = cecService.registerCandidate('Кандидат А').id;
    candidate2Id = cecService.registerCandidate('Кандидат Б').id;

    voter = new Voter('Іваненко І. І.', cryptoService);
    bureauService.addEligibleVoter(voter.fullName);
    const rn = bureauService.registerVoter(voter.fullName, voter.publicKey)!;
    voter.setRegistrationNumber(rn);

    const registry = bureauService.exportAnonymousRegistry();
    for (const lc of lcs) {
      lc.receiveVoterRegistry(registry, bureauService.publicKey);
    }
  });

  it('Позитивний сценарій: гомоморфно об’єднує батчі ВКС-1 та ВКС-2, розшифровує підсумковий шифротекст, зараховує голос та підписує результати', () => {
    const packets = voter.createEncryptedBallotPackets(
      candidate1Id,
      cecService.publicKey,
      lcPublicKeys,
    );
    packets.forEach((pkt, idx) => lcs[idx].submitEncryptedPacket(pkt));

    const lcBatches = lcs.map((lc) => lc.exportSignedBatch());
    const mc1Batch = mc1.aggregateBatches(
      lcBatches[0],
      lcs[0].publicKey,
      lcBatches[1],
      lcs[1].publicKey,
      1,
      cecService.publicKey,
    )!;
    const mc2Batch = mc2.aggregateBatches(
      lcBatches[2],
      lcs[2].publicKey,
      lcBatches[3],
      lcs[3].publicKey,
      1,
      cecService.publicKey,
    )!;

    const results = cecService.tallyElection(
      mc1Batch,
      mc1.publicKey,
      mc2Batch,
      mc2.publicKey,
      1,
    );

    expect(results).not.toBeNull();
    expect(results!.tally[candidate1Id]).toBe(1);
    expect(results!.tally[candidate2Id]).toBe(0);
    expect(results!.invalidVoterIds).toHaveLength(0);
    expect(results!.ballots).toHaveLength(1);
    expect(results!.ballots[0].candidateId).toBe(candidate1Id);

    const isVerifiedByVoter = voter.verifyVoteInPublishedData(
      lcBatches.map((b) => b.parts),
      [mc1Batch.parts, mc2Batch.parts],
      results!.ballots,
      cecService.publicKey,
    );
    expect(isVerifiedByVoter).toBe(true);
  });

  it('Негативний сценарій: підпис ВКС-1 або ВКС-2 підроблений', () => {
    const packets = voter.createEncryptedBallotPackets(
      candidate1Id,
      cecService.publicKey,
      lcPublicKeys,
    );
    packets.forEach((pkt, idx) => lcs[idx].submitEncryptedPacket(pkt));

    const lcBatches = lcs.map((lc) => lc.exportSignedBatch());
    const mc1Batch = mc1.aggregateBatches(
      lcBatches[0],
      lcs[0].publicKey,
      lcBatches[1],
      lcs[1].publicKey,
      1,
      cecService.publicKey,
    )!;
    const mc2Batch = mc2.aggregateBatches(
      lcBatches[2],
      lcs[2].publicKey,
      lcBatches[3],
      lcs[3].publicKey,
      1,
      cecService.publicKey,
    )!;

    mc2Batch.signature += 1n;

    const results = cecService.tallyElection(
      mc1Batch,
      mc1.publicKey,
      mc2Batch,
      mc2.publicKey,
      1,
    );

    expect(results).toBeNull();
  });

  it('Негативний сценарій: невалідний candidateId при розшифруванні, якщо комісія підмінила частку до підписання', () => {
    const packets = voter.createEncryptedBallotPackets(
      candidate1Id,
      cecService.publicKey,
      lcPublicKeys,
    );
    packets.forEach((pkt, idx) => lcs[idx].submitEncryptedPacket(pkt));

    const lcBatches = lcs.map((lc) => lc.exportSignedBatch());
    const mc1Batch = mc1.aggregateBatches(
      lcBatches[0],
      lcs[0].publicKey,
      lcBatches[1],
      lcs[1].publicKey,
      1,
      cecService.publicKey,
    )!;

    const tamperedCipher = cryptoService.encryptNumber(
      11n,
      cecService.publicKey.e,
      cecService.publicKey.n,
    );
    jest
      .spyOn(cryptoService, 'multiplyCiphertexts')
      .mockReturnValueOnce(tamperedCipher);

    const mc2TamperedBatch = mc2.aggregateBatches(
      lcBatches[2],
      lcs[2].publicKey,
      lcBatches[3],
      lcs[3].publicKey,
      1,
      cecService.publicKey,
    )!;

    const results = cecService.tallyElection(
      mc1Batch,
      mc1.publicKey,
      mc2TamperedBatch,
      mc2.publicKey,
      1,
    );

    expect(results).not.toBeNull();
    expect(results!.ballots).toHaveLength(0);
    expect(results!.invalidVoterIds).toEqual([lcBatches[0].parts[0].voterId]);
    expect(results!.tally[candidate1Id]).toBe(0);
  });

  it('Негативний сценарій: викидає помилку при спробі зареєструвати дублікат кандидата або порожнє ім’я', () => {
    expect(() => cecService.registerCandidate('   ')).toThrow(
      'ПІБ кандидата не може бути порожнім',
    );
    expect(() => cecService.registerCandidate('Кандидат А')).toThrow(
      'Кандидат "Кандидат А" вже зареєстрований',
    );
  });
});
