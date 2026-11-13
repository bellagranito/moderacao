import { ErroDominio } from '../erros';
import { slaVencido } from '../sla';
import { AlteracaoCaso, ContextoTransicao, Transicao } from './transicao';

export class Escalonar extends Transicao {
  readonly acao = 'escalonar';
  readonly destino = 'ESCALONADA' as const;
  readonly permissoes = {
    RECEBIDA: ['sistema'],
    EM_ANALISE: ['moderador', 'supervisor', 'sistema'],
  } as const;

  async validar(ctx: ContextoTransicao): Promise<void> {
    this.exigirJustificativa(ctx);
    this.exigirResponsavel(ctx);

    if (ctx.ator.perfil === 'sistema' && !slaVencido(ctx.caso.prazoSla, ctx.agora)) {
      throw new ErroDominio('REGRA_NEGOCIO', 'O prazo de SLA do caso ainda não venceu.');
    }
  }

  // ao subir para o supervisor o caso deixa de ocupar a cota do moderador
  async aplicar(): Promise<AlteracaoCaso> {
    return { moderadorId: null };
  }
}
