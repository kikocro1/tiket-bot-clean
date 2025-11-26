// 🔹 prvo učitaj .env
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

// 🔹 ENV varijable
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID?.trim();

const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID; // rola za support

// =====================
//  "DB" PREKO JSON FAJLA (za dashboard: welcome/logging/embeds)
// =====================

const dbFile = path.join(__dirname, 'db.json');

function getDefaultData() {
  return {
    welcome: {
      channelId: '',
      message: 'Dobrodošao {user} na server!',
    },
    logging: {
      channelId: '',
    },
    embeds: [],
  };
}

function loadDb() {
  try {
    const raw = fs.readFileSync(dbFile, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...getDefaultData(), ...parsed };
  } catch {
    const def = getDefaultData();
    saveDb(def);
    return def;
  }
}

function saveDb(data) {
  fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));
}

// inicijaliziraj db.json ako ne postoji
saveDb(loadDb());

// =====================
//  EXPRESS + DASHBOARD
// =====================

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.DASHBOARD_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
  })
);

// 🧮 helper za lijepi uptime
function formatUptime(ms) {
  if (!ms) return 'N/A';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push('manje od 1 minute');
  return parts.join(' ');
}

// root -> /dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// glavni dashboard
app.get('/dashboard', async (req, res) => {
  const activeTab = req.query.tab || 'overview';

  let guild = null;
  try {
    guild = await client.guilds.fetch(guildId);
  } catch (e) {
    console.log('❌ Ne mogu fetchati guild:', guildId, e.message);
  }

  console.log(
    'Dashboard guild:',
    guild ? guild.name : 'NEMA GUILDA',
    'ID:',
    guildId
  );

  const botData = {
    tag: client.user ? client.user.tag : 'Bot offline',
    id: client.user ? client.user.id : 'N/A',
    avatar: client.user ? client.user.displayAvatarURL() : null,
    uptime: formatUptime(client.uptime),
    readyAt: client.readyAt || null,
  };

  const guildData = guild
    ? {
        name: guild.name,
        memberCount: guild.memberCount,
        id: guild.id,
      }
    : {
        name: 'Guild nije učitan',
        memberCount: 'N/A',
        id: guildId,
      };

  let channels = [];
  if (guild) {
    try {
      await guild.channels.fetch();

      channels = guild.channels.cache
        .filter(
          (c) =>
            c.type === ChannelType.GuildText ||
            c.type === ChannelType.GuildAnnouncement
        )
        .map((c) => ({
          id: c.id,
          name: c.name,
        }));
    } catch (e) {
      console.log('❌ Greška pri fetchanju kanala:', e.message);
    }
  }

  console.log('Broj kanala za dropdown:', channels.length);

  const config = loadDb();

  res.render('dashboard', {
    bot: botData,
    guild: guildData,
    config,
    activeTab,
    channels,
  });
});

// --------------- GREETINGS (WELCOME) ---------------
app.post('/dashboard/greetings', (req, res) => {
  const { welcomeChannelId, welcomeMessage } = req.body;

  const data = loadDb();
  data.welcome.channelId = welcomeChannelId || '';
  data.welcome.message =
    welcomeMessage && welcomeMessage.trim().length
      ? welcomeMessage
      : 'Dobrodošao {user} na server!';
  saveDb(data);

  res.redirect('/dashboard?tab=greetings');
});

// --------------- LOGGING ---------------
app.post('/dashboard/logging', (req, res) => {
  const { logChannelId } = req.body;

  const data = loadDb();
  data.logging.channelId = logChannelId || '';
  saveDb(data);

  res.redirect('/dashboard?tab=logging');
});

// --------------- EMBEDS ---------------
app.post('/dashboard/embeds', async (req, res) => {
  const {
    embedChannelId,
    title,
    description,
    color,
    footerText,
    footerIcon,
    thumbnailUrl,
    imageUrl,
    authorName,
    authorIcon,
    timestamp,
  } = req.body;

  try {
    const ch = await client.channels.fetch(embedChannelId);

    const embed = new EmbedBuilder();

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (color) embed.setColor(color);

    if (authorName || authorIcon) {
      embed.setAuthor({
        name: authorName || '',
        iconURL: authorIcon || null,
      });
    }

    if (footerText || footerIcon) {
      embed.setFooter({
        text: footerText || '',
        iconURL: footerIcon || null,
      });
    }

    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
    if (imageUrl) embed.setImage(imageUrl);

    if (timestamp === 'on') {
      embed.setTimestamp(new Date());
    }

    await ch.send({ embeds: [embed] });

    const data = loadDb();
    data.embeds.push({
      channelId: embedChannelId,
      title,
      description,
      color,
      footerText,
      footerIcon,
      thumbnailUrl,
      imageUrl,
      authorName,
      authorIcon,
      timestamp: timestamp === 'on',
      sentAt: new Date().toISOString(),
    });
    saveDb(data);

    res.redirect('/dashboard?tab=embeds');
  } catch (err) {
    console.error('Embed error:', err);
    res.status(500).send('Greška pri slanju embed-a: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Dashboard listening on port ${PORT}`);
});

// =====================
//  DISCORD BOT DIO
// =====================

// ❗ kategorija gdje idu tiketi
const TICKET_CATEGORY_ID = '1437220354992115912';

// ❗ kanal gdje idu AKTIVNI FARMING poslovi (npr. #posao-na-farmi)
const FS_JOB_CHANNEL_ID = '1442984129699254292';

// ❗ kanal gdje idu ZAVRŠENI poslovi (npr. #zavrseni-poslovi)
const FS_JOB_DONE_CHANNEL_ID = '1442951254287454399';

// mapa za FARMING zadatke (po korisniku)
const activeTasks = new Map(); // key: userId, value: { field: string | null }

console.log('▶ Pokrećem bota...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', () => {
  console.log(`✅ Bot je online kao ${client.user.tag}`);
});

client.on('error', (err) => {
  console.error('❌ Client error:', err);
});

// ============== WELCOME + LOGGING ==============
client.on('guildMemberAdd', async (member) => {
  const data = loadDb();
  const cfg = data.welcome;

  if (!cfg?.channelId || !cfg?.message) return;

  const ch = await client.channels.fetch(cfg.channelId).catch(() => null);
  if (!ch) return;

  const msg = cfg.message
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{username}/g, member.user.username);

  ch.send(msg).catch(() => {});

  if (data.logging?.channelId) {
    const logCh = await client.channels
      .fetch(data.logging.channelId)
      .catch(() => null);
    if (logCh) {
      logCh
        .send(`✅ Novi član: ${member.user.tag} (ID: ${member.id})`)
        .catch(() => {});
    }
  }
});

// ============== SLASH KOMANDE + INTERAKCIJE ==============
client.on('interactionCreate', async (interaction) => {
  // ---------- SLASH KOMANDE ----------
  if (interaction.isChatInputCommand()) {
    // /ticket-panel
    if (interaction.commandName === 'ticket-panel') {
      const embed = new EmbedBuilder()
        .setColor('#ffd000')
        .setTitle('Ticket system')
        .setDescription(
          'Molimo vas da pažljivo pročitate ovu poruku prije nego što otvorite tiket.\n\n' +
            '**Opcije:**\n' +
            '• **Igranje na serveru** – Zahtjev za pridruživanje serveru.\n' +
            '• **Žalba na igrače** – prijava igrača koji krši pravila servera.\n' +
            '• **Edit modova** – pomoć, ideje ili problemi vezani uz edit modova.\n\n' +
            '**Prije otvaranja tiketa**\n' +
            '1. Provjerite jeste li sve instalirali i podesili prema uputama.\n' +
            '2. Pokušajte sami riješiti problem i provjerite da nije do vaših modova ili klijenta.\n' +
            '3. Ako ne uspijete, otvorite tiket i detaljno opišite svoj problem.\n' +
            '4. Budite strpljivi – netko iz tima će vam se javiti čim bude moguće.\n\n' +
            '**Pravila tiketa:**\n' +
            '• Svi problemi moraju biti jasno i detaljno opisani, bez poruka tipa "ne radi".\n' +
            '• Poštujte članove staff tima.\n' +
            '• Ne pingajte staff bez razloga – netko će vam se javiti.\n' +
            '• Tiket bez odgovora korisnika 48h bit će zatvoren.\n' +
            '• Ne otvarajte tikete u pogrešnoj kategoriji.\n' +
            '• Kršenje pravila može rezultirati zatvaranjem tiketa ili sankcijama.'
        );

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category')
        .setPlaceholder('Odaberi vrstu tiketa')
        .addOptions(
          {
            label: 'Igranje na serveru',
            description:
              'Ako želiš igrati s nama samo otvori ticket i odgovori na pitanja.',
            value: 'igranje',
            emoji: '🎮',
          },
          {
            label: 'Žalba na igrače',
            description: 'Prijavi igrača koji krši pravila servera.',
            value: 'zalba',
            emoji: '⚠️',
          },
          {
            label: 'Edit modova',
            description: 'Ako trebaš pomoć ili savjet oko edita modova.',
            value: 'modovi',
            emoji: '🧩',
          }
        );

      const row = new ActionRowBuilder().addComponents(menu);

      await interaction.deferReply({ ephemeral: true });
      await interaction.deleteReply();

      const channel = interaction.channel;
      await channel.send({ embeds: [embed], components: [row] });
    }

    // /task-panel – Farming zadaci
    if (interaction.commandName === 'task-panel') {
      const embed = new EmbedBuilder()
        .setColor('#00a84d')
        .setTitle('🚜 Farming Simulator 25 – Kreiraj zadatak')
        .setDescription(
          'Klikni na gumb ispod kako bi započeo kreiranje novog zadatka.'
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('task_start')
          .setLabel('➕ Kreiraj posao')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.deferReply({ ephemeral: true });
      await interaction.deleteReply();

      const channel = interaction.channel;
      await channel.send({ embeds: [embed], components: [row] });
    }
  }

  // ---------- KREIRANJE TIKETA (dropdown) ----------
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === 'ticket_category'
  ) {
    const type = interaction.values[0];
    const guild = interaction.guild;
    const member = interaction.member;

    const channelName = `ticket-${type}-${member.user.username}`.toLowerCase();

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: SUPPORT_ROLE_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          // 🔹 pobrini se da BOT uvijek ima pristup ticket kanalu
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    let ticketMessage = '';

    switch (type) {
      case 'igranje':
        ticketMessage = [
          `🎮 Zdravo <@${member.id}>, hvala što si otvorio **Igranje na serveru** ticket.`,
          '',
          '# 🧾 Evo da skratimo stvari i ubrzamo proces',
          '',
          '**Imaš par pitanja pa čisto da vlasnik ne gubi vrijeme kad preuzme ovaj tiket.**',
          '',
          '- Koliko često planiraš da igraš na serveru? (npr. svakodnevno, par puta nedeljno...)',
          '- U koje vrijeme si najčešće aktivan? (npr. popodne, uveče, vikendom...)',
          '- Da li si spreman da poštuješ raspored i obaveze na farmi (npr. oranje, žetva, hranjenje stoke)?',
          '- Kako bi reagovao ako neko iz tima ne poštuje dogovor ili pravila igre?',
          '- Da li koristiš voice chat (Discord) tokom igre?',
          '- Da li si spreman da pomogneš drugim igračima (npr. novim članovima tima)?',
          '- Zašto želiš da igraš baš na hard serveru?',
          '',
          '🕹️ Kada odgovoriš na ova pitanja, neko iz tima će ti se ubrzo javiti.',
        ].join('\n');
        break;

      case 'zalba':
        ticketMessage =
          `⚠️ Zdravo <@${member.id}>, hvala što si otvorio **žalbu na igrače**.\n` +
          'Molimo te da navedeš:\n' +
          '• Ime igrača na kojeg se žališ\n' +
          '• Vrijeme i detaljan opis situacije\n' +
          '• Dokaze (slike, video, logovi) ako ih imaš.\n' +
          '👮 Moderatori će pregledati prijavu i javiti ti se.';
        break;

      case 'modovi':
        ticketMessage =
          `🧩 Zdravo <@${member.id}>, hvala što si otvorio **izrada modova** ticket.\n` +
          'Opiši kakav mod radiš ili s kojim dijelom imaš problem.\n' +
          '💡 Slobodno pošalji kod, ideju ili primjer – što više informacija daš, lakše ćemo pomoći.';
        break;

      default:
        ticketMessage =
          `👋 Zdravo <@${member.id}>, hvala što si otvorio ticket.\n` +
          'Molimo te da opišeš svoj problem što detaljnije.';
        break;
    }

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel('Preuzmi tiket')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Zatvori tiket')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content: ticketMessage,
      components: [buttons],
    });

    await interaction.reply({
      content: `Tvoj ticket je otvoren: ${channel}`,
      ephemeral: true,
    });
  }

  // ---------- BUTTONI (TICKETI + FARMING) ----------
  if (interaction.isButton()) {
    // === FARMING: START KREIRANJA POSLA ===
    if (interaction.customId === 'task_start') {
      activeTasks.set(interaction.user.id, { field: null });

      const FIELDS = [
        '5',
        '16',
        '17',
        '33',
        '34',
        '35',
        '36',
        '37',
        '6-7-8-11',
        '30-31',
        '2-3',
      ];

      const perRow = 5;
      const rows = [];

      for (let i = 0; i < FIELDS.length; i += perRow) {
        const row = new ActionRowBuilder();
        const slice = FIELDS.slice(i, i + perRow);

        for (const field of slice) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`task_field_${field}`)
              .setLabel(`Polje ${field}`)
              .setStyle(ButtonStyle.Secondary)
          );
        }

        rows.push(row);
      }

      const embed = new EmbedBuilder()
        .setColor('#00a84d')
        .setTitle('🚜 Kreiranje zadatka – Korak 1')
        .setDescription('Odaberi polje za koje želiš kreirati posao.');

      await interaction.reply({
        embeds: [embed],
        components: rows,
        ephemeral: true,
      });
      return;
    }

    // === FARMING: ODABIR POLJA ===
    if (interaction.customId.startsWith('task_field_')) {
      const fieldId = interaction.customId.replace('task_field_', '');

      const current = activeTasks.get(interaction.user.id) || {};
      current.field = fieldId;
      activeTasks.set(interaction.user.id, current);

      const embed = new EmbedBuilder()
        .setColor('#00a84d')
        .setTitle('🚜 Kreiranje zadatka – Korak 2')
        .setDescription(
          `Odabrano polje: **Polje ${fieldId}**\n\nSada odaberi vrstu posla:`
        );

      const jobsRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('task_job_oranje')
          .setLabel('Oranje')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('task_job_lajn')
          .setLabel('Bacanje lajma')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('task_job_djubrenje')
          .setLabel('Đubrenje')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('task_job_tanjiranje')
          .setLabel('Tanjiranje')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('task_job_podrivanje')
          .setLabel('Podrivanje')
          .setStyle(ButtonStyle.Primary)
      );

      const jobsRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('task_job_herbicid')
          .setLabel('Herbicid')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('task_job_kosnja_trave')
          .setLabel('Košnja trave')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('task_job_kosnja_djeteline')
          .setLabel('Košnja djeteline')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('task_job_kombajniranje_modal') // kombajniranje ide na modal
          .setLabel('Kombajniranje')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('task_job_sijanje')
          .setLabel('Sijanje')
          .setStyle(ButtonStyle.Success)
      );

      const jobsRow3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('task_job_malciranje')
          .setLabel('Malčiranje')
          .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
          .setCustomId('task_job_spajanje')
          .setLabel('Spajaanje polja')
          .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
          .setCustomId('task_job_baliranje')
          .setLabel('Baliranje')
          .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
          .setCustomId('task_job_skupljanje')
          .setLabel('Skupljanje u redove')
          .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
          .setCustomId('task_job_okretanje')
          .setLabel('Prevrtanje trave / djeteline')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.update({
        embeds: [embed],
        components: [jobsRow1, jobsRow2, jobsRow3],
      });
      return;
    }

    // === FARMING: ODABIR POSLA (sve osim sijanja i kombajniranja s modalom) ===
    if (
      interaction.customId.startsWith('task_job_') &&
      interaction.customId !== 'task_job_sijanje' &&
      interaction.customId !== 'task_job_kombajniranje_modal'
    ) {
      const current = activeTasks.get(interaction.user.id);
      if (!current || !current.field) {
        await interaction.reply({
          content:
            '⚠️ Nije pronađeno polje. Pokušaj ponovno klikom na „Kreiraj posao“.',
          ephemeral: true,
        });
        return;
      }

      const jobKey = interaction.customId.replace('task_job_', '');
      const jobNames = {
        oranje: 'Oranje',
        lajn: 'Bacanje lajma',
        djubrenje: 'Đubrenje',
        tanjiranje: 'Tanjiranje',
        podrivanje: 'Podrivanje',
        herbicid: 'Prskanje herbicidom',
        kosnja_trave: 'Košnja trave',
        kosnja_djeteline: 'Košnja djeteline',
        malciranje: 'Malčiranje',
        spajanje: 'Spajaanje polja',
        baliranje: 'Baliranje',
        skupljanje: 'Skupljanje u redove',
        okretanje: 'Prevrtanje trave / djeteline',
      };
      const jobName = jobNames[jobKey] || jobKey;

      const embed = new EmbedBuilder()
        .setColor('#00a84d')
        .setTitle('✅ Novi zadatak kreiran')
        .addFields(
          { name: 'Polje', value: `Polje ${current.field}`, inline: true },
          { name: 'Posao', value: jobName, inline: true },
          { name: 'Izradio', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setTimestamp();

      const doneRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('task_done')
          .setLabel('✅ Zadatak završen')
          .setStyle(ButtonStyle.Success)
      );

      const jobChannel = await interaction.guild.channels.fetch(
        FS_JOB_CHANNEL_ID
      );

      await interaction.reply({
        content: '✅ Zadatak je kreiran i objavljen u kanalu za poslove.',
        ephemeral: true,
      });

      await jobChannel.send({
        embeds: [embed],
        components: [doneRow],
      });

      activeTasks.delete(interaction.user.id);
      return;
    }

    // === FARMING: Sijanje – otvaranje modala ===
    if (interaction.customId === 'task_job_sijanje') {
      const current = activeTasks.get(interaction.user.id);
      if (!current || !current.field) {
        await interaction.reply({
          content:
            '⚠️ Nije pronađeno polje. Pokušaj ponovno klikom na „Kreiraj posao“.',
          ephemeral: true,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId('task_sowing_modal')
        .setTitle('Sijanje – unos kulture');

      const input = new TextInputBuilder()
        .setCustomId('seed_name')
        .setLabel('Što se sije? (npr. kukuruz, ječam...)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      await interaction.showModal(modal);
      return;
    }

    // === FARMING: Kombajniranje – otvaranje modala ===
    if (interaction.customId === 'task_job_kombajniranje_modal') {
      const current = activeTasks.get(interaction.user.id);
      if (!current || !current.field) {
        await interaction.reply({
          content:
            '⚠️ Nije pronađeno polje. Pokušaj ponovno klikom na „Kreiraj posao“.',
          ephemeral: true,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId('task_harvest_modal')
        .setTitle('Kombajniranje – unos detalja');

      const input = new TextInputBuilder()
        .setCustomId('harvest_info')
        .setLabel('Što se kombajnira? (npr. pšenica, soja...)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      await interaction.showModal(modal);
      return;
    }

    // === FARMING: označi zadatak kao završen ===
    if (interaction.customId === 'task_done') {
      const oldEmbed = interaction.message.embeds[0];

      if (!oldEmbed) {
        await interaction.reply({
          content: '⚠️ Ne mogu pronaći podatke o zadatku.',
          ephemeral: true,
        });
        return;
      }

      const finishedEmbed = EmbedBuilder.from(oldEmbed)
        .setColor('#9aa53bff')
        .setTitle('✅ Zadatak završen')
        .setFooter({
          text: 'Označeno kao završeno od strane: ' + interaction.user.tag,
        });

      const doneChannel = await interaction.guild.channels.fetch(
        FS_JOB_DONE_CHANNEL_ID
      );

      await doneChannel.send({ embeds: [finishedEmbed] });

      await interaction.reply({
        content:
          '✅ Zadatak je označen kao završen i prebačen u kanal za završene poslove.',
        ephemeral: true,
      });

      await interaction.message.delete().catch(() => {});

      return;
    }

    // === TICKET DUGMAD: CLAIM & CLOSE ===
    if (
      interaction.customId === 'ticket_claim' ||
      interaction.customId === 'ticket_close'
    ) {
      const hasStaffPerms = interaction.member.permissions.has(
        PermissionFlagsBits.ManageChannels
      );

      if (!hasStaffPerms) {
        return interaction.reply({
          content: '⛔ Samo staff/admin može koristiti ovu opciju.',
          ephemeral: true,
        });
      }

      if (interaction.customId === 'ticket_claim') {
        await interaction.reply({
          content: `✅ Ticket je preuzeo/la ${interaction.user}.`,
        });
        return;
      }

      if (interaction.customId === 'ticket_close') {
        await interaction.reply({
          content: '🔒 Ticket je zatvoren. Kanal je označen kao zatvoren.',
          ephemeral: true,
        });

        if (!interaction.channel.name.startsWith('closed-')) {
          await interaction.channel.setName(
            `closed-${interaction.channel.name}`
          );
        }

        return;
      }
    }
  }

  // ---------- MODALI (SIJANJE + KOMBAJNIRANJE) ----------
  if (interaction.isModalSubmit()) {
    // Sijanje
    if (interaction.customId === 'task_sowing_modal') {
      const current = activeTasks.get(interaction.user.id);
      if (!current || !current.field) {
        await interaction.reply({
          content:
            '⚠️ Ne mogu pronaći odabrano polje. Pokušaj ponovno od početka.',
          ephemeral: true,
        });
        return;
      }

      const seedName = interaction.fields.getTextInputValue('seed_name');

      const embed = new EmbedBuilder()
        .setColor('#00a84d')
        .setTitle('✅ Novi zadatak kreiran')
        .addFields(
          { name: 'Polje', value: `Polje ${current.field}`, inline: true },
          { name: 'Posao', value: 'Sijanje', inline: true },
          { name: 'Kultura', value: seedName, inline: true },
          { name: 'Izradio', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setTimestamp();

      const doneRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('task_done')
          .setLabel('✅ Zadatak završen')
          .setStyle(ButtonStyle.Success)
      );

      const jobChannel = await interaction.guild.channels.fetch(
        FS_JOB_CHANNEL_ID
      );

      await interaction.reply({
        content:
          '✅ Zadatak za sijanje je kreiran i objavljen u kanalu za poslove.',
        ephemeral: true,
      });

      await jobChannel.send({
        embeds: [embed],
        components: [doneRow],
      });

      activeTasks.delete(interaction.user.id);
      return;
    }

    // Kombajniranje
    if (interaction.customId === 'task_harvest_modal') {
      const current = activeTasks.get(interaction.user.id);
      if (!current || !current.field) {
        await interaction.reply({
          content:
            '⚠️ Ne mogu pronaći odabrano polje. Pokušaj ponovno od početka.',
          ephemeral: true,
        });
        return;
      }

      const harvestInfo = interaction.fields.getTextInputValue('harvest_info');

      const embed = new EmbedBuilder()
        .setColor('#00a84d')
        .setTitle('✅ Novi zadatak kreiran')
        .addFields(
          { name: 'Polje', value: `Polje ${current.field}`, inline: true },
          { name: 'Posao', value: 'Kombajniranje', inline: true },
          { name: 'Detalji', value: harvestInfo, inline: true },
          { name: 'Izradio', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setTimestamp();

      const doneRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('task_done')
          .setLabel('✅ Zadatak završen')
          .setStyle(ButtonStyle.Success)
      );

      const jobChannel = await interaction.guild.channels.fetch(
        FS_JOB_CHANNEL_ID
      );

      await interaction.reply({
        content:
          '✅ Zadatak za kombajniranje je kreiran i objavljen u kanalu za poslove.',
        ephemeral: true,
      });

      await jobChannel.send({
        embeds: [embed],
        components: [doneRow],
      });

      activeTasks.delete(interaction.user.id);
      return;
    }
  }
});

client.login(token).catch((err) => {
  console.error('❌ Login error:', err);
});