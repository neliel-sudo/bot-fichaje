const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder
} = require('discord.js');

const sqlite3 = require('sqlite3').verbose();

/* =========================
   CONFIGURACIÓN
========================= */
.
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

/* ========================= */

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const db = new sqlite3.Database('./fichajes.db');

/* =========================
   BASE DE DATOS
========================= */

db.run(`
CREATE TABLE IF NOT EXISTS usuarios (
    userId TEXT PRIMARY KEY,
    entrada INTEGER,
    totalSemanal INTEGER DEFAULT 0,
    semana INTEGER DEFAULT 0
)
`);

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

    db.get(`SELECT * FROM usuarios WHERE userId = ?`, [userId], (err, row) => {

        if (!row) {
            db.run(
                `INSERT INTO usuarios(userId, entrada, totalSemanal, semana)
                 VALUES (?, ?, 0, ?)`,
                [userId, ahora, semanaActual]
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Green')
                        .setTitle('⏱️ Registro de fichaje')
                        .setDescription(
                            `👤 Nombre: ${interaction.user.tag}\n\n` +
                            `🟢 Entrada registrada\n` +
                            `📅 ${new Date(ahora).toLocaleString()}`
                        )
                ]
            });
        }

        // Reset semana automática
        if (row.semana !== semanaActual) {
            row.totalSemanal = 0;
        }

        // SALIDA
        if (row.entrada) {

            const duracion = ahora - row.entrada;
            const nuevoTotal = Number(row.totalSemanal) + duracion;

            db.run(
                `UPDATE usuarios
                 SET entrada = NULL,
                     totalSemanal = ?,
                     semana = ?
                 WHERE userId = ?`,
                [nuevoTotal, semanaActual, userId]
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Blue')
                        .setTitle('⏱️ Registro de fichaje')
                        .setDescription(
                            `👤 Nombre: ${interaction.user.tag}\n\n` +

                            `🟢 Inicio: ${new Date(row.entrada).toLocaleString()}\n` +
                            `🔴 Salida: ${new Date(ahora).toLocaleString()}\n\n` +

                            `⏱ Tiempo trabajado: ${formatTiempo(duracion)}\n` +
                            `📊 Total semanal: ${formatTiempo(nuevoTotal)}`
                        )
                ]
            });
        }

        // ENTRADA
        db.run(
            `UPDATE usuarios SET entrada = ? WHERE userId = ?`,
            [ahora, userId]
        );

        interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Green')
                    .setTitle('⏱️ Registro de fichaje')
                    .setDescription(
                        `👤 Nombre: ${interaction.user.tag}\n\n` +
                        `🟢 Entrada registrada\n` +
                        `📅 ${new Date(ahora).toLocaleString()}`
                    )
            ]
        });
    });
});

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
