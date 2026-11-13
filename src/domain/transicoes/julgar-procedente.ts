import { ErroDominio } from '../erros';
import { PortasTransicao } from '../portas';
import { AlteracaoCaso, ContextoTransicao, Transicao } from './transicao';

export class JulgarProcedente extends Transicao {
  readonly acao = 'julgar-procedente';
  readonly destino = 'PROCEDENTE' as const;
  readonly permissoes = {
    EM_ANALISE: ['moderador', 'supervisor'],
    ESCALONADA: ['supervisor'],
  } as const;

  async validar(ctx: ContextoTransicao): Promise<void> {
    this.exigirResponsavel(ctx);
    this.exigirJustificativa(ctx);

    if (ctx.punicao !== 'advertencia' && ctx.punicao !== 'banimento') {
      throw new ErroDominio('REGRA_NEGOCIO', 'Informe a punição: advertencia ou banimento.');
    }
    if (ctx.punicao === 'banimento' && ctx.ator.perfil !== 'supervisor') {
      throw new ErroDominio('SEM_PERMISSAO', 'Somente o supervisor pode aplicar banimento.');
    }
  }

  async aplicar(ctx: ContextoTransicao, portas: PortasTransicao): Promise<AlteracaoCaso> {
    await portas.removerPostagem(ctx.caso.postagemId);
    await portas.registrarPunicao(ctx.caso.id, ctx.caso.autorPostagemId, ctx.punicao!);
    if (ctx.punicao === 'banimento') {
      await portas.banirUsuario(ctx.caso.autorPostagemId);
    }
    return { julgadoEm: ctx.agora };
  }
}
