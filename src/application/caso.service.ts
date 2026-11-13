import { Injectable } from '@nestjs/common';
import { ErroDominio } from '../domain/erros';
import { faixaDoScore } from '../domain/sla';
import { Estado, TipoPunicao, Usuario } from '../domain/tipos';
import { buscarTransicao, TRANSICOES } from '../domain/transicoes';
import { Banco } from '../infrastructure/banco';

const ESTADOS_VALIDOS: Estado[] = ['RECEBIDA', 'EM_ANALISE', 'ESCALONADA', 'PROCEDENTE', 'IMPROCEDENTE', 'REVERTIDA'];

export interface DadosDaAcao {
  justificativa?: unknown;
  punicao?: unknown;
}

@Injectable()
export class CasoService {
  constructor(private readonly banco: Banco) {}

  async listar(ator: Usuario, estado?: string) {
    this.exigirEquipeDeModeracao(ator);
    if (estado && !ESTADOS_VALIDOS.includes(estado as Estado)) {
      throw new ErroDominio('DADOS_INVALIDOS', `Estado inválido: ${estado}`);
    }

    const casos = await this.banco.repositorio().listarCasos(estado as Estado | undefined);
    return casos.map((c) => ({ ...c, faixa: faixaDoScore(c.score) }));
  }

  async detalhar(id: number, ator: Usuario) {
    this.exigirEquipeDeModeracao(ator);
    const repo = this.banco.repositorio();

    const caso = await repo.buscarCaso(id);
    if (!caso) throw new ErroDominio('NAO_ENCONTRADO', 'Caso não encontrado.');

    const postagem = await repo.buscarPostagem(caso.postagemId);
    const acoesPermitidas = TRANSICOES.filter((t) => t.permitePara(caso.estado, ator.perfil)).map((t) => t.acao);

    return {
      caso: { ...caso, faixa: faixaDoScore(caso.score) },
      postagem,
      denuncias: await repo.listarDenuncias(id),
      historico: await repo.listarHistorico(id),
      punicoes: await repo.listarPunicoes(id),
      acoesPermitidas,
    };
  }

  // único caminho para mudar o estado de um caso
  async executar(casoId: number, nomeDaAcao: string, ator: Usuario, dados: DadosDaAcao) {
    const transicao = buscarTransicao(nomeDaAcao);
    if (!transicao) throw new ErroDominio('NAO_ENCONTRADO', `Ação desconhecida: ${nomeDaAcao}`);

    const justificativa =
      (typeof dados.justificativa === 'string' ? dados.justificativa.trim() : '') ||
      transicao.justificativaPadrao ||
      '';
    const punicao = dados.punicao as TipoPunicao | undefined;

    return this.banco.transacao(async (repo) => {
      const caso = await repo.travarCaso(casoId);
      if (!caso) throw new ErroDominio('NAO_ENCONTRADO', 'Caso não encontrado.');

      const permitidos = transicao.permissoes[caso.estado];
      if (!permitidos) {
        throw new ErroDominio(
          'TRANSICAO_INVALIDA',
          `A ação "${transicao.acao}" não pode ser feita em um caso ${caso.estado}.`,
        );
      }
      if (!permitidos.includes(ator.perfil)) {
        throw new ErroDominio(
          'SEM_PERMISSAO',
          `O perfil ${ator.perfil} não pode executar "${transicao.acao}" em um caso ${caso.estado}.`,
        );
      }

      const ctx = { caso, ator, justificativa, punicao, agora: new Date() };
      await transicao.validar(ctx, repo);
      const alteracao = await transicao.aplicar(ctx, repo);

      await repo.atualizarEstado(caso.id, transicao.destino, alteracao);
      await repo.gravarHistorico({
        idRegistro: caso.id,
        estadoAnterior: caso.estado,
        novoEstado: transicao.destino,
        autorId: ator.id,
        justificativa,
      });

      return { casoId: caso.id, estadoAnterior: caso.estado, novoEstado: transicao.destino };
    });
  }

  private exigirEquipeDeModeracao(ator: Usuario) {
    if (ator.perfil === 'usuario') {
      throw new ErroDominio('SEM_PERMISSAO', 'Somente a equipe de moderação acessa os casos.');
    }
  }
}
