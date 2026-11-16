import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module';
import { CecService } from './cec.service';

@Module({
  imports: [CryptoModule],
  providers: [CecService],
  exports: [CecService],
})
export class CecModule {}
