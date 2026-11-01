require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const { REST, Routes } = require("discord.js");
const general = require("./src/commands/general");
const ticket = require("./src/commands/ticket");
const vc = require("./src/commands/vc");
const dm = require("./src/commands/dm");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error("Falta DISCORD_TOKEN o CLIENT_ID en .env");
  process.exit(1);
}

const commands = [
  ...general.map(c => c.data.toJSON()),
  ticket.data.toJSON(),
  vc.data.toJSON(),
  dm.data.toJSON()
];

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registrando comandos...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("✅ Comandos registrados correctamente.");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
