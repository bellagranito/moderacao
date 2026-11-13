// Teste de ponta a ponta contra a API rodando (npm run start:dev).
// Antes de rodar: npm run db:reset  (o teste usa dados do seed e muda o banco)
const { Client } = require('pg');

const URL = process.env.API_URL || 'http://localhost:3000';
const DB = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/moderacao';

const USUARIOS_COMUNS = [1, 2, 3, 4, 5, 6, 7];
const HELENA = 9;
const IGOR = 10;
const SOFIA = 11;

let falhas = 0;

async function chamar(usuarioId, metodo, caminho, corpo) {
  const resposta = await fetch(URL + caminho, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-usuario-id': String(usuarioId) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await resposta.json().catch(() => null);
  return { status: resposta.status, json };
}

function conferir(descricao, condicao, detalhe) {
  if (condicao) {
    console.log('   ok   ' + descricao);
  } else {
    falhas++;
    console.log('   FALHA ' + descricao + (detalhe ? ' -> ' + JSON.stringify(detalhe) : ''));
  }
}

async function main() {
  console.log('1) seis pessoas denunciam a postagem 5 ao mesmo tempo');
  const denuncias = await Promise.all(
    [1, 2, 3, 4, 5, 6].map((id) =>
      chamar(id, 'POST', '/denuncias', { postagemId: 5, motivo: 'DISCURSO_ODIO', descricao: 'ofensa a um grupo' }),
    ),
  );
  conferir('todas retornaram 201', denuncias.every((d) => d.status === 201), denuncias.map((d) => d.status));
  const ids = new Set(denuncias.map((d) => d.json && d.json.casoId));
  conferir('todas caíram em um único caso', ids.size === 1, [...ids]);
  const casoId = denuncias[0].json.casoId;
  conferir('apenas uma criou o caso', denuncias.filter((d) => d.json.novoCaso).length === 1);
  const detalhe = await chamar(HELENA, 'GET', `/casos/${casoId}`);
  conferir('o caso tem 6 denúncias', detalhe.json.denuncias.length === 6, detalhe.json.denuncias.length);
  conferir('score com teto de volume (12 + 6 = 18, faixa ALTA)', detalhe.json.caso.score === 18 && detalhe.json.caso.faixa === 'ALTA', detalhe.json.caso);
  const repetida = await chamar(1, 'POST', '/denuncias', { postagemId: 5, motivo: 'SPAM' });
  conferir('denúncia repetida do mesmo usuário é recusada (422)', repetida.status === 422, repetida);

  console.log('2) Helena e Igor assumem o mesmo caso no mesmo instante');
  const assumir = await Promise.all([
    chamar(HELENA, 'POST', `/casos/${casoId}/acoes/assumir`, {}),
    chamar(IGOR, 'POST', `/casos/${casoId}/acoes/assumir`, {}),
  ]);
  const status = assumir.map((a) => a.status).sort();
  conferir('um recebeu 200 e o outro 422', status[0] === 200 && status[1] === 422, status);
  const responsavel = assumir[0].status === 200 ? HELENA : IGOR;
  const outro = responsavel === HELENA ? IGOR : HELENA;

  console.log('3) usuário comum tenta julgar o caso');
  const comum = await chamar(1, 'POST', `/casos/${casoId}/acoes/julgar-improcedente`, { justificativa: 'quero julgar esse caso' });
  conferir('recebe 403', comum.status === 403, comum);

  console.log('4) julgamento com justificativa curta');
  const curta = await chamar(responsavel, 'POST', `/casos/${casoId}/acoes/julgar-improcedente`, { justificativa: 'não é' });
  conferir('guarda de justificativa bloqueia (422)', curta.status === 422, curta);

  console.log('5) reverter um caso que ainda está EM_ANALISE');
  const reverterCedo = await chamar(SOFIA, 'POST', `/casos/${casoId}/acoes/reverter`, { justificativa: 'tentativa de reverter cedo' });
  conferir('transição inválida (422 ou 403)', reverterCedo.status === 422 || reverterCedo.status === 403, reverterCedo);

  console.log('6) moderador que não é o responsável tenta julgar');
  const intruso = await chamar(outro, 'POST', `/casos/${casoId}/acoes/julgar-procedente`, { justificativa: 'não sou o responsável', punicao: 'advertencia' });
  conferir('recebe 422 (guarda de responsável)', intruso.status === 422, intruso);

  console.log('7) moderador tenta banir');
  const banir = await chamar(responsavel, 'POST', `/casos/${casoId}/acoes/julgar-procedente`, { justificativa: 'conteúdo de ódio evidente', punicao: 'banimento' });
  conferir('recebe 403 (só supervisor bane)', banir.status === 403, banir);

  console.log('8) moderador julga procedente com advertência');
  const julgar = await chamar(responsavel, 'POST', `/casos/${casoId}/acoes/julgar-procedente`, { justificativa: 'conteúdo de ódio evidente', punicao: 'advertencia' });
  conferir('200 e estado PROCEDENTE', julgar.status === 200 && julgar.json.novoEstado === 'PROCEDENTE', julgar);
  const posJulgamento = await chamar(responsavel, 'GET', `/casos/${casoId}`);
  conferir('postagem removida e punição ativa', posJulgamento.json.postagem.removida === true && posJulgamento.json.punicoes[0].ativa === true);
  const denunciarRemovida = await chamar(7, 'POST', '/denuncias', { postagemId: 5, motivo: 'SPAM' });
  conferir('postagem removida não recebe novas denúncias (422)', denunciarRemovida.status === 422, denunciarRemovida);

  console.log('9) supervisor reverte o julgamento (rollback parcial)');
  const reverter = await chamar(SOFIA, 'POST', `/casos/${casoId}/acoes/reverter`, { justificativa: 'revisão: foi exagero' });
  conferir('200 e estado REVERTIDA', reverter.status === 200 && reverter.json.novoEstado === 'REVERTIDA', reverter);
  const posReversao = await chamar(SOFIA, 'GET', `/casos/${casoId}`);
  conferir('postagem restaurada e punição revogada', posReversao.json.postagem.removida === false && posReversao.json.punicoes[0].ativa === false);
  conferir('histórico com 4 registros (RECEBIDA, EM_ANALISE, PROCEDENTE, REVERTIDA)', posReversao.json.historico.length === 4, posReversao.json.historico.map((h) => h.novoEstado));

  console.log('10) SLA vencido escalona o caso 1 automaticamente');
  const banco = new Client({ connectionString: DB });
  await banco.connect();
  await banco.query("UPDATE casos_moderacao SET prazo_sla = now() - interval '1 minute' WHERE id = 1");
  const sla = await chamar(SOFIA, 'POST', '/sla/executar');
  conferir('caso 1 foi escalonado', sla.status === 200 && sla.json.escalonados.includes(1), sla);
  const escalonado = await chamar(SOFIA, 'GET', '/casos/1');
  conferir('estado ESCALONADA e sem moderador', escalonado.json.caso.estado === 'ESCALONADA' && escalonado.json.caso.moderadorId === null);
  const helenaEscalonado = await chamar(HELENA, 'POST', '/casos/1/acoes/julgar-improcedente', { justificativa: 'tentando julgar escalonado' });
  conferir('moderador não julga caso escalonado (403)', helenaEscalonado.status === 403, helenaEscalonado);
  const supervisorJulga = await chamar(SOFIA, 'POST', '/casos/1/acoes/julgar-improcedente', { justificativa: 'denúncia sem fundamento' });
  conferir('supervisor julga o caso escalonado (200)', supervisorJulga.status === 200, supervisorJulga);

  console.log('11) limite de 3 casos em análise por moderador, com cliques simultâneos');
  const postagens = [1, 2, 4, 6];
  const casos = [];
  for (const postagemId of postagens) {
    const r = await chamar(7, 'POST', '/denuncias', { postagemId, motivo: 'SPAM' });
    casos.push(r.json.casoId);
  }
  const tentativas = await Promise.all(casos.map((id) => chamar(IGOR, 'POST', `/casos/${id}/acoes/assumir`, {})));
  const aceitas = tentativas.filter((t) => t.status === 200).length;
  conferir('exatamente 3 aceitas e 1 recusada (422)', aceitas === 3 && tentativas.filter((t) => t.status === 422).length === 1, tentativas.map((t) => t.status));
  const emAnalise = await banco.query("SELECT count(*)::int AS n FROM casos_moderacao WHERE moderador_id = $1 AND estado = 'EM_ANALISE'", [IGOR]);
  conferir('banco confirma 3 casos em análise para Igor', emAnalise.rows[0].n === 3, emAnalise.rows[0]);

  console.log('12) o histórico não pode ser alterado nem apagado');
  let bloqueou = false;
  try {
    await banco.query("UPDATE historico_estados SET justificativa = 'adulterado'");
  } catch (erro) {
    bloqueou = true;
  }
  conferir('UPDATE no histórico é bloqueado pelo banco', bloqueou);
  await banco.end();

  console.log(falhas === 0 ? '\nTodos os testes passaram.' : `\n${falhas} verificação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((erro) => {
  console.error('Erro ao rodar o teste (a API está rodando?):', erro.message);
  process.exit(1);
});
