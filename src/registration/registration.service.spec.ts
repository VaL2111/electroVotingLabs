import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationService } from './registration.service';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';

describe('RegistrationService', () => {
  let registrationService: RegistrationService;
  let cryptoService: CryptoService;

  const eligibleVoterName = 'Іван Ф.';
  const UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [CryptoModule],
      providers: [RegistrationService],
    }).compile();

    registrationService = module.get<RegistrationService>(RegistrationService);
    cryptoService = module.get<CryptoService>(CryptoService);

    registrationService.addEligibleVoter(eligibleVoterName);
  });

  it('Позитивний сценарій: реєструє виборця зі списку та видає унікальний RN', () => {
    const { publicKey } = cryptoService.generateKeyPair();

    const rn = registrationService.registerVoter(eligibleVoterName, publicKey);

    expect(rn).toMatch(UUID_V4_REGEX);
    expect(registrationService.getAnonymousRegistryForEC()).toEqual([
      { rn, publicKey },
    ]);
  });

  it('Негативний сценарій: відмовляє особі, якої немає у списку виборців', () => {
    const { publicKey } = cryptoService.generateKeyPair();

    const rn = registrationService.registerVoter('stranger', publicKey);

    expect(rn).toBeNull();
    expect(registrationService.getAnonymousRegistryForEC()).toHaveLength(0);
  });

  it('Негативний сценарій: відмовляє у повторному отриманні RN тим самим виборцем', () => {
    const { publicKey } = cryptoService.generateKeyPair();

    const firstRn = registrationService.registerVoter(
      eligibleVoterName,
      publicKey,
    );
    const secondRn = registrationService.registerVoter(
      eligibleVoterName,
      publicKey,
    );

    expect(firstRn).toMatch(UUID_V4_REGEX);
    expect(secondRn).toBeNull();
    expect(registrationService.getAnonymousRegistryForEC()).toHaveLength(1);
  });
});
