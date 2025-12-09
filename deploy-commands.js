const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const commands = [
  // ticket panel
  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Pošalji ticket panel u ovaj kanal.'),

  // farming task panel
  new SlashCommandBuilder()
    .setName('task-panel')
    .setDescription('Postavi Farming Simulator 25 panel za kreiranje zadataka u ovaj kanal.'),

  // ➕ doda novo polje u listu
  new SlashCommandBuilder()
    .setName('add-field')
    .setDescription('Dodaj novo polje u listu za Farming zadatke.')
    .addStringOption(opt =>
      opt
        .setName('value')
        .setDescription('Oznaka polja (npr. 56-276)')
        .setRequired(true)
    ),

  // 🗑️ izbriše polje iz liste
  new SlashCommandBuilder()
    .setName('remove-field')
    .setDescription('Ukloni polje iz liste za Farming zadatke.')
    .addStringOption(opt =>
      opt
        .setName('value')
        .setDescription('Oznaka polja koju želiš ukloniti (npr. 56-276)')
        .setRequired(true)
    ),

    // 🌾 resetira sezonu sjetve (briše posijana polja, embed ostaje)
new SlashCommandBuilder()
  .setName('reset-season')
  .setDescription('Resetira aktivnu sezonu sjetve.'),


  // 📋 prikaže trenutnu listu polja (ephemeral)
  new SlashCommandBuilder()
    .setName('list-fields')
    .setDescription('Prikaži sva polja koja su dostupna u task-panelu.'),

    

  // 🧑‍🌾 panel s gumbom "Dodaj novo polje"
  new SlashCommandBuilder()
    .setName('field-panel')
    .setDescription('Pošalji panel za upravljanje poljima (dodavanje polja) u ovaj kanal.'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('📨 Registrujem komande...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );
    console.log('✅ Slash komande /ticket-panel, /task-panel, /add-field, /remove-field, /list-fields i /field-panel registrirane.');
  } catch (error) {
    console.error(error);
  }
})();
