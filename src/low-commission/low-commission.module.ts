import { Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module';
import { CryptoService } from '../crypto/crypto.service';
import {
  LC1_TOKEN,
  LC2_TOKEN,
  LC3_TOKEN,
  LC4_TOKEN,
  LowCommissionService,
} from './low-commission.service';

@Module({
  imports: [CryptoModule],
  providers: [
    {
      provide: LC1_TOKEN,
      useFactory: (cryptoService: CryptoService) =>
        new LowCommissionService('ВКН-1', cryptoService),
      inject: [CryptoService],
    },
  ],
  exports: [LC1_TOKEN],
})
export class Lc1Module {}

@Module({
  imports: [CryptoModule],
  providers: [
    {
      provide: LC2_TOKEN,
      useFactory: (cryptoService: CryptoService) =>
        new LowCommissionService('ВКН-2', cryptoService),
      inject: [CryptoService],
    },
  ],
  exports: [LC2_TOKEN],
})
export class Lc2Module {}

@Module({
  imports: [CryptoModule],
  providers: [
    {
      provide: LC3_TOKEN,
      useFactory: (cryptoService: CryptoService) =>
        new LowCommissionService('ВКН-3', cryptoService),
      inject: [CryptoService],
    },
  ],
  exports: [LC3_TOKEN],
})
export class Lc3Module {}

@Module({
  imports: [CryptoModule],
  providers: [
    {
      provide: LC4_TOKEN,
      useFactory: (cryptoService: CryptoService) =>
        new LowCommissionService('ВКН-4', cryptoService),
      inject: [CryptoService],
    },
  ],
  exports: [LC4_TOKEN],
})
export class Lc4Module {}
