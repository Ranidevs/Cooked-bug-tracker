"use strict";

/**
 * src/commands/tools/report.js
 *
 * Slash command: /report bug
 *
 * Flow:
 *   1. User runs /report bug
 *   2. A modal appears asking for a Bug Title and Bug Description
 *   3. On modal submit, a red "Unresolved" embed is posted to BUG_REPORT_CHANNEL_ID
 *      with a "Resolve" button underneath
 *   4. A user with Manage Messages clicks Resolve:
 *      - Embed turns green, status becomes "Resolved"
 *      - Resolved By / Resolved At fields are added
 *      - Button is disabled and relabelled "Resolved"
 */

const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  time,
  TimestampStyles,
} = require("discord.js");

// ─── Config ───────────────────────────────────────────────────────────────────
const BUG_REPORT_CHANNEL_ID = "PUT_CHANNEL_ID_HERE";

// ─── Constants ────────────────────────────────────────────────────────────────
// Custom IDs tie the modal submit and button click back to this command.
const MODAL_ID         = "bug_report_modal";
const INPUT_TITLE_ID   = "bug_title";
const INPUT_DESC_ID    = "bug_description";
const BUTTON_RESOLVE   = "bug_resolve";

// Embed colours
const COLOR_UNRESOLVED = 0xe74c3c; // Red
const COLOR_RESOLVED   = 0x2ecc71; // Green

// ─── Slash command definition ─────────────────────────────────────────────────
const data = new SlashCommandBuilder()
  .setName("report")
  .setDescription("Reporting tools")
  .addSubcommand((sub) =>
    sub
      .setName("bug")
      .setDescription("Submit a bug report")
  );

// ─── Execute ──────────────────────────────────────────────────────────────────
/**
 * Called by your command handler when any /report subcommand is used.
 * Only the "bug" subcommand is currently implemented.
 *
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "bug") {
    await handleBugSubcommand(interaction);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  /report bug  →  show modal
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Responds to /report bug by presenting a modal with two text inputs.
 *
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
async function handleBugSubcommand(interaction) {
  // Build the Bug Title input (single line)
  const titleInput = new TextInputBuilder()
    .setCustomId(INPUT_TITLE_ID)
    .setLabel("Bug Title")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Brief summary of the bug")
    .setMinLength(5)
    .setMaxLength(100)
    .setRequired(true);

  // Build the Bug Description input (multi-line paragraph)
  const descInput = new TextInputBuilder()
    .setCustomId(INPUT_DESC_ID)
    .setLabel("Bug Description")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Steps to reproduce, expected vs. actual behaviour, etc.")
    .setMinLength(20)
    .setMaxLength(1000)
    .setRequired(true);

  // Each TextInput must live inside its own ActionRow
  const titleRow = new ActionRowBuilder().addComponents(titleInput);
  const descRow  = new ActionRowBuilder().addComponents(descInput);

  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle("Bug Report")
    .addComponents(titleRow, descRow);

  // Show the modal — no further code runs here; the submit is handled below
  await interaction.showModal(modal);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Modal submit  →  post embed to bug-report channel
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Must be called from your interactionCreate event handler when
 * interaction.isModalSubmit() && interaction.customId === MODAL_ID.
 *
 * @param {import("discord.js").ModalSubmitInteraction} interaction
 */
async function handleModalSubmit(interaction) {
  const bugTitle = interaction.fields.getTextInputValue(INPUT_TITLE_ID);
  const bugDesc  = interaction.fields.getTextInputValue(INPUT_DESC_ID);
  const reporter = interaction.user;
  const now      = new Date();

  // Locate the bug-report channel
  const channel = interaction.guild.channels.cache.get(BUG_REPORT_CHANNEL_ID);
  if (!channel) {
    return interaction.reply({
      content: "❌ Bug-report channel not found. Please contact an administrator.",
      ephemeral: true,
    });
  }

  // Build the unresolved (red) embed
  const embed = new EmbedBuilder()
    .setTitle(`🐛 Bug Report — ${bugTitle}`)
    .setColor(COLOR_UNRESOLVED)
    .addFields(
      {
        name: "📝 Description",
        value: bugDesc,
      },
      {
        name: "👤 Reported By",
        value: `${reporter.username} (<@${reporter.id}>)`,
        inline: true,
      },
      {
        name: "📅 Date Reported",
        value: time(now, TimestampStyles.ShortDateTime),
        inline: true,
      },
      {
        name: "🔴 Status",
        value: "Unresolved",
        inline: true,
      }
    )
    .setFooter({ text: `User ID: ${reporter.id}` })
    .setTimestamp(now);

  // Resolve button — Success style (green) so it stands out as a positive action
  const resolveButton = new ButtonBuilder()
    .setCustomId(BUTTON_RESOLVE)
    .setLabel("Resolve")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(resolveButton);

  try {
    await channel.send({ embeds: [embed], components: [row] });

    // Ephemeral confirmation so the reporter knows it worked
    await interaction.reply({
      content: `✅ Your bug report has been submitted to <#${BUG_REPORT_CHANNEL_ID}>.`,
      ephemeral: true,
    });
  } catch (err) {
    console.error("[report.js] Failed to post bug report embed:", err);
    await interaction.reply({
      content: "❌ Something went wrong while submitting your report. Please try again.",
      ephemeral: true,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Resolve button  →  update embed and disable button
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Must be called from your interactionCreate event handler when
 * interaction.isButton() && interaction.customId === BUTTON_RESOLVE.
 *
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleResolveButton(interaction) {
  // ── Permission check ────────────────────────────────────────────────────────
  // Only users with Manage Messages may resolve reports
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: "❌ You need the **Manage Messages** permission to resolve bug reports.",
      ephemeral: true,
    });
  }

  const originalEmbed = interaction.message.embeds[0];
  if (!originalEmbed) {
    return interaction.reply({
      content: "❌ Could not find the original embed to update.",
      ephemeral: true,
    });
  }

  const resolver = interaction.user;
  const now      = new Date();

  // ── Rebuild the embed ───────────────────────────────────────────────────────
  // Clone all existing fields, then splice the Status field to "Resolved"
  // and append Resolved By / Resolved At.

  // Find and replace the Status field (keep all others intact)
  const updatedFields = originalEmbed.fields.map((field) => {
    if (field.name === "🔴 Status") {
      return { name: "🟢 Status", value: "Resolved", inline: true };
    }
    return field; // Preserve Reporter, Date Reported, Description unchanged
  });

  // Append resolution metadata
  updatedFields.push(
    {
      name: "🔧 Resolved By",
      value: `${resolver.username} (<@${resolver.id}>)`,
      inline: true,
    },
    {
      name: "✅ Resolved At",
      value: time(now, TimestampStyles.ShortDateTime),
      inline: true,
    }
  );

  const resolvedEmbed = EmbedBuilder.from(originalEmbed)
    .setColor(COLOR_RESOLVED) // Switch to green
    .setFields(updatedFields);

  // ── Disable the button ──────────────────────────────────────────────────────
  const disabledButton = new ButtonBuilder()
    .setCustomId(BUTTON_RESOLVE)
    .setLabel("Resolved")
    .setStyle(ButtonStyle.Success)
    .setDisabled(true);

  const updatedRow = new ActionRowBuilder().addComponents(disabledButton);

  try {
    // interaction.update() edits the message and acks the interaction in one call
    await interaction.update({
      embeds: [resolvedEmbed],
      components: [updatedRow],
    });
  } catch (err) {
    console.error("[report.js] Failed to update resolved embed:", err);
    await interaction.reply({
      content: "❌ Could not mark the report as resolved. Please try again.",
      ephemeral: true,
    });
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  data,
  execute,
  // Export the interaction sub-handlers so your interactionCreate event
  // can route modal submits and button clicks to this file:
  //
  //   const { handleModalSubmit, handleResolveButton } = require("./commands/tools/report");
  //
  //   if (interaction.isModalSubmit() && interaction.customId === "bug_report_modal") {
  //     return handleModalSubmit(interaction);
  //   }
  //   if (interaction.isButton() && interaction.customId === "bug_resolve") {
  //     return handleResolveButton(interaction);
  //   }
  handleModalSubmit,
  handleResolveButton,
  // Exporting the custom IDs lets your handler do the routing without
  // hardcoding strings outside of this file:
  MODAL_ID,
  BUTTON_RESOLVE,
};
