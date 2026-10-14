require('dotenv').config();
const fs = require('node:fs');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder,
  PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType } = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Preencha DISCORD_TOKEN, CLIENT_ID e GUILD_ID nas variáveis.');
  process.exit(1);
}
const FILE = './data.json', MAX = 16;
const empty = () => ({ guildId: GUILD_ID, channelId: null, panelMessageId: null, players: [], rounds: [], roundIndex: 0, started: false, championId: null });
let state = empty();
try { if (fs.existsSync(FILE)) state = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { console.error(e); }
function save() { try { fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); } catch (e) { console.error('Falha ao salvar:', e.message); } }
function organizer(member) { return member?.permissions?.has(PermissionFlagsBits.ManageGuild); }

function embedPanel() {
  const list = state.players.length ? state.players.map((id, i) => `\`${String(i+1).padStart(2,'0')}\` <@${id}>`).join('\n') : 'Ninguém entrou ainda.';
  return new EmbedBuilder().setColor(0x5865F2).setTitle('🎮 Simulador de Torneio — Inscrições Abertas')
    .setDescription('Clique em **Entrar** para participar. A organização pode iniciar quando quiser, desde que haja pelo menos 2 jogadores.')
    .addFields({name:'Vagas',value:`${state.players.length}/${MAX}`,inline:true},
      {name:'Cargo necessário',value:'Nenhum',inline:true},
      {name:`👤 Participantes (${state.players.length})`,value:list.slice(0,1024)})
    .setFooter({text:'Stumble Guys • Eliminação direta'});
}
function panelButtons(disabled=false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('join').setLabel('Entrar').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId('leave').setLabel('Sair').setEmoji('📋').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('start').setLabel('Iniciar Torneio').setEmoji('⚔️').setStyle(ButtonStyle.Primary).setDisabled(disabled)
  )];
}
const commands = [
  new SlashCommandBuilder().setName('painel').setDescription('Publica painel de inscrições').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o=>o.setName('canal').setDescription('Canal de inscrições').addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName('iniciar').setDescription('Inicia com os jogadores inscritos').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('campeonato-status').setDescription('Mostra o estado do campeonato'),
  new SlashCommandBuilder().setName('campeonato-resetar').setDescription('Reseta o campeonato').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(c=>c.toJSON());

const client = new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers],partials:[Partials.Channel]});
async function refreshPanel(guild) {
  if (!state.channelId || !state.panelMessageId) return;
  try {
    const ch=await guild.channels.fetch(state.channelId), msg=await ch.messages.fetch(state.panelMessageId);
    await msg.edit({embeds:[embedPanel()],components:panelButtons(state.started || state.players.length>=MAX)});
  } catch(e) { console.warn('Não consegui atualizar painel:',e.message); }
}
function winnerButtons(m) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`win:${m.id}:${m.a}`).setLabel('Venceu jogador 1').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`win:${m.id}:${m.b}`).setLabel('Venceu jogador 2').setStyle(ButtonStyle.Primary)
  )];
}
async function makeThread(channel, m, label) {
  if (!m.b || !channel?.threads?.create) return;
  try {
    const thread=await channel.threads.create({name:`${label}-${m.id}`,type:ChannelType.PrivateThread,autoArchiveDuration:1440,reason:'Confronto do campeonato'});
    await thread.members.add(m.a); await thread.members.add(m.b); m.threadId=thread.id;
    await thread.send({content:`⚔️ **${label}**\n<@${m.a}> VS <@${m.b}>\nA organização registra o vencedor abaixo.`,components:winnerButtons(m)});
  } catch(e) { console.warn('Erro ao criar tópico privado:',e.message); }
}
async function advance(guild) {
  while(state.started) {
    const round=state.rounds[state.roundIndex];
    if(!round || !round.every(m=>m.winner)) return;
    const winners=round.map(m=>m.winner);
    if(winners.length===1) {
      state.championId=winners[0]; state.started=false; save();
      const ch=state.channelId && await guild.channels.fetch(state.channelId).catch(()=>null);
      if(ch?.isTextBased()) await ch.send(`🏆 **CAMPEÃO DO TORNEIO: <@${state.championId}>!** Parabéns!`).catch(()=>{});
      await refreshPanel(guild); return;
    }
    const next=[];
    for(let i=0;i<winners.length;i+=2) next.push({id:`r${state.roundIndex+1}m${next.length+1}`,a:winners[i],b:winners[i+1]||null,winner:null,threadId:null});
    state.roundIndex++; state.rounds.push(next); save();
    const ch=state.channelId && await guild.channels.fetch(state.channelId).catch(()=>null);
    const title=next.length===4?'Quartas de Final':next.length===2?'Semifinais':next.length===1?'Final':`Rodada ${state.roundIndex+1}`;
    const lines=[];
    for(let i=0;i<next.length;i++) {
      const m=next[i];
      if(!m.b) {m.winner=m.a;lines.push(`<@${m.a}> avança automaticamente.`);continue;}
      lines.push(`**Confronto ${String(i+1).padStart(2,'0')}**\n<@${m.a}> **VS** <@${m.b}>\n⏳ aguardando resultado`);
      await makeThread(ch,m,`${title.toLowerCase().replaceAll(' ','-')}-${i+1}`);
    }
    if(ch?.isTextBased()) await ch.send({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle(`⚔️ ${title} — Confrontos`).setDescription(lines.join('\n\n').slice(0,4000))}).catch(()=>{});
    save();
    if(!next.every(m=>m.winner)) return;
  }
}
async function startTournament(interaction) {
  if(state.started) return interaction.reply({content:'O campeonato já começou.',ephemeral:true});
  if(state.players.length<2) return interaction.reply({content:'Precisa ter pelo menos 2 jogadores inscritos.',ephemeral:true});
  const shuffled=[...state.players].sort(()=>Math.random()-0.5);
  const first=[];
  for(let i=0;i<shuffled.length;i+=2) first.push({id:`r0m${first.length+1}`,a:shuffled[i],b:shuffled[i+1]||null,winner:null,threadId:null});
  state.rounds=[first]; state.roundIndex=0; state.started=true; state.championId=null; save();
  await interaction.reply({content:`⚔️ Campeonato iniciado! ${shuffled.length} jogadores no sorteio.`,ephemeral:true});
  const ch=state.channelId && await interaction.guild.channels.fetch(state.channelId).catch(()=>null);
  const lines=[];
  for(let i=0;i<first.length;i++) {
    const m=first[i];
    if(!m.b){m.winner=m.a;lines.push(`<@${m.a}> avança automaticamente.`);continue;}
    lines.push(`**Confronto ${String(i+1).padStart(2,'0')}**\n<@${m.a}> **VS** <@${m.b}>\n⏳ aguardando resultado`);
    await makeThread(ch,m,`oitavas-${i+1}`);
  }
  if(ch?.isTextBased()) await ch.send({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('⚔️ Oitavas de Final — Confrontos').setDescription(lines.join('\n\n').slice(0,4000))}).catch(()=>{});
  save(); await refreshPanel(interaction.guild); await advance(interaction.guild);
}
client.on('interactionCreate',async i=>{
  try {
    if(i.isChatInputCommand()) {
      if(i.commandName==='painel') {
        const ch=i.options.getChannel('canal',true);
        state={...empty(),guildId:i.guildId,channelId:ch.id};
        const msg=await ch.send({embeds:[embedPanel()],components:panelButtons()});
        state.panelMessageId=msg.id;save();
        return i.reply({content:`Painel publicado em ${ch}.`,ephemeral:true});
      }
      if(i.commandName==='iniciar') {
        if(!organizer(i.member)) return i.reply({content:'Só a organização pode iniciar.',ephemeral:true});
        return startTournament(i);
      }
      if(i.commandName==='campeonato-status') {
        const status=state.championId?`Campeão: <@${state.championId}>`:state.started?`Em andamento — rodada ${state.roundIndex+1}`:'Inscrições abertas ou campeonato não iniciado.';
        return i.reply({content:`**Campeonato**\n${status}\nParticipantes: ${state.players.length}/${MAX}`,ephemeral:true});
      }
      if(i.commandName==='campeonato-resetar') {
        if(!organizer(i.member)) return i.reply({content:'Só a organização pode resetar.',ephemeral:true});
        state=empty();save();return i.reply({content:'Campeonato resetado. Use `/painel` para criar outro.',ephemeral:true});
      }
    }
    if(i.isButton()) {
      if(i.customId==='join') {
        if(state.started) return i.reply({content:'O campeonato já começou.',ephemeral:true});
        if(state.players.includes(i.user.id)) return i.reply({content:'Você já está inscrito!',ephemeral:true});
        if(state.players.length>=MAX) return i.reply({content:'As vagas estão lotadas.',ephemeral:true});
        state.players.push(i.user.id);save();
        return i.update({embeds:[embedPanel()],components:panelButtons(state.players.length>=MAX)});
      }
      if(i.customId==='leave') {
        if(state.started) return i.reply({content:'Não dá para sair depois que começou.',ephemeral:true});
        state.players=state.players.filter(id=>id!==i.user.id);save();
        return i.update({embeds:[embedPanel()],components:panelButtons(false)});
      }
      if(i.customId==='start') {
        if(!organizer(i.member)) return i.reply({content:'Só a organização (Gerenciar Servidor) pode iniciar.',ephemeral:true});
        return startTournament(i);
      }
      if(i.customId.startsWith('win:')) {
        if(!organizer(i.member)) return i.reply({content:'Só a organização (Gerenciar Servidor) pode registrar resultados.',ephemeral:true});
        const [,mid,wid]=i.customId.split(':');
        const round=state.rounds.find(r=>r.some(m=>m.id===mid)), match=round?.find(m=>m.id===mid);
        if(!match) return i.reply({content:'Confronto não encontrado.',ephemeral:true});
        if(match.winner) return i.reply({content:'Resultado já registrado.',ephemeral:true});
        if(wid!==match.a&&wid!==match.b) return i.reply({content:'Jogador inválido.',ephemeral:true});
        match.winner=wid;save();
        await i.update({content:`✅ Resultado registrado: <@${wid}> venceu!`,components:[]});
        await advance(i.guild);
      }
    }
  } catch(e) {
    console.error('Erro na interação:',e);
    if(i.isRepliable()&&!i.replied&&!i.deferred) await i.reply({content:'Erro no bot. Confira os logs da Railway.',ephemeral:true}).catch(()=>{});
  }
});
client.once('ready',()=>console.log(`Bot conectado como ${client.user.tag}`));
(async()=>{
  try {
    const rest=new REST({version:'10'}).setToken(DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands});
    console.log('Comandos registrados.');
    await client.login(DISCORD_TOKEN);
  } catch(e) { console.error('Falha ao iniciar:',e); process.exit(1); }
})();
