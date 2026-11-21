// ============================================================
// PAINEL DA PASCOM — Paróquia Sagrado Coração de Jesus (Marília/SP)
// Gerado a partir do painel da paróquia: só a aba "Agentes Pascom" (novos e ativos), com fotos, fichas e status.
// Lê e grava na planilha SÓ DA PASCOM (Pascom_Cadastros_e_Atas).
// ============================================================
const CONFIG = {
  CLIENT_ID: '172692599350-9ssc0ir4r4j4rtn3v7ksd5i6un41damc.apps.googleusercontent.com',

  // Planilha só da Pascom: abas Agentes_Pascom (novos, A–U) e Agentes_Ativos (ativos, A–T)
  AGENTES_RANGE: 'Agentes_Pascom!A2:U',
  AGENTES_ABA: 'Agentes_Pascom',
  AGENTES_ATIVOS_RANGE: 'Agentes_Ativos!A2:T',
  AGENTES_ATIVOS_ABA: 'Agentes_Ativos',
  AGENTES_SHEET_ID: '1x3Tq-t8P4QSgpAMVzGKcLpaYDlEyngv9Dzbz5fQpLyw',
  SHEET_ID: '1x3Tq-t8P4QSgpAMVzGKcLpaYDlEyngv9Dzbz5fQpLyw', // valor padrão das leituras (as funções do painel antigo usam CONFIG.SHEET_ID quando não recebem outra planilha)
  EXTRAS_ABA: 'Agentes_Pascom', // só para o texto padrão das mensagens de erro

  // Foto do agente: a foto maior (800 px) vai para o Drive pelo n8n, que confere o login Google antes de guardar
  WEBHOOK_AGENTES_FOTO: 'https://paroquia-scjm-n8n-paroquia.ndjgby.easypanel.host/webhook/agentes-foto',

  // E-mails autorizados (checagem de UX — a segurança de verdade é a permissão de compartilhamento da planilha no Google)
  ALLOWED_EMAILS: ['pascomscjmarilia@gmail.com'],
};
// ============================================================

let accessToken = null;
let linhasAgentes = [];
let grupoAgentes = 'novos'; // sub-aba aberta: 'novos' | 'ativos'
let abaAtivosAusente = false;

const el = (id) => document.getElementById(id);

function mostrarErroLogin(msg) {
  const erro = el('loginErro');
  erro.textContent = msg;
  erro.hidden = false;
}

function iniciarBotaoGoogle(tentativas) {
  tentativas = tentativas || 0;
  if (!window.google || !window.google.accounts) {
    // O script do Google carrega em paralelo (async) e pode ainda não ter chegado — tenta de novo por alguns segundos.
    if (tentativas < 20) { setTimeout(() => iniciarBotaoGoogle(tentativas + 1), 200); return; }
    mostrarErroLogin('Não foi possível carregar o login do Google. Verifique sua conexão com a internet e recarregue a página.');
    return;
  }
  try {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      // spreadsheets (não .readonly): o painel grava o status e a foto dos agentes.
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email',
      callback: async (resp) => {
        if (resp.error) { mostrarErroLogin('Não foi possível entrar com essa conta Google (' + resp.error + ').'); return; }
        accessToken = resp.access_token;
        await handleLoginSucesso();
      },
    });
    const btn = document.createElement('button');
    btn.textContent = 'Entrar com Google';
    btn.className = 'btn-google';
    btn.style.cssText = 'background:#fff;border:1px solid #ccc;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:0.95rem;font-weight:600;color:#3c4043;';
    btn.onclick = () => { el('loginErro').hidden = true; tokenClient.requestAccessToken(); };
    el('googleBtn').innerHTML = '';
    el('googleBtn').appendChild(btn);
  } catch (e) {
    mostrarErroLogin('Erro ao iniciar o login do Google: ' + e.message);
  }
}

async function handleLoginSucesso() {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + accessToken } });
    const perfil = await resp.json();
    const email = (perfil.email || '').toLowerCase();
    if (!CONFIG.ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(email)) {
      mostrarErroLogin('Conta "' + email + '" não autorizada para este app.');
      accessToken = null;
      return;
    }
    el('userEmail').textContent = email;
    el('userBox').hidden = false;
    el('loginScreen').hidden = true;
    el('appScreen').hidden = false;
    await carregarAgentes();
  } catch (e) {
    mostrarErroLogin('Erro ao verificar sua conta. Tente novamente.');
  }
}

async function buscarValoresSheet(range, sheetId) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId || CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}`;
  const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
  if (resp.status === 403) throw new Error('SEM_PERMISSAO');
  if (!resp.ok) throw new Error('STATUS_' + resp.status);
  const data = await resp.json();
  return data.values || [];
}

function sair() {
  if (accessToken && window.google && google.accounts) { google.accounts.oauth2.revoke(accessToken, () => {}); }
  accessToken = null;
  linhasAgentes = [];
  grupoAgentes = 'novos';
  el('userBox').hidden = true;
  el('appScreen').hidden = true;
  el('loginScreen').hidden = false;
}

// ---------- Funções auxiliares (copiadas do painel da paróquia) ----------
const CHATWOOT_CONVERSAS = 'https://paroquia-scjm-chatwoot.ndjgby.easypanel.host/app/accounts/1/conversations/';
// Traduz o erro do Google Sheets numa mensagem que diz o que fazer (em vez de um "tente novamente" genérico).
function mensagemErroGravacao(err, aba, planilha) {
  aba = aba || CONFIG.EXTRAS_ABA;
  planilha = planilha || 'planilha de dados da paróquia';
  const s = err && err.status;
  if (s === 401) return 'Sua sessão do Google expirou. Clique em "Sair" (canto superior direito), entre de novo e tente outra vez.';
  if (s === 403) return 'Sua conta Google não tem permissão para EDITAR a ' + planilha + ' (só para ver). Peça para compartilhá-la com você como Editor e tente de novo.';
  if (s === 400 || s === 404) return 'Não encontrei a aba "' + aba + '" na ' + planilha + '. Confira se o nome da aba está exatamente assim.';
  if (s === 429) return 'O Google está limitando os acessos neste momento. Aguarde 1 minuto e tente de novo.';
  if (s) return 'O Google recusou a gravação (código ' + s + '). Tente novamente em instantes; se continuar, avise a equipe técnica.';
  return 'Sem conexão com o Google. Confira a internet e tente novamente.';
}

// Deixa só os dígitos: "5514997222096@s.whatsapp.net" ou "(14) 99722-2096" -> só números.
// Usado em todas as abas, então a exibição e a busca por número ficam iguais.
function limparNumero(numero) {
  // Instagram/Facebook não têm telefone: a conversa é identificada por "ig_NN" / "fb_NN" (ou "Instagram (ig_NN)") — mantém esse código inteiro.
  const social = String(numero || '').toLowerCase().match(/\b(ig|fb)_\d+\b/);
  if (social) return social[0];
  return String(numero || '').replace('@s.whatsapp.net', '').replace(/\D/g, '');
}

function linkWhatsApp(numero) {
  // Instagram/Facebook: o link abre a conversa no Chatwoot, onde a secretaria responde
  const social = String(numero || '').match(/^(ig|fb)_(\d+)$/);
  if (social) return CHATWOOT_CONVERSAS + social[2];
  const digits = limparNumero(numero);
  // Número digitado sem o código do país (10 ou 11 dígitos, ex.: 14997222096) -> acrescenta 55 para o link abrir
  const comPais = (digits.length === 10 || digits.length === 11) ? '55' + digits : digits;
  return comPais ? `https://wa.me/${comPais}` : '';
}

// "23/09/2026 18:05" -> número para ordenar. Sem data legível, vai para o fim da lista.
function valorDataHora(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (!m) return -Infinity;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)).getTime();
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

// ---------- Agentes da Pascom (cadastros feitos pelo formulário agente-pascom-novo.html) ----------
// Colunas da aba: A Data/Hora · B Nome Completo · C Nome Abreviado · D Nascimento · E Crismado(a) · F WhatsApp ·
// G E-mail · H Participa de Pastoral/Grupo · I Qual Pastoral/Grupo · J Status (Novo · Em contato · Ativo) ·
// K Situação na Pascom (Novo agente · Já é agente) · L Agente desde (mm/aaaa) · M Foto (miniatura JPEG em data URL) · N Foto (link do Drive)

// Só aceita como foto um JPEG em data URL (é o que o formulário grava); qualquer outra coisa na célula é ignorada.
function fotoMiniaturaSegura(v) {
  const s = String(v || '').trim();
  return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s) ? s : '';
}
// Etiqueta da situação: "🆕 Novo agente" ou "⭐ Já é agente · desde 03/2023" (cadastros antigos, sem a informação, não mostram nada).
function situacaoAgenteInfo(l) {
  const s = norm(l.situacao);
  if (s === 'ja e agente') return { classe: 'ja', rotulo: '⭐ Já é agente', detalhe: l.desde ? 'desde ' + l.desde : '', texto: '⭐ Já é agente' + (l.desde ? ' · desde ' + l.desde : '') };
  if (s === 'novo agente') return { classe: 'novo', rotulo: '🆕 Novo agente', detalhe: '', texto: '🆕 Novo agente' };
  return null;
}
function htmlSeloAgente(l) {
  const i = situacaoAgenteInfo(l);
  return i ? `<span class="selo-agente ${i.classe}">${escapeHtml(i.rotulo)}${i.detalhe ? `<small>${escapeHtml(i.detalhe)}</small>` : ''}</span>` : '';
}
function htmlAvatarAgente(l) {
  const nome = escapeAttr(l.apelido || l.nome);
  return l.foto
    ? `<img class="ag-foto-mini" src="${escapeAttr(l.foto)}" alt="Foto de ${nome}" title="Toque para ampliar" data-acao="foto" data-linha="${l.linha}" loading="lazy">`
    : `<button type="button" class="ag-foto-vazia no-print" title="Sem foto — toque para adicionar" aria-label="Adicionar foto de ${nome}" data-acao="foto-nova" data-linha="${l.linha}">📷</button>`;
}
// Foto ampliada (sem biblioteca): fundo escuro; toque em qualquer lugar ou Esc para fechar.
function abrirFotoAgente(linhaNumero) {
  const l = linhasAgentes.find(x => x.linha === linhaNumero);
  if (!l || !l.foto) return;
  const fundo = document.createElement('div');
  fundo.id = 'lightboxFotoAgente';
  fundo.setAttribute('role', 'dialog'); fundo.setAttribute('aria-label', 'Foto de ' + (l.apelido || l.nome));
  fundo.innerHTML = `<figure><img src="${escapeAttr(l.foto)}" alt="Foto de ${escapeAttr(l.apelido || l.nome)}"><figcaption><strong>${escapeHtml(l.apelido || l.nome)}</strong>${l.apelido && l.nome ? '<br>' + escapeHtml(l.nome) : ''}${situacaoAgenteInfo(l) ? '<br>' + escapeHtml(situacaoAgenteInfo(l).texto) : ''}${l.fotoLink ? `<br><a href="${escapeAttr(l.fotoLink)}" target="_blank" rel="noopener">Abrir foto maior (Drive)</a>` : ''}<div class="lb-acoes"><button type="button" data-lb="trocar">📷 Trocar foto</button><button type="button" data-lb="remover">🗑️ Remover foto</button></div></figcaption></figure>`;
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', aoTecla); };
  const aoTecla = (e) => { if (e.key === 'Escape') fechar(); };
  fundo.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lb]');
    if (b) { fechar(); if (b.dataset.lb === 'trocar') abrirModalFotoAgente(linhaNumero); else removerFotoAgente(linhaNumero); return; }
    if (e.target.tagName !== 'A') fechar();
  });
  document.addEventListener('keydown', aoTecla);
  document.body.appendChild(fundo);
}

// ---------- Foto do agente enviada pelo painel (mesmo caminho da Lojinha) ----------
// O arquivo é reduzido aqui no navegador; a miniatura (300x300) vai direto para a célula M da planilha (com o login Google do painel) e a foto maior (800 px)
// vai para o Drive pelo n8n (que confere o login Google antes de guardar) — o link fica na célula N. Se a cópia no Drive falhar, a miniatura continua valendo.
async function lerImagemAgente(arquivo) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); } catch (e) { /* tenta pelo <img> */ }
  }
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo); const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não consegui abrir essa imagem. Tente outra foto (JPG ou PNG).')); };
    img.src = url;
  });
}
function jpegAgente(img, largura, altura, rec, maxChars) {
  const c = document.createElement('canvas'); c.width = largura; c.height = altura;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, largura, altura);
  x.drawImage(img, rec.sx, rec.sy, rec.sw, rec.sh, 0, 0, largura, altura);
  let q = 0.82, url = c.toDataURL('image/jpeg', q);
  while (url.length > maxChars && q > 0.35) { q -= 0.08; url = c.toDataURL('image/jpeg', q); }
  return url;
}
async function prepararFotoAgente(arquivo) {
  if (!/^image\//.test(arquivo.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(arquivo.name || '')) throw new Error('Esse arquivo não parece uma foto. Escolha uma imagem (JPG ou PNG).');
  if (arquivo.size > 30 * 1024 * 1024) throw new Error('A foto é grande demais. Escolha uma menor.');
  const img = await lerImagemAgente(arquivo);
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  if (!w || !h) throw new Error('Não consegui abrir essa imagem. Tente outra foto (JPG ou PNG).');
  const lado = Math.min(w, h);
  const miniatura = jpegAgente(img, 300, 300, { sx: Math.round((w - lado) / 2), sy: Math.round((h - lado) / 2), sw: lado, sh: lado }, 44000);
  const f = Math.min(1, 800 / Math.max(w, h));
  const grande = jpegAgente(img, Math.round(w * f), Math.round(h * f), { sx: 0, sy: 0, sw: w, sh: h }, 560000);
  if (img.close) img.close();
  return { miniatura, grandeBase64: grande.split(',')[1] };
}
async function enviarFotoAgenteDrive(grandeBase64, nome) {
  let resp;
  try {
    resp = await fetch(CONFIG.WEBHOOK_AGENTES_FOTO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: accessToken, nome, mime: 'image/jpeg', base64: grandeBase64 }) });
  } catch (e) { throw new Error('sem conexão com o n8n'); }
  let dados = {}; try { dados = await resp.json(); } catch (e) { /* sem JSON */ }
  if (!dados.sucesso || !/^https:\/\/drive\.google\.com\//.test(String(dados.url || ''))) throw new Error(dados.mensagem || 'o n8n não guardou a foto');
  return dados.url;
}
async function gravarFotoAgenteNaPlanilha(linhaNumero, miniatura, link) {
  const l = linhasAgentes.find(x => x.linha === linhaNumero);
  if (!l) throw new Error('cadastro não encontrado');
  const cols = l.grupo === 'ativos' ? 'S' : 'M', colf = l.grupo === 'ativos' ? 'T' : 'N';
  const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.AGENTES_SHEET_ID}/values:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data: [{ range: `${l.aba}!${cols}${l.linhaReal}:${colf}${l.linhaReal}`, values: [[miniatura, link]] }] }),
  });
  if (!resp.ok) { const err = new Error('status ' + resp.status); err.status = resp.status; throw err; }
}
function abrirModalFotoAgente(linhaNumero) {
  const l = linhasAgentes.find(x => x.linha === linhaNumero);
  if (!l) return;
  const antigo = document.getElementById('modalFotoAgente'); if (antigo) antigo.remove();
  const nome = l.apelido || l.nome;
  const fundo = document.createElement('div');
  fundo.id = 'modalFotoAgente'; fundo.className = 'modal-foto-agente no-print';
  fundo.setAttribute('role', 'dialog'); fundo.setAttribute('aria-label', 'Foto de ' + nome);
  fundo.innerHTML = `<div class="mfa-caixa">
    <h3>📷 Foto de ${escapeHtml(nome)}</h3>
    <p class="mfa-dica">Escolha uma foto de rosto, com boa luz. Ela aparece para os outros agentes reconhecerem a pessoa.</p>
    <div class="mfa-previa" id="mfaPrevia">${l.foto ? `<img src="${escapeAttr(l.foto)}" alt="">` : '<span>👤</span>'}</div>
    <p><input type="file" id="mfaArquivo" accept="image/*"></p>
    <p class="mfa-msg" id="mfaMsg" role="status"></p>
    <div class="mfa-botoes"><button type="button" class="btn-acao btn-resolver" id="mfaSalvar" disabled>Salvar foto</button><button type="button" class="btn-acao btn-editar" id="mfaCancelar">Cancelar</button></div>
  </div>`;
  document.body.appendChild(fundo);
  let pronto = null;
  const msg = (t, erro) => { const m = document.getElementById('mfaMsg'); m.textContent = t || ''; m.className = 'mfa-msg' + (erro ? ' erro' : ''); };
  const fechar = () => { fundo.remove(); };
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });
  document.getElementById('mfaCancelar').addEventListener('click', fechar);
  document.getElementById('mfaArquivo').addEventListener('change', async (e) => {
    const arq = e.target.files && e.target.files[0]; pronto = null; document.getElementById('mfaSalvar').disabled = true;
    if (!arq) return;
    msg('Preparando a foto…');
    try {
      pronto = await prepararFotoAgente(arq);
      document.getElementById('mfaPrevia').innerHTML = `<img src="${escapeAttr(pronto.miniatura)}" alt="Prévia">`;
      msg('Foto pronta. Toque em "Salvar foto".'); document.getElementById('mfaSalvar').disabled = false;
    } catch (err) { console.error(err); msg(err.message || 'Não consegui ler essa foto.', true); }
  });
  document.getElementById('mfaSalvar').addEventListener('click', async () => {
    if (!pronto) return;
    const botao = document.getElementById('mfaSalvar'); botao.disabled = true;
    let link = '', avisoDrive = '';
    try {
      msg('Enviando a foto para o Drive…');
      try { link = await enviarFotoAgenteDrive(pronto.grandeBase64, nome); }
      catch (e) { console.error('Drive:', e); avisoDrive = ' (A cópia maior no Drive não foi enviada, mas a foto já aparece no painel.)'; }
      msg('Salvando na planilha…');
      await gravarFotoAgenteNaPlanilha(linhaNumero, pronto.miniatura, link);
      msg('✅ Foto salva.' + avisoDrive);
      await carregarAgentes();
      setTimeout(fechar, avisoDrive ? 2500 : 900);
    } catch (err) {
      console.error(err); botao.disabled = false;
      msg(err.status ? mensagemErroGravacao(err, CONFIG.AGENTES_ABA, 'planilha Pascom_Cadastros_e_Atas') : (err.message || 'Não foi possível salvar a foto.'), true);
    }
  });
}
async function removerFotoAgente(linhaNumero) {
  const l = linhasAgentes.find(x => x.linha === linhaNumero);
  if (!l || !confirm('Remover a foto de ' + (l.apelido || l.nome) + ' do painel? (A cópia que está no Drive não é apagada.)')) return;
  try { await gravarFotoAgenteNaPlanilha(linhaNumero, '', ''); await carregarAgentes(); }
  catch (e) { alert(mensagemErroGravacao(e, CONFIG.AGENTES_ABA, 'planilha Pascom_Cadastros_e_Atas')); }
}

// "linha" é a CHAVE única do cadastro no painel (novos: número da linha; ativos: 100000 + número da linha). "linhaReal" é a linha da planilha, "aba" a aba onde ela está.
const AG_CHAVE_ATIVOS = 100000;
function lerAgenteNovo(row, idx) {
  return {
    grupo: 'novos', aba: CONFIG.AGENTES_ABA, linhaReal: idx + 2, linha: idx + 2, ordem: idx,
    data: row[0] || '', nome: row[1] || '', apelido: row[2] || '', nascimento: row[3] || '', crisma: row[4] || '',
    whatsapp: limparNumero(row[5]), email: row[6] || '', participa: row[7] || '', qual: row[8] || '',
    status: (row[9] || '').trim() || 'Novo', situacao: (row[10] || '').trim(), desde: (row[11] || '').trim(),
    foto: fotoMiniaturaSegura(row[12]),
    fotoLink: /^https:\/\/drive\.google\.com\//.test(String(row[13] || '').trim()) ? String(row[13]).trim() : '',
    comunidade: row[14] || '', areas: row[15] || '', experiencia: row[16] || '', equipamentos: row[17] || '',
    disponibilidade: row[18] || '', motivacao: row[19] || '', confirmouEncontro: row[20] || '',
  };
}
function lerAgenteAtivo(row, idx) {
  return {
    grupo: 'ativos', aba: CONFIG.AGENTES_ATIVOS_ABA, linhaReal: idx + 2, linha: AG_CHAVE_ATIVOS + idx + 2, ordem: idx,
    data: row[0] || '', nome: row[1] || '', apelido: row[2] || '', nascimento: row[3] || '', crisma: row[4] || '',
    whatsapp: limparNumero(row[5]), email: row[6] || '', participa: row[7] || '', qual: row[8] || '',
    status: (row[9] || '').trim() || 'Ativo', situacao: 'Já é agente', desde: (row[10] || '').trim(),
    funcao: row[11] || '', atuaEm: row[12] || '', disponibilidade: row[13] || '', equipamentos: row[14] || '',
    camiseta: row[15] || '', formar: row[16] || '', comunidade: row[17] || '',
    foto: fotoMiniaturaSegura(row[18]),
    fotoLink: /^https:\/\/drive\.google\.com\//.test(String(row[19] || '').trim()) ? String(row[19]).trim() : '',
  };
}

async function carregarAgentes() {
  const statusMsg = el('statusMsgAgentes');
  statusMsg.textContent = 'Carregando cadastros...';

  try {
    const valoresNovos = await buscarValoresSheet(CONFIG.AGENTES_RANGE, CONFIG.AGENTES_SHEET_ID);
    // A aba dos ativos pode ainda não existir: isso não impede de ver os novos.
    let valoresAtivos = []; abaAtivosAusente = false;
    try { valoresAtivos = await buscarValoresSheet(CONFIG.AGENTES_ATIVOS_RANGE, CONFIG.AGENTES_SHEET_ID); }
    catch (e) { if (e.message === 'STATUS_400') abaAtivosAusente = true; else throw e; }
    linhasAgentes = [
      ...valoresNovos.map(lerAgenteNovo),
      ...valoresAtivos.map(lerAgenteAtivo),
    ].filter(l => l.nome || l.apelido);
    renderizarAgentes();
  } catch (e) {
    statusMsg.textContent = e.message === 'SEM_PERMISSAO'
      ? 'Sua conta Google não tem permissão de acesso a esta planilha. Peça para compartilhá-la com você.'
      : e.message === 'STATUS_400'
        ? 'A aba "' + CONFIG.AGENTES_ABA + '" ainda não existe na planilha Pascom_Cadastros_e_Atas. Crie a aba (veja as instruções) e clique em Atualizar.'
        : 'Erro ao carregar os cadastros.';
  }
}

// Sub-abas "Novos agentes" / "Agentes ativos": cada uma mostra só o seu grupo, com a sua contagem e os seus status.
function trocarGrupoAgentes(grupo) {
  grupoAgentes = grupo === 'ativos' ? 'ativos' : 'novos';
  const filtro = el('filtroStatusAgentes'); filtro.value = '';
  filtro.innerHTML = grupoAgentes === 'ativos'
    ? '<option value="">Todos os status</option><option value="Ativo">Ativo</option><option value="Afastado">Afastado</option>'
    : '<option value="">Todos os status</option><option value="Novo">Novo</option><option value="Em contato">Em contato</option><option value="Ativo">Ativo</option>';
  renderizarAgentes();
}

// Linhas "rótulo: valor" que aparecem em "Ver dados" (só o que foi preenchido)
function dadosExtrasAgente(l) {
  const campos = l.grupo === 'ativos'
    ? [['Comunidade', l.comunidade], ['Função atual', l.funcao], ['Atua em', l.atuaEm], ['Disponibilidade', l.disponibilidade], ['Equipamentos', l.equipamentos], ['Camiseta', l.camiseta], ['Pode ajudar a formar novos', l.formar]]
    : [['Comunidade', l.comunidade], ['Áreas de interesse', l.areas], ['Experiência anterior', l.experiencia], ['Equipamentos', l.equipamentos], ['Disponibilidade', l.disponibilidade], ['Por que quer ser agente', l.motivacao], ['Confirmou o 1º encontro', l.confirmouEncontro]];
  return campos.filter(([, v]) => String(v || '').trim());
}

function renderizarAgentes() {
  const termo = norm(el('buscaAgentes').value.trim());
  const crismaFiltro = el('filtroCrismaAgentes').value;
  const statusFiltro = norm(el('filtroStatusAgentes').value);

  // contagem nas sub-abas e destaque da aba aberta
  const nNovos = linhasAgentes.filter(l => l.grupo === 'novos').length, nAtivos = linhasAgentes.filter(l => l.grupo === 'ativos').length;
  el('btnSubAgNovos').textContent = '🆕 Novos agentes (' + nNovos + ')';
  el('btnSubAgAtivos').textContent = '⭐ Agentes ativos (' + nAtivos + ')';
  el('btnSubAgNovos').classList.toggle('ativa', grupoAgentes === 'novos');
  el('btnSubAgAtivos').classList.toggle('ativa', grupoAgentes === 'ativos');
  el('btnSubAgNovos').setAttribute('aria-pressed', String(grupoAgentes === 'novos'));
  el('btnSubAgAtivos').setAttribute('aria-pressed', String(grupoAgentes === 'ativos'));
  el('introAgentesNovos').hidden = grupoAgentes !== 'novos';
  el('introAgentesAtivos').hidden = grupoAgentes !== 'ativos';

  const statusMsg = el('statusMsgAgentes');
  const doGrupo = linhasAgentes.filter(l => l.grupo === grupoAgentes);

  const filtrados = doGrupo.filter(l => {
    const bateTexto = !termo || norm([l.nome, l.apelido, l.whatsapp, l.email, l.qual, l.desde, l.comunidade, l.areas, l.funcao, l.atuaEm, l.equipamentos, l.disponibilidade].join(' ')).includes(termo);
    const bateCrisma = !crismaFiltro || norm(l.crisma) === crismaFiltro;
    const bateStatus = !statusFiltro || norm(l.status) === statusFiltro;
    return bateTexto && bateCrisma && bateStatus;
  }).sort((a, b) => (valorDataHora(b.data) - valorDataHora(a.data)) || (b.ordem - a.ordem)); // mais novos no topo

  statusMsg.textContent = grupoAgentes === 'ativos' && abaAtivosAusente
    ? 'A aba "' + CONFIG.AGENTES_ATIVOS_ABA + '" ainda não existe na planilha Pascom_Cadastros_e_Atas. Crie a aba (veja as instruções) e clique em Atualizar.'
    : doGrupo.length + ' cadastro(s) encontrado(s)' + (filtrados.length !== doGrupo.length ? ' · ' + filtrados.length + ' no filtro.' : '.');

  const corpo = el('tabelaAgentesCorpo');
  corpo.innerHTML = '';

  if (filtrados.length === 0) {
    corpo.innerHTML = '<tr><td colspan="7">Nenhum cadastro encontrado.</td></tr>';
    return;
  }

  filtrados.forEach(l => {
    const ehAtivos = l.grupo === 'ativos';
    const ativo = norm(l.status) === 'ativo';
    const afastado = norm(l.status) === 'afastado';
    const emContato = norm(l.status).startsWith('em contato');
    const statusClasse = ativo ? 'resolvido' : (emContato || afastado ? 'andamento' : 'pendente');
    const crismado = norm(l.crisma) === 'sim';
    const participa = norm(l.participa) === 'sim';
    const wa = linkWhatsApp(l.whatsapp);
    const nomeCurto = l.apelido || l.nome;
    const extras = dadosExtrasAgente(l).map(([r, v]) => `<p><strong>${escapeHtml(r)}:</strong> ${escapeHtml(v)}</p>`).join('');

    const detalhes = `
      <details class="detalhes-cat">
        <summary>Ver dados</summary>
        <p><strong>Nome completo:</strong> ${escapeHtml(l.nome || '—')}</p>
        <p><strong>Nascimento:</strong> ${escapeHtml(l.nascimento || '—')}</p>
        <p><strong>E-mail:</strong> ${l.email ? `<a href="mailto:${escapeAttr(l.email)}">${escapeHtml(l.email)}</a>` : '—'}</p>
        ${extras}
        <p class="no-print"><button type="button" class="btn-acao btn-editar btn-ag" data-acao="ficha" data-linha="${l.linha}" title="Abrir a ficha de cadastro completa, já preenchida (de lá dá para imprimir)">📄 Abrir ficha completa</button> <button type="button" class="btn-acao btn-editar btn-ag" data-acao="foto-modal" data-linha="${l.linha}" title="Adicionar ou trocar a foto deste agente">📷 ${l.foto ? 'Trocar foto' : 'Adicionar foto'}</button></p>
      </details>`;

    const botoesStatus = ehAtivos
      ? (afastado ? `<button class="btn-acao btn-resolver btn-ag" data-acao="reativar" data-linha="${l.linha}">↩ Voltou a atuar</button>` : `<button class="btn-acao btn-editar btn-ag" data-acao="afastar" data-linha="${l.linha}">⏸ Afastado(a)</button>`)
      : `${!ativo && !emContato ? `<button class="btn-acao btn-editar btn-ag" data-acao="contato" data-linha="${l.linha}">▶ Em contato</button>` : ''}
          ${!ativo ? `<button class="btn-acao btn-resolver btn-ag" data-acao="ativar" data-linha="${l.linha}">✅ Ativo</button>` : `<button class="btn-acao btn-editar btn-ag" data-acao="reabrir" data-linha="${l.linha}">↩ Reabrir</button>`}`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Data">${escapeHtml(l.data)}</td>
      <td data-label="Agente"><div class="ag-celula">${htmlAvatarAgente(l)}<div class="ag-celula-texto"><strong>${escapeHtml(nomeCurto)}</strong>${l.apelido && l.nome ? `<br><small>${escapeHtml(l.nome)}</small>` : ''}${situacaoAgenteInfo(l) ? '<br>' + htmlSeloAgente(l) : ''}${ehAtivos && l.funcao ? `<br><small>🎯 ${escapeHtml(l.funcao)}</small>` : ''}${detalhes}</div></div></td>
      <td data-label="WhatsApp">${escapeHtml(l.whatsapp)}</td>
      <td data-label="Crisma"><span class="status-pill ${crismado ? 'resolvido' : 'pendente'}">${escapeHtml(l.crisma || '—')}</span></td>
      <td data-label="Pastoral / grupo">${participa ? escapeHtml(l.qual || 'Sim') : (norm(l.participa) === 'nao' ? 'Não participa' : '—')}</td>
      <td data-label="Status"><span class="status-pill ${statusClasse}">${escapeHtml(l.status)}</span></td>
      <td data-label="Ação" class="no-print acoes-recado acoes-agente">
        <div class="acoes-linha">
          ${wa ? `<a href="${escapeAttr(wa)}" target="_blank" rel="noopener" class="btn-acao">💬 WhatsApp</a>` : ''}
          <button class="btn-acao btn-editar btn-ag" data-acao="ficha" data-linha="${l.linha}" title="Abrir a ficha já preenchida (de lá dá para imprimir)">📄 Ficha</button>
          ${botoesStatus}
        </div>
      </td>
    `;
    corpo.appendChild(tr);
  });
}

// Ficha de cadastro já preenchida com o que a pessoa informou no formulário (mesmo layout da ficha em branco, Ficha_Cadastro_Agente_Pascom.pdf).
// Devolve um documento HTML completo para abrir numa janela: a ficha aparece para conferir e a barra do topo tem o botão "Imprimir"
// (a barra não sai no papel; a ficha imprime em 1 página A4).
function htmlFichaAgente(l) {
  const e = escapeHtml;
  const campo = (rot, val, cls) => `<div class="campo ${cls || ''}"><span class="l">${rot}</span><span class="v">${e(val || '')}</span></div>`;
  const cx = (marcado, texto) => `<span><i class="cx">${marcado ? '✕' : ''}</i>${texto}</span>`;
  // 5514997222096 -> (14) 99722-2096 (só quando tem o formato de número brasileiro; senão mostra como está)
  const telBonito = (t) => {
    const m = String(t || '').match(/^55(\d{2})(9?\d{4})(\d{4})$/);
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (t || '');
  };
  const crismaSim = norm(l.crisma) === 'sim';
  const crismaNao = norm(l.crisma) === 'nao';
  const participa = norm(l.participa) === 'sim';
  const naoParticipa = norm(l.participa) === 'nao';
  const dataCadastro = String(l.data || '').split(' ')[0];
  const brasao = new URL('brasao.png', location.href).href;
  const ehAtivos = l.grupo === 'ativos';
  const tituloFicha = ehAtivos ? 'Ficha de Cadastro — Agente Ativo da Pascom' : 'Ficha de Cadastro — Novo Agente da Pascom';
  const extrasFicha = dadosExtrasAgente(l).filter(([r]) => r !== 'Confirmou o 1º encontro').map(([r, v]) => [r, String(v).length > 170 ? String(v).slice(0, 167) + '…' : v]);

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Ficha de cadastro — ${e(l.apelido || l.nome)}</title>
<style>
  @page { size: A4; margin: 0; }
  :root { --vinho:#7a1f2b; --vinho-escuro:#591622; --dourado:#c9a24a; --creme:#faf7f0; --texto:#2b2420; --linha:#8f847a; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin:0; width:210mm; height:297mm; overflow:hidden; font-family:"Segoe UI", Arial, sans-serif; font-size:9.5pt; line-height:1.3; color:var(--texto); position:relative; }
  .topo { background: radial-gradient(circle at 25% 30%, #8a2b32 0%, var(--vinho-escuro) 80%); color:#fff; padding:6mm 14mm; display:flex; align-items:center; gap:6mm; border-bottom:2.2mm solid var(--dourado); }
  .topo img { height:17mm; }
  .topo .sup { color:#e3c88a; font-size:8pt; letter-spacing:1.4px; text-transform:uppercase; }
  .topo .nome { font-family:Georgia, serif; font-size:15pt; font-weight:700; line-height:1.15; margin:0.5mm 0 1mm; color:#f1dfae; }
  .topo .contato { font-size:8pt; color:#eadfd2; }
  .conteudo { padding:7mm 14mm 0; }
  h1 { font-family:Georgia, serif; color:var(--vinho); font-size:17pt; margin:0; line-height:1.15; text-align:center; }
  .subtitulo { text-align:center; color:#6b6055; font-size:8.5pt; margin:1mm 0 4mm; }
  .aviso { background:var(--creme); border-left:3px solid var(--dourado); padding:2.5mm 4mm; margin:0 0 1mm; border-radius:2px; font-size:8.8pt; line-height:1.38; }
  .aviso .t { font-size:9.5pt; font-weight:700; color:var(--vinho); letter-spacing:0.4px; margin-bottom:1.2mm; }
  .aviso p { margin:0 0 1.4mm; }
  .aviso p:last-child { margin-bottom:0; font-weight:700; color:var(--vinho); }
  h2 { font-size:9.5pt; color:#fff; background:var(--vinho); margin:5mm 0 1mm; padding:1mm 3mm; border-radius:2px; letter-spacing:0.3px; }
  .linha { display:flex; gap:4mm; }
  .campo { flex:1; min-height:15mm; border-bottom:1px solid var(--linha); padding-top:1mm; }
  .campo .l { display:block; font-size:7pt; color:#7a6f66; text-transform:uppercase; letter-spacing:0.3px; }
  .campo .v { display:block; font-size:10.5pt; font-weight:600; color:#1d1a17; margin-top:1.2mm; }
  .campo.p2 { flex:2; } .campo.p3 { flex:3; }
  .dados-foto { display:flex; gap:5mm; align-items:flex-start; }
  .dados-campos { flex:1; min-width:0; }
  .foto-ficha { flex:0 0 30mm; width:30mm; height:38mm; margin-top:1mm; border:1px solid var(--linha); border-radius:2px; background:#fdfbf6; display:flex; align-items:center; justify-content:center; overflow:hidden; text-align:center; font-size:7pt; color:#9a8f84; text-transform:uppercase; }
  .foto-ficha img { width:100%; height:100%; object-fit:cover; }
  .extras-ficha { font-size:8.2pt; line-height:1.28; margin:1mm 0 0; }
  .extras-ficha p { margin:0 0 0.8mm; }
  body.compacta h2 { margin-top:3mm; }
  body.compacta .aviso { padding:1.6mm 3mm; font-size:8.2pt; line-height:1.3; }
  body.compacta .aviso p { margin-bottom:1mm; }
  body.compacta .campo { min-height:12mm; }
  body.compacta .pergunta { margin-top:2.5mm; }
  body.compacta .opcoes { padding:1mm 0 0.5mm; }
  body.compacta .autoriza { margin-top:3mm; font-size:8pt; }
  body.compacta .assina { margin-top:7mm; }
  body.compacta .uso { margin-top:4mm; }
  body.compacta .conteudo { padding-top:5mm; }
  .pergunta { margin-top:5mm; font-size:9.5pt; font-weight:600; }
  .opcoes { display:flex; flex-wrap:wrap; gap:1.5mm 8mm; align-items:center; padding:2mm 0 1mm; font-size:9.5pt; }
  .cx { display:inline-block; width:3.6mm; height:3.6mm; border:1px solid #4a4038; margin-right:1.8mm; vertical-align:-0.7mm; font-style:normal; font-size:9pt; line-height:3.3mm; text-align:center; font-weight:700; }
  .qual { flex:1; min-width:70mm; border-bottom:1px solid var(--linha); height:6mm; font-size:10.5pt; font-weight:600; line-height:5.5mm; }
  .autoriza { background:var(--creme); border-left:3px solid var(--dourado); padding:2.5mm 3.5mm; margin-top:6mm; font-size:8.5pt; line-height:1.4; border-radius:2px; }
  .assina { display:flex; gap:8mm; margin-top:12mm; }
  .assina .a { flex:3; border-top:1px solid var(--linha); padding-top:1mm; font-size:7.5pt; color:#7a6f66; text-align:center; }
  .assina .d { flex:1; border-top:1px solid var(--linha); padding-top:1mm; font-size:7.5pt; color:#7a6f66; text-align:center; }
  .uso { margin-top:8mm; border:1.2px dashed #a89a8a; border-radius:3px; padding:1.5mm 3mm 0; background:#fdfbf6; }
  .uso .tit { font-size:7.5pt; font-weight:700; color:var(--vinho); text-transform:uppercase; letter-spacing:0.6px; }
  .uso .campo { min-height:10mm; }
  .rodape { position:absolute; left:0; right:0; bottom:5mm; text-align:center; font-size:7.5pt; color:#888; }
  .barra { position:fixed; top:0; left:0; right:0; z-index:10; display:flex; align-items:center; justify-content:center; gap:12px; flex-wrap:wrap; padding:8px 12px; background:#2b2420; color:#f1dfae; font:600 14px "Segoe UI", Arial, sans-serif; box-shadow:0 2px 6px rgba(0,0,0,.35); }
  .barra button { font:600 14px "Segoe UI", Arial, sans-serif; padding:8px 16px; border-radius:6px; border:0; cursor:pointer; background:#c9a24a; color:#2b2420; }
  .barra button.sec { background:#eadfd2; }
  @media screen { html { background:#d9d4cc; } body { margin:62px auto 20px; background:#fff; box-shadow:0 2px 12px rgba(0,0,0,.3); } }
  @media print { .barra { display:none !important; } }
</style></head><body class="${extrasFicha.length ? 'compacta' : ''}">
<div class="barra"><span>Ficha de cadastro — ${e(l.apelido || l.nome)}</span><button type="button" onclick="window.print()">🖨️ Imprimir</button><button type="button" class="sec" onclick="window.close()">Fechar</button></div>
<div class="topo"><img src="${brasao}" alt=""><div>
  <div class="sup">Paróquia</div><div class="nome">Sagrado Coração de Jesus</div>
  <div class="contato">Diocese de Marília · Rua Etelvina Teixeira da Silva, 17 — Marília/SP · Secretaria: (14) 3425-1732</div>
</div></div>
<div class="conteudo">
  <h1>${tituloFicha}</h1>
  <p class="subtitulo">Pastoral da Comunicação · Dados informados no cadastro pela internet. Complete à mão o que estiver em branco.</p>

${ehAtivos ? '' : `  <div class="aviso">
    <div class="t">INSCRIÇÕES PASCOM | 23/11 a 10/01</div>
    <p>O primeiro encontro, de participação obrigatória, será no dia 16 de janeiro, às 16h, na Igreja Matriz. Pedimos que reservem essa data em suas agendas. Caso não possam comparecer, deverão justificar posteriormente à coordenação.</p>
    <p>Será criado um grupo de WhatsApp com os inscritos para o envio de orientações e informações próximas à data do encontro.</p>
    <p>Esperamos por vocês!</p>
  </div>

`}
  <h2>Dados do agente</h2>
  <div class="dados-foto">
    <div class="dados-campos">
      <div class="linha">${campo('Nome completo', l.nome, 'p3')}${campo('Data de nascimento', l.nascimento)}</div>
      <div class="linha">${campo('Nome abreviado (como gosta de ser chamado(a))', l.apelido, 'p3')}${campo('Telefone / WhatsApp com DDD', telBonito(l.whatsapp), 'p2')}</div>
      <div class="linha">${campo('E-mail', l.email, 'p3')}${campo('Situação na Pascom', (situacaoAgenteInfo(l) || { texto: '' }).texto.replace(/^[^\p{L}]+/u, '').split(' · ')[0], 'p2')}${campo('Agente desde', l.desde)}</div>
    </div>
    <div class="foto-ficha">${l.foto ? `<img src="${e(l.foto)}" alt="Foto">` : '<span>Foto<br>3×4</span>'}</div>
  </div>

  <h2>Sacramento e participação na paróquia</h2>
  <div class="pergunta">Já recebeu o Sacramento da Crisma?</div>
  <div class="opcoes">${cx(crismaSim, 'Sim')}${cx(crismaNao, 'Não')}</div>

  <div class="pergunta">Participa de alguma pastoral, movimento ou grupo da paróquia?</div>
  <div class="opcoes">${cx(participa, 'Sim. Qual?')}<span class="qual">${e(participa ? l.qual : '')}</span></div>
  <div class="opcoes" style="padding-top:0;">${cx(naoParticipa, 'Não')}</div>

  ${extrasFicha.length ? `<h2>${ehAtivos ? 'Atuação na Pascom' : 'Interesse e disponibilidade'}</h2>
  <div class="extras-ficha">${extrasFicha.map(([r, v]) => `<p><b>${e(r)}:</b> ${e(v)}</p>`).join('')}</div>` : ''}

  <div class="autoriza"><strong>Autorização.</strong> Declaro que as informações acima são verdadeiras.
  Autorizo a paróquia a usar estes dados <strong>somente</strong> para o cadastro e o contato da Pascom,
  com sigilo e cuidado, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).</div>
  <div class="assina"><div class="a">Assinatura</div><div class="d">Data</div></div>

  <div class="uso"><div class="tit">Uso da Pascom</div>
    <div class="linha">${campo('Recebido por', 'Cadastro pela internet')}${campo('Data', dataCadastro)}${campo('Situação (novo / em contato / ativo)', l.status)}</div>
    <div class="linha">${campo('Observações da equipe', '', 'p3')}</div>
  </div>
</div>
<div class="rodape">Paróquia Sagrado Coração de Jesus · Marília/SP</div>
</body></html>`;
}

function abrirFichaAgente(linhaNumero) {
  const l = linhasAgentes.find(x => x.linha === linhaNumero);
  if (!l) return;
  const janela = window.open('', '_blank');
  if (!janela) {
    alert('O navegador bloqueou a janela da ficha. Permita pop-ups para este site (ícone na barra de endereço) e tente de novo.');
    return;
  }
  janela.document.open();
  janela.document.write(htmlFichaAgente(l));
  janela.document.close();
}

async function atualizarStatusAgente(chave, novoStatus) {
  const l = linhasAgentes.find(x => x.linha === chave);
  if (!l) return;
  const dados = [{ range: `${l.aba}!J${l.linhaReal}`, values: [[novoStatus]] }];
  // NOVOS: marcar como "Ativo" também registra "Já é agente" e "Agente desde" (mês/ano de hoje, se a pessoa ainda não tinha informado), nas colunas K e L.
  if (l.grupo === 'novos' && novoStatus === 'Ativo' && norm(l.situacao) !== 'ja e agente') {
    const hoje = new Date();
    const mesAno = String(hoje.getMonth() + 1).padStart(2, '0') + '/' + hoje.getFullYear();
    dados.push({ range: `${l.aba}!K${l.linhaReal}:L${l.linhaReal}`, values: [['Já é agente', l.desde || mesAno]] });
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.AGENTES_SHEET_ID}/values:batchUpdate`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data: dados }),
    });
    if (!resp.ok) { const err = new Error('status ' + resp.status); err.status = resp.status; throw err; }
    await carregarAgentes();
  } catch (e) {
    alert(mensagemErroGravacao(e, l.aba, 'planilha Pascom_Cadastros_e_Atas'));
  }
}


window.addEventListener('DOMContentLoaded', () => {
  iniciarBotaoGoogle();

  // Agentes da Pascom
  el('buscaAgentes').addEventListener('input', renderizarAgentes);
  el('filtroCrismaAgentes').addEventListener('change', renderizarAgentes);
  el('filtroStatusAgentes').addEventListener('change', renderizarAgentes);
  el('btnAtualizarAgentes').addEventListener('click', carregarAgentes);
  el('btnImprimirAgentes').addEventListener('click', () => window.print());
  el('btnFichaBrancoAgentes').addEventListener('click', () => window.open('Ficha_Cadastro_Agente_Pascom.pdf', '_blank'));
  // "?" da aba (mostra/esconde as instruções) e botão de copiar o link do formulário
  el('abaAgentes').addEventListener('click', async (e) => {
    const btnAjuda = e.target.closest('.btn-ajuda');
    if (btnAjuda) {
      const caixa = el(btnAjuda.dataset.ajuda);
      caixa.hidden = !caixa.hidden;
      btnAjuda.setAttribute('aria-expanded', String(!caixa.hidden));
      return;
    }
    const btnCopiar = e.target.closest('.btn-copiar-link-ag');
    if (btnCopiar) {
      const msg = el('msgCopiarLinkAgentes');
      try {
        await navigator.clipboard.writeText(el(btnCopiar.dataset.alvo).textContent.trim());
        msg.textContent = 'Link copiado!';
      } catch (err) {
        msg.textContent = 'Não consegui copiar. Selecione o link acima e copie com Ctrl+C.';
      }
      setTimeout(() => { msg.textContent = ''; }, 3000);
    }
  });
  el('btnSubAgNovos').addEventListener('click', () => trocarGrupoAgentes('novos'));
  el('btnSubAgAtivos').addEventListener('click', () => trocarGrupoAgentes('ativos'));
  el('tabelaAgentesCorpo').addEventListener('click', (e) => {
    const foto = e.target.closest('img[data-acao="foto"]');
    if (foto) { abrirFotoAgente(Number(foto.dataset.linha)); return; }
    const nova = e.target.closest('button[data-acao="foto-nova"]');
    if (nova) { abrirModalFotoAgente(Number(nova.dataset.linha)); return; }
    const b = e.target.closest('.btn-ag');
    if (!b) return;
    const linha = Number(b.dataset.linha);
    if (b.dataset.acao === 'ficha') abrirFichaAgente(linha);
    else if (b.dataset.acao === 'foto-modal') abrirModalFotoAgente(linha);
    else if (b.dataset.acao === 'contato') atualizarStatusAgente(linha, 'Em contato');
    else if (b.dataset.acao === 'reabrir') atualizarStatusAgente(linha, 'Novo');
    else if (b.dataset.acao === 'afastar' && confirm('Marcar esta pessoa como afastada (não está atuando no momento)? Ela continua na lista de agentes ativos.')) atualizarStatusAgente(linha, 'Afastado');
    else if (b.dataset.acao === 'reativar') atualizarStatusAgente(linha, 'Ativo');
    else if (b.dataset.acao === 'ativar' && confirm('Confirma que quer marcar este cadastro como Ativo (já faz parte da equipe)? Se a pessoa ainda estiver como "Novo agente", ela passa a "Já é agente" desde este mês.')) atualizarStatusAgente(linha, 'Ativo');
  });

  el('btnSair').addEventListener('click', sair);
});
