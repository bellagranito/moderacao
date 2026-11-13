import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { CasoService } from './application/caso.service';
import { DenunciaService } from './application/denuncia.service';
import { SlaService } from './application/sla.service';
import { Banco } from './infrastructure/banco';
import { AuthGuard } from './presentation/auth.guard';
import { CasosController } from './presentation/casos.controller';
import { DenunciasController } from './presentation/denuncias.controller';
import { FiltroDeErros } from './presentation/filtro-de-erros';
import { SlaController } from './presentation/sla.controller';
import { UsuariosController } from './presentation/usuarios.controller';

@Module({
  controllers: [UsuariosController, DenunciasController, CasosController, SlaController],
  providers: [
    Banco,
    CasoService,
    DenunciaService,
    SlaService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: FiltroDeErros },
  ],
})
export class AppModule {}
