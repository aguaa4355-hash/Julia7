# Bot de Campeonato — Stumble Guys

Bot Discord com inscrição por botões, limite de 16 jogadores, sorteio, tópicos privados para confrontos e registro de vencedores.

## Comandos
- `/painel canal:#inscrições` — publica o painel.
- `/iniciar` — inicia com os inscritos (mínimo 2), mesmo com vagas incompletas.
- `/campeonato-status` — mostra o estado.
- `/campeonato-resetar` — reseta para um novo campeonato.

## Instalar
1. Crie uma aplicação/bot em https://discord.com/developers/applications.
2. Em **Bot**, ative **SERVER MEMBERS INTENT**.
3. Convide usando os escopos `bot` e `applications.commands`.
4. Permissões: View Channels, Send Messages, Embed Links, Read Message History, Create Private Threads, Send Messages in Threads e Manage Threads.
5. Copie `.env.example` para `.env` e preencha `DISCORD_TOKEN`, `CLIENT_ID` (Application ID) e `GUILD_ID` (ID do servidor).
6. Rode `npm install` e `npm start`, ou envie os arquivos para Railway e use `npm start`.

O bot precisa conseguir criar tópicos privados e adicionar os dois jogadores. O estado é salvo em `data.json`; use volume persistente na Railway se quiser manter os dados após reinicializações. Nunca compartilhe o token.
