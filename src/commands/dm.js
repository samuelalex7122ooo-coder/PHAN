const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags
} = require("discord.js");

const data = new SlashCommandBuilder()
  .setName("dm")
  .setDescription("Enviar mensajes privados")
  .addSubcommand(s => s
    .setName("enviar")
    .setDescription("Enviar un mensaje privado a un usuario")
    .addUserOption(o => o
      .setName("usuario")
      .setDescription("Usuario que recibirá el mensaje")
      .setRequired(true))
    .addStringOption(o => o
      .setName("mensaje")
      .setDescription("Contenido del mensaje")
      .setRequired(true)
      .setMaxLength(2000)));

async function execute(interaction) {
  // Reconocer la interacción inmediatamente.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.editReply("No tienes permiso para usar este comando.");
  }

  const user = interaction.options.getUser("usuario");
  const content = interaction.options.getString("mensaje");

  if (user.bot) {
    return interaction.editReply("No se pueden enviar mensajes a otros bots.");
  }

  try {
    const embed = new EmbedBuilder()
      .setColor("#3498DB")
      .setTitle(`📩 Mensaje de ${interaction.guild.name}`)
      .setDescription(content)
      .setFooter({ text: "KRYPTON • Mensaje privado" })
      .setTimestamp();

    await user.send({ embeds: [embed] });

    return interaction.editReply(`✅ Mensaje enviado por DM a **${user.tag}**.`);
  } catch (error) {
    console.error("Error enviando DM:", error);
    return interaction.editReply(
      "❌ No se pudo enviar el DM. Es posible que el usuario tenga desactivados los mensajes privados."
    );
  }
}

module.exports = { data, execute };
