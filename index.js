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
   VARIABLES RAILWAY
========================= */

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

/* 🔥 CHECK IMPORTANTE */
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.log("❌ FALTAN VARIABLES EN RAILWAY");
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
   FUNCIONES
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

function getWeekNumber() {
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), 0, 1);

    const days = Math.floor(
        (date - firstDay) / (24 * 60 * 60 * 1000)
    );

    return Math.ceil((days + firstDay.getDay() + 1) / 7);
}

function formatTiempo(ms) {
    const horas = Math.floor(ms / 3600000);
    const minutos = Math.floor((ms % 3600000) / 60000);
    const segundos = Math.floor((ms % 60000) / 1000);

    return `${horas}h ${minutos}m ${segundos}s`;
}

/* =========================
   COMANDOS
========================= */

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

/* =========================
   REGISTRO COMANDOS
========================= */

const rest = new REST({ version: '10' }).setToken(TOKEN);

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

    /* =========================
       ESTADO
    ========================= */

    if (interaction.commandName === 'estado') {
        const usuarios = db.prepare('SELECT * FROM usuarios').all();

        if (!usuarios.length) {
            return interaction.reply({
                content: 'No hay usuarios registrados.',
                ephemeral: true
            });
        }

        let trabajando = '';
        let libres = '';

        for (const user of usuarios) {
            let total = Number(user.totalSemanal);

            if (user.semana !== semanaActual) {
                total = 0;
            }

            if (user.entrada) {
                total += (ahora - user.entrada);

                trabajando += `🟢 <@${user.userId}>\n⏱ ${formatTiempo(total)}\n\n`;
            } else {
                libres += `🔴 <@${user.userId}>\n⏱ ${formatTiempo(total)}\n\n`;
            }
        }

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Orange')
                    .setTitle('📊 Estado del personal')
                    .addFields(
                        {
                            name: '🟢 En servicio',
                            value: trabajando || 'Nadie trabajando',
                            inline: true
                        },
                        {
                            name: '🔴 Fuera de servicio',
                            value: libres || 'Todos trabajando',
                            inline: true
                        }
                    )
            ]
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

    if (row.semana !== semanaActual) {
        row.totalSemanal = 0;
        row.semana = semanaActual;
    }

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
