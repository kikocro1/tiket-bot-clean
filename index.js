// 🔹 prvo učitaj .env
require('dotenv').config();

// 🔹 moduli
const path = require('path');
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
const guildId  = process.env.GUILD_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID; // koristimo ga dolje u ticketima

// =====================
//  EXPRESS + DASHBOARD
// =====================

const app  = express();
const PORT = process.env.PORT || 3000;

// ako želiš kasnije EJS, dodaš ovo i instaliraš ejs
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.DASHBOARD_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
  })
);

// basic health-check / home
app.get('/', (req, res) => {
  res.send('Dashboard is running!');
});

// jednostavna dashboard ruta (za sad samo tekst)
app.get('/dashboard', (req, res) => {
  res.send('Dashboard page');
});

app.listen(PORT, () => {
  console.log(`🌐 Dashboard listening on port ${PORT}`);
});

// =====================
//  DISCORD BOT DIO
// =====================

// ❗ OVDJE UPIŠI SVOJE ID-OVE:
const TICKET_CATEGORY_ID = '1437220354992115912';   // kategorija gdje idu tiketi
// SUPPORT_ROLE_ID uzimamo iz .env (gore) – isti onaj koji si stavio na Railway / .env
// (Developer Mode ON → desni klik na kategoriju/rolu → Copy ID)

console.log('▶ Pokrećem bota...');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`✅ Bot je online kao ${client.user.tag}`);
});

client.on('error', (err) => {
  console.error('❌ Client error:', err);
});

// ============== SLASH KOMANDA /ticket-panel ==============
client.on('interactionCreate', async interaction => {
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
          '• Kršenje pravila može rezultirati zatvaranjem tiketa ili sankcijama.'
        );

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category')
        .setPlaceholder('Odaberi vrstu tiketa')
        .addOptions(
          {
            label: 'Igranje na serveru',
            description: 'Ako želis igrati s nama samo otvori ticket i odgovori na pitanja.',
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
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category') {
    const type   = interaction.values[0]; // igranje / zalba / modovi
    const guild  = interaction.guild;
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
        ticketMessage =
          `🎮 Zdravo ${member}, hvala što si otvorio **Igranje na serveru** ticket.\n\n` +
          '# 🧾 Evo da skratimo stvari i ubrzamo proces\n\n' +
          '**Imaš par pitanja pa čisto da vlasnik ne gubi vrijeme kad preuzme ovaj tiket.**\n\n' +
          '- Koliko često planiraš da igraš na serveru? (npr. svakodnevno, par puta nedeljno...)\n' +
          '- U koje vrijeme si najčešće aktivan? (npr. popodne, uveče, vikendom...)\n' +
          '- Da li si spreman da poštuješ raspored i obaveze na farmi (npr. oranje, žetva, hranjenje stoke)?\n' +
          '- Kako bi reagovao ako neko iz tima ne poštuje dogovor ili pravila igre?\n' +
          '- Da li koristiš voice chat (Discord) tokom igre?\n' +
          '- Da li si spreman da pomogneš drugim igračima (npr. novim članovima tima)?\n' +
          '- Zašto želiš da igraš baš na hard serveru?\n\n' +
          '🕹️ Kada odgovoriš na ova pitanja, neko iz tima će ti se ubrzo javiti.';
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
    const hasStaffPerms = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

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

client.login(token).catch(err => {
  console.error('❌ Login error:', err);
});
