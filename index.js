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
   CONFIG
========================= */

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

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
   HORA ESPAÑA 🇪🇸
========================= */

function horaEspaña(ms) {
    return new Date(ms).toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        hour12: false
    });
}

/* =========================
   SEMANA
========================= */

function getWeekNumber() {
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - firstDay) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + firstDay.getDay() + 1) / 7);
}

/* =========================
   FORMATO TIEMPO
========================= */

function formatTiempo(ms) {
    const horas = Math.floor(ms / 3600000);
    const minutos = Math.floor((ms % 3600000) / 60000);
    const segundos = Math.floor((ms % 60000) / 1000);
    return `${horas} horas, ${minutos} minutos y ${segundos} segundos`;
}

/* =========================
   COMANDO
========================= */

const command = new SlashCommandBuilder()
    .setName('fichar')
    .setDescription('Entrar o salir del trabajo');

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: [command.toJSON()] }
    );
})();

/* =========================
   LOGICA
========================= */

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'fichar') return;

    const userId = interaction.user.id;
    const ahora = Date.now();
    const semanaActual = getWeekNumber();

    let row = db.prepare(
        'SELECT * FROM usuarios WHERE userId = ?'
    ).get(userId);

    /* =========================
       PRIMERA VEZ
    ========================= */

    if (!row) {
        db.prepare(`
            INSERT INTO usuarios(userId, entrada, totalSemanal, semana)
            VALUES (?, ?, 0, ?)
        `).run(userId, ahora, semanaActual);

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Green')
                    .setTitle('⏱️ Registro de fichaje')
                    .setDescription(
                        `👤 ${interaction.user.tag}\n\n` +
                        `🟢 Entrada: ${horaEspaña(ahora)}`
                    )
            ]
        });
    }

    /* =========================
       RESET SEMANA
    ========================= */

    if (row.semana !== semanaActual) {
        row.totalSemanal = 0;
        row.semana = semanaActual;
    }

    /* =========================
       SALIDA
    ========================= */

    if (row.entrada) {
        const duracion = ahora - row.entrada;
        const nuevoTotal = Number(row.totalSemanal) + duracion;

        db.prepare(`
            UPDATE usuarios
            SET entrada = NULL,
                totalSemanal = ?,
                semana = ?
            WHERE userId = ?
        `).run(nuevoTotal, semanaActual, userId);

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Blue')
                    .setTitle('⏱️ Registro de fichaje')
                    .setDescription(
                        `👤 ${interaction.user.tag}\n\n` +
                        `🟢 Entrada: ${horaEspaña(row.entrada)}\n` +
                        `🔴 Salida: ${horaEspaña(ahora)}\n\n` +
                        `⏱ Tiempo trabajado: ${formatTiempo(duracion)}\n` +
                        `📊 Total semanal: ${formatTiempo(nuevoTotal)}`
                    )
            ]
        });
    }

    /* =========================
       ENTRADA
    ========================= */

    db.prepare(`
        UPDATE usuarios
        SET entrada = ?
        WHERE userId = ?
    `).run(ahora, userId);

    interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor('Green')
                .setTitle('⏱️ Registro de fichaje')
                .setDescription(
                    `👤 ${interaction.user.tag}\n\n` +
                    `🟢 Entrada: ${horaEspaña(ahora)}`
                )
        ]
    });
});

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
