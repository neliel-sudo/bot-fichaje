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
   NUMERO SEMANA
========================= */

function getWeekNumber() {

    const date = new Date();

    const firstDay = new Date(
        date.getFullYear(),
        0,
        1
    );

    const days = Math.floor(
        (date - firstDay) /
        (24 * 60 * 60 * 1000)
    );

    return Math.ceil(
        (days + firstDay.getDay() + 1) / 7
    );
}

/* =========================
   FORMATO TIEMPO
========================= */

function formatTiempo(ms) {

    const horas = Math.floor(ms / 3600000);

    const minutos = Math.floor(
        (ms % 3600000) / 60000
    );

    const segundos = Math.floor(
        (ms % 60000) / 1000
    );

    return `${horas} horas, ${minutos} minutos y ${segundos} segundos`;
}

/* =========================
   COMANDOS
========================= */

const ficharCommand = new SlashCommandBuilder()
    .setName('fichar')
    .setDescription('Entrar o salir del trabajo');

const estadoCommand = new SlashCommandBuilder()
    .setName('estado')
    .setDescription('Ver quién está trabajando');

const horasCommand = new SlashCommandBuilder()
    .setName('comprobar-horas-semanales')
    .setDescription('Ver horas semanales de todos los empleados');

/* =========================
   REGISTRO COMANDOS
========================= */

const rest = new REST({ version: '10' })
    .setToken(TOKEN);

(async () => {

    try {

        console.log('Registrando comandos...');

        await rest.put(
            Routes.applicationGuildCommands(
                CLIENT_ID,
                GUILD_ID
            ),
            {
                body: [
                    ficharCommand.toJSON(),
                    estadoCommand.toJSON(),
                    horasCommand.toJSON()
                ]
            }
        );

        console.log('Comandos registrados.');

    } catch (err) {

        console.error(err);
    }

})();

/* =========================
   INTERACCIONES
========================= */

client.on('interactionCreate', async interaction => {

    if (!interaction.isChatInputCommand()) return;

    if (
        interaction.commandName !== 'fichar' &&
        interaction.commandName !== 'estado' &&
        interaction.commandName !== 'comprobar-horas-semanales'
    ) return;

    const userId = interaction.user.id;
    const ahora = Date.now();
    const semanaActual = getWeekNumber();

    /* =========================
       COMANDO ESTADO
    ========================= */

    if (interaction.commandName === 'estado') {

        const usuarios = db.prepare(
            'SELECT * FROM usuarios'
        ).all();

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

                trabajando +=
                    `🟢 <@${user.userId}>\n` +
                    `⏱ ${formatTiempo(total)}\n\n`;

            } else {

                libres +=
                    `🔴 <@${user.userId}>\n` +
                    `⏱ ${formatTiempo(total)}\n\n`;
            }
        }

        if (!trabajando) {
            trabajando = 'Nadie trabajando';
        }

        if (!libres) {
            libres = 'Todos trabajando';
        }

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Orange')
                    .setTitle('📊 Estado del personal')
                    .addFields(
                        {
                            name: '🟢 En servicio',
                            value: trabajando,
                            inline: true
                        },
                        {
                            name: '🔴 Fuera de servicio',
                            value: libres,
                            inline: true
                        }
                    )
                    .setTimestamp()
            ]
        });
    }

    /* =========================
       COMPROBAR HORAS
    ========================= */

    if (
        interaction.commandName ===
        'comprobar-horas-semanales'
    ) {

        const usuarios = db.prepare(
            'SELECT * FROM usuarios'
        ).all();

        if (!usuarios.length) {

            return interaction.reply({
                content: 'No hay empleados registrados.',
                ephemeral: true
            });
        }

        let descripcion = '';

        for (const user of usuarios) {

            let total = Number(user.totalSemanal);

            if (user.semana !== semanaActual) {
                total = 0;
            }

            let estado = '🔴 Fuera de servicio.';

            if (user.entrada) {

                total += (ahora - user.entrada);

                estado = '🟢 En servicio.';
            }

            let nombre = `Usuario ${user.userId}`;

            try {

                const miembro =
                    await interaction.guild.members.fetch(
                        user.userId
                    );

                nombre = miembro.user.username;

            } catch (err) {}

            descripcion +=
                `## ${nombre}\n` +
                `> **Estado:** ${estado}\n` +
                `> **Horas semanales totales:** ${formatTiempo(total)}.\n\n`;
        }

        const embed = new EmbedBuilder()
            .setColor('#2B2D31')
            .setTitle(
                'Horas semanales de los empleados de Los Santos Custom'
            )
            .setDescription(descripcion)
            .setFooter({
                text: `Total empleados: ${usuarios.length}`
            })
            .setTimestamp();

        return interaction.reply({
            embeds: [embed]
        });
    }

    /* =========================
       FICHAR
    ========================= */

    let row = db.prepare(
        'SELECT * FROM usuarios WHERE userId = ?'
    ).get(userId);

    /* =========================
       PRIMERA VEZ
    ========================= */

    if (!row) {

        db.prepare(`
            INSERT INTO usuarios(
                userId,
                entrada,
                totalSemanal,
                semana
            )
            VALUES (?, ?, 0, ?)
        `).run(
            userId,
            ahora,
            semanaActual
        );

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Green')
                    .setTitle('⏱️ Registro de fichaje')
                    .setDescription(
                        `👤 ${interaction.user.tag}\n\n` +
                        `🟢 Entrada registrada:\n${horaEspaña(ahora)}`
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

        const duracion =
            ahora - row.entrada;

        const nuevoTotal =
            Number(row.totalSemanal) +
            duracion;

        db.prepare(`
            UPDATE usuarios
            SET entrada = NULL,
                totalSemanal = ?,
                semana = ?
            WHERE userId = ?
        `).run(
            nuevoTotal,
            semanaActual,
            userId
        );

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('Blue')
                    .setTitle('⏱️ Registro de fichaje')
                    .setDescription(
                        `👤 ${interaction.user.tag}\n\n` +

                        `🟢 Entrada:\n${horaEspaña(row.entrada)}\n\n` +

                        `🔴 Salida:\n${horaEspaña(ahora)}\n\n` +

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
    `).run(
        ahora,
        userId
    );

    interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor('Green')
                .setTitle('⏱️ Registro de fichaje')
                .setDescription(
                    `👤 ${interaction.user.tag}\n\n` +
                    `🟢 Entrada registrada:\n${horaEspaña(ahora)}`
                )
        ]
    });
});

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
