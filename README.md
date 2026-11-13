# Moderação de Conteúdo e Denúncias em Redes Sociais

Terceiro trabalho de Desenvolvimento de Projeto Web 2 (projeto 15). Usuários denunciam postagens; todas as denúncias da mesma postagem viram **um único caso**; o caso entra numa fila ordenada por um **score de urgência** e passa por uma **máquina de estados** até ser julgado. O julgamento procedente remove a postagem e aplica advertência ou banimento, e o supervisor pode reverter.

- Backend: NestJS (TypeScript) + PostgreSQL, organizado em `domain`, `application`, `infrastructure` e `presentation`
- Tela: HTML/CSS/JS simples em `public/`, servida pelo próprio Nest

## Como subir o ambiente

Requisitos: Node 20+ e Docker (ou um PostgreSQL 14+ próprio).

Com Docker (o `schema.sql` e o `seed.sql` rodam sozinhos na primeira subida):

```
docker compose up -d
npm install
npm run start:dev
```

Sem Docker, com um PostgreSQL local: crie o banco `moderacao` e ajuste `DATABASE_URL` (veja `.env.example`; o padrão é `postgres://postgres:postgres@localhost:5432/moderacao`). Depois:

```
npm install
npm run db:reset
npm run start:dev
```

Abra `http://localhost:3000`. No topo da tela escolha o usuário (não há senha: o login é simulado pelo header `x-usuario-id`).

`npm run db:reset` recria as tabelas e os dados de exemplo a qualquer momento.

### Usuários do seed

| ids | perfil | exemplos |
| --- | --- | --- |
| 1 a 8 | usuario | Ana, Bruno, Carla... (autores e denunciantes) |
| 9 e 10 | moderador | Helena, Igor |
| 11 | supervisor | Sofia |
| 12 | sistema | usado pelo escalonamento automático |

### Teste de concorrência

Com a API rodando e o banco recém-resetado:

```
npm run db:reset
npm run teste:concorrencia
```

O script exercita: seis denúncias simultâneas na mesma postagem (um caso só), dois moderadores assumindo o mesmo caso ao mesmo tempo, guardas, permissões, reversão, SLA vencido, limite de casos por moderador com cliques simultâneos e imutabilidade do histórico.

## Máquina de estados

O estado do caso **só muda por ações**: não existe rota `PUT`/`PATCH` para o estado. A única rota que muda é `POST /casos/:id/acoes/:acao`, e o banco ainda tem um `CHECK` com os seis estados válidos.

```mermaid
stateDiagram-v2
    [*] --> RECEBIDA: 1ª denúncia da postagem
    RECEBIDA --> EM_ANALISE: assumir
    RECEBIDA --> ESCALONADA: escalonar (sistema, SLA vencido)
    EM_ANALISE --> ESCALONADA: escalonar
    EM_ANALISE --> PROCEDENTE: julgar-procedente
    EM_ANALISE --> IMPROCEDENTE: julgar-improcedente
    ESCALONADA --> PROCEDENTE: julgar-procedente (supervisor)
    ESCALONADA --> IMPROCEDENTE: julgar-improcedente (supervisor)
    PROCEDENTE --> REVERTIDA: reverter (supervisor, até 7 dias)
    IMPROCEDENTE --> [*]
    REVERTIDA --> [*]
```

### Matriz de permissões (RBAC por estado)

| Ação | De | Para | Quem pode |
| --- | --- | --- | --- |
| `assumir` | RECEBIDA | EM_ANALISE | moderador, supervisor |
| `escalonar` | RECEBIDA | ESCALONADA | sistema |
| `escalonar` | EM_ANALISE | ESCALONADA | moderador, supervisor, sistema |
| `julgar-procedente` | EM_ANALISE | PROCEDENTE | moderador, supervisor |
| `julgar-procedente` | ESCALONADA | PROCEDENTE | supervisor |
| `julgar-improcedente` | EM_ANALISE | IMPROCEDENTE | moderador, supervisor |
| `julgar-improcedente` | ESCALONADA | IMPROCEDENTE | supervisor |
| `reverter` | PROCEDENTE | REVERTIDA | supervisor |

### Guardas de transição

| Ação | Guardas |
| --- | --- |
| `assumir` | ninguém assume caso da própria postagem; máximo de 3 casos em análise por moderador |
| `escalonar` | justificativa com 10+ caracteres; moderador só escalona caso que assumiu; o sistema só escalona com o SLA vencido |
| `julgar-*` | justificativa com 10+ caracteres; moderador só julga caso que assumiu; procedente exige punição, e banimento é só do supervisor |
| `reverter` | justificativa com 10+ caracteres; só até 7 dias depois do julgamento |

Erros de permissão de perfil viram **403**, estado errado ou regra de negócio viram **422**, dados malformados **400**, usuário não informado **401** e recurso inexistente **404**.

## Regras de negócio

- **Agrupamento de denúncias:** o índice único parcial `uq_caso_aberto_por_postagem` só permite um caso aberto por postagem. O `INSERT ... ON CONFLICT DO NOTHING` faz com que, mesmo com denúncias simultâneas, apenas uma crie o caso e as outras entrem nele. Cada pessoa denuncia uma postagem só uma vez por caso.
- **Score de urgência:** soma de regras independentes (`domain/urgencia.ts`): 2 pontos por denúncia com teto de 10 denúncias, gravidade do pior motivo (SPAM 1, FALSA_INFO 2, CONTEUDO_IMPROPRIO 4, ASSEDIO e DISCURSO_ODIO 6) e reincidência do autor (3 pontos por punição ativa, máximo 9). O teto de volume evita que denúncias em massa criem gargalos na fila: elas sobem o caso na fila, mas não o deixam acima de tudo para sempre. A fila é ordenada por score e, em empate, pelo caso mais antigo.
- **SLA com escalonamento:** o score define o prazo (`domain/sla.ts`): 15+ pontos = ALTA, 2h; 7+ = MEDIA, 8h; abaixo = BAIXA, 24h. Quando novas denúncias aumentam o score o prazo só encurta. O `SlaService` roda a cada minuto (`SLA_INTERVALO_MS`) e escalona casos vencidos usando o usuário `sistema`; supervisor e sistema também podem forçar a verificação em `POST /sla/executar`.
- **Limites por pessoa:** no máximo 10 denúncias por hora por usuário e 3 casos em análise por moderador.
- **Rollback (cancelamento parcial):** `reverter` desfaz o julgamento procedente: revoga a punição, devolve a postagem e recalcula se o autor continua banido (só se tiver outro banimento ativo).

## Concorrência

| Disputa | Solução |
| --- | --- |
| Dois moderadores assumem o mesmo caso | `SELECT ... FOR UPDATE` na linha do caso, dentro da transação (lock pessimista). O segundo espera, lê o caso já `EM_ANALISE` e recebe `TRANSICAO_INVALIDA` (422) |
| Várias denúncias na mesma postagem ao mesmo tempo | índice único parcial + `ON CONFLICT DO NOTHING`; o score é recalculado com o caso travado |
| Mesmo usuário passa dos limites com várias requisições | `pg_advisory_xact_lock` pelo id do usuário, que vale até o fim da transação |

## Auditoria e transações ACID

Toda mudança de estado grava uma linha em `historico_estados` (`id_registro`, `estado_anterior`, `novo_estado`, `autor_id`, `justificativa`, `timestamp`) **na mesma transação** que altera o caso e aplica os efeitos (punição, remoção da postagem). Se qualquer passo falha, o `ROLLBACK` desfaz tudo. A tabela é só de inserção: um trigger do banco bloqueia `UPDATE`, `DELETE` e `TRUNCATE`.

## Modelo de dados (DER)

```mermaid
erDiagram
    USUARIOS ||--o{ POSTAGENS : "escreve"
    USUARIOS ||--o{ DENUNCIAS : "faz"
    USUARIOS ||--o{ PUNICOES : "recebe"
    USUARIOS ||--o{ CASOS_MODERACAO : "analisa (moderador)"
    USUARIOS ||--o{ HISTORICO_ESTADOS : "autor da mudança"
    POSTAGENS ||--o{ CASOS_MODERACAO : "é alvo de"
    CASOS_MODERACAO ||--|{ DENUNCIAS : "agrupa"
    CASOS_MODERACAO ||--o{ PUNICOES : "origina"
    CASOS_MODERACAO ||--|{ HISTORICO_ESTADOS : "registra"

    USUARIOS {
        int id PK
        varchar nome
        varchar perfil "usuario, moderador, supervisor, sistema"
        boolean banido
    }
    POSTAGENS {
        int id PK
        int autor_id FK
        text conteudo
        boolean removida
        timestamptz criada_em
    }
    CASOS_MODERACAO {
        int id PK
        int postagem_id FK
        varchar estado "CHECK nos 6 estados"
        int score
        timestamptz prazo_sla
        int moderador_id FK
        timestamptz criado_em
        timestamptz julgado_em
    }
    DENUNCIAS {
        int id PK
        int caso_id FK
        int denunciante_id FK
        varchar motivo
        text descricao
        timestamptz criada_em
    }
    PUNICOES {
        int id PK
        int caso_id FK
        int usuario_id FK
        varchar tipo "advertencia, banimento"
        boolean ativa
        timestamptz criada_em
        timestamptz revogada_em
    }
    HISTORICO_ESTADOS {
        int id PK
        int id_registro FK
        varchar estado_anterior
        varchar novo_estado
        int autor_id FK
        text justificativa
        timestamptz timestamp
    }
```

Restrições principais: `UNIQUE (caso_id, denunciante_id)` em denúncias, `CHECK` de estado e motivo, `CHECK (estado <> 'EM_ANALISE' OR moderador_id IS NOT NULL)` em casos, índice único parcial de caso aberto por postagem e trigger de imutabilidade no histórico. O modelo está na 3ª forma normal: o autor da postagem vem de `postagens`, e o estado atual do caso fica em `casos_moderacao` enquanto o passado fica só no histórico.

## Princípios SOLID

- **SRP:** cada transição cuida das próprias guardas e efeitos (`domain/transicoes/`); o `CasoService` cuida só do motor (travar, validar, aplicar, gravar histórico) e da transação; o `Repositorio` cuida só do SQL.
- **OCP:** uma ação nova é uma classe nova em `domain/transicoes/` e uma linha em `transicoes/index.ts`, sem mexer no motor. O mesmo vale para o score: uma `RegraUrgencia` nova entra na lista da `calculadoraPadrao`.
- **LSP:** toda transição estende `Transicao` e é usada pelo motor exatamente do mesmo jeito (`validar` e `aplicar`); as guardas lançam `ErroDominio` em vez de devolver booleanos, então nenhuma subclasse muda o contrato da base.

O domínio depende só da interface `PortasTransicao` (`domain/portas.ts`), que o `Repositorio` implementa; por isso as regras não conhecem o PostgreSQL.

## Estrutura

```
src/
  domain/           tipos, erros, urgência, SLA, portas e transicoes/
  application/      CasoService (motor), DenunciaService, SlaService
  infrastructure/   banco (pool e transação), repositório (SQL), schema.sql, seed.sql
  presentation/     controllers, AuthGuard e FiltroDeErros
public/             tela em HTML/CSS/JS
scripts/            db-reset.js e teste-concorrencia.js
```

## Endpoints

| Método | Rota | Quem |
| --- | --- | --- |
| GET | `/usuarios` | público (usado pela tela de login) |
| GET | `/postagens` | qualquer usuário logado |
| POST | `/denuncias` | qualquer usuário, menos o `sistema` |
| GET | `/casos?estado=` | moderador, supervisor, sistema |
| GET | `/casos/:id` | moderador, supervisor, sistema (inclui denúncias, histórico e ações permitidas) |
| POST | `/casos/:id/acoes/:acao` | conforme a matriz de permissões |
| POST | `/sla/executar` | supervisor, sistema |

Todas, exceto `/usuarios`, exigem o header `x-usuario-id`.
