import { ErroDominio } from '../erros';
import { PortasTransicao } from '../portas';
import { AlteracaoCaso, ContextoTransicao, Transicao } from './transicao';

export const DIAS_PARA_REVERTER = 7;

export class Reverter extends Transicao {
  readonly acao = 'reverter';
  readonly destino = 'REVERTIDA' as const;
  readonly permissoes = {
    PROCEDENTE: ['supervisor'],
  } as const;

  async validar(ctx: ContextoTransicao): Promise<void> {
    this.exigirJustificativa(ctx);

    const julgadoEm = ctx.caso.julgadoEm;
    if (julgadoEm) {
      const dias = (ctx.agora.getTime() - julgadoEm.getTime()) / (24 * 60 * 60 * 1000);
      if (dias > DIAS_PARA_REVERTER) {
        throw new ErroDominio(
          'REGRA_NEGOCIO',
          `Só é possível reverter um julgamento em até ${DIAS_PARA_REVERTER} dias.`,
        );
      }
    }
  }

  // desfaz tudo o que o julgamento procedente tinha feito
  async aplicar(ctx: ContextoTransicao, portas: PortasTransicao): Promise<AlteracaoCaso> {
    await portas.revogarPunicoesDoCaso(ctx.caso.id);
    await portas.restaurarPostagem(ctx.caso.postagemId);
    await portas.recalcularBanimento(ctx.caso.autorPostagemId);
    return {};
  }
}
