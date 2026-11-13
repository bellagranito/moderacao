DROP TABLE IF EXISTS historico_estados, punicoes, denuncias, casos_moderacao, postagens, usuarios CASCADE;
DROP FUNCTION IF EXISTS bloquear_alteracao_historico() CASCADE;

CREATE TABLE usuarios (
  id     SERIAL PRIMARY KEY,
  nome   VARCHAR(80) NOT NULL,
  perfil VARCHAR(20) NOT NULL
         CHECK (perfil IN ('usuario', 'moderador', 'supervisor', 'sistema')),
  banido BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE postagens (
  id        SERIAL PRIMARY KEY,
  autor_id  INT NOT NULL REFERENCES usuarios (id),
  conteudo  TEXT NOT NULL CHECK (length(btrim(conteudo)) > 0),
  removida  BOOLEAN NOT NULL DEFAULT FALSE,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE casos_moderacao (
  id           SERIAL PRIMARY KEY,
  postagem_id  INT NOT NULL REFERENCES postagens (id),
  estado       VARCHAR(20) NOT NULL DEFAULT 'RECEBIDA'
               CHECK (estado IN ('RECEBIDA', 'EM_ANALISE', 'ESCALONADA', 'PROCEDENTE', 'IMPROCEDENTE', 'REVERTIDA')),
  score        INT NOT NULL DEFAULT 0 CHECK (score >= 0),
  prazo_sla    TIMESTAMPTZ NOT NULL,
  moderador_id INT REFERENCES usuarios (id),
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  julgado_em   TIMESTAMPTZ,
  CONSTRAINT ck_em_analise_tem_moderador
    CHECK (estado <> 'EM_ANALISE' OR moderador_id IS NOT NULL)
);

-- só pode existir um caso aberto por postagem (agrupa as denúncias repetidas)
CREATE UNIQUE INDEX uq_caso_aberto_por_postagem
  ON casos_moderacao (postagem_id)
  WHERE estado IN ('RECEBIDA', 'EM_ANALISE', 'ESCALONADA');

CREATE INDEX idx_casos_fila ON casos_moderacao (estado, score DESC, criado_em);

CREATE TABLE denuncias (
  id             SERIAL PRIMARY KEY,
  caso_id        INT NOT NULL REFERENCES casos_moderacao (id),
  denunciante_id INT NOT NULL REFERENCES usuarios (id),
  motivo         VARCHAR(30) NOT NULL
                 CHECK (motivo IN ('SPAM', 'FALSA_INFO', 'CONTEUDO_IMPROPRIO', 'ASSEDIO', 'DISCURSO_ODIO')),
  descricao      TEXT,
  criada_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_denuncia_por_usuario_no_caso UNIQUE (caso_id, denunciante_id)
);

CREATE INDEX idx_denuncias_denunciante_data ON denuncias (denunciante_id, criada_em);

CREATE TABLE punicoes (
  id          SERIAL PRIMARY KEY,
  caso_id     INT NOT NULL REFERENCES casos_moderacao (id),
  usuario_id  INT NOT NULL REFERENCES usuarios (id),
  tipo        VARCHAR(20) NOT NULL CHECK (tipo IN ('advertencia', 'banimento')),
  ativa       BOOLEAN NOT NULL DEFAULT TRUE,
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revogada_em TIMESTAMPTZ,
  CONSTRAINT ck_punicao_revogada CHECK (ativa OR revogada_em IS NOT NULL)
);

CREATE TABLE historico_estados (
  id              SERIAL PRIMARY KEY,
  id_registro     INT NOT NULL REFERENCES casos_moderacao (id),
  estado_anterior VARCHAR(20)
                  CHECK (estado_anterior IN ('RECEBIDA', 'EM_ANALISE', 'ESCALONADA', 'PROCEDENTE', 'IMPROCEDENTE', 'REVERTIDA')),
  novo_estado     VARCHAR(20) NOT NULL
                  CHECK (novo_estado IN ('RECEBIDA', 'EM_ANALISE', 'ESCALONADA', 'PROCEDENTE', 'IMPROCEDENTE', 'REVERTIDA')),
  autor_id        INT NOT NULL REFERENCES usuarios (id),
  justificativa   TEXT NOT NULL CHECK (length(btrim(justificativa)) > 0),
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historico_registro ON historico_estados (id_registro, timestamp);

-- o histórico é só de inserção: ninguém altera nem apaga
CREATE FUNCTION bloquear_alteracao_historico() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'historico_estados é imutável (% não permitido)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_historico_imutavel
  BEFORE UPDATE OR DELETE ON historico_estados
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao_historico();

CREATE TRIGGER trg_historico_sem_truncate
  BEFORE TRUNCATE ON historico_estados
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_alteracao_historico();
