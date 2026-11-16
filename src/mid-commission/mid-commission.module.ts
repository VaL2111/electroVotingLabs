import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import {
  MC1_TOKEN,
  MC2_TOKEN,
  MidCommissionService,
} from './mid-commission.service';

@Module({
  imports: [CryptoModule],
  providers: [
    {
      provide: MC1_TOKEN,
      useFactory: (cryptoService: CryptoService) =>
        new MidCommissionService('ВКС-1', cryptoService),
      inject: [CryptoService],
    },
  ],
  exports: [MC1_TOKEN],
})
export class Mc1Module {}

@Module({
  imports: [CryptoModule],
  providers: [
    {
      provide: MC2_TOKEN,
      useFactory: (cryptoService: CryptoService) =>
        new MidCommissionService('ВКС-2', cryptoService),
      inject: [CryptoService],
    },
  ],
  exports: [MC2_TOKEN],
})
export class Mc2Module {}
