const { SlashCommandBuilder } = require("discord.js");
const { joinVoiceChannel, getVoiceConnection } = require("@discordjs/voice");

const data = new SlashCommandBuilder()
  .setName("vc")
  .setDescription("Sistema de conexión a canales de voz")
  .addSubcommand(s => s.setName("conectar").setDescription("Conectar el bot a tu canal de voz"))
  .addSubcommand(s => s.setName("desconectar").setDescription("Desconectar el bot del canal de voz"));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (sub === "conectar") {
    const voiceChannel = interaction.member.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: "Primero debes entrar a un canal de voz.", ephemeral: true });
    }

    const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!permissions?.has(["Connect", "Speak"])) {
      return interaction.reply({ content: "No tengo permiso para conectar y hablar en ese canal.", ephemeral: true });
    }

    const current = getVoiceConnection(guildId);
    if (current) current.destroy();

    joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true
    });

    return interaction.reply({ content: `🔊 Me conecté a **${voiceChannel.name}**.`, ephemeral: true });
  }

  if (sub === "desconectar") {
    const connection = getVoiceConnection(guildId);
    if (!connection) {
      return interaction.reply({ content: "No estoy conectado a ningún canal de voz.", ephemeral: true });
    }

    connection.destroy();
    return interaction.reply({ content: "👋 Me desconecté del canal de voz.", ephemeral: true });
  }
}

module.exports = { data, execute };
