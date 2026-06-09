const { REST, Routes } = require('@discordjs/rest');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log("CLIENT_ID =", process.env.CLIENT_ID);
console.log("TOKEN =", process.env.TOKEN);

const commands = [];
const commandsPath = path.join(__dirname, 'src/commands');

// Recursively load all command files
const loadCommands = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      loadCommands(filePath);
    } else if (file.endsWith('.js')) {
      const command = require(filePath);
      if (command.data) {
        commands.push(command.data.toJSON());
      }
    }
  }
};

loadCommands(commandsPath);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} commands...`);
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('✅ Commands registered successfully!');
  } catch (error) {
    console.error(error);
  }
})();
