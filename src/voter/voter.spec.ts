import { CryptoService } from '../crypto/crypto.service';
import { PublicKey } from '../crypto/crypto.interfaces';
import { SignedVoterPacket } from '../common/protocol.interfaces';
import { Voter } from './voter';

describe('Voter', () => {
  let cryptoService: CryptoService;
  let voter: Voter;
  let cecPublicKey: PublicKey;
  let cecPrivateKeyD: bigint;
  let lcKeys: ReturnType<CryptoService['generateKeyPair']>[];

  const candidateId = 210; // 2 * 3 * 5 * 7

  beforeEach(() => {
    cryptoService = new CryptoService();
    voter = new Voter('Іваненко І. І.', cryptoService);

    const cecKeyPair = cryptoService.generateKeyPair();
    cecPublicKey = cecKeyPair.publicKey;
    cecPrivateKeyD = cecKeyPair.privateKey.d;

    lcKeys = [
      cryptoService.generateKeyPair(),
      cryptoService.generateKeyPair(),
      cryptoService.generateKeyPair(),
      cryptoService.generateKeyPair(),
    ];
  });

  it('Позитивний сценарій: розкладає candidateId на 4 множники, шифрує їх ключем ЦВК, підписує та шифрує пакети ключами ВКН 1..4', () => {
    voter.setRegistrationNumber('rn-123');

    const packets = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      [
        lcKeys[0].publicKey,
        lcKeys[1].publicKey,
        lcKeys[2].publicKey,
        lcKeys[3].publicKey,
      ],
    );

    expect(packets).toHaveLength(4);

    let combinedCipher = 1n;
    const voterIds = new Set<string>();
    for (let i = 0; i < lcKeys.length; i++) {
      const decryptedJson = cryptoService.decryptText(
        packets[i],
        lcKeys[i].privateKey.d,
        lcKeys[i].privateKey.n,
      );
      const parsed = JSON.parse(decryptedJson) as SignedVoterPacket;

      voterIds.add(parsed.voterId);
      expect(parsed.registrationNumber).toBe('rn-123');

      combinedCipher = cryptoService.multiplyCiphertexts(
        combinedCipher,
        BigInt(parsed.encryptedPart),
        cecPublicKey.n,
      );
    }

    expect(voterIds.size).toBe(1);

    const decryptedProduct = cryptoService.decryptNumber(
      combinedCipher,
      cecPrivateKeyD,
      cecPublicKey.n,
    );
    expect(Number(decryptedProduct)).toBe(candidateId);
  });

  it('Негативний сценарій: викидає помилку при спробі сформувати бюлетень без отриманого RN', () => {
    expect(() =>
      voter.createEncryptedBallotPackets(candidateId, cecPublicKey, [
        lcKeys[0].publicKey,
        lcKeys[1].publicKey,
        lcKeys[2].publicKey,
        lcKeys[3].publicKey,
      ]),
    ).toThrow('не має RN');
  });

  it('Позитивний сценарій: успішно верифікує власний голос у таблицях ВКН 1..4, ВКС 1..2 та ЦВК', () => {
    voter.setRegistrationNumber('rn-123');
    const packets = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      [
        lcKeys[0].publicKey,
        lcKeys[1].publicKey,
        lcKeys[2].publicKey,
        lcKeys[3].publicKey,
      ],
    );

    const parsedPackets = packets.map((pkt, i) => {
      const json = cryptoService.decryptText(
        pkt,
        lcKeys[i].privateKey.d,
        lcKeys[i].privateKey.n,
      );
      return JSON.parse(json) as SignedVoterPacket;
    });
    const voterId = parsedPackets[0].voterId;
    const c = parsedPackets.map((p) => BigInt(p.encryptedPart));

    const c12 = cryptoService.multiplyCiphertexts(c[0], c[1], cecPublicKey.n);
    const c34 = cryptoService.multiplyCiphertexts(c[2], c[3], cecPublicKey.n);

    const isVerified = voter.verifyVoteInPublishedData(
      [
        [{ voterId, encryptedPart: c[0] }],
        [{ voterId, encryptedPart: c[1] }],
        [{ voterId, encryptedPart: c[2] }],
        [{ voterId, encryptedPart: c[3] }],
      ],
      [[{ voterId, encryptedPart: c12 }], [{ voterId, encryptedPart: c34 }]],
      [{ voterId, candidateId }],
      cecPublicKey,
    );

    expect(isVerified).toBe(true);
  });

  it('Негативний сценарій: виявляє підміну частки бюлетеня на рівні ВКН, ВКС або ЦВК під час верифікації', () => {
    voter.setRegistrationNumber('rn-123');
    const packets = voter.createEncryptedBallotPackets(
      candidateId,
      cecPublicKey,
      [
        lcKeys[0].publicKey,
        lcKeys[1].publicKey,
        lcKeys[2].publicKey,
        lcKeys[3].publicKey,
      ],
    );

    const parsedPackets = packets.map((pkt, i) => {
      const json = cryptoService.decryptText(
        pkt,
        lcKeys[i].privateKey.d,
        lcKeys[i].privateKey.n,
      );
      return JSON.parse(json) as SignedVoterPacket;
    });
    const voterId = parsedPackets[0].voterId;
    const c = parsedPackets.map((p) => BigInt(p.encryptedPart));

    const c12 = cryptoService.multiplyCiphertexts(c[0], c[1], cecPublicKey.n);
    const c34 = cryptoService.multiplyCiphertexts(c[2], c[3], cecPublicKey.n);

    expect(
      voter.verifyVoteInPublishedData(
        [
          [{ voterId, encryptedPart: c[0] }],
          [{ voterId, encryptedPart: c[1] + 1n }],
          [{ voterId, encryptedPart: c[2] }],
          [{ voterId, encryptedPart: c[3] }],
        ],
        [[{ voterId, encryptedPart: c12 }], [{ voterId, encryptedPart: c34 }]],
        [{ voterId, candidateId }],
        cecPublicKey,
      ),
    ).toBe(false);

    expect(
      voter.verifyVoteInPublishedData(
        [
          [{ voterId, encryptedPart: c[0] }],
          [{ voterId, encryptedPart: c[1] }],
          [{ voterId, encryptedPart: c[2] }],
          [{ voterId, encryptedPart: c[3] }],
        ],
        [
          [{ voterId, encryptedPart: c12 + 1n }],
          [{ voterId, encryptedPart: c34 }],
        ],
        [{ voterId, candidateId }],
        cecPublicKey,
      ),
    ).toBe(false);

    expect(
      voter.verifyVoteInPublishedData(
        [
          [{ voterId, encryptedPart: c[0] }],
          [{ voterId, encryptedPart: c[1] }],
          [{ voterId, encryptedPart: c[2] }],
          [{ voterId, encryptedPart: c[3] }],
        ],
        [[{ voterId, encryptedPart: c12 }], [{ voterId, encryptedPart: c34 }]],
        [{ voterId, candidateId: 300 }],
        cecPublicKey,
      ),
    ).toBe(false);
  });
});
