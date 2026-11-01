require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events
} = require("discord.js");

const { ensureGuild } = require("./src/database");
const general = require("./src/commands/general");
const ticket = require("./src/commands/ticket");
const vc = require("./src/commands/vc");
const dm = require("./src/commands/dm");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.User]
});

const commands = new Map();
for (const command of general) commands.set(command.data.name, command);
commands.set(ticket.data.name, ticket);
commands.set(vc.data.name, vc);
commands.set(dm.data.name, dm);

client.once(Events.ClientReady, readyClient => {
  console.log(`KRYPTON conectado: ${readyClient.user.tag}`);
  for (const guild of readyClient.guilds.cache.values()) ensureGuild(guild.id);

  setInterval(() => {
    ticket.closeInactive(client).catch(error => console.error(error));
  }, 60 * 1000);
});

client.on(Events.GuildCreate, guild => ensureGuild(guild.id));
client.on(Events.MessageCreate, message => ticket.onMessage(message));

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "krypton_ticket_select") {
      await ticket.handleSelect(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("kt_")) {
      await ticket.handleButton(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("kt_close_modal:")) {
      await ticket.handleModal(interaction);
    }
  } catch (error) {
    console.error("Error en interacción:", error);
    const response = { content: "Ocurrió un error al ejecutar esta acción.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("Falta DISCORD_TOKEN en .env");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
