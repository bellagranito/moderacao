import { Injectable } from '@nestjs/common';
import { ErroDominio } from '../domain/erros';
import { MOTIVOS, Motivo, Usuario } from '../domain/tipos';
import { calcularPrazo, prazoAtualizado } from '../domain/sla';
import { calculadoraPadrao } from '../domain/urgencia';
import { Banco } from '../infrastructure/banco';

export const LIMITE_DENUNCIAS_POR_HORA = 10;

@Injectable()
export class DenunciaService {
  constructor(private readonly banco: Banco) {}

  async registrar(denunciante: Usuario, dados: any) {
    const postagemId = Number(dados?.postagemId);
    const motivo = dados?.motivo as Motivo;
    const descricao = typeof dados?.descricao === 'string' ? dados.descricao.trim() || null : null;

    if (!Number.isInteger(postagemId) || postagemId <= 0) {
      throw new ErroDominio('DADOS_INVALIDOS', 'Informe a postagem denunciada.');
    }
    if (!MOTIVOS.includes(motivo)) {
      throw new ErroDominio('DADOS_INVALIDOS', `Motivo inválido. Use: ${MOTIVOS.join(', ')}`);
    }
    if (denunciante.perfil === 'sistema') {
      throw new ErroDominio('SEM_PERMISSAO', 'O usuário do sistema não faz denúncias.');
    }
    if (denunciante.banido) {
      throw new ErroDominio('REGRA_NEGOCIO', 'Usuários banidos não podem denunciar.');
    }

    return this.banco.transacao(async (repo) => {
      const postagem = await repo.buscarPostagem(postagemId);
      if (!postagem) throw new ErroDominio('NAO_ENCONTRADO', 'Postagem não encontrada.');
      if (postagem.removida) throw new ErroDominio('REGRA_NEGOCIO', 'Essa postagem já foi removida.');
      if (postagem.autorId === denunciante.id) {
        throw new ErroDominio('REGRA_NEGOCIO', 'Você não pode denunciar a própria postagem.');
      }

      // limite por pessoa: a trava impede que várias requisições simultâneas furem o limite
      await repo.travarLimiteDeDenuncias(denunciante.id);
      if ((await repo.contarDenunciasNaUltimaHora(denunciante.id)) >= LIMITE_DENUNCIAS_POR_HORA) {
        throw new ErroDominio(
          'REGRA_NEGOCIO',
          `Limite de ${LIMITE_DENUNCIAS_POR_HORA} denúncias por hora atingido.`,
        );
      }

      // todas as denúncias da mesma postagem caem no mesmo caso
      const agora = new Date();
      const novoCasoId = await repo.abrirCaso(postagem.id, calcularPrazo(agora, 0));
      const caso = await repo.travarCasoAbertoDaPostagem(postagem.id);
      if (!caso) {
        throw new ErroDominio('REGRA_NEGOCIO', 'O caso dessa postagem acabou de ser encerrado, tente novamente.');
      }

      if (novoCasoId !== null) {
        await repo.gravarHistorico({
          idRegistro: caso.id,
          estadoAnterior: null,
          novoEstado: 'RECEBIDA',
          autorId: denunciante.id,
          justificativa: 'Primeira denúncia da postagem',
        });
      }

      const inserida = await repo.inserirDenuncia(caso.id, denunciante.id, motivo, descricao);
      if (!inserida) {
        throw new ErroDominio('REGRA_NEGOCIO', 'Você já denunciou essa postagem.');
      }

      const denuncias = await repo.listarDenuncias(caso.id);
      const score = calculadoraPadrao.calcular({
        denuncias,
        punicoesAtivasDoAutor: await repo.contarPunicoesAtivas(postagem.autorId),
      });
      const prazo = prazoAtualizado(caso.prazoSla, caso.criadoEm, score);
      await repo.atualizarScoreEPrazo(caso.id, score, prazo);

      return {
        casoId: caso.id,
        novoCaso: novoCasoId !== null,
        totalDenuncias: denuncias.length,
        score,
        prazoSla: prazo,
      };
    });
  }
}
