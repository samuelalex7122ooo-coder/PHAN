const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName("ayuda")
      .setDescription("Ver los comandos de KRYPTON"),
    async execute(interaction) {
      const embed = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle("🕷️ KRYPTON • Ayuda")
        .setDescription("Estos son los comandos disponibles:")
        .addFields(
          { name: "🎫 Tickets", value: "`/ticket configurar`\n`/ticket editar`\n`/ticket logs`\n`/ticket tiempo`\n`/ticket cerrar`\n`/ticket categoria agregar`\n`/ticket categoria listar`\n`/ticket categoria eliminar`" },
          { name: "🔊 Voz", value: "`/vc conectar`\n`/vc desconectar`" },
          { name: "🌐 Servidor", value: "`/servidor`" }
        )
        .setFooter({ text: "KRYPTON • Sistema de administración" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName("servidor")
      .setDescription("Ver información del servidor"),
    async execute(interaction) {
      const guild = interaction.guild;
      const embed = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle(`📊 ${guild.name}`)
        .addFields(
          { name: "Miembros", value: `${guild.memberCount}`, inline: true },
          { name: "Canales", value: `${guild.channels.cache.size}`, inline: true },
          { name: "Servidor creado", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }
        )
        .setThumbnail(guild.iconURL({ size: 256 }));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
];

module.exports = commands;
