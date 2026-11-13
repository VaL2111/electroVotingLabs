import { Test, TestingModule } from '@nestjs/testing';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import { RegistrationBureauService } from './registration-bureau.service';

describe('RegistrationBureauService', () => {
  let service: RegistrationBureauService;
  let cryptoService: CryptoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CryptoModule],
      providers: [RegistrationBureauService],
    }).compile();

    service = module.get<RegistrationBureauService>(RegistrationBureauService);
    cryptoService = module.get<CryptoService>(CryptoService);
  });

  it('Негативний сценарій: викидає помилку при спробі додати порожнє ПІБ у реєстр виборців', () => {
    expect(() => service.addEligibleVoter('   ')).toThrow(
      'ПІБ виборця не може бути порожнім',
    );
  });

  it('Позитивний сценарій: реєструє виборця з правом голосу та видає унікальний RN', () => {
    service.addEligibleVoter('Іваненко І. І.');
    const voterKeys = cryptoService.generateKeyPair();

    const rn = service.registerVoter('Іваненко І. І.', voterKeys.publicKey);

    expect(rn).toEqual(expect.any(String));
    expect(service.exportAnonymousRegistry().totalRegistered).toBe(1);
  });

  it('Негативний сценарій: відхиляє реєстрацію особи, бо відсутня у списку виборців)', () => {
    service.addEligibleVoter('Іваненко І. І.');
    const outsiderKeys = cryptoService.generateKeyPair();

    const rn = service.registerVoter('Стороння Особа', outsiderKeys.publicKey);

    expect(rn).toBeNull();
    expect(service.exportAnonymousRegistry().totalRegistered).toBe(0);
  });

  it('Негативний сценарій: блокує повторну реєстрацію того самого виборця', () => {
    service.addEligibleVoter('Петренко П. П.');
    const voterKeys1 = cryptoService.generateKeyPair();
    const voterKeys2 = cryptoService.generateKeyPair();

    const firstRn = service.registerVoter(
      'Петренко П. П.',
      voterKeys1.publicKey,
    );
    const secondRn = service.registerVoter(
      'Петренко П. П.',
      voterKeys2.publicKey,
    );

    expect(firstRn).not.toBeNull();
    expect(secondRn).toBeNull();
    expect(service.exportAnonymousRegistry().totalRegistered).toBe(1);
  });

  it('Позитивний сценарій: експортує знеособлений реєстр', () => {
    service.addEligibleVoter('Виборець А');
    service.addEligibleVoter('Виборець Б');

    const keysA = cryptoService.generateKeyPair();
    const keysB = cryptoService.generateKeyPair();

    const rnA = service.registerVoter('Виборець А', keysA.publicKey);
    const rnB = service.registerVoter('Виборець Б', keysB.publicKey);

    const exported = service.exportAnonymousRegistry();

    expect(exported.totalRegistered).toBe(2);
    expect(exported.records).toEqual([
      { registrationNumber: rnA, publicKey: keysA.publicKey },
      { registrationNumber: rnB, publicKey: keysB.publicKey },
    ]);

    const payloadJson = JSON.stringify({
      totalRegistered: exported.totalRegistered,
      records: exported.records.map((r) => ({
        registrationNumber: r.registrationNumber,
        e: r.publicKey.e.toString(),
        n: r.publicKey.n.toString(),
      })),
    });
    const expectedHash = cryptoService.customHash(
      payloadJson,
      service.publicKey.n,
    );

    expect(
      cryptoService.verifySignature(
        expectedHash,
        exported.signature,
        service.publicKey.e,
        service.publicKey.n,
      ),
    ).toBe(true);
  });
});
