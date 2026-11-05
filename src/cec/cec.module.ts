import { Module } from '@nestjs/common';
import { CecService } from './cec.service';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [CryptoModule],
  providers: [CecService],
  exports: [CecService],
})
export class CecModule {}
