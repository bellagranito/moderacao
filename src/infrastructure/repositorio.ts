import { Pool, PoolClient } from 'pg';
import { PortasTransicao } from '../domain/portas';
import {
  Caso,
  Denuncia,
  ESTADOS_ABERTOS,
  Estado,
  Motivo,
  Postagem,
  Punicao,
  RegistroHistorico,
  TipoPunicao,
  Usuario,
} from '../domain/tipos';

type Executor = Pool | PoolClient;

export interface CasoResumo extends Caso {
  conteudoPostagem: string;
  autorPostagemNome: string;
  moderadorNome: string | null;
  totalDenuncias: number;
}

const SELECT_CASO = `
  SELECT c.id, c.postagem_id, p.autor_id AS autor_postagem_id, c.estado, c.score, c.prazo_sla,
         c.moderador_id, c.criado_em, c.julgado_em
  FROM casos_moderacao c
  JOIN postagens p ON p.id = c.postagem_id`;

function paraCaso(l: any): Caso {
  return {
    id: l.id,
    postagemId: l.postagem_id,
    autorPostagemId: l.autor_postagem_id,
    estado: l.estado,
    score: l.score,
    prazoSla: l.prazo_sla,
    moderadorId: l.moderador_id,
    criadoEm: l.criado_em,
    julgadoEm: l.julgado_em,
  };
}

export class Repositorio implements PortasTransicao {
  constructor(private readonly db: Executor) {}

  // ---------- usuários e postagens ----------

  async listarUsuarios(): Promise<Usuario[]> {
    const r = await this.db.query('SELECT id, nome, perfil, banido FROM usuarios ORDER BY id');
    return r.rows;
  }

  async buscarUsuario(id: number): Promise<Usuario | null> {
    const r = await this.db.query('SELECT id, nome, perfil, banido FROM usuarios WHERE id = $1', [id]);
    return r.rows[0] ?? null;
  }

  async buscarUsuarioSistema(): Promise<Usuario | null> {
    const r = await this.db.query(
      "SELECT id, nome, perfil, banido FROM usuarios WHERE perfil = 'sistema' ORDER BY id LIMIT 1",
    );
    return r.rows[0] ?? null;
  }

  async listarPostagens(): Promise<Postagem[]> {
    const r = await this.db.query(
      `SELECT p.id, p.autor_id, u.nome AS autor_nome, p.conteudo, p.removida
       FROM postagens p JOIN usuarios u ON u.id = p.autor_id ORDER BY p.id`,
    );
    return r.rows.map((l) => ({
      id: l.id,
      autorId: l.autor_id,
      autorNome: l.autor_nome,
      conteudo: l.conteudo,
      removida: l.removida,
    }));
  }

  async buscarPostagem(id: number): Promise<Postagem | null> {
    const r = await this.db.query(
      `SELECT p.id, p.autor_id, u.nome AS autor_nome, p.conteudo, p.removida
       FROM postagens p JOIN usuarios u ON u.id = p.autor_id WHERE p.id = $1`,
      [id],
    );
    const l = r.rows[0];
    if (!l) return null;
    return { id: l.id, autorId: l.autor_id, autorNome: l.autor_nome, conteudo: l.conteudo, removida: l.removida };
  }

  // ---------- casos ----------

  async buscarCaso(id: number): Promise<Caso | null> {
    const r = await this.db.query(`${SELECT_CASO} WHERE c.id = $1`, [id]);
    return r.rows[0] ? paraCaso(r.rows[0]) : null;
  }

  // trava a linha do caso até o fim da transação: quem chegar depois espera
  async travarCaso(id: number): Promise<Caso | null> {
    const r = await this.db.query(`${SELECT_CASO} WHERE c.id = $1 FOR UPDATE OF c`, [id]);
    return r.rows[0] ? paraCaso(r.rows[0]) : null;
  }

  async travarCasoAbertoDaPostagem(postagemId: number): Promise<Caso | null> {
    const r = await this.db.query(
      `${SELECT_CASO} WHERE c.postagem_id = $1 AND c.estado = ANY($2) FOR UPDATE OF c`,
      [postagemId, ESTADOS_ABERTOS],
    );
    return r.rows[0] ? paraCaso(r.rows[0]) : null;
  }

  // se já existe caso aberto para a postagem o índice único faz o INSERT ser ignorado
  async abrirCaso(postagemId: number, prazoSla: Date): Promise<number | null> {
    const r = await this.db.query(
      `INSERT INTO casos_moderacao (postagem_id, prazo_sla) VALUES ($1, $2)
       ON CONFLICT (postagem_id) WHERE estado IN ('RECEBIDA', 'EM_ANALISE', 'ESCALONADA')
       DO NOTHING RETURNING id`,
      [postagemId, prazoSla],
    );
    return r.rows[0]?.id ?? null;
  }

  async listarCasos(estado?: Estado): Promise<CasoResumo[]> {
    const r = await this.db.query(
      `SELECT c.id, c.postagem_id, p.autor_id AS autor_postagem_id, c.estado, c.score, c.prazo_sla,
              c.moderador_id, c.criado_em, c.julgado_em,
              p.conteudo AS conteudo_postagem, ua.nome AS autor_postagem_nome, um.nome AS moderador_nome,
              (SELECT count(*) FROM denuncias d WHERE d.caso_id = c.id)::int AS total_denuncias
       FROM casos_moderacao c
       JOIN postagens p ON p.id = c.postagem_id
       JOIN usuarios ua ON ua.id = p.autor_id
       LEFT JOIN usuarios um ON um.id = c.moderador_id
       WHERE ($1::text IS NULL OR c.estado = $1)
       ORDER BY c.score DESC, c.criado_em ASC`,
      [estado ?? null],
    );
    return r.rows.map((l) => ({
      ...paraCaso(l),
      conteudoPostagem: l.conteudo_postagem,
      autorPostagemNome: l.autor_postagem_nome,
      moderadorNome: l.moderador_nome,
      totalDenuncias: l.total_denuncias,
    }));
  }

  async atualizarEstado(
    casoId: number,
    estado: Estado,
    alteracao: { moderadorId?: number | null; julgadoEm?: Date | null },
  ): Promise<void> {
    await this.db.query(
      `UPDATE casos_moderacao
       SET estado = $2,
           moderador_id = CASE WHEN $3::boolean THEN $4 ELSE moderador_id END,
           julgado_em   = CASE WHEN $5::boolean THEN $6 ELSE julgado_em END
       WHERE id = $1`,
      [
        casoId,
        estado,
        alteracao.moderadorId !== undefined,
        alteracao.moderadorId ?? null,
        alteracao.julgadoEm !== undefined,
        alteracao.julgadoEm ?? null,
      ],
    );
  }

  async atualizarScoreEPrazo(casoId: number, score: number, prazoSla: Date): Promise<void> {
    await this.db.query('UPDATE casos_moderacao SET score = $2, prazo_sla = $3 WHERE id = $1', [
      casoId,
      score,
      prazoSla,
    ]);
  }

  async listarIdsDeCasosVencidos(agora: Date): Promise<number[]> {
    const r = await this.db.query(
      `SELECT id FROM casos_moderacao
       WHERE estado IN ('RECEBIDA', 'EM_ANALISE') AND prazo_sla < $1
       ORDER BY prazo_sla`,
      [agora],
    );
    return r.rows.map((l) => l.id);
  }

  // ---------- denúncias ----------

  async inserirDenuncia(casoId: number, denuncianteId: number, motivo: Motivo, descricao: string | null) {
    const r = await this.db.query(
      `INSERT INTO denuncias (caso_id, denunciante_id, motivo, descricao) VALUES ($1, $2, $3, $4)
       ON CONFLICT (caso_id, denunciante_id) DO NOTHING RETURNING id`,
      [casoId, denuncianteId, motivo, descricao],
    );
    return r.rows.length > 0;
  }

  async listarDenuncias(casoId: number): Promise<Denuncia[]> {
    const r = await this.db.query(
      `SELECT d.id, d.caso_id, d.denunciante_id, u.nome AS denunciante_nome, d.motivo, d.descricao, d.criada_em
       FROM denuncias d JOIN usuarios u ON u.id = d.denunciante_id
       WHERE d.caso_id = $1 ORDER BY d.criada_em, d.id`,
      [casoId],
    );
    return r.rows.map((l) => ({
      id: l.id,
      casoId: l.caso_id,
      denuncianteId: l.denunciante_id,
      denuncianteNome: l.denunciante_nome,
      motivo: l.motivo,
      descricao: l.descricao,
      criadaEm: l.criada_em,
    }));
  }

  async contarDenunciasNaUltimaHora(denuncianteId: number): Promise<number> {
    const r = await this.db.query(
      `SELECT count(*)::int AS total FROM denuncias
       WHERE denunciante_id = $1 AND criada_em > now() - interval '1 hour'`,
      [denuncianteId],
    );
    return r.rows[0].total;
  }

  async travarLimiteDeDenuncias(usuarioId: number): Promise<void> {
    await this.db.query('SELECT pg_advisory_xact_lock(1, $1)', [usuarioId]);
  }

  // ---------- histórico (auditoria) ----------

  async gravarHistorico(registro: {
    idRegistro: number;
    estadoAnterior: Estado | null;
    novoEstado: Estado;
    autorId: number;
    justificativa: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO historico_estados (id_registro, estado_anterior, novo_estado, autor_id, justificativa)
       VALUES ($1, $2, $3, $4, $5)`,
      [registro.idRegistro, registro.estadoAnterior, registro.novoEstado, registro.autorId, registro.justificativa],
    );
  }

  async listarHistorico(casoId: number): Promise<RegistroHistorico[]> {
    const r = await this.db.query(
      `SELECT h.id, h.id_registro, h.estado_anterior, h.novo_estado, h.autor_id, u.nome AS autor_nome,
              h.justificativa, h.timestamp
       FROM historico_estados h JOIN usuarios u ON u.id = h.autor_id
       WHERE h.id_registro = $1 ORDER BY h.timestamp, h.id`,
      [casoId],
    );
    return r.rows.map((l) => ({
      id: l.id,
      idRegistro: l.id_registro,
      estadoAnterior: l.estado_anterior,
      novoEstado: l.novo_estado,
      autorId: l.autor_id,
      autorNome: l.autor_nome,
      justificativa: l.justificativa,
      timestamp: l.timestamp,
    }));
  }

  // ---------- punições ----------

  async listarPunicoes(casoId: number): Promise<Punicao[]> {
    const r = await this.db.query('SELECT * FROM punicoes WHERE caso_id = $1 ORDER BY id', [casoId]);
    return r.rows.map((l) => ({
      id: l.id,
      casoId: l.caso_id,
      usuarioId: l.usuario_id,
      tipo: l.tipo,
      ativa: l.ativa,
      criadaEm: l.criada_em,
      revogadaEm: l.revogada_em,
    }));
  }

  async contarPunicoesAtivas(usuarioId: number): Promise<number> {
    const r = await this.db.query(
      'SELECT count(*)::int AS total FROM punicoes WHERE usuario_id = $1 AND ativa',
      [usuarioId],
    );
    return r.rows[0].total;
  }

  // ---------- portas usadas pelas transições ----------

  async travarLimiteDeAnalise(moderadorId: number): Promise<void> {
    await this.db.query('SELECT pg_advisory_xact_lock(2, $1)', [moderadorId]);
  }

  async contarCasosEmAnalise(moderadorId: number): Promise<number> {
    const r = await this.db.query(
      "SELECT count(*)::int AS total FROM casos_moderacao WHERE moderador_id = $1 AND estado = 'EM_ANALISE'",
      [moderadorId],
    );
    return r.rows[0].total;
  }

  async removerPostagem(postagemId: number): Promise<void> {
    await this.db.query('UPDATE postagens SET removida = TRUE WHERE id = $1', [postagemId]);
  }

  async restaurarPostagem(postagemId: number): Promise<void> {
    await this.db.query('UPDATE postagens SET removida = FALSE WHERE id = $1', [postagemId]);
  }

  async registrarPunicao(casoId: number, usuarioId: number, tipo: TipoPunicao): Promise<void> {
    await this.db.query('INSERT INTO punicoes (caso_id, usuario_id, tipo) VALUES ($1, $2, $3)', [
      casoId,
      usuarioId,
      tipo,
    ]);
  }

  async banirUsuario(usuarioId: number): Promise<void> {
    await this.db.query('UPDATE usuarios SET banido = TRUE WHERE id = $1', [usuarioId]);
  }

  async revogarPunicoesDoCaso(casoId: number): Promise<void> {
    await this.db.query(
      'UPDATE punicoes SET ativa = FALSE, revogada_em = now() WHERE caso_id = $1 AND ativa',
      [casoId],
    );
  }

  // o usuário continua banido só se ainda tiver algum banimento ativo em outro caso
  async recalcularBanimento(usuarioId: number): Promise<void> {
    await this.db.query(
      `UPDATE usuarios SET banido = EXISTS (
         SELECT 1 FROM punicoes WHERE usuario_id = $1 AND tipo = 'banimento' AND ativa
       ) WHERE id = $1`,
      [usuarioId],
    );
  }
}
