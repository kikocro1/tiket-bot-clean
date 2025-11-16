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
} = require('discord.js');

// 🔹 ENV varijable
const token  = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId  = process.env.GUILD_ID?.trim();

const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID; // koristimo ga dolje u ticketima

// =====================
//  "DB" PREKO JSON FAJLA
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
    embeds: [], // povijest poslanih embedova
  };
}

function loadDb() {
  try {
    const raw = fs.readFileSync(dbFile, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...getDefaultData(), ...parsed };
  } catch {
    // ako nema fajla ili je pokvaren
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

const app  = express();
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

// root samo preusmjerava na /dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// glavni dashboard
app.get('/dashboard', async (req, res) => {
  const activeTab = req.query.tab || 'overview';

  // 1) uvijek probaj svježe fetchati guild po ID-u
  let guild = null;
  try {
    guild = await client.guilds.fetch(guildId);
  } catch (e) {
    console.log('❌ Ne mogu fetchati guild:', guildId, e.message);
  }

  console.log('Dashboard guild:', guild ? guild.name : 'NEMA GUILDA', 'ID:', guildId);

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

  // 2) fetchaj kanale da sigurno popuniš cache
  let channels = [];
  if (guild) {
    try {
      await guild.channels.fetch(); // 🔹 ovdje se puni cache

      channels = guild.channels.cache
        .filter(c =>
          c.type === ChannelType.GuildText ||
          c.type === ChannelType.GuildAnnouncement
        )
        .map(c => ({
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
    timestamp
  } = req.body;

  try {
    const ch = await client.channels.fetch(embedChannelId);

    const embed = new EmbedBuilder();

    if (title)        embed.setTitle(title);
    if (description)  embed.setDescription(description);
    if (color)        embed.setColor(color);

    if (authorName || authorIcon) {
      embed.setAuthor({
        name: authorName || '',
        iconURL: authorIcon || null
      });
    }

    if (footerText || footerIcon) {
      embed.setFooter({
        text: footerText || '',
        iconURL: footerIcon || null
      });
    }

    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
    if (imageUrl)     embed.setImage(imageUrl);

    if (timestamp === 'on') {
      embed.setTimestamp(new Date());
    }

    await ch.send({ embeds: [embed] });

    // spremi u povijest
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

// ❗ OVDJE UPIŠI SVOJE ID-OVE:
const TICKET_CATEGORY_ID = '1437220354992115912'; // kategorija gdje idu tiketi

console.log('▶ Pokrećem bota...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // za guildMemberAdd
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
      logCh.send(`✅ Novi član: ${member.user.tag} (ID: ${member.id})`).catch(
        () => {},
      );
    }
  }
});

// ============== SLASH KOMANDA /ticket-panel ==============
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
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
            '• Kršenje pravila može rezultirati zatvaranjem tiketa ili sankcijama.',
        );

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category')
        .setPlaceholder('Odaberi vrstu tiketa')
        .addOptions(
          {
            label: 'Igranje na serveru',
            description:
              'Ako želis igrati s nama samo otvori ticket i odgovori na pitanja.',
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
          },
        );

      const row = new ActionRowBuilder().addComponents(menu);

      await interaction.deferReply({ ephemeral: true });
      await interaction.deleteReply();

      const channel = interaction.channel;
      await channel.send({ embeds: [embed], components: [row] });
    }
  }

  // ============== KREIRANJE TIKETA (dropdown) ==============
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === 'ticket_category'
  ) {
    const type = interaction.values[0]; // igranje / zalba / modovi
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
          id: SUPPORT_ROLE_ID, // iz .env
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
      ],
    });

    let ticketMessage = '';

    switch (type) {
      case 'igranje':
        ticketMessage = [
          `🎮 Zdravo ${member}, hvala što si otvorio **Igranje na serveru** ticket.`,
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
          `⚠️ Zdravo ${member}, hvala što si otvorio **žalbu na igrače**.\n` +
          'Molimo te da navedeš:\n' +
          '• Ime igrača na kojeg se žališ\n' +
          '• Vrijeme i detaljan opis situacije\n' +
          '• Dokaze (slike, video, logovi) ako ih imaš.\n' +
          '👮 Moderatori će pregledati prijavu i javiti ti se.';
        break;

      case 'modovi':
        ticketMessage =
          `🧩 Zdravo ${member}, hvala što si otvorio **izrada modova** ticket.\n` +
          'Opiši kakav mod radiš ili s kojim dijelom imaš problem.\n' +
          '💡 Slobodno pošalji kod, ideju ili primjer – što više informacija daš, lakše ćemo pomoći.';
        break;

      default:
        ticketMessage =
          `👋 Zdravo ${member}, hvala što si otvorio ticket.\n` +
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
        .setStyle(ButtonStyle.Danger),
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

  // ============== DUGMAD: CLAIM & CLOSE ==============
  if (interaction.isButton()) {
    const hasStaffPerms =
      interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

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
        await interaction.channel.setName(`closed-${interaction.channel.name}`);
      }

      return;
    }
  }
});

client.login(token).catch((err) => {
  console.error('❌ Login error:', err);
});
