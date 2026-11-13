import { ErroDominio } from '../erros';
import { PortasTransicao } from '../portas';
import { Caso, Estado, Perfil, TipoPunicao, Usuario } from '../tipos';

export interface ContextoTransicao {
  caso: Caso;
  ator: Usuario;
  justificativa: string;
  punicao?: TipoPunicao;
  agora: Date;
}

export interface AlteracaoCaso {
  moderadorId?: number | null;
  julgadoEm?: Date | null;
}

export const TAMANHO_MINIMO_JUSTIFICATIVA = 10;

export abstract class Transicao {
  abstract readonly acao: string;
  abstract readonly destino: Estado;
  // chave: estado de origem / valor: perfis que podem executar a partir dele
  abstract readonly permissoes: Partial<Record<Estado, readonly Perfil[]>>;
  readonly justificativaPadrao?: string;

  abstract aplicar(ctx: ContextoTransicao, portas: PortasTransicao): Promise<AlteracaoCaso>;

  async validar(_ctx: ContextoTransicao, _portas: PortasTransicao): Promise<void> {}

  permitePara(estado: Estado, perfil: Perfil): boolean {
    const perfis = this.permissoes[estado];
    return !!perfis && perfis.includes(perfil);
  }

  protected exigirJustificativa(ctx: ContextoTransicao): void {
    if (ctx.justificativa.length < TAMANHO_MINIMO_JUSTIFICATIVA) {
      throw new ErroDominio(
        'REGRA_NEGOCIO',
        `A justificativa precisa ter pelo menos ${TAMANHO_MINIMO_JUSTIFICATIVA} caracteres.`,
      );
    }
  }

  // moderador só mexe em caso que ele mesmo assumiu; supervisor não tem essa restrição
  protected exigirResponsavel(ctx: ContextoTransicao): void {
    if (ctx.caso.estado !== 'EM_ANALISE') return;
    if (ctx.ator.perfil === 'moderador' && ctx.caso.moderadorId !== ctx.ator.id) {
      throw new ErroDominio('REGRA_NEGOCIO', 'Somente o moderador responsável pelo caso pode fazer isso.');
    }
  }
}
