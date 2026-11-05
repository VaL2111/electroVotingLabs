import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import {
  EC1_TOKEN,
  ElectionCommissionService,
} from './election-commission.service';

@Module({
  imports: [CryptoModule],
  providers: [
    {
      provide: EC1_TOKEN,
      useFactory: (cryptoService: CryptoService) =>
        new ElectionCommissionService('ВК-1', cryptoService),
      inject: [CryptoService],
    },
  ],
  exports: [EC1_TOKEN],
})
export class Ec1Module {}
