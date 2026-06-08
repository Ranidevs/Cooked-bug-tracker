/**
 * ============================================================
 *  Discord Bug Report Bot — Discord.js v14
 *  Single-file version: drag this into your repo and go.
 * ============================================================
 *
 *  SETUP (one-time)
 *  ─────────────────────────────────────────────────────────
 *  1. npm install discord.js
 *
 *  2. Fill in the four constants in the CONFIG block below.
 *
 *  3. Register the /bug slash command (run once, then never again
 *     unless you change the command definition):
 *       node bug-bot.js --deploy
 *
 *  4. Start the bot:
 *       node bug-bot.js
 * ============================================================
 */

"use strict";

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

// ─── CONFIG — fill these in ───────────────────────────────────────────────────
const BOT_TOKEN      = "YOUR_BOT_TOKEN_HERE";      // Bot → Token
const CLIENT_ID      = "YOUR_CLIENT_ID_HERE";      // General Information → Application ID
const GUILD_ID       = "YOUR_GUILD_ID_HERE";       // Right-click server → Copy Server ID
const BUG_CHANNEL_ID = "YOUR_BUG_CHANNEL_ID_HERE"; // Right-click #bug-reports → Copy Channel ID
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
//  DEPLOY MODE  —  node bug-bot.js --deploy
//  Registers the /bug slash command with Discord, then exits.
// ═══════════════════════════════════════════════════════════════════════════════
if (process.argv.includes("--deploy")) {
  const command = new SlashCommandBuilder()
    .setName("bug")
    .setDescription("Submit a bug report to the bug-reports channel")
    .addStringOption((opt) =>
      opt
        .setName("description")
        .setDescription("Describe the bug you encountered")
        .setRequired(true)
        .setMinLength(10)   // Require at least 10 characters for quality reports
        .setMaxLength(1000) // Stay within Discord embed field limits
    )
    .toJSON();

  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

  (async () => {
    try {
      console.log("🔄 Registering /bug slash command...");

      // Guild-scoped = instant (perfect for dev/production in one server).
      // For multi-server bots swap to: Routes.applicationCommands(CLIENT_ID)
      // — note that global commands take up to 1 hour to propagate.
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: [command],
      });

      console.log("✅ /bug command registered! You can now run: node bug-bot.js");
    } catch (err) {
      console.error("❌ Failed to register command:", err);
    }
    process.exit(0);
  })();

  return; // Stop executing the rest of the file in deploy mode
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BOT MODE  —  node bug-bot.js
// ═══════════════════════════════════════════════════════════════════════════════
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`   Listening for /bug in guild ${GUILD_ID}`);
  console.log(`   Bug reports → channel ${BUG_CHANNEL_ID}`);
});

// ─── Interactions ─────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {

  // ── /bug slash command ──────────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === "bug") {
    const description = interaction.options.getString("description");

    // Look up the bug-reports channel from the guild's cache
    const bugChannel = interaction.guild.channels.cache.get(BUG_CHANNEL_ID);
    if (!bugChannel) {
      return interaction.reply({
        content: "❌ Could not find the bug-reports channel. Double-check `BUG_CHANNEL_ID`.",
        ephemeral: true,
      });
    }

    // Red embed — status: Unresolved
    const embed = new EmbedBuilder()
      .setTitle("🐛 Bug Report")
      .setColor(0xe74c3c) // Red
      .addFields(
        { name: "👤 Reporter",    value: interaction.user.username, inline: true },
        { name: "🔴 Status",      value: "Unresolved",              inline: true },
        { name: "📝 Description", value: description }
      )
      .setTimestamp()
      .setFooter({ text: `Reported by ${interaction.user.username}` });

    // Resolve button (red = action needed)
    const resolveButton = new ButtonBuilder()
      .setCustomId("resolve_bug")
      .setLabel("✅ Resolve")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(resolveButton);

    try {
      await bugChannel.send({ embeds: [embed], components: [row] });

      // Only the reporter sees this confirmation
      await interaction.reply({
        content: `✅ Bug report submitted to <#${BUG_CHANNEL_ID}>!`,
        ephemeral: true,
      });
    } catch (err) {
      console.error("Failed to post bug report:", err);
      await interaction.reply({
        content: "❌ Something went wrong while sending the bug report.",
        ephemeral: true,
      });
    }
  }

  // ── Resolve button ──────────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === "resolve_bug") {
    const originalEmbed = interaction.message.embeds[0];

    // Clone the embed, switch to green, update Status field, add resolver name
    const resolvedEmbed = EmbedBuilder.from(originalEmbed)
      .setColor(0x2ecc71) // Green
      .spliceFields(1, 1, {          // Swap out the Status field (index 1)
        name: "🟢 Status",
        value: "Resolved",
        inline: true,
      })
      .addFields({
        name: "🔧 Resolved By",
        value: interaction.user.username,
        inline: true,
      })
      .setFooter({
        text: `${originalEmbed.footer?.text ?? ""} • Resolved by ${interaction.user.username}`,
      });

    // Disable the button so it can't be clicked again
    const disabledButton = new ButtonBuilder()
      .setCustomId("resolve_bug")
      .setLabel("✅ Resolved")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);

    const updatedRow = new ActionRowBuilder().addComponents(disabledButton);

    try {
      // Edit the original bug-report message in place
      await interaction.update({ embeds: [resolvedEmbed], components: [updatedRow] });
    } catch (err) {
      console.error("Failed to resolve bug report:", err);
      await interaction.reply({
        content: "❌ Could not update the bug report.",
        ephemeral: true,
      });
    }
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
client.login(BOT_TOKEN);
