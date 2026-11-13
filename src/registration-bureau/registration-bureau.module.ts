import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module';
import { RegistrationBureauService } from './registration-bureau.service';

@Module({
  imports: [CryptoModule],
  providers: [RegistrationBureauService],
  exports: [RegistrationBureauService],
})
export class RegistrationBureauModule {}
