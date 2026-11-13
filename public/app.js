const API = '';

let usuarios = [];
let usuarioAtual = null;
let casoAberto = null;

const NOMES_DAS_ACOES = {
  assumir: 'Assumir caso',
  escalonar: 'Escalonar',
  'julgar-procedente': 'Julgar procedente',
  'julgar-improcedente': 'Julgar improcedente',
  reverter: 'Reverter julgamento',
};

const MOTIVOS = ['SPAM', 'FALSA_INFO', 'CONTEUDO_IMPROPRIO', 'ASSEDIO', 'DISCURSO_ODIO'];

function esc(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function dataHora(valor) {
  return new Date(valor).toLocaleString('pt-BR');
}

function mostrarAviso(mensagem, tipo) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = mensagem;
  aviso.className = 'aviso ' + tipo;
  setTimeout(() => aviso.classList.add('escondido'), 6000);
}

async function chamarApi(metodo, caminho, corpo) {
  const resposta = await fetch(API + caminho, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      'x-usuario-id': usuarioAtual ? String(usuarioAtual.id) : '',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(dados && dados.mensagem ? dados.mensagem : 'Erro ' + resposta.status);
  }
  return dados;
}

// ---------- login e abas ----------

async function iniciar() {
  usuarios = await (await fetch('/usuarios')).json();
  const select = document.getElementById('usuario');
  select.innerHTML = usuarios.map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join('');

  const salvo = Number(localStorage.getItem('usuarioId'));
  if (usuarios.some((u) => u.id === salvo)) select.value = String(salvo);

  select.addEventListener('change', trocarUsuario);
  document.getElementById('aba-denunciar').addEventListener('click', () => mostrarAba('denunciar'));
  document.getElementById('aba-fila').addEventListener('click', () => mostrarAba('fila'));
  document.getElementById('filtro-estado').addEventListener('change', carregarFila);
  document.getElementById('btn-sla').addEventListener('click', verificarSla);
  document.getElementById('fechar').addEventListener('click', fecharModal);

  trocarUsuario();
}

function trocarUsuario() {
  const id = Number(document.getElementById('usuario').value);
  usuarioAtual = usuarios.find((u) => u.id === id);
  localStorage.setItem('usuarioId', String(id));

  const selo = document.getElementById('perfil');
  selo.textContent = usuarioAtual.perfil + (usuarioAtual.banido ? ' (banido)' : '');

  const equipe = usuarioAtual.perfil !== 'usuario';
  document.getElementById('aba-fila').classList.toggle('escondido', !equipe);
  document.getElementById('btn-sla').classList.toggle(
    'escondido',
    usuarioAtual.perfil !== 'supervisor' && usuarioAtual.perfil !== 'sistema',
  );

  mostrarAba(equipe ? 'fila' : 'denunciar');
}

function mostrarAba(nome) {
  document.getElementById('painel-denunciar').classList.toggle('escondido', nome !== 'denunciar');
  document.getElementById('painel-fila').classList.toggle('escondido', nome !== 'fila');
  document.getElementById('aba-denunciar').classList.toggle('ativa', nome === 'denunciar');
  document.getElementById('aba-fila').classList.toggle('ativa', nome === 'fila');

  if (nome === 'denunciar') carregarPostagens();
  else carregarFila();
}

// ---------- denunciar ----------

async function carregarPostagens() {
  const lista = document.getElementById('postagens');
  try {
    const postagens = await chamarApi('GET', '/postagens');
    lista.innerHTML = postagens
      .map(
        (p) => `
        <div class="cartao ${p.removida ? 'removida' : ''}">
          <div>
            <strong>${esc(p.autorNome)}</strong> <small>postagem #${p.id}</small>
            <p>${esc(p.conteudo)}</p>
            ${p.removida ? '<small>Postagem removida pela moderação</small>' : ''}
          </div>
          ${p.removida ? '' : `<button class="btn perigo pequeno" data-postagem="${p.id}">Denunciar</button>`}
        </div>`,
      )
      .join('');
    lista.querySelectorAll('[data-postagem]').forEach((botao) => {
      botao.addEventListener('click', () => abrirFormularioDenuncia(Number(botao.dataset.postagem), postagens));
    });
  } catch (erro) {
    mostrarAviso(erro.message, 'erro');
  }
}

function abrirFormularioDenuncia(postagemId, postagens) {
  const postagem = postagens.find((p) => p.id === postagemId);
  abrirModal(`
    <h3>Denunciar postagem #${postagem.id}</h3>
    <div class="citacao">${esc(postagem.conteudo)}</div>
    <label class="campo" for="motivo">Motivo</label>
    <select id="motivo" class="campo">${MOTIVOS.map((m) => `<option>${m}</option>`).join('')}</select>
    <label class="campo" for="descricao">Descrição (opcional)</label>
    <textarea id="descricao" class="campo"></textarea>
    <div class="acoes"><button id="enviar-denuncia" class="btn">Enviar denúncia</button></div>
  `);

  document.getElementById('enviar-denuncia').addEventListener('click', async () => {
    try {
      const resultado = await chamarApi('POST', '/denuncias', {
        postagemId,
        motivo: document.getElementById('motivo').value,
        descricao: document.getElementById('descricao').value,
      });
      fecharModal();
      const detalhe = resultado.novoCaso
        ? 'Caso #' + resultado.casoId + ' criado.'
        : 'Agrupada ao caso #' + resultado.casoId + ' (' + resultado.totalDenuncias + ' denúncias).';
      mostrarAviso('Denúncia registrada. ' + detalhe, 'sucesso');
    } catch (erro) {
      mostrarAviso(erro.message, 'erro');
    }
  });
}

// ---------- fila de casos ----------

function textoDoPrazo(caso) {
  if (['PROCEDENTE', 'IMPROCEDENTE', 'REVERTIDA', 'ESCALONADA'].includes(caso.estado)) return '-';
  const restante = new Date(caso.prazoSla).getTime() - Date.now();
  if (restante < 0) return '<span class="vencido">vencido</span>';
  const minutos = Math.floor(restante / 60000);
  const horas = Math.floor(minutos / 60);
  return horas > 0 ? `${horas}h ${minutos % 60}min` : `${minutos}min`;
}

async function carregarFila() {
  const estado = document.getElementById('filtro-estado').value;
  const corpo = document.getElementById('casos');
  try {
    const casos = await chamarApi('GET', '/casos' + (estado ? '?estado=' + estado : ''));
    if (casos.length === 0) {
      corpo.innerHTML = '<tr><td colspan="8" class="vazio">Nenhum caso encontrado.</td></tr>';
      return;
    }
    corpo.innerHTML = casos
      .map(
        (c) => `
        <tr>
          <td>#${c.id}</td>
          <td class="trecho">${esc(c.conteudoPostagem)}<br><small>de ${esc(c.autorPostagemNome)}</small></td>
          <td>${c.totalDenuncias}</td>
          <td><span class="tag faixa-${c.faixa}">${c.faixa}</span> <small>${c.score} pts</small></td>
          <td>${textoDoPrazo(c)}</td>
          <td><span class="tag estado-${c.estado}">${c.estado}</span></td>
          <td>${esc(c.moderadorNome) || '-'}</td>
          <td><button class="btn pequeno" data-caso="${c.id}">Abrir</button></td>
        </tr>`,
      )
      .join('');
    corpo.querySelectorAll('[data-caso]').forEach((botao) => {
      botao.addEventListener('click', () => abrirCaso(Number(botao.dataset.caso)));
    });
  } catch (erro) {
    corpo.innerHTML = '';
    mostrarAviso(erro.message, 'erro');
  }
}

async function verificarSla() {
  try {
    const r = await chamarApi('POST', '/sla/executar');
    mostrarAviso(`SLA verificado: ${r.verificados} vencido(s), ${r.escalonados.length} escalonado(s).`, 'sucesso');
    carregarFila();
  } catch (erro) {
    mostrarAviso(erro.message, 'erro');
  }
}

// ---------- detalhe do caso ----------

async function abrirCaso(id) {
  try {
    casoAberto = await chamarApi('GET', '/casos/' + id);
    desenharCaso();
  } catch (erro) {
    mostrarAviso(erro.message, 'erro');
  }
}

function desenharCaso() {
  const { caso, postagem, denuncias, historico, punicoes, acoesPermitidas } = casoAberto;

  const botoes = acoesPermitidas
    .map((acao) => `<button class="btn ${acao === 'julgar-procedente' ? 'perigo' : ''}" data-acao="${acao}">${NOMES_DAS_ACOES[acao]}</button>`)
    .join('');

  abrirModal(`
    <h3>Caso #${caso.id} <span class="tag estado-${caso.estado}">${caso.estado}</span>
      <span class="tag faixa-${caso.faixa}">${caso.faixa} - ${caso.score} pts</span></h3>
    <div class="citacao">
      ${esc(postagem.conteudo)}<br>
      <small>de ${esc(postagem.autorNome)}${postagem.removida ? ' - POSTAGEM REMOVIDA' : ''}</small>
    </div>
    <small>Prazo de SLA: ${dataHora(caso.prazoSla)}</small>

    <h3>Denúncias (${denuncias.length})</h3>
    <ul class="lista">
      ${denuncias.map((d) => `<li><strong>${esc(d.denuncianteNome)}</strong> - ${d.motivo}${d.descricao ? ': ' + esc(d.descricao) : ''}</li>`).join('')}
    </ul>

    ${
      punicoes.length > 0
        ? `<h3>Punições</h3><ul class="lista">${punicoes
            .map((p) => `<li>${p.tipo} - ${p.ativa ? 'ativa' : 'revogada'}</li>`)
            .join('')}</ul>`
        : ''
    }

    <h3>Histórico</h3>
    <ul class="lista">
      ${historico
        .map(
          (h) => `<li>${dataHora(h.timestamp)} - ${h.estadoAnterior || 'início'} &rarr; <strong>${h.novoEstado}</strong>
            por ${esc(h.autorNome)}<br><small>${esc(h.justificativa)}</small></li>`,
        )
        .join('')}
    </ul>

    <h3>Ações</h3>
    <div class="acoes">${botoes || '<small>Nenhuma ação disponível para o seu perfil neste estado.</small>'}</div>
    <div id="form-acao"></div>
  `);

  document.querySelectorAll('[data-acao]').forEach((botao) => {
    botao.addEventListener('click', () => abrirFormularioAcao(botao.dataset.acao));
  });
}

function abrirFormularioAcao(acao) {
  const pedePunicao = acao === 'julgar-procedente';
  const pedeJustificativa = acao !== 'assumir';

  document.getElementById('form-acao').innerHTML = `
    <h3>${NOMES_DAS_ACOES[acao]}</h3>
    ${
      pedePunicao
        ? `<label class="campo" for="punicao">Punição</label>
           <select id="punicao" class="campo">
             <option value="advertencia">Advertência</option>
             <option value="banimento">Banimento (somente supervisor)</option>
           </select>`
        : ''
    }
    ${
      pedeJustificativa
        ? `<label class="campo" for="justificativa">Justificativa (mínimo 10 caracteres)</label>
           <textarea id="justificativa" class="campo"></textarea>`
        : '<p>Você assume a responsabilidade por este caso.</p>'
    }
    <div class="acoes"><button id="confirmar" class="btn">Confirmar</button></div>
  `;

  document.getElementById('confirmar').addEventListener('click', async () => {
    const corpo = {};
    if (pedeJustificativa) corpo.justificativa = document.getElementById('justificativa').value;
    if (pedePunicao) corpo.punicao = document.getElementById('punicao').value;

    try {
      const r = await chamarApi('POST', `/casos/${casoAberto.caso.id}/acoes/${acao}`, corpo);
      mostrarAviso(`Caso #${r.casoId}: ${r.estadoAnterior} -> ${r.novoEstado}`, 'sucesso');
      await abrirCaso(casoAberto.caso.id);
      carregarFila();
    } catch (erro) {
      mostrarAviso(erro.message, 'erro');
    }
  });
}

// ---------- modal ----------

function abrirModal(html) {
  document.getElementById('conteudo-modal').innerHTML = html;
  document.getElementById('modal').classList.remove('escondido');
}

function fecharModal() {
  document.getElementById('modal').classList.add('escondido');
}

iniciar();
