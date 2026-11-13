import { AlteracaoCaso, ContextoTransicao, Transicao } from './transicao';

export class JulgarImprocedente extends Transicao {
  readonly acao = 'julgar-improcedente';
  readonly destino = 'IMPROCEDENTE' as const;
  readonly permissoes = {
    EM_ANALISE: ['moderador', 'supervisor'],
    ESCALONADA: ['supervisor'],
  } as const;

  async validar(ctx: ContextoTransicao): Promise<void> {
    this.exigirResponsavel(ctx);
    this.exigirJustificativa(ctx);
  }

  async aplicar(ctx: ContextoTransicao): Promise<AlteracaoCaso> {
    return { julgadoEm: ctx.agora };
  }
}
