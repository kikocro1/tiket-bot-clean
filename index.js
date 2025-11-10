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

const { token } = require('./config.json');

// ❗ OVDJE UPIŠI SVOJE ID-OVE:
const TICKET_CATEGORY_ID = '1437220354992115912';   // npr. '123456789012345678'
const SUPPORT_ROLE_ID    = '863814372610146314'; // npr. '987654321098765432'
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

client.on('interactionCreate', async interaction => {
  // ============== SLASH KOMANDA /ticket-panel ==============
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

      // 🔻 ovo uklanja sivu poruku "korisnik upotrebio /ticket-panel"
      await interaction.deferReply({ ephemeral: true }); // privremeni "nevidljivi" odgovor
      await interaction.deleteReply();                   // obriše taj odgovor

      const channel = interaction.channel;
      await channel.send({ embeds: [embed], components: [row] });
    }
  }

  // ============== KREIRANJE TIKETA (dropdown) ==============
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category') {
    const type = interaction.values[0]; // igranje / zalba / modovi
    const guild = interaction.guild;
    const member = interaction.member;

    const channelName = `ticket-${type}-${member.user.username}`.toLowerCase();

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID, // 🔹 svi tiketi idu u ovu kategoriju
      permissionOverwrites: [
        {
          id: guild.roles.everyone, // svi ostali ne vide
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: SUPPORT_ROLE_ID, // Support tim vidi sve tikete
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: member.id, // korisnik koji je otvorio tiket
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    // prilagođena poruka ovisno o tipu
    let ticketMessage = '';

    switch (type) {
      case 'igranje': 
        ticketMessage =
          `🎮 Zdravo ${member}, hvala što si otvorio **Igranje na serveru** ticket.\n\n` +
          '# 🧾 Evo da skratimo stvari i ubrzamo proces\n\n' +
          '**Imaš par pitanja pa čisto da **vlasnik** ne gubi vrijeme kad preuzme ovaj tiket.**\n\n' +
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

    // dugmad: PREUZMI i ZATVORI
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

    // PREUZMI TIKET
    if (interaction.customId === 'ticket_claim') {
      await interaction.reply({
        content: `✅ Ticket je preuzeo/la ${interaction.user}.`,
      });
      return;
    }

    // ZATVORI TIKET (samo preimenuje u closed-...)
    if (interaction.customId === 'ticket_close') {
      await interaction.reply({
        content: '🔒 Ticket je zatvoren. Kanal je označen kao zatvoren.',
        ephemeral: true,
      });

      if (!interaction.channel.name.startsWith('closed-')) {
        await interaction.channel.setName(`closed-${interaction.channel.name}`);
      }

      // ovdje po želji možeš premjestiti kanal u arhiva kategoriju:
      // const ARCHIVE_CATEGORY_ID = 'OVDJE_ID_ARHIVA_KATEGORIJE';
      // await interaction.channel.setParent(ARCHIVE_CATEGORY_ID);

      return;
    }
  }
});

client.login(token).catch(err => {
  console.error('❌ Login error:', err);
});
