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

const { version } = require("discord.js");
console.log("🔍 Discord.js verzija:", version);


// 🔹 ENV varijable
const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID?.trim();

const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID; // rola za support
// secret za Farming Server webhooks
const FS_WEBHOOK_SECRET = process.env.FS_WEBHOOK_SECRET;

// =====================
//  "DB" PREKO JSON FAJLA (za dashboard: welcome/logging/embeds/tickets)
// =====================

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const dbFile = path.join(dbDir, 'db.json');


// default postavke za ticket sistem (za dashboard)
const DEFAULT_TICKET_SYSTEM = {
  logChannelId: '',               // gdje idu transkripti
  categoryId: '',                 // kategorija za tikete
  supportRoleId: '',              // support rola (ako želiš override env-a)
  autoCloseHours: 48,             // nakon koliko sati neaktivnosti se auto zatvara
  reminderHours: 3,               // svakih koliko MINUTA ide podsjetnik (mi ćemo ga tretirati kao minute)
  types: {
    igranje: {
      title: 'Igranje na serveru',
      questions: [
        'Koliko često planiraš da igraš na serveru?',
        'U koje vrijeme si najčešće aktivan?',
        'Da li si spreman da poštuješ raspored i obaveze na farmi?',
        'Kako bi reagovao ako neko iz tima ne poštuje dogovor ili pravila igre?',
        'Da li koristiš voice chat (Discord) tokom igre?',
        'Da li si spreman da pomogneš drugim igračima?',
        'Zašto želiš da igraš baš na hard serveru?',
      ],
    },
    zalba: {
      title: 'Žalba na igrače',
      questions: [
        'Ime igrača na kojeg se žališ?',
        'Vrijeme i detaljan opis situacije?',
        'Imaš li dokaze (slike, video, log)?',
      ],
    },
    modovi: {
      title: 'Edit modova',
      questions: [
        'Na čemu trenutno radiš?',
        'Koji je konkretan problem?',
        'Koji editor / verziju igre koristiš?',
      ],
    },
  },
  messages: {
    reminder:
      'Hej {user}! 😊\n' +
      'Još uvijek nisi odgovorio na pitanja iz prve poruke u tiketu.\n\n' +
      'Molimo te da se vratiš na početnu poruku i odgovoriš na sva pitanja, ' +
      'kako bismo mogli nastaviti s procesom.',
    autoClose:
      'Ticket je automatski zatvoren jer 48 sati nije bilo aktivnosti. ' +
      'Ako i dalje trebaš pomoć, slobodno otvori novi ticket. 🙂',
  },
};

// 🔹 default polja za Farming zadatke (prebacujemo iz koda u db.json)
const DEFAULT_FARMING_FIELDS = [
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
  '24-23',
];

// default sezonski podaci za sjetvu
const DEFAULT_SOWING_SEASONS = [];


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
    ticketSystem: JSON.parse(JSON.stringify(DEFAULT_TICKET_SYSTEM)),
    // 🔹 ovdje ćemo spremati aktivne/završene FS zadatke (da ih možemo naći po polju)
    farmingTasks: [],
    farmingFields: [...DEFAULT_FARMING_FIELDS],
    sowingSeasons: [...DEFAULT_SOWING_SEASONS],   // ✅ OVO NEDOSTAJE
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

// helper: vraća ticket config = default + ono što je u db.json
function getTicketConfig() {
  const data = loadDb();
  const cfg = data.ticketSystem || {};

  const merged = {
    // ako u configu nema ID, koristi hard-coded konstante niže (TICKET_CATEGORY_ID / TICKET_LOG_CHANNEL_ID)
    logChannelId: cfg.logChannelId || TICKET_LOG_CHANNEL_ID || DEFAULT_TICKET_SYSTEM.logChannelId,
    categoryId: cfg.categoryId || TICKET_CATEGORY_ID || DEFAULT_TICKET_SYSTEM.categoryId,
    supportRoleId: cfg.supportRoleId || SUPPORT_ROLE_ID || DEFAULT_TICKET_SYSTEM.supportRoleId,
    autoCloseHours:
      typeof cfg.autoCloseHours === 'number'
        ? cfg.autoCloseHours
        : DEFAULT_TICKET_SYSTEM.autoCloseHours,
    reminderHours:
      typeof cfg.reminderHours === 'number'
        ? cfg.reminderHours
        : DEFAULT_TICKET_SYSTEM.reminderHours,
    types: {
      igranje: {
        ...DEFAULT_TICKET_SYSTEM.types.igranje,
        ...(cfg.types?.igranje || {}),
      },
      zalba: {
        ...DEFAULT_TICKET_SYSTEM.types.zalba,
        ...(cfg.types?.zalba || {}),
      },
      modovi: {
        ...DEFAULT_TICKET_SYSTEM.types.modovi,
        ...(cfg.types?.modovi || {}),
      },
    },
    messages: {
      reminder:
        cfg.messages?.reminder || DEFAULT_TICKET_SYSTEM.messages.reminder,
      autoClose:
        cfg.messages?.autoClose || DEFAULT_TICKET_SYSTEM.messages.autoClose,
    },
  };

  return merged;
}

// helper: vraća listu polja za Farming zadatke
function getFarmingFields() {
  const data = loadDb();
  const arr = data.farmingFields;
  if (Array.isArray(arr) && arr.length) {
    return arr.map(String);
  }
  return [...DEFAULT_FARMING_FIELDS];
}

// helper: spremi polja u db.json
function saveFarmingFields(fields) {
  const data = loadDb();
  data.farmingFields = Array.from(new Set(fields.map(String)));
  saveDb(data);
}

// =====================
//  SOWING SEASON SYSTEM – DB + HELPERS
// =====================

// ID kanala gdje ide živa embed poruka
const SOWING_SEASON_CHANNEL_ID = "1437698436068671528";

// učitaj ili kreiraj listu sezona
function getSowingSeasons() {
  const data = loadDb();

  if (!Array.isArray(data.sowingSeasons)) {
    data.sowingSeasons = [];
    saveDb(data); // ← ključna linija
  }

  return data.sowingSeasons;
}


function saveSowingSeasons(list) {
  const data = loadDb();
  data.sowingSeasons = list;
  saveDb(data);
}

// kreira praznu novu sezonu
function createNewSeason() {
  const seasons = getSowingSeasons();
  const number = seasons.length + 1;

  const newSeason = {
    season: number,
    messageId: null,
    completed: false,
    fields: {}, // "36": "ječam"
    createdAt: Date.now(),
  };

  seasons.push(newSeason);
  saveSowingSeasons(seasons);

  return newSeason;
}

// uzmi aktivnu sezonu ili kreiraj novu
function getActiveSeason() {
    const seasons = getSowingSeasons();

    if (!seasons.length) {
        const created = createNewSeason();
        return created;
    }

    const last = seasons[seasons.length - 1];

    if (last.completed) {
        const newSeason = createNewSeason();
        return newSeason;
    }

    return last;
}


// generisanje progress bara
function makeSeasonProgressBar(current, total) {
  const percent = Math.round((current / total) * 100);
  const filledCount = Math.round(percent / 10);
  const emptyCount = 10 - filledCount;
  return "▰".repeat(filledCount) + "▱".repeat(emptyCount) + ` ${percent}%`;
}

// update ili kreiranje embed poruke u sezoni
async function updateSeasonEmbed(guild, forceEmpty = false) {
  const season = getActiveSeason();
  const fields = getFarmingFields();
  const total = fields.length;
  const sownCount = Object.keys(season.fields).length;

  const channel = await guild.channels
    .fetch(SOWING_SEASON_CHANNEL_ID)
    .catch(() => null);

  if (!channel) return;

  // -------------------------------------------------------
  // 1️⃣ FORCE RESET MODE → prazan embed bez polja
  // -------------------------------------------------------
  if (forceEmpty === true) {
    const emptyEmbed = new EmbedBuilder()
      .setColor("#3ba55d")
      .setTitle(`🌾 Sezona Sjetve #${season.season}`)
      .setDescription("_Još nema posijanih polja..._")
      .addFields({
        name: "Progres",
        value: `0/${total}\n${makeSeasonProgressBar(0, total)}`
      })
      .setTimestamp();

    // Ako embed postoji, osvježi ga
    if (season.messageId) {
      const msg = await channel.messages.fetch(season.messageId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [emptyEmbed] });
        return;
      }
    }

    // ili kreiraj novi embed ako ga nema
    const sent = await channel.send({ embeds: [emptyEmbed] });
    season.messageId = sent.id;

    const seasons = getSowingSeasons();
    const idx = seasons.findIndex(s => s.season === season.season);
    if (idx !== -1) {
      seasons[idx] = season;
      saveSowingSeasons(seasons);
    }

    return;
  }

  // -------------------------------------------------------
  // 2️⃣ NORMALNI MODE → prikaz samo posijanih polja
  // -------------------------------------------------------
  const lines = [];

  for (const f of fields) {
    if (season.fields[f]) {
      lines.push(`**Polje ${f}** — ${season.fields[f]}`);
    }
  }


  if (lines.length === 0) {
    lines.push("_Još nema posijanih polja..._");
  }


  const progress = makeSeasonProgressBar(sownCount, total);

  const embed = new EmbedBuilder()
    .setColor("#3ba55d")
    .setTitle(`🌾 Sezona Sjetve #${season.season}`)
    .setDescription(lines.join("\n"))
    .addFields({
      name: "Progres",
      value: `${sownCount}/${total}\n${progress}`,
    })
    .setTimestamp();

  // Ako embed još ne postoji — kreiraj ga
  if (!season.messageId) {
    const sent = await channel.send({ embeds: [embed] });
    season.messageId = sent.id;

    const seasons = getSowingSeasons();
    const idx = seasons.findIndex(s => s.season === season.season);
    if (idx !== -1) {
      seasons[idx] = season;
      saveSowingSeasons(seasons);
    }
    return;
  }

  // Inače — osvježi embed
  const msg = await channel.messages.fetch(season.messageId).catch(() => null);

  if (!msg) {
    const sent = await channel.send({ embeds: [embed] });
    season.messageId = sent.id;

    const seasons = getSowingSeasons();
    const idx = seasons.findIndex(s => s.season === season.season);
    if (idx !== -1) {
      seasons[idx] = season;
      saveSowingSeasons(seasons);
    }

    return;
  }

  await msg.edit({ embeds: [embed] });

  // Završetak sezone
  if (sownCount >= total && !season.completed) {
    season.completed = true;
    saveSowingSeasons(getSowingSeasons());

    const doneEmbed = EmbedBuilder.from(embed)
      .setColor("#ffcc00")
      .setTitle(`🌾 Sezona Sjetve #${season.season} — ✔ Završena`);

    await msg.edit({ embeds: [doneEmbed] });


    createNewSeason();
  }
}

// =====================
//  SOWING – Upis polja u sezonu
// =====================
async function handleNewSowingTask(guild, field, cropName) {
    const seasons = getSowingSeasons();
    let season = getActiveSeason();

    // pronađi pravi season objekt
    const idx = seasons.findIndex(s => s.season === season.season);
    if (idx === -1) {
        console.log("⚠️ Sezona nije pronađena u listi!");
        return;
    }

    // upis kulture
    seasons[idx].fields[field] = cropName;

    // spremi u db.json
    saveSowingSeasons(seasons);

    console.log(`🌱 Upis sjetve → Sezona ${season.season}, Polje ${field}: ${cropName}`);

    // osvježavanje embeda
    await updateSeasonEmbed(guild);
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
// za JSON body (webhookovi s FS servera)
app.use(express.json());

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

// --------------- TICKET SYSTEM CONFIG ---------------
app.post('/dashboard/tickets', (req, res) => {
  const data = loadDb();
  const ts = data.ticketSystem || { ...DEFAULT_TICKET_SYSTEM };

  const {
    ticketLogChannelId,
    ticketCategoryId,
    ticketSupportRoleId,
    autoCloseHours,
    reminderHours,
    igranjeQuestions,
    zalbaQuestions,
    modoviQuestions,
    reminderMessage,
    autoCloseMessage,
  } = req.body;

  ts.logChannelId = ticketLogChannelId || '';
  ts.categoryId = ticketCategoryId || '';
  ts.supportRoleId = ticketSupportRoleId || '';

  ts.autoCloseHours = Number(autoCloseHours) || DEFAULT_TICKET_SYSTEM.autoCloseHours;
  ts.reminderHours = Number(reminderHours) || DEFAULT_TICKET_SYSTEM.reminderHours;

  // pitanja: svaki red u textarea = jedno pitanje
  ts.types.igranje.questions = (igranjeQuestions || '')
    .split('\n')
    .map((q) => q.trim())
    .filter(Boolean);

  ts.types.zalba.questions = (zalbaQuestions || '')
    .split('\n')
    .map((q) => q.trim())
    .filter(Boolean);

  ts.types.modovi.questions = (modoviQuestions || '')
    .split('\n')
    .map((q) => q.trim())
    .filter(Boolean);

  ts.messages.reminder = reminderMessage || DEFAULT_TICKET_SYSTEM.messages.reminder;
  ts.messages.autoClose = autoCloseMessage || DEFAULT_TICKET_SYSTEM.messages.autoClose;

  data.ticketSystem = ts;
  saveDb(data);

  res.redirect('/dashboard?tab=tickets');
});


// =====================
//  FS WEBHOOK – helper za provjeru secreta
// =====================
function checkFsSecret(req, res) {
  const sent =
    req.headers['x-fs-secret'] ||
    req.headers['x-fs25-secret'] ||
    (req.body && req.body.secret);

  if (!FS_WEBHOOK_SECRET) {
    console.warn('⚠️ FS_WEBHOOK_SECRET nije postavljen u .env – odbijam zahtjev.');
    res.status(500).json({ ok: false, error: 'secret_not_configured' });
    return false;
  }

  if (!sent) {
    console.warn('⚠️ FS webhook: secret nije poslan u headeru/body-u.');
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return false;
  }

  if (sent !== FS_WEBHOOK_SECRET) {
    console.warn(
      '⚠️ FS webhook: neispravan secret. serverLen=%d, sentLen=%d',
      FS_WEBHOOK_SECRET.length,
      String(sent).length
    );
    res.status(403).json({ ok: false, error: 'invalid_secret' });
    return false;
  }

  return true;
}


// =====================
//  FS TELEMETRY – helper funkcije (emoji, progress bar, boje, embed)
// =====================

function makeProgressBar(percent, size = 10) {
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const filled = Math.round((p / 100) * size);
  const empty = size - filled;
  const fullChar = '█';
  const emptyChar = '░';
  return fullChar.repeat(filled) + emptyChar.repeat(empty);
}

function pickVehicleEmoji(typeName = '') {
  const t = typeName.toLowerCase();
  if (t.includes('combine')) return '🌾';
  if (t.includes('truck') || t.includes('lkw')) return '🚚';
  if (t.includes('trailer')) return '🚛';
  if (t.includes('car') || t.includes('pickup')) return '🚙';
  if (t.includes('telehandler') || t.includes('loader')) return '🚧';
  return '🚜';
}

function pickColorFromVehicle(v) {
  if (!v) return 0x2f3136;
  const dmg = v.damage?.damagePercent ?? 0;
  const broken = v.damage?.isBroken;

  if (broken || dmg >= 80) return 0xff0000;      // crveno – razbijen
  if (dmg >= 40) return 0xffa500;                // narančasto – dosta oštećen
  if (v.isOnAI) return 0xffe000;                 // žuto – AI ga vozi
  if (v.isRunning) return 0x57f287;              // zeleno – motor radi
  return 0x5865f2;                               // default Discord plava
}

function createTelemetryEmbed(telemetry) {
  const v = telemetry?.vehicles?.[0];

  if (!v) {
    return new EmbedBuilder()
      .setTitle('FS25 TELEMETRY')
      .setDescription('Nije pronađen nijedan aktivni stroj u telemetriji.')
      .setColor(0x2f3136);
  }

  const emoji = pickVehicleEmoji(v.typeName);
  const mapName = telemetry.mapName || 'Lunow';

  const speed = `${v.speedKph ?? 0} km/h`;
  const direction = v.direction || '-';

  const fieldId = v.field?.fieldId;
  const farmlandId = v.field?.farmlandId;
  const fieldText = v.field?.isOnField
    ? (fieldId ? `F${fieldId}` : farmlandId ? `farmland ${farmlandId}` : 'na polju')
    : 'izvan polja';

  // fill info – uzimamo prvi spremnik ako postoji
  const fill = v.fills?.[0];
  const fillPercent = fill?.percent ?? 0;
  const fillTitle = fill?.title || 'Prazno';
  const fillLine = `${fillPercent}% ${fillTitle}`;

  // gorivo
  const fuelPercent = v.fuel?.fuelPercent ?? 0;
  const defPercent = v.fuel?.defPercent ?? null;
  const fuelType = (v.fuel?.fuelType || 'fuel').toUpperCase();

  const fuelBar = makeProgressBar(fuelPercent, 12);
  const defBar = defPercent != null ? makeProgressBar(defPercent, 12) : null;

  // damage
  const damagePercent = v.damage?.damagePercent ?? 0;
  const damageBar = makeProgressBar(damagePercent, 12);

  const isRunning = v.isRunning ? 'ON' : 'OFF';
  const aiText = v.isOnAI ? 'DA' : 'NE';
  const controlledText = v.isControlled ? 'Igrač' : (v.isOnAI ? 'AI' : 'Nije');

  const playerName = v.playerName || 'Nepoznat';
  const farmName = v.farmName || `Farm ${v.farmId ?? '?'}`;

  // 🔹 PRVA LINIJA – sve u jednom redu:
  // "CLAAS TRION 750 | 8 km/h | F112 | 54% Corn"
  const summaryLine =
    `${emoji} ${v.vehicleName || 'Vozilo'} | ` +
    `${speed} | ` +
    `${fieldText} | ` +
    `📦 ${fillLine}`;

  const embed = new EmbedBuilder()
    .setTitle(`FS25 TELEMETRY | ${mapName}`)
    .setDescription(summaryLine)
    .setColor(pickColorFromVehicle(v))
    .addFields(
      {
        name: 'Vozilo',
        value: [
          `**Naziv:** ${v.vehicleName || 'Nepoznato'}`,
          `**Tip:** ${v.typeName || '-'}`,
          `**Igrač:** ${playerName}`,
          `**Farma:** ${farmName}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Status',
        value: [
          `**Motor:** ${isRunning}`,
          `**Smjer:** ${direction}`,
          `**Brzina:** ${speed}`,
          `**AI:** ${aiText}`,
          `**Kontrola:** ${controlledText}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Gorivo 🛢️',
        value: [
          `**${fuelType}:** ${fuelPercent}%`,
          fuelBar,
          defBar != null ? `**DEF:** ${defPercent}%\n${defBar}` : null,
        ].filter(Boolean).join('\n'),
        inline: true,
      },
      {
        name: 'Šteta',
        value: [
          `**Stanje:** ${damagePercent}%`,
          damageBar,
          v.damage?.isBroken ? '⚠️ **Vozilo je pokvareno!**' : '',
        ].filter(Boolean).join('\n'),
        inline: true,
      },
      {
        name: 'Spremnici 📦',
        value: fill
          ? [
              `**${fillTitle}:** ${fillPercent}%`,
              makeProgressBar(fillPercent, 18),
              `${Math.round(fill.level || 0)}/${Math.round(fill.capacity || 0)} L`,
            ].join('\n')
          : 'Nema aktivnog punjenja.',
        inline: false,
      },
      {
        name: 'Pozicija 🧭',
        value: [
          `X: ${v.worldPosition?.x?.toFixed(1) ?? '-'}`,
          `Z: ${v.worldPosition?.z?.toFixed(1) ?? '-'}`,
          `Y: ${v.worldPosition?.y?.toFixed(1) ?? '-'}`,
          `Polje: ${fieldText}`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({
      text: `${telemetry.modName || 'FS25_DiscordBridge'} • ${new Date().toLocaleString('hr-HR')}`,
    });

  return embed;
}

// =====================
//  FS WEBHOOK – test ruta
// =====================
app.post('/fs/test', (req, res) => {
  if (!checkFsSecret(req, res)) return;

  console.log('🔗 [FS TEST] Primljen payload:', req.body);

  res.json({ ok: true, received: req.body });
});

// =====================
//  FS WEBHOOK – TELEMETRY -> DISCORD EMBED
// =====================
app.post('/fs/telemetry', async (req, res) => {
  if (!checkFsSecret(req, res)) return;

  const body = req.body || {};
  const telemetry = body.telemetry || body;

  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      console.warn('⚠️ /fs/telemetry: guild nije učitan.');
      return res.status(500).json({ ok: false, error: 'guild_not_loaded' });
    }

    const channel = await client.channels
      .fetch(FS_TELEMETRY_CHANNEL_ID)
      .catch(() => null);

    if (!channel) {
      console.warn('⚠️ /fs/telemetry: kanal za telemetriju nije podešen.');
      return res
        .status(500)
        .json({ ok: false, error: 'telemetry_channel_not_configured' });
    }

    const vehicles = Array.isArray(telemetry.vehicles)
      ? telemetry.vehicles
      : [];

    // Ako nema vozila – simple embed
    if (vehicles.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0x2f3136)
        .setTitle('FS25 TELEMETRY')
        .setDescription('Nije pronađen nijedan aktivni stroj u telemetriji.')
        .setTimestamp(new Date());

      await channel.send({ embeds: [embed] });
      return res.json({ ok: true, sent: true, vehicles: 0 });
    }

    // Inače koristimo naš fancy helper s emoji + progress barovima
    const embed = createTelemetryEmbed(telemetry);
    await channel.send({ embeds: [embed] });

    return res.json({
      ok: true,
      sent: true,
      vehicles: vehicles.length,
    });
  } catch (err) {
    console.error('❌ Greška u /fs/telemetry:', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});




// =====================
//  FS – pomoćne funkcije za zadatke (DB)
// =====================

// spremi / update jednog zadatka u db.json
function saveFarmingTask(record) {
  const data = loadDb();
  if (!Array.isArray(data.farmingTasks)) data.farmingTasks = [];

  // ako već postoji isti messageId → update
  const idx = data.farmingTasks.findIndex(
    (t) => t.messageId === record.messageId
  );

  if (idx !== -1) {
    data.farmingTasks[idx] = { ...data.farmingTasks[idx], ...record };
  } else {
    data.farmingTasks.push(record);
  }

  saveDb(data);
}

// pronađi zadatak po polju koji je još "open"
function findOpenTaskByField(field) {
  const data = loadDb();
  if (!Array.isArray(data.farmingTasks)) return null;

  // tražimo od kraja (najnoviji)
  for (let i = data.farmingTasks.length - 1; i >= 0; i--) {
    const t = data.farmingTasks[i];
    if (t.field === field && t.status === 'open') return t;
  }
  return null;
}

// označi zadatak kao završen + prebaci embed u "završene poslove"
// ili kreiraj novi završen zadatak ako ne postoji
async function finishTaskFromFsUpdate(field, payload) {
  const task = findOpenTaskByField(field);
  const finishedBy = payload.player || 'FS Server';
  const status = payload.status || 'finished';
  const jobFromFs = payload.job || null;

  // dohvatimo guild (tvoj glavni)
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;

  const jobChannel = await client.channels
    .fetch(FS_JOB_CHANNEL_ID)
    .catch(() => null);
  const doneChannel = await client.channels
    .fetch(FS_JOB_DONE_CHANNEL_ID)
    .catch(() => null);

  if (!doneChannel) return false;

  // ako nema spremljenog zadatka za ovo polje
  if (!task || !jobChannel) {
    const jobName = jobFromFs || `Posao sa FS (${status})`;

    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('✅ Zadatak (auto iz FS)')
      .addFields(
        { name: 'Polje', value: `Polje ${field}`, inline: true },
        { name: 'Posao', value: jobName, inline: true },
        { name: 'Završio', value: finishedBy, inline: true }
      )
      .setTimestamp();

    const msg = await doneChannel.send({ embeds: [embed] });

    saveFarmingTask({
      field,
      jobName,
      status: 'done',
      fromFs: true,
      channelId: doneChannel.id,
      messageId: msg.id,
      createdBy: null,
      createdAt: new Date().toISOString(),
      finishedBy,
      finishedAt: new Date().toISOString(),
    });

    console.log(
      `✅ FS: Nije pronađen aktivni zadatak za polje ${field}, kreiran novi "završen" zadatak.`
    );

    return true;
  }

  // imamo otvoreni zadatak u kanalu za poslove → dohvatimo stari embed
  const msg = await jobChannel.messages
    .fetch(task.messageId)
    .catch(() => null);
  if (!msg || !msg.embeds[0]) return false;

  const oldEmbed = msg.embeds[0];

  const finishedEmbed = EmbedBuilder.from(oldEmbed)
    .setColor('#ff0000')
    .setTitle('✅ Zadatak završen (FS)')
    .setFooter({
      text: 'Označeno kao završeno od strane: ' + finishedBy,
    })
    .setTimestamp();

  await doneChannel.send({ embeds: [finishedEmbed] });
  await msg.delete().catch(() => {});

  // update u db
  const data = loadDb();
  if (!Array.isArray(data.farmingTasks)) data.farmingTasks = [];
  const idx = data.farmingTasks.findIndex(
    (t) => t.messageId === task.messageId
  );
  if (idx !== -1) {
    data.farmingTasks[idx].status = 'done';
    data.farmingTasks[idx].finishedBy = finishedBy;
    data.farmingTasks[idx].finishedAt = new Date().toISOString();
    saveDb(data);
  }

  console.log(
    `✅ FS: Zadatak za polje ${field} automatski označen kao završen.`
  );

  return true;
}

// =====================
//  FS WEBHOOK – field update (auto završavanje posla)
// =====================
app.post('/fs/field-update', async (req, res) => {
  if (!checkFsSecret(req, res)) return;

  const payload = req.body || {};
  const field = String(payload.field || '').trim();
  const status = String(payload.status || '').toLowerCase();

  console.log('🌾 [FS FIELD UPDATE]', payload);

  if (!field) {
    return res.status(400).json({ ok: false, error: 'missing_field' });
  }

  const FINISHED_STATUSES = ['finished', 'done', 'harvested', 'completed'];

  if (!FINISHED_STATUSES.includes(status)) {
    return res.json({ ok: true, ignored: true, reason: 'status_not_finished' });
  }

  try {
    const success = await finishTaskFromFsUpdate(field, payload);
    if (!success) {
      return res.status(404).json({
        ok: false,
        error: 'no_task_and_failed_to_create',
      });
    }

    // 🌾 Ako FS završi posao koji je sijanje, zabilježi ga u sezoni
try {
  const crop = payload.crop || payload.seed || null;

  if (crop) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      await handleNewSowingTask(guild, field, crop);
    }
  }
} catch (e) {
  console.log("⚠️ Greška pri upisu FS sjetve u sezonu:", e);
}


    return res.json({ ok: true, finished: true });
  } catch (err) {
    console.error('❌ Greška u /fs/field-update:', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Dashboard listening on port ${PORT}`);
});

// =====================
//  DISCORD BOT DIO
// =====================

// ❗ kategorija gdje idu tiketi (default, može se override-ati u dashboardu)
const TICKET_CATEGORY_ID = '1437220354992115912';

// ❗ kanal gdje ide TRANSKRIPT zatvorenih tiketa  (default, može se override-ati u dashboardu)
const TICKET_LOG_CHANNEL_ID = '1437218054718095410';

// ❗ kanal gdje idu AKTIVNI FARMING poslovi (npr. #posao-na-farmi)
const FS_JOB_CHANNEL_ID = '1442984129699254292';

// ❗ kanal gdje idu ZAVRŠENI poslovi (npr. #zavrseni-poslovi)
const FS_JOB_DONE_CHANNEL_ID = '1442951254287454399';

// ❗ kanal gdje idu FS25 TELEMETRY logovi (embed s vozilom)
const FS_TELEMETRY_CHANNEL_ID = process.env.FS_TELEMETRY_CHANNEL_ID || '';

// mapa za FARMING zadatke (po korisniku)
const activeTasks = new Map(); // key: userId, value: { field: string | null }

// === mapa za ticket REMINDER-e (kanal -> intervalId) ===
const ticketReminders = new Map();

// === mapa za AUTO-CLOSE tiketa (kanal -> timeoutId) ===
const ticketInactivity = new Map();

console.log('▶ Pokrećem bota...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, // za messageCreate
  ],
});

client.once('ready', async () => {
  console.log(`✅ Bot je online kao ${client.user.tag}`);

  // 🌾 AUTOMATSKO OBNAVLJANJE SEZONE SJETVE PRI STARTU BOTA
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      await updateSeasonEmbed(guild);
      console.log("🌾 Sezona Sjetve — embed obnovljen pri startu bota.");
    }
  } catch (err) {
    console.log("⚠️ Greška pri obnavljanju Sezone Sjetve:", err);
  }
});


client.on('error', (err) => {
  console.error('❌ Client error:', err);
});

// === helperi za reminder ===
function stopTicketReminder(channelId) {
  const intervalId = ticketReminders.get(channelId);
  if (intervalId) {
    clearInterval(intervalId);
    ticketReminders.delete(channelId);
  }
}

function startTicketReminder(channel, userId) {
  stopTicketReminder(channel.id);

  const cfg = getTicketConfig();
  // reminderHours sada tretiramo kao MINUTE
  const intervalMs = (cfg.reminderHours || 3) * 60 * 1000;

  const intervalId = setInterval(async () => {
    try {
      const ch = await channel.client.channels.fetch(channel.id).catch(() => null);
      if (!ch || ch.deleted) {
        stopTicketReminder(channel.id);
        return;
      }

      if (ch.name.startsWith('closed-')) {
        stopTicketReminder(channel.id);
        return;
      }

      const text = (cfg.messages.reminder || DEFAULT_TICKET_SYSTEM.messages.reminder)
        .replace(/{user}/g, `<@${userId}>`);

      await ch.send({ content: text });
    } catch (err) {
      console.error('Greška pri slanju ticket remindera:', err);
    }
  }, intervalMs);

  ticketReminders.set(channel.id, intervalId);
}

// === helperi za AUTO-CLOSE nakon X sati ===
function stopTicketInactivity(channelId) {
  const timeoutId = ticketInactivity.get(channelId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    ticketInactivity.delete(channelId);
  }
}

function startTicketInactivity(channel) {
  stopTicketInactivity(channel.id);

  const cfg = getTicketConfig();
  const timeoutMs = (cfg.autoCloseHours || 48) * 60 * 60 * 1000;

  const timeoutId = setTimeout(async () => {
    try {
      const ch = await channel.client.channels.fetch(channel.id).catch(() => null);
      if (!ch || ch.deleted) {
        stopTicketInactivity(channel.id);
        return;
      }

      // ako je već ručno zatvoren
      if (ch.name.startsWith('closed-')) {
        stopTicketInactivity(channel.id);
        return;
      }

      const guild = ch.guild;
      const topic = ch.topic || '';
      const match = topic.match(/Ticket owner:\s*(\d+)/i);
      const ticketOwnerId = match ? match[1] : null;

      const msgText =
        (cfg.messages.autoClose || DEFAULT_TICKET_SYSTEM.messages.autoClose);

      await ch.send(msgText).catch(() => {});

      // preimenuj
      if (!ch.name.startsWith('closed-')) {
        await ch.setName(`closed-${ch.name}`).catch(() => {});
      }

      // zaključaj permisije
      await ch.permissionOverwrites
        .edit(guild.roles.everyone, {
          SendMessages: false,
          AddReactions: false,
        })
        .catch(() => {});

      if (ticketOwnerId) {
        await ch.permissionOverwrites
          .edit(ticketOwnerId, {
            SendMessages: false,
            AddReactions: false,
          })
          .catch(() => {});
      }

      if (SUPPORT_ROLE_ID) {
        await ch.permissionOverwrites
          .edit(SUPPORT_ROLE_ID, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          })
          .catch(() => {});
      }

      await ch.permissionOverwrites
        .edit(ch.client.user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        })
        .catch(() => {});

      // pošalji transkript (bot kao "zatvorio")
      await sendTicketTranscript(ch, ch.client.user);

      // ugasi i reminder ako postoji
      stopTicketReminder(ch.id);

      // obriši kanal nakon 10 sekundi
      setTimeout(() => {
        ch.delete().catch(() => {});
      }, 10_000);
    } catch (err) {
      console.error('Greška u auto-close tiketa:', err);
    } finally {
      stopTicketInactivity(channel.id);
    }
  }, timeoutMs);

  ticketInactivity.set(channel.id, timeoutId);
}

// === helper za transkript tiketa ===
async function sendTicketTranscript(channel, closedByUser) {
  const cfg = getTicketConfig();
  const logId = cfg.logChannelId;
  if (!logId) return;

  try {
    const logChannel = await channel.client.channels
      .fetch(logId)
      .catch(() => null);
    if (!logChannel) return;

    let allMessages = [];
    let lastId;

    while (true) {
      const fetched = await channel.messages.fetch({
        limit: 100,
        before: lastId,
      });

      if (fetched.size === 0) break;

      allMessages.push(...Array.from(fetched.values()));
      lastId = fetched.last().id;

      if (allMessages.length >= 1000) break;
    }

    allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const lines = allMessages.map((msg) => {
      const time = new Date(msg.createdTimestamp).toLocaleString('hr-HR');
      const author = `${msg.author.tag} (${msg.author.id})`;
      const content = msg.content || '';
      return `[${time}] ${author}: ${content}`;
    });

    const transcriptText =
      lines.join('\n') || 'Nema poruka u ovom tiketu.';

    const buffer = Buffer.from(transcriptText, 'utf-8');

    await logChannel.send({
      content: `📝 Transkript zatvorenog tiketa: ${channel.name}\nZatvorio: ${closedByUser.tag}`,
      files: [{ attachment: buffer, name: `transkript-${channel.id}.txt` }],
    });
  } catch (err) {
    console.error('Greška pri slanju transkripta:', err);
  }
}

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

// ============== MESSAGE CREATE (tiketi: reminder + inactivity) ==============
client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  const channel = message.channel;

  // ako je ovo tiket koji pratimo za inactivity → reset Xh timera
  if (ticketInactivity.has(channel.id)) {
    startTicketInactivity(channel);
  }

  // ako nema reminder za ovaj kanal, dalje nas ništa ne zanima
  if (!ticketReminders.has(channel.id)) return;

  const topic = channel.topic || '';
  const match = topic.match(/Ticket owner:\s*(\d+)/i);
  const ticketOwnerId = match ? match[1] : null;

  if (!ticketOwnerId) return;
  if (message.author.id !== ticketOwnerId) return;

  // vlasnik tiketa je odgovorio → zaustavi reminder
  stopTicketReminder(channel.id);
});

// ============== SLASH KOMANDE + INTERAKCIJE ==============
client.on('interactionCreate', async (interaction) => {

// ==========================================
//  PROTECTION LAYER (Railway fake interactions)
// ==========================================
if (!interaction || !interaction.user || !interaction.guild) {
    return; // tiho ignoriraj
}

// Ako interakcija ne podržava showModal (hosting glitch) – tiho ignoriši
if (interaction.isModalSubmit && typeof interaction.showModal !== "function") {
    return;
}


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
        .setColor('#ffd900')
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

    // /add-field value:<string>
    if (interaction.commandName === 'add-field') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          content: '⛔ Samo staff/admin može dodavati nova polja.',
          ephemeral: true,
        });
      }

      const value = interaction.options.getString('value', true).trim();

      if (!value) {
        return interaction.reply({
          content: '⚠️ Moraš upisati oznaku polja (npr. `56-276`).',
          ephemeral: true,
        });
      }

      const fields = getFarmingFields();
      if (fields.includes(value)) {
        return interaction.reply({
          content: `⚠️ Polje **${value}** već postoji u listi.`,
          ephemeral: true,
        });
      }

      fields.push(value);
      saveFarmingFields(fields);

      return interaction.reply({
        content: `✅ Polje **${value}** je dodano u listu. Dostupno je u task-panelu.`,
        ephemeral: true,
      });
    }

    // /remove-field value:<string>
    if (interaction.commandName === 'remove-field') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          content: '⛔ Samo staff/admin može brisati polja.',
          ephemeral: true,
        });
      }

      const value = interaction.options.getString('value', true).trim();
      const fields = getFarmingFields();
      const index = fields.indexOf(value);

      if (index === -1) {
        return interaction.reply({
          content: `⚠️ Polje **${value}** nije pronađeno u listi.`,
          ephemeral: true,
        });
      }

      fields.splice(index, 1);
      saveFarmingFields(fields);

      return interaction.reply({
        content: `🗑️ Polje **${value}** je uklonjeno iz liste.`,
        ephemeral: true,
      });
    }

    // /list-fields
    if (interaction.commandName === 'list-fields') {
      const fields = getFarmingFields();

      if (!fields.length) {
        return interaction.reply({
          content: 'Lista polja je trenutno prazna.',
          ephemeral: true,
        });
      }

      return interaction.reply({
        content:
          '📋 Trenutna polja za Farming zadatke:\n' +
          fields.map((f) => `• ${f}`).join('\n'),
        ephemeral: true,
      });
    }

    // /field-panel – poruka s gumbom za dodavanje polja
    if (interaction.commandName === 'field-panel') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          content: '⛔ Samo staff/admin može postaviti ovaj panel.',
          ephemeral: true,
        });
      }
      

      const embed = new EmbedBuilder()
        .setColor('#3ba55d')
        .setTitle('🧑‍🌾 Upravljanje poljima')
        .setDescription(
          'Ovdje možeš dodati nova polja za Farming zadatke.\n\n' +
          'Klikni na gumb ispod, unesi oznaku polja (npr. `56-276`) i bot će ga spremiti.\n' +
          'Ta polja se automatski koriste u **task-panel** sistemu.'
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('field_add_button')
          .setLabel('➕ Dodaj novo polje')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    // /reset-season – resetira aktivnu sezonu sjetve
if (interaction.commandName === 'reset-season') {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: '⛔ Nemaš permisije za reset sezone.',
      ephemeral: true,
    });
  }


  const seasons = getSowingSeasons();
  const active = getActiveSeason();

  // 1️⃣ Resetiramo polja
  active.fields = {};
  active.completed = false;

  // 2️⃣ Zapišemo nazad u DB
  const index = seasons.findIndex(s => s.season === active.season);
  seasons[index] = active;
  saveSowingSeasons(seasons);

  // 3️⃣ Očistimo embed totalno
  await updateSeasonEmbed(interaction.guild, true);

  return interaction.reply({
    content: '🔄 Sezona resetirana! Živi embed je očišćen.',
    ephemeral: true,
  });
}

// /update-field
if (interaction.customId === "update_field_step1") {
    const oldField = interaction.fields.getTextInputValue("old_field").trim();
    const fields = getFarmingFields();

    if (!fields.includes(oldField)) {
        return interaction.reply({
            content: `❌ Polje **${oldField}** ne postoji u listi.`,
            ephemeral: true,
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`update_field_step2_${oldField}`)
        .setTitle("Uredi polje – Korak 2");

    const input = new TextInputBuilder()
        .setCustomId("new_field")
        .setLabel(`Novo ime za polje ${oldField}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    // KEY FIX
    await interaction.deferUpdate();
    return interaction.showModal(modal);
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

    const cfg = getTicketConfig();
    const typeCfg = cfg.types[type];

    const channelName = `ticket-${type}-${member.user.username}`.toLowerCase();

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: cfg.categoryId || TICKET_CATEGORY_ID,
      topic: `Ticket owner: ${member.id} | Type: ${type}`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: cfg.supportRoleId || SUPPORT_ROLE_ID,
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
        if (typeCfg && typeCfg.questions?.length) {
          ticketMessage = [
            `🎮 Zdravo <@${member.id}>, hvala što si otvorio **${typeCfg.title || 'Igranje na serveru'}** ticket.`,
            '',
            '# 🧾 Evo da skratimo stvari i ubrzamo proces',
            '',
            '**Odgovori na sljedeća pitanja:**',
            '',
            ...typeCfg.questions.map((q) => `- ${q}`),
            '',
            '🕹️ Kada odgovoriš na ova pitanja, neko iz tima će ti se ubrzo javiti.',
          ].join('\n');
        } else {
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
        }
        break;

      case 'zalba':
        if (typeCfg && typeCfg.questions?.length) {
          ticketMessage = [
            `⚠️ Zdravo <@${member.id}>, hvala što si otvorio **${typeCfg.title || 'žalbu na igrače'}** ticket.`,
            '',
            '**Molimo te da odgovoriš na sljedeća pitanja:**',
            '',
            ...typeCfg.questions.map((q) => `- ${q}`),
            '',
            '👮 Moderatori će pregledati prijavu i javiti ti se.',
          ].join('\n');
        } else {
          ticketMessage =
            `⚠️ Zdravo <@${member.id}>, hvala što si otvorio **žalbu na igrače**.\n` +
            'Molimo te da navedeš:\n' +
            '• Ime igrača na kojeg se žališ\n' +
            '• Vrijeme i detaljan opis situacije\n' +
            '• Dokaze (slike, video, logovi) ako ih imaš.\n' +
            '👮 Moderatori će pregledati prijavu i javiti ti se.';
        }
        break;

      case 'modovi':
        if (typeCfg && typeCfg.questions?.length) {
          ticketMessage = [
            `🧩 Zdravo <@${member.id}>, hvala što si otvorio **${typeCfg.title || 'izrada modova'}** ticket.`,
            '',
            '**Kako bismo ti lakše pomogli, odgovori na sljedeća pitanja:**',
            '',
            ...typeCfg.questions.map((q) => `- ${q}`),
            '',
            '💡 Što više informacija daš, lakše ćemo pomoći.',
          ].join('\n');
        } else {
          ticketMessage =
            `🧩 Zdravo <@${member.id}>, hvala što si otvorio **izrada modova** ticket.\n` +
            'Opiši kakav mod radiš ili s kojim dijelom imaš problem.\n' +
            '💡 Slobodno pošalji kod, ideju ili primjer – što više informacija daš, lakše ćemo pomoći.';
        }
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

    // pokreni automatski podsjetnik
    startTicketReminder(channel, member.id);
    // pokreni i inactivity auto-close
    startTicketInactivity(channel);

    await interaction.reply({
      content: `Tvoj ticket je otvoren: ${channel}`,
      ephemeral: true,
    });
  }

  // ---------- BUTTONI (TICKETI + FARMING) ----------
  if (interaction.isButton()) {
    // === FARMING: dugme za dodavanje polja (iz field-panel poruke) ===
    if (interaction.customId === 'field_add_button') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          content: '⛔ Samo staff/admin može dodavati polja.',
          ephemeral: true,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('field_add_modal')
        .setTitle('Dodavanje novog polja');

      const input = new TextInputBuilder()
        .setCustomId('field_value')
        .setLabel('Oznaka polja (npr. 56-276)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      await interaction.showModal(modal);
      return;
    }

    // === FARMING: START KREIRANJA POSLA ===
    if (interaction.customId === 'task_start') {
      activeTasks.set(interaction.user.id, { field: null });

      const FIELDS = getFarmingFields();
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
        .setColor('#ffd900')
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
          .setCustomId('task_job_kombajniranje_modal')
          .setLabel('Kombajniranje')
          .setStyle(ButtonStyle.Success),
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
          .setLabel('Spajanje polja')
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

      const jobsRow4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('task_job_zamotavanje')
          .setLabel('Zamotati bale za silažu')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('task_job_zimska')
          .setLabel('Zimska brazda')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('task_job_ceste')
          .setLabel('Čišćenje ceste')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('task_job_rolanje')
          .setLabel('Rolanje polja')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.update({
        embeds: [embed],
        components: [jobsRow1, jobsRow2, jobsRow3, jobsRow4],
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
        spajanje: 'Spajanje polja',
        baliranje: 'Baliranje',
        skupljanje: 'Skupljanje u redove',
        okretanje: 'Prevrtanje trave / djeteline',
        zamotavanje: 'Zamotati bale za silažu',
        zimska: 'Zimska brazda',
        ceste: 'Čišćenje ceste',
        rolanje: 'Rolanje polja',
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
          .setLabel('✅ Završi zadatak')
          .setStyle(ButtonStyle.Success)
      );

      const jobChannel = await interaction.guild.channels.fetch(
        FS_JOB_CHANNEL_ID
      );

      await interaction.reply({
        content: '✅ Zadatak je kreiran i objavljen u kanalu za poslove.',
        ephemeral: true,
      });

      const sentMsg = await jobChannel.send({
        embeds: [embed],
        components: [doneRow],
      });

      saveFarmingTask({
        field: current.field,
        jobKey,
        jobName,
        status: 'open',
        fromFs: false,
        channelId: jobChannel.id,
        messageId: sentMsg.id,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString(),
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

    // === FARMING: označi zadatak kao završen ručno ===
if (interaction.customId === 'task_done') {
  const oldEmbed = interaction.message.embeds[0];

  if (!oldEmbed) {
    await interaction.reply({
      content: '⚠️ Ne mogu pronaći podatke o zadatku.',
      ephemeral: true,
    });
    return;
  }

  // 🔍 PRONAĐI ZADATAK U DB-u PO PORUKI
  const db = loadDb();
  const task = db.farmingTasks.find(t => t.messageId === interaction.message.id);

  // 🌾 Ako je ovo bio zadatak SIJANJA → upis u sezonu
  if (task && task.jobKey === 'sijanje') {
    const cropName = task.cropName || task.jobName || "nepoznato";

    // 🔧 FIX – upiši cropName u DB ako nedostaje
if (!task.cropName) {
    task.cropName = cropName;
    saveDb(db);
}


    try {
    console.log("➡ Pokrećem ručni upis sjetve u sezonu...");
    await handleNewSowingTask(interaction.guild, task.field, cropName);
    console.log(`🌾 Ručno završavanje sjetve → Polje ${task.field}: ${cropName}`);

    // 🔥 PRISILNI REFRESH EMBEDA
    await updateSeasonEmbed(interaction.guild);
    console.log("🌾 Embed sezone ručno osvježen.");
} catch (err) {
    console.error("❌ Greška pri ručnom upisu sjetve:", err);
}

  }

  // 🔄 GENERIRAJ NOVI EMBED O ZAVRŠETKU
  const finishedEmbed = EmbedBuilder.from(oldEmbed)
    .setColor('#ff0000')
    .setTitle('✅ Zadatak završen')
    .setFooter({
      text: 'Označeno kao završeno od strane: ' + interaction.user.tag,
    })
    .setTimestamp();

  const doneChannel = await interaction.guild.channels.fetch(FS_JOB_DONE_CHANNEL_ID);

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

      // svaki put kad staff dira tiket, ugasi reminder i inactivity
      stopTicketReminder(interaction.channel.id);
      stopTicketInactivity(interaction.channel.id);

      const channel = interaction.channel;
      const guild = interaction.guild;

      const topic = channel.topic || '';
      const match = topic.match(/Ticket owner:\s*(\d+)/i);
      const ticketOwnerId = match ? match[1] : null;

      if (interaction.customId === 'ticket_claim') {
        await interaction.reply({
          content: `✅ Ticket je preuzeo/la ${interaction.user}.`,
        });
        return;
      }

      if (interaction.customId === 'ticket_close') {
        await interaction.reply({
          content: '🔒 Ticket je zatvoren. A kanal je označen kao zatvoren.',
          ephemeral: true,
        });

        if (!channel.name.startsWith('closed-')) {
          await channel.setName(`closed-${channel.name}`).catch(() => {});
        }

        await channel.permissionOverwrites.edit(guild.roles.everyone, {
          SendMessages: false,
          AddReactions: false,
        }).catch(() => {});

        if (ticketOwnerId) {
          await channel.permissionOverwrites.edit(ticketOwnerId, {
            SendMessages: false,
            AddReactions: false,
          }).catch(() => {});
        }

        if (SUPPORT_ROLE_ID) {
          await channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          }).catch(() => {});
        }

        await channel.permissionOverwrites.edit(client.user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        }).catch(() => {});

        await sendTicketTranscript(channel, interaction.user);

        setTimeout(() => {
          channel.delete().catch(() => {});
        }, 10_000);

        return;
      }
    }
  }

  // ---------- MODALI (FIELD ADD + SIJANJE + KOMBAJNIRANJE + UPDATE FIELD) ----------
if (interaction.isModalSubmit()) {

    // === UPDATE FIELD – STEP 1 ===
    if (interaction.customId === "update_field_step1") {
        const oldField = interaction.fields.getTextInputValue("old_field").trim();
        const fields = getFarmingFields();

        if (!fields.includes(oldField)) {
            return interaction.reply({
                content: `❌ Polje **${oldField}** ne postoji u listi.`,
                ephemeral: true,
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`update_field_step2_${oldField}`)
            .setTitle("Uredi polje – Korak 2");

        const input = new TextInputBuilder()
            .setCustomId("new_field")
            .setLabel(`Novo ime za polje ${oldField}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));

        return interaction.showModal(modal);
    }

    // === DODAVANJE POLJA (field_add_modal) ===
    if (interaction.customId === 'field_add_modal') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: '⛔ Samo staff/admin može dodavati polja.',
                ephemeral: true,
            });
        }

        const value = interaction.fields.getTextInputValue('field_value').trim();

        if (!value) {
            return interaction.reply({
                content: '⚠️ Moraš upisati oznaku polja.',
                ephemeral: true,
            });
        }

        const fields = getFarmingFields();

        if (fields.includes(value)) {
            return interaction.reply({
                content: `⚠️ Polje **${value}** već postoji u listi.`,
                ephemeral: true,
            });
        }

        fields.push(value);
        saveFarmingFields(fields);

        return interaction.reply({
            content: `✅ Polje **${value}** je dodano u listu. Dostupno je u task-panelu.`,
            ephemeral: true,
        });
    }


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

      // 🌱 Sezona Sjetve – registracija novog posijanog polja
      await handleNewSowingTask(interaction.guild, current.field, seedName);


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

      const sentMsg = await jobChannel.send({
        embeds: [embed],
        components: [doneRow],
      });

      saveFarmingTask({
        field: current.field,
        jobKey: 'sijanje',
        jobName: 'Sijanje',
        cropName: seedName,
        status: 'open',
        fromFs: false,
        channelId: jobChannel.id,
        messageId: sentMsg.id,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString(),
      });

      activeTasks.delete(interaction.user.id);
      return;
    }

    // === UPDATE FIELD – STEP 2 (kompletan rename sistema) ===
if (interaction.customId.startsWith("update_field_step2_")) {
    const oldField = interaction.customId.replace("update_field_step2_", "");
    const newField = interaction.fields.getTextInputValue("new_field").trim();

    // === 1) Učitaj listu polja
    const fields = getFarmingFields();
    const index = fields.indexOf(oldField);

    if (index === -1) {
        return interaction.reply({
            content: `❌ Greška: polje **${oldField}** više ne postoji.`,
            ephemeral: true,
        });
    }

    if (fields.includes(newField)) {
        return interaction.reply({
            content: `⚠️ Polje **${newField}** već postoji.`,
            ephemeral: true,
        });
    }

    // zamijeni u listi polja
    fields[index] = newField;
    saveFarmingFields(fields);

    // === 2) Učitaj DB jer mijenjamo još stvari
    const db = loadDb();

    // === 3) Update u svim farmingTasks
    for (const t of db.farmingTasks) {
        if (t.field === oldField) {
            t.field = newField;
        }
    }

    // odmah spremi
    saveDb(db);


    // === 4) Update embed poruka zadataka (aktivni + završeni)
    async function updateTaskEmbeds() {
        const guild = interaction.guild;

        // aktivni channel
        const jobCh = await guild.channels.fetch(FS_JOB_CHANNEL_ID).catch(() => null);
        const doneCh = await guild.channels.fetch(FS_JOB_DONE_CHANNEL_ID).catch(() => null);

        const allTasks = db.farmingTasks.filter(t => t.field === newField);

        for (const t of allTasks) {
            const ch = t.status === "open" ? jobCh : doneCh;
            if (!ch) continue;

            const msg = await ch.messages.fetch(t.messageId).catch(() => null);
            if (!msg || !msg.embeds[0]) continue;

            let embed = EmbedBuilder.from(msg.embeds[0]);

            // Regex: zamjenjuje bilo koji oblik "Polje ... oldField"
            const regex = new RegExp(`Polje\\s*[:\\-]*\\s*${oldField}`, "i");

            embed = embed.toJSON(); // lakše manipulirati

            if (embed.fields) {
                for (const f of embed.fields) {
                    if (regex.test(f.value)) {
                        f.value = f.value.replace(regex, `Polje ${newField}`);
                    }
                }
            }

            await msg.edit({ embeds: [embed] });
        }
    }

    await updateTaskEmbeds();


    // === 5) Update Sowing Season (mora promijeniti ključ)
    const seasons = getSowingSeasons();
    for (const season of seasons) {
        if (season.fields && season.fields[oldField]) {
            season.fields[newField] = season.fields[oldField];
            delete season.fields[oldField];
        }
    }
    saveSowingSeasons(seasons);


    // === 6) Refresh živog embed-a sezone
    try {
        await updateSeasonEmbed(interaction.guild);
    } catch (e) {
        console.log("Greška refresh sezone:", e);
    }


    return interaction.reply({
        content: `✅ Polje **${oldField}** je uspješno preimenovano u **${newField}**.\n\nSve poruke, zadaci i sezona su ažurirani.`,
        ephemeral: true,
    });
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

      const sentMsg = await jobChannel.send({
        embeds: [embed],
        components: [doneRow],
      });

      saveFarmingTask({
        field: current.field,
        jobKey: 'kombajniranje',
        jobName: 'Kombajniranje',
        status: 'open',
        fromFs: false,
        channelId: jobChannel.id,
        messageId: sentMsg.id,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString(),
      });

      activeTasks.delete(interaction.user.id);
      return;
    }
  }
});

client.login(token).catch((err) => {
  console.error('❌ Login error:', err);

  console.log("Discord.js version running:", require("discord.js").version);

});
