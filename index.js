require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder
} = require('discord.js');

const Database = require('better-sqlite3');

/* =========================
   VARIABLES DE ENTORNO
========================= */

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

/* 🔥 CHECK CRÍTICO DE TOKEN */
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.log("❌ FALTAN VARIABLES DE ENTORNO");
    console.log("TOKEN:", !!TOKEN);
    console.log("CLIENT_ID:", !!CLIENT_ID);
    console.log("GUILD_ID:", !!GUILD_ID);
    process.exit(1);
}

/* =========================
   CLIENTE DISCORD
========================= */

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

/* =========================
   BASE DE DATOS
========================= */

const db = new Database('fichajes.db');

db.prepare(`
CREATE TABLE IF NOT EXISTS usuarios (
    userId TEXT PRIMARY KEY,
    entrada INTEGER,
    totalSemanal INTEGER DEFAULT 0,
    semana INTEGER DEFAULT 0
)
`).run();

/* =========================
   HORA ESPAÑA
========================= */

function horaEspaña(ms) {
    const d = new Date(ms);

    const fecha = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(d);

    const hora = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(d);

    return `📅 ${fecha}\n🕒 ${hora}`;
}

/* =========================
   SEMANA
========================= */

function getWeekNumber() {
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), 0, 1);

    const days = Math.floor(
        (date - firstDay) / (24 * 60 * 60 * 1000)
    );

    return Math.ceil((days + firstDay.getDay() + 1) / 7);
}

/* =========================
   FORMATO TIEMPO
========================= */

function formatTiempo(ms) {
    const horas = Math.floor(ms / 3600000);
    const minutos = Math.floor((ms % 3600000) / 60000);
    const segundos = Math.floor((ms % 60000) / 1000);

    return `${horas}h ${minutos}m ${segundos}s`;
}

/* =========================
   REGISTRO COMANDOS
========================= */

const rest = new REST({ version: '10' }).setToken(TOKEN);

const commands = [
    new SlashCommandBuilder()
        .setName('fichar')
        .setDescription('Entrar o salir del trabajo'),

    new SlashCommandBuilder()
        .setName('estado')
        .setDescription('Ver quién está trabajando'),

    new SlashCommandBuilder()
        .setName('comprobar-horas-semanales')
        .setDescription('Ver horas semanales')
].map(cmd => cmd.toJSON());

(async () => {
    try {
        console.log("🔄 Registrando comandos...");

        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );

        console.log("✅ Comandos registrados");
    } catch (err) {
        console.error("❌ Error registrando comandos:", err);
    }
})();

/* =========================
   INTERACCIONES
========================= */

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;
    const ahora = Date.now();
    const semanaActual = getWeekNumber();

    if (interaction.commandName === 'estado') {
        const usuarios = db.prepare('SELECT * FROM usuarios').all();

        return interaction.reply({
            content: `Hay ${usuarios.length} usuarios registrados.`,
            ephemeral: true
        });
    }

    if (interaction.commandName === 'comprobar-horas-semanales') {
        const usuarios = db.prepare('SELECT * FROM usuarios').all();

        let msg = "";

        for (const u of usuarios) {
            msg += `<@${u.userId}> → ${formatTiempo(u.totalSemanal)}\n`;
        }

        return interaction.reply({
            content: msg || "No hay datos",
            ephemeral: true
        });
    }

    /* =========================
       FICHAR
    ========================= */

    let row = db.prepare('SELECT * FROM usuarios WHERE userId = ?').get(userId);

    if (!row) {
        db.prepare(`
            INSERT INTO usuarios (userId, entrada, totalSemanal, semana)
            VALUES (?, ?, 0, ?)
        `).run(userId, ahora, semanaActual);

        return interaction.reply("🟢 Entrada registrada");
    }

    if (row.entrada) {
        const duracion = ahora - row.entrada;

        const nuevoTotal = row.totalSemanal + duracion;

        db.prepare(`
            UPDATE usuarios
            SET entrada = NULL,
                totalSemanal = ?,
                semana = ?
            WHERE userId = ?
        `).run(nuevoTotal, semanaActual, userId);

        return interaction.reply("🔴 Salida registrada");
    }

    db.prepare(`
        UPDATE usuarios
        SET entrada = ?
        WHERE userId = ?
    `).run(ahora, userId);

    return interaction.reply("🟢 Entrada registrada");
});

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
