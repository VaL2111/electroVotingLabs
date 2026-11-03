import { Module } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [CryptoModule],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
