INSERT INTO usuarios (id, nome, perfil) VALUES
  (1,  'Ana Lima',      'usuario'),
  (2,  'Bruno Matos',   'usuario'),
  (3,  'Carla Dias',    'usuario'),
  (4,  'Diego Rocha',   'usuario'),
  (5,  'Elisa Prado',   'usuario'),
  (6,  'Fábio Neves',   'usuario'),
  (7,  'Gabi Torres',   'usuario'),
  (8,  'Hugo Pires',    'usuario'),
  (9,  'Helena Castro', 'moderador'),
  (10, 'Igor Sampaio',  'moderador'),
  (11, 'Sofia Andrade', 'supervisor'),
  (12, 'Sistema',       'sistema');

INSERT INTO postagens (id, autor_id, conteudo) VALUES
  (1, 1, 'Promoção imperdível! Clique no link e ganhe um celular de graça!!!'),
  (2, 2, 'Essa vacina causa mais mal do que bem, todo mundo sabe disso.'),
  (3, 3, 'Você é a pessoa mais inútil que já conheci, devia sumir daqui.'),
  (4, 4, 'Bom dia, pessoal! Alguém sabe onde comprar um bom café por aqui?'),
  (5, 8, 'Esse grupo de pessoas não merece viver em nenhum lugar do país.'),
  (6, 1, 'Vendo curso de investimentos, chama no privado que explico tudo.');

-- caso 1: três denúncias na postagem 2, ainda na fila
INSERT INTO casos_moderacao (id, postagem_id, estado, score, prazo_sla, criado_em) VALUES
  (1, 2, 'RECEBIDA', 8, now() + interval '8 hours', now() - interval '20 minutes');
INSERT INTO denuncias (caso_id, denunciante_id, motivo, descricao, criada_em) VALUES
  (1, 1, 'SPAM',       'Parece propaganda disfarçada.',      now() - interval '20 minutes'),
  (1, 4, 'SPAM',       NULL,                                  now() - interval '15 minutes'),
  (1, 5, 'FALSA_INFO', 'Informação falsa sobre vacinas.',    now() - interval '10 minutes');
INSERT INTO historico_estados (id_registro, estado_anterior, novo_estado, autor_id, justificativa, timestamp) VALUES
  (1, NULL, 'RECEBIDA', 1, 'Primeira denúncia da postagem', now() - interval '20 minutes');

-- caso 2: uma denúncia grave na postagem 3, já assumida pela Helena
INSERT INTO casos_moderacao (id, postagem_id, estado, score, prazo_sla, moderador_id, criado_em) VALUES
  (2, 3, 'EM_ANALISE', 8, now() + interval '7 hours', 9, now() - interval '1 hour');
INSERT INTO denuncias (caso_id, denunciante_id, motivo, descricao, criada_em) VALUES
  (2, 6, 'ASSEDIO', 'Ataque direto a uma pessoa.', now() - interval '1 hour');
INSERT INTO historico_estados (id_registro, estado_anterior, novo_estado, autor_id, justificativa, timestamp) VALUES
  (2, NULL,       'RECEBIDA',   6, 'Primeira denúncia da postagem', now() - interval '1 hour'),
  (2, 'RECEBIDA', 'EM_ANALISE', 9, 'Caso assumido pelo moderador',  now() - interval '50 minutes');

SELECT setval('usuarios_id_seq',         (SELECT max(id) FROM usuarios));
SELECT setval('postagens_id_seq',        (SELECT max(id) FROM postagens));
SELECT setval('casos_moderacao_id_seq',  (SELECT max(id) FROM casos_moderacao));
