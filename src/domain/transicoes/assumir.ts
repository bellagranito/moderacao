import { ErroDominio } from '../erros';
import { PortasTransicao } from '../portas';
import { AlteracaoCaso, ContextoTransicao, Transicao } from './transicao';

export const LIMITE_CASOS_EM_ANALISE = 3;

export class Assumir extends Transicao {
  readonly acao = 'assumir';
  readonly destino = 'EM_ANALISE' as const;
  readonly permissoes = {
    RECEBIDA: ['moderador', 'supervisor'],
  } as const;
  readonly justificativaPadrao = 'Caso assumido pelo moderador';

  async validar(ctx: ContextoTransicao, portas: PortasTransicao): Promise<void> {
    if (ctx.caso.autorPostagemId === ctx.ator.id) {
      throw new ErroDominio('REGRA_NEGOCIO', 'Ninguém pode analisar um caso sobre a própria postagem.');
    }

    // a trava evita que dois cliques simultâneos do mesmo moderador passem do limite
    await portas.travarLimiteDeAnalise(ctx.ator.id);
    const emAnalise = await portas.contarCasosEmAnalise(ctx.ator.id);
    if (emAnalise >= LIMITE_CASOS_EM_ANALISE) {
      throw new ErroDominio(
        'REGRA_NEGOCIO',
        `Você já tem ${LIMITE_CASOS_EM_ANALISE} casos em análise. Conclua algum antes de assumir outro.`,
      );
    }
  }

  async aplicar(ctx: ContextoTransicao): Promise<AlteracaoCaso> {
    return { moderadorId: ctx.ator.id };
  }
}
