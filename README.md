# Pascom — Paróquia Sagrado Coração de Jesus (Marília/SP)

Páginas da Pastoral da Comunicação, publicadas no GitHub Pages:
https://pascomscjmarilia-creator.github.io/pascom-scjm-marilia/

| Página | Para quê |
|---|---|
| `agente-pascom-novo.html` | Cadastro de **novos** agentes (com foto) |
| `agente-pascom-ativo.html` | Cadastro de agentes **já ativos** (com foto). **Uso interno**: o link é passado pela equipe da Pascom diretamente aos agentes; não aparece no menu, não é enviado pelo chat do WhatsApp e não é divulgado em cartazes (a página pede aos buscadores que não a indexem) |
| `painel.html` | **Painel interno** dos agentes (novos e ativos): fotos, fichas, status. Login Google da conta da Pascom |
| `ata-pascom.html` | *(fora de produção por ora, sem link no menu)* Confirmação de presença nas reuniões (código no WhatsApp + assinatura no dedo) |
| `ata-pascom-redigir.html` | *(fora de produção por ora, sem link no menu)* Redação da ata (só quem tem "Redige ata" na planilha) |

## Como funciona
- As páginas são estáticas. Os dados **não ficam neste repositório**: as páginas enviam para o n8n (webhooks), que grava na planilha **Pascom_Cadastros_e_Atas** (Google Sheets) e guarda as fotos/assinaturas no Drive.
- Os endereços dos webhooks e o primeiro encontro dos novos agentes ficam no bloco `CONFIG` no topo do script de cada página.

## Situação (20/11/2026): FUNCIONANDO EM PARALELO
Este repositório foi criado como cópia de teste. O repositório antigo `paroquia-documentos` continua no ar e **não foi desligado**.
Os dois usam os mesmos webhooks e a mesma planilha. A oficialização (trocar os links do bot e das divulgações, e deixar o antigo só redirecionando) só acontece depois de tudo testado e aprovado.

## Cuidados
- Repositório público (necessário para o GitHub Pages gratuito): **nunca** colocar aqui senhas, chaves, tokens, planilhas ou dados pessoais.
- Para atualizar uma página, substituir o arquivo inteiro e conferir o tamanho depois de enviar.
