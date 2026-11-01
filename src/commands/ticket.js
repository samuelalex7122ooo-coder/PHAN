const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionsBitField
} = require("discord.js");

const { db, ensureGuild, updateGuild } = require("../database");

const COLORS = {
  blue: 0x3498DB,
  red: 0xE74C3C,
  green: 0x2ECC71
};

function staffRoles(category) {
  try {
    const parsed = JSON.parse(category.staff_roles || "[]");
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return category.staff_role ? [category.staff_role] : [];
}

function getConfig(guildId) {
  ensureGuild(guildId);
  return db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId);
}

function makePanel(config) {
  return new EmbedBuilder()
    .setColor(config.ticket_panel_color || "#3498DB")
    .setTitle(config.ticket_panel_title || "🎫 Centro de soporte")
    .setDescription(config.ticket_panel_description || "Selecciona una categoría para abrir un ticket. Nuestro equipo te atenderá lo antes posible.")
    .setFooter({ text: "KRYPTON • Sistema de soporte" });
}

function makePanelRow(categories) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("krypton_ticket_select")
    .setPlaceholder("Selecciona una categoría...")
    .addOptions(categories.map(c => ({
      label: c.name.slice(0, 100),
      value: String(c.id),
      description: (c.description || "Abrir un ticket").slice(0, 100),
      emoji: c.emoji || "🎫"
    })));
  return new ActionRowBuilder().addComponents(menu);
}

async function sendLog(guild, config, title, description, color = COLORS.blue) {
  if (!config.ticket_log_channel) return;
  const channel = await guild.channels.fetch(config.ticket_log_channel).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => {});
}

function getTicket(channelId) {
  return db.prepare("SELECT * FROM tickets WHERE channel_id = ?").get(channelId);
}

function getCategory(categoryId, guildId) {
  return db.prepare("SELECT * FROM ticket_categories WHERE id = ? AND guild_id = ?")
    .get(categoryId, guildId);
}

function isStaff(member, category) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return true;
  const roles = staffRoles(category);
  return member.roles?.cache?.some(role => roles.includes(role.id)) || false;
}

async function closeTicket(client, ticket, reason, closedBy) {
  const guild = await client.guilds.fetch(ticket.guild_id).catch(() => null);
  if (!guild) return;

  const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null);
  const config = getConfig(ticket.guild_id);

  db.prepare(`
    UPDATE tickets
    SET status = 'closed', closed_at = ?, close_reason = ?
    WHERE channel_id = ?
  `).run(Math.floor(Date.now() / 1000), reason, ticket.channel_id);

  await sendLog(
    guild,
    config,
    "🔒 Ticket cerrado",
    `**Canal:** ${channel ? channel.toString() : ticket.channel_id}\n**Cerrado por:** <@${closedBy}>\n**Motivo:** ${reason}`,
    COLORS.red
  );

  if (channel) {
    await channel.permissionOverwrites.edit(ticket.user_id, {
      SendMessages: false,
      AddReactions: false
    }).catch(() => {});
    await channel.setName(`cerrado-${ticket.id}`.slice(0, 100)).catch(() => {});
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.red)
          .setTitle("🔒 Ticket cerrado")
          .setDescription(`**Motivo:** ${reason}\n**Cerrado por:** <@${closedBy}>`)
          .setTimestamp()
      ]
    }).catch(() => {});
  }
}

const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Sistema de tickets de KRYPTON")
  .addSubcommand(s => s
    .setName("configurar")
    .setDescription("Publicar el panel de tickets")
    .addChannelOption(o => o.setName("canal").setDescription("Canal donde publicar el panel").addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s => s
    .setName("editar")
    .setDescription("Editar el panel publicado")
    .addStringOption(o => o.setName("titulo").setDescription("Nuevo título").setMaxLength(256))
    .addStringOption(o => o.setName("descripcion").setDescription("Nueva descripción").setMaxLength(4000))
    .addStringOption(o => o.setName("color").setDescription("Color hexadecimal, por ejemplo #3498DB").setMaxLength(7)))
  .addSubcommand(s => s
    .setName("logs")
    .setDescription("Configurar el canal de registros")
    .addChannelOption(o => o.setName("canal").setDescription("Canal de registros").addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s => s
    .setName("tiempo")
    .setDescription("Configurar cierre por inactividad")
    .addIntegerOption(o => o.setName("minutos").setDescription("Minutos sin actividad").setMinValue(1).setMaxValue(43200).setRequired(true)))
  .addSubcommand(s => s
    .setName("cerrar")
    .setDescription("Cerrar el ticket actual")
    .addStringOption(o => o.setName("motivo").setDescription("Motivo del cierre").setMaxLength(500)))
  .addSubcommandGroup(g => g
    .setName("categoria")
    .setDescription("Administrar categorías")
    .addSubcommand(s => {
      s.setName("agregar")
        .setDescription("Crear una categoría de tickets")
        .addStringOption(o => o.setName("nombre").setDescription("Nombre de la categoría").setRequired(true).setMaxLength(80))
        .addStringOption(o => o.setName("descripcion").setDescription("Descripción").setRequired(true).setMaxLength(100))
        .addRoleOption(o => o.setName("staff1").setDescription("Primer rol de staff").setRequired(true))
        .addStringOption(o => o.setName("emoji").setDescription("Emoji de la categoría").setMaxLength(20))
        .addChannelOption(o => o.setName("categoria_canal").setDescription("Categoría de canales donde crear tickets").addChannelTypes(ChannelType.GuildCategory));
      for (let i = 2; i <= 10; i++) {
        s.addRoleOption(o => o.setName(`staff${i}`).setDescription(`Rol de staff ${i}`).setRequired(false));
      }
      return s;
    })
    .addSubcommand(s => s.setName("listar").setDescription("Ver las categorías configuradas"))
    .addSubcommand(s => s
      .setName("eliminar")
      .setDescription("Eliminar una categoría")
      .addIntegerOption(o => o.setName("id").setDescription("ID de la categoría").setRequired(true))));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const group = interaction.options.getSubcommandGroup(false);
  const guildId = interaction.guildId;
  ensureGuild(guildId);

  if (group === "categoria") {
    if (sub === "agregar") {
      const count = db.prepare("SELECT COUNT(*) AS n FROM ticket_categories WHERE guild_id = ?").get(guildId).n;
      if (count >= 25) {
        return interaction.reply({ content: "Ya tienes 25 categorías. Elimina una antes de crear otra.", ephemeral: true });
      }

      const roles = [];
      for (let i = 1; i <= 10; i++) {
        const role = interaction.options.getRole(`staff${i}`);
        if (role && !roles.includes(role.id)) roles.push(role.id);
      }

      const name = interaction.options.getString("nombre");
      const description = interaction.options.getString("descripcion");
      const emoji = interaction.options.getString("emoji") || "🎫";
      const parent = interaction.options.getChannel("categoria_canal");

      const result = db.prepare(`
        INSERT INTO ticket_categories
        (guild_id, name, emoji, description, category_channel, staff_role, staff_roles)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(guildId, name, emoji, description, parent?.id || null, roles[0], JSON.stringify(roles));

      return interaction.reply({
        content: `✅ Categoría **${name}** creada.\n**ID:** ${result.lastInsertRowid}\n**Roles de staff:** ${roles.map(id => `<@&${id}>`).join(", ")}`,
        ephemeral: true
      });
    }

    if (sub === "listar") {
      const categories = db.prepare("SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY id").all(guildId);
      if (!categories.length) return interaction.reply({ content: "No hay categorías configuradas.", ephemeral: true });
      const description = categories.map(c =>
        `${c.emoji || "🎫"} **${c.name}** — ID: \`${c.id}\`\nRoles: ${staffRoles(c).map(id => `<@&${id}>`).join(", ")}`
      ).join("\n\n");
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLORS.blue).setTitle("Categorías de tickets").setDescription(description)],
        ephemeral: true
      });
    }

    if (sub === "eliminar") {
      const id = interaction.options.getInteger("id");
      const category = getCategory(id, guildId);
      if (!category) return interaction.reply({ content: "No encontré esa categoría.", ephemeral: true });
      db.prepare("DELETE FROM ticket_categories WHERE id = ? AND guild_id = ?").run(id, guildId);
      return interaction.reply({ content: `🗑️ Categoría **${category.name}** eliminada.`, ephemeral: true });
    }
  }

  if (sub === "configurar") {
    const channel = interaction.options.getChannel("canal");
    const categories = db.prepare("SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY id LIMIT 25").all(guildId);
    if (!categories.length) return interaction.reply({ content: "Primero crea una categoría con `/ticket categoria agregar`.", ephemeral: true });

    const config = getConfig(guildId);
    const message = await channel.send({
      embeds: [makePanel(config)],
      components: [makePanelRow(categories)]
    });

    updateGuild(guildId, {
      ticket_panel_channel: channel.id,
      ticket_panel_message: message.id
    });

    return interaction.reply({ content: `✅ Panel publicado en ${channel}.`, ephemeral: true });
  }

  if (sub === "editar") {
    const title = interaction.options.getString("titulo");
    const description = interaction.options.getString("descripcion");
    let color = interaction.options.getString("color");

    if (!title && !description && !color) {
      return interaction.reply({ content: "Indica al menos un título, descripción o color para editar.", ephemeral: true });
    }

    if (color) {
      if (!/^#?[0-9A-Fa-f]{6}$/.test(color)) {
        return interaction.reply({ content: "Color no válido. Usa un formato como `#3498DB`.", ephemeral: true });
      }
      if (!color.startsWith("#")) color = `#${color}`;
    }

    const config = getConfig(guildId);
    const values = {};
    if (title) values.ticket_panel_title = title;
    if (description) values.ticket_panel_description = description;
    if (color) values.ticket_panel_color = color;
    updateGuild(guildId, values);

    const updated = getConfig(guildId);
    if (updated.ticket_panel_channel && updated.ticket_panel_message) {
      const channel = await interaction.guild.channels.fetch(updated.ticket_panel_channel).catch(() => null);
      const message = channel ? await channel.messages.fetch(updated.ticket_panel_message).catch(() => null) : null;
      if (message) {
        const categories = db.prepare("SELECT * FROM ticket_categories WHERE guild_id = ? ORDER BY id LIMIT 25").all(guildId);
        await message.edit({
          embeds: [makePanel(updated)],
          components: categories.length ? [makePanelRow(categories)] : []
        });
      } else {
        return interaction.reply({ content: "Guardé los cambios, pero no encontré el mensaje del panel. Vuelve a publicarlo con `/ticket configurar`.", ephemeral: true });
      }
    } else {
      return interaction.reply({ content: "Guardé los cambios. Publica el panel con `/ticket configurar` para verlo.", ephemeral: true });
    }

    return interaction.reply({ content: "✅ Panel actualizado correctamente.", ephemeral: true });
  }

  if (sub === "logs") {
    const channel = interaction.options.getChannel("canal");
    updateGuild(guildId, { ticket_log_channel: channel.id });
    return interaction.reply({ content: `✅ Los registros se enviarán a ${channel}.`, ephemeral: true });
  }

  if (sub === "tiempo") {
    const minutes = interaction.options.getInteger("minutos");
    updateGuild(guildId, { ticket_inactivity: minutes });
    return interaction.reply({ content: `⏱️ Cierre por inactividad configurado en **${minutes} minutos**.`, ephemeral: true });
  }

  if (sub === "cerrar") {
    const ticket = getTicket(interaction.channelId);
    if (!ticket || ticket.status !== "open") {
      return interaction.reply({ content: "Este canal no es un ticket abierto.", ephemeral: true });
    }
    const category = getCategory(ticket.category_id, guildId);
    if (ticket.user_id !== interaction.user.id && !isStaff(interaction.member, category)) {
      return interaction.reply({ content: "No tienes permiso para cerrar este ticket.", ephemeral: true });
    }
    await interaction.reply({ content: "🔒 Cerrando ticket...", ephemeral: true });
    return closeTicket(interaction.client, ticket, interaction.options.getString("motivo") || "Sin motivo especificado", interaction.user.id);
  }
}

async function handleSelect(interaction) {
  if (interaction.customId !== "krypton_ticket_select") return;
  const guildId = interaction.guildId;
  const categoryId = Number(interaction.values[0]);
  const category = getCategory(categoryId, guildId);
  if (!category) return interaction.reply({ content: "Esa categoría ya no existe.", ephemeral: true });

  const existing = db.prepare(`
    SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'
  `).get(guildId, interaction.user.id);

  if (existing) {
    const oldChannel = await interaction.guild.channels.fetch(existing.channel_id).catch(() => null);
    if (oldChannel) return interaction.reply({ content: `Ya tienes un ticket abierto: ${oldChannel}`, ephemeral: true });
  }

  const roles = staffRoles(category);
  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles
      ]
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels
      ]
    },
    ...roles.map(id => ({
      id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }))
  ];

  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90),
    type: ChannelType.GuildText,
    parent: category.category_channel || undefined,
    permissionOverwrites: overwrites,
    reason: `Ticket abierto por ${interaction.user.tag}`
  });

  const result = db.prepare(`
    INSERT INTO tickets (guild_id, channel_id, user_id, category_id, status, created_at, last_activity)
    VALUES (?, ?, ?, ?, 'open', ?, ?)
  `).run(guildId, channel.id, interaction.user.id, category.id, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000));

  const ticketId = result.lastInsertRowid;

  const embed = new EmbedBuilder()
    .setColor(COLORS.blue)
    .setTitle(`${category.emoji || "🎫"} ${category.name}`)
    .setDescription(`Hola ${interaction.user}, tu ticket ha sido creado.\n\n**Motivo:** ${category.description}\n**Atención:** <@&${roles.join("> <@&")}>`)
    .addFields(
      { name: "Ticket", value: `#${ticketId}`, inline: true },
      { name: "Estado", value: "Disponible", inline: true }
    )
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`kt_claim:${ticketId}`).setLabel("Reclamar").setEmoji("🙋").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`kt_release:${ticketId}`).setLabel("Liberar").setEmoji("🔓").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`kt_close:${ticketId}`).setLabel("Cerrar ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `${interaction.user} ${roles.map(id => `<@&${id}>`).join(" ")}`, embeds: [embed], components: [buttons] });

  const config = getConfig(guildId);
  await sendLog(interaction.guild, config, "🎫 Ticket abierto", `**Canal:** ${channel}\n**Usuario:** ${interaction.user}\n**Categoría:** ${category.name}`, COLORS.green);

  return interaction.reply({ content: `✅ Tu ticket está listo: ${channel}`, ephemeral: true });
}

async function handleButton(interaction) {
  if (!interaction.customId.startsWith("kt_")) return;
  const [action, idText] = interaction.customId.split(":");
  const ticketId = Number(idText);
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ? AND guild_id = ?").get(ticketId, interaction.guildId);

  if (!ticket || ticket.status !== "open") {
    return interaction.reply({ content: "Este ticket ya está cerrado o no existe.", ephemeral: true });
  }

  const category = getCategory(ticket.category_id, interaction.guildId);
  const config = getConfig(interaction.guildId);

  if (action === "kt_claim" || action === "kt_release") {
    if (!isStaff(interaction.member, category)) {
      return interaction.reply({ content: "Solo el staff asignado puede usar este botón.", ephemeral: true });
    }

    if (action === "kt_claim") {
      if (ticket.claimed_by) return interaction.reply({ content: `Este ticket ya fue reclamado por <@${ticket.claimed_by}>.`, ephemeral: true });
      db.prepare("UPDATE tickets SET claimed_by = ? WHERE id = ?").run(interaction.user.id, ticketId);
      await interaction.reply({ content: `🙋 ${interaction.user} se ha hecho cargo del ticket.` });
      await sendLog(interaction.guild, config, "🙋 Ticket reclamado", `**Ticket:** <#${ticket.channel_id}>\n**Staff:** ${interaction.user}`);
    } else {
      if (!ticket.claimed_by) return interaction.reply({ content: "Este ticket no está reclamado.", ephemeral: true });
      db.prepare("UPDATE tickets SET claimed_by = NULL WHERE id = ?").run(ticketId);
      await interaction.reply({ content: `🔓 ${interaction.user} ha liberado el ticket.` });
      await sendLog(interaction.guild, config, "🔓 Ticket liberado", `**Ticket:** <#${ticket.channel_id}>\n**Staff:** ${interaction.user}`);
    }
    return;
  }

  if (action === "kt_close") {
    if (ticket.user_id !== interaction.user.id && !isStaff(interaction.member, category)) {
      return interaction.reply({ content: "No tienes permiso para cerrar este ticket.", ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`kt_close_modal:${ticketId}`)
      .setTitle("Cerrar ticket");

    const reason = new TextInputBuilder()
      .setCustomId("reason")
      .setLabel("Motivo del cierre")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Escribe el motivo...")
      .setRequired(true)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(reason));
    return interaction.showModal(modal);
  }
}

async function handleModal(interaction) {
  if (!interaction.customId.startsWith("kt_close_modal:")) return;
  const id = Number(interaction.customId.split(":")[1]);
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ? AND guild_id = ?").get(id, interaction.guildId);
  if (!ticket || ticket.status !== "open") return interaction.reply({ content: "Este ticket ya está cerrado.", ephemeral: true });

  const category = getCategory(ticket.category_id, interaction.guildId);
  if (ticket.user_id !== interaction.user.id && !isStaff(interaction.member, category)) {
    return interaction.reply({ content: "No tienes permiso para cerrar este ticket.", ephemeral: true });
  }

  const reason = interaction.fields.getTextInputValue("reason");
  await interaction.reply({ content: "🔒 Cerrando ticket...", ephemeral: true });
  return closeTicket(interaction.client, ticket, reason, interaction.user.id);
}

function onMessage(message) {
  if (!message.guild || message.author.bot) return;
  const ticket = getTicket(message.channelId);
  if (ticket && ticket.status === "open") {
    db.prepare("UPDATE tickets SET last_activity = ? WHERE channel_id = ?")
      .run(Math.floor(Date.now() / 1000), message.channelId);
  }
}

async function closeInactive(client) {
  const now = Math.floor(Date.now() / 1000);
  const openTickets = db.prepare("SELECT * FROM tickets WHERE status = 'open'").all();

  for (const ticket of openTickets) {
    const config = getConfig(ticket.guild_id);
    const minutes = Number(config.ticket_inactivity || 1440);
    if (now - ticket.last_activity >= minutes * 60) {
      await closeTicket(client, ticket, "Cierre automático por inactividad", client.user.id);
    }
  }
}

module.exports = { data, execute, handleSelect, handleButton, handleModal, onMessage, closeInactive };
