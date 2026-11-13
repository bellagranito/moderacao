import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ErroDominio } from '../domain/erros';
import { Banco } from '../infrastructure/banco';
import { CasoService } from './caso.service';

@Injectable()
export class SlaService implements OnModuleInit, OnModuleDestroy {
  private temporizador?: NodeJS.Timeout;

  constructor(
    private readonly banco: Banco,
    private readonly casoService: CasoService,
  ) {}

  onModuleInit() {
    const intervalo = Number(process.env.SLA_INTERVALO_MS ?? 60000);
    this.temporizador = setInterval(() => {
      this.escalarVencidos().catch((erro) => console.error('Falha ao verificar SLA:', erro.message));
    }, intervalo);
    this.temporizador.unref();
  }

  onModuleDestroy() {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  // escalona cada caso vencido em uma transação própria: um erro não derruba os demais
  async escalarVencidos() {
    const repo = this.banco.repositorio();
    const sistema = await repo.buscarUsuarioSistema();
    if (!sistema) throw new ErroDominio('NAO_ENCONTRADO', 'Usuário do sistema não cadastrado.');

    const ids = await repo.listarIdsDeCasosVencidos(new Date());
    const escalonados: number[] = [];
    const ignorados: number[] = [];

    for (const id of ids) {
      try {
        await this.casoService.executar(id, 'escalonar', sistema, {
          justificativa: 'Escalonado automaticamente: prazo de SLA vencido.',
        });
        escalonados.push(id);
      } catch (erro) {
        ignorados.push(id);
      }
    }
    return { verificados: ids.length, escalonados, ignorados };
  }
}
