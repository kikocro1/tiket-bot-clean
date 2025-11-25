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
    .setDescription('Postavi Farming Simulator 25 panel za kreiranje zadataka u ovaj kanal.')

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('📥 Registrujem komande...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );
    console.log('✅ Slash komande /ticket-panel i /task-panel registrovane.');
  } catch (error) {
    console.error(error);
  }
})();
