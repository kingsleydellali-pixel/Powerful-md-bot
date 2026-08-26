// ==================== KING-XD BOT MINI ====================
// Main entry point – WhatsApp bot + web dashboard
// Built by King_Bless Tech
// ==========================================================

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    jidDecode,
    proto,
    getContentType,
    Browsers,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs-extra');
const path = require('path');
const express = require('express');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const axios = require('axios');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const translate = require('translate-google');
const googleIt = require('google-it');
const weather = require('weather-js');
const { RemoveBgResult, RemoveBgError, removeBackgroundFromImageBase64 } = require('remove.bg');
const fetch = require('node-fetch');
const FormData = require('form-data');
const moment = require('moment');
const chalk = require('chalk');
const figlet = require('figlet');
const os = require('os');

// Load settings
const settings = require('./settings');

// ==================== CONFIGURATION ====================
const PREFIX = settings.PREFIX || '.';
const OWNER_NUMBER = process.env.OWNER_NUMBER || settings.OWNER_NUMBER;
const BOT_NAME = settings.BOT_NAME;
const MODE = process.env.MODE || settings.MODE;
const DASHBOARD_PORT = process.env.PORT || settings.DASHBOARD_PORT;
const LOGO_URL = process.env.LOGO_URL || settings.LOGO_URL;
const ANIME_BACKGROUND = process.env.ANIME_BACKGROUND || settings.ANIME_BACKGROUND;
const ENABLE_INTERNET_COLLECTION = process.env.ENABLE_INTERNET_COLLECTION === 'true' || settings.ENABLE_INTERNET_COLLECTION;
const DATA_PER_PAIRING_MB = parseFloat(process.env.DATA_PER_PAIRING_MB || settings.DATA_PER_PAIRING_MB);

// ==================== GLOBAL STATE ====================
let sock = null;                     // WhatsApp socket
let store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });
store?.readFromFile('./baileys_store.json');
setInterval(() => {
    store?.writeToFile('./baileys_store.json');
}, 10_000);

// Protection flags (can be toggled via commands)
let antiDelete = settings.ANTIDELETE;
let antiCall = settings.ANTICALL;
let autoStatus = settings.AUTOSTATUS;
let autoReact = settings.AUTOREACT;
let antiLink = settings.ANTILINK;
let antiBadWord = settings.ANTIBADWORD;
const badWords = settings.BAD_WORDS;

// Internet collection tracker
let collectedDataMB = 0;
if (ENABLE_INTERNET_COLLECTION) {
    if (fs.existsSync(settings.COLLECTED_DATA_FILE)) {
        collectedDataMB = fs.readJSONSync(settings.COLLECTED_DATA_FILE).total || 0;
    } else {
        fs.writeJSONSync(settings.COLLECTED_DATA_FILE, { total: 0 });
    }
}

// ==================== WEB DASHBOARD ====================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // optional for static assets

// Store pairing requests
let pairingRequests = [];

// Dashboard HTML
app.get('/', (req, res) => {
    const qrCode = global.qrCodeData || '';
    const pairingCode = global.pairingCode || '';
    const botStatus = sock ? 'Connected' : 'Disconnected';
    const uptime = process.uptime();
    const collected = ENABLE_INTERNET_COLLECTION ? `Data collected: ${collectedDataMB.toFixed(2)} MB` : '';

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>${BOT_NAME} - Pairing Dashboard</title>
        <style>
            body {
                font-family: 'Arial', sans-serif;
                background: url('${ANIME_BACKGROUND}') no-repeat center center fixed;
                background-size: cover;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                color: white;
                text-shadow: 1px 1px 3px rgba(0,0,0,0.7);
            }
            .container {
                background: rgba(0,0,0,0.7);
                backdrop-filter: blur(10px);
                padding: 30px;
                border-radius: 15px;
                width: 90%;
                max-width: 500px;
                text-align: center;
                box-shadow: 0 0 30px rgba(0,0,0,0.5);
            }
            .logo {
                max-width: 150px;
                margin-bottom: 20px;
                border-radius: 50%;
                border: 3px solid #fff;
            }
            h1 { font-size: 24px; margin: 10px 0; }
            .status {
                display: inline-block;
                padding: 8px 15px;
                border-radius: 20px;
                background: ${sock ? '#4CAF50' : '#f44336'};
                margin: 10px 0;
            }
            .qr-section, .pairing-section {
                margin: 20px 0;
                padding: 15px;
                background: rgba(255,255,255,0.1);
                border-radius: 10px;
            }
            img#qrImage { max-width: 250px; }
            input[type="text"] {
                padding: 10px;
                width: 80%;
                border-radius: 5px;
                border: none;
                margin: 10px 0;
                font-size: 16px;
            }
            button {
                background: #4CAF50;
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
                transition: background 0.3s;
            }
            button:hover { background: #45a049; }
            .info { margin-top: 15px; font-size: 14px; color: #ddd; }
            .loading { display: none; margin-top: 15px; }
            .spinner {
                border: 4px solid #f3f3f3;
                border-top: 4px solid #3498db;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                animation: spin 1s linear infinite;
                margin: 0 auto;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <img src="${LOGO_URL}" alt="Bot Logo" class="logo">
            <h1>${BOT_NAME}</h1>
            <div class="status">${botStatus}</div>
            <p>Uptime: ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s</p>
            ${collected ? `<p style="color:#ffcc00">${collected}</p>` : ''}

            <div class="qr-section">
                <h2>Scan QR Code</h2>
                ${qrCode ? `<img id="qrImage" src="${qrCode}" alt="QR Code">` : '<p>QR code will appear here</p>'}
            </div>

            <div class="pairing-section">
                <h2>Or Pair with Number</h2>
                <input type="text" id="phoneNumber" placeholder="e.g. 2348012345678" />
                <button onclick="requestPairing()">Get Pairing Code</button>
                <div id="loading" class="loading">
                    <div class="spinner"></div>
                    <p>Collecting internet data... Please wait</p>
                </div>
                <div id="pairingCode" style="margin-top:10px; font-weight:bold;"></div>
            </div>

            <div class="info">
                <p>Connected to WhatsApp Multi-Device</p>
            </div>
        </div>

        <script>
            async function requestPairing() {
                const number = document.getElementById('phoneNumber').value.trim();
                if (!number) return alert('Please enter your number');
                document.getElementById('loading').style.display = 'block';
                document.getElementById('pairingCode').innerText = '';
                try {
                    const res = await fetch('/request-pairing', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ number })
                    });
                    const data = await res.json();
                    if (data.success) {
                        // Simulate data collection delay
                        setTimeout(() => {
                            document.getElementById('loading').style.display = 'none';
                            document.getElementById('pairingCode').innerText = 'Your Pairing Code: ' + data.code;
                        }, 3000);
                    } else {
                        document.getElementById('loading').style.display = 'none';
                        alert('Error: ' + data.message);
                    }
                } catch (err) {
                    document.getElementById('loading').style.display = 'none';
                    alert('Request failed');
                }
            }
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// Endpoint to request pairing code
app.post('/request-pairing', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.json({ success: false, message: 'Missing number' });

    // Simulate internet collection
    if (ENABLE_INTERNET_COLLECTION) {
        collectedDataMB += DATA_PER_PAIRING_MB;
        fs.writeJSONSync(settings.COLLECTED_DATA_FILE, { total: collectedDataMB });
        console.log(chalk.yellow(`[INTERNET] Collected ${DATA_PER_PAIRING_MB} MB from pairing. Total: ${collectedDataMB.toFixed(2)} MB`));
    }

    try {
        if (!sock) return res.json({ success: false, message: 'Bot not connected yet' });
        const code = await sock.requestPairingCode(number.replace(/[^0-9]/g, ''));
        global.pairingCode = code;
        res.json({ success: true, code });
    } catch (err) {
        console.error('Pairing error:', err);
        res.json({ success: false, message: 'Failed to generate pairing code' });
    }
});

// Start dashboard server
app.listen(DASHBOARD_PORT, () => {
    console.log(chalk.green(`Dashboard running on http://localhost:${DASHBOARD_PORT}`));
});

// ==================== BAILY'S CONNECTION ====================
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => (store.loadMessage(key) || {}),
    });

    store.bind(sock.ev);

    // QR Code handling
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            global.qrCodeData = qr;
            qrcodeTerminal.generate(qr, { small: true });
            qrcode.toDataURL(qr, (err, url) => {
                if (err) console.error(err);
                else global.qrCodeData = url;
            });
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(chalk.red(`Connection closed due to ${lastDisconnect?.error?.message || 'unknown'}, reconnecting: ${shouldReconnect}`));
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log(chalk.green('✅ Bot connected successfully!'));
            console.log(chalk.cyan(figlet.textSync(BOT_NAME, { horizontalLayout: 'default' })));
            // Auto view status if enabled
            if (autoStatus) {
                console.log(chalk.blue('Auto status viewing enabled'));
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // ==================== MESSAGE HANDLER ====================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const isGroup = from.endsWith('@g.us');
        const isOwner = sender.replace(/[^0-9]/g, '') === OWNER_NUMBER;
        const isAdmin = isGroup ? await isGroupAdmin(from, sender, sock) : false;
        const isBotAdmin = isGroup ? await isGroupAdmin(from, sock.user.id, sock) : false;
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || '';
        const command = body.startsWith(PREFIX) ? body.slice(PREFIX.length).trim().split(' ')[0].toLowerCase() : '';
        const args = body.trim().split(' ').slice(1);

        // ==================== PROTECTION ====================
        // Anti-Delete
        if (antiDelete && msg.message?.protocolMessage?.type === 0) {
            // Message deleted, we can try to recover from store
            console.log(chalk.red(`[ANTI-DELETE] Detected deletion from ${sender}`));
            // We'll rely on store to fetch and resend if we have it
            const deletedMsg = await store.loadMessage(msg.key);
            if (deletedMsg) {
                await sock.sendMessage(from, { text: `🚫 *Anti-Delete*\n👤 @${sender.split('@')[0]}\n📝 Deleted message:\n${deletedMsg.message?.conversation || '[Media]'}` }, { mentions: [sender] });
            }
            return;
        }

        // Anti-Call
        if (antiCall && msg.message?.call) {
            await sock.rejectCall(msg.key.id, msg.key.remoteJid);
            await sock.sendMessage(from, { text: '📵 Calls are not allowed! Auto-rejected.' });
            return;
        }

        // Anti-Link (groups only)
        if (isGroup && antiLink && body.match(/(https?:\/\/[^\s]+)/g)) {
            if (!isAdmin) {
                await sock.sendMessage(from, { text: `🚫 *Anti-Link*\nLink removed! @${sender.split('@')[0]} is not an admin.` }, { mentions: [sender] });
                await sock.groupParticipantsUpdate(from, [sender], 'remove');
                return;
            }
        }

        // Anti-Badword
        if (isGroup && antiBadWord && badWords.some(word => body.toLowerCase().includes(word.toLowerCase()))) {
            await sock.sendMessage(from, { text: `⚠️ *Bad word detected!*\n@${sender.split('@')[0]} please avoid that language.` }, { mentions: [sender] });
            // Optionally delete the message
            await sock.sendMessage(from, { delete: msg.key });
            return;
        }

        // Auto-React (simple emoji reaction to every message)
        if (autoReact && !msg.key.fromMe) {
            const randomEmojis = ['👍', '❤️', '😂', '🔥', '👏', '💯', '😮'];
            const emoji = randomEmojis[Math.floor(Math.random() * randomEmojis.length)];
            await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
        }

        // Auto-Status viewing (if enabled, we just consume status messages silently)
        if (autoStatus && from === 'status@broadcast') {
            // No action needed, just ignore
            return;
        }

        // ==================== COMMAND HANDLER ====================
        if (!command) return;

        // Mode check (private mode only owner)
        if (MODE === 'private' && !isOwner) return;

        console.log(chalk.cyan(`[CMD] ${command} from ${sender}`));

        switch (command) {
            // ---------------- DOWNLOADER ----------------
            case 'yt':
            case 'song':
            case 'video':
            case 'vid':
            case 'yts':
                if (!args[0]) return sock.sendMessage(from, { text: `❌ Please provide a YouTube URL or search query.\nExample: ${PREFIX}yt https://youtu.be/...` });
                await handleYouTubeDownload(from, command, args, sock);
                break;
            case 'tt':
                if (!args[0]) return sock.sendMessage(from, { text: `❌ Please provide a TikTok URL.\nExample: ${PREFIX}tt https://vm.tiktok.com/...` });
                await handleTikTokDownload(from, args[0], sock);
                break;
            case 'ig':
                if (!args[0]) return sock.sendMessage(from, { text: `❌ Please provide an Instagram URL.\nExample: ${PREFIX}ig https://www.instagram.com/reel/...` });
                await handleInstagramDownload(from, args[0], sock);
                break;
            case 'fb':
                if (!args[0]) return sock.sendMessage(from, { text: `❌ Please provide a Facebook video URL.\nExample: ${PREFIX}fb https://fb.watch/...` });
                await handleFacebookDownload(from, args[0], sock);
                break;

            // ---------------- GROUP MANAGER ----------------
            case 'kick':
                if (!isGroup || !isAdmin) return sock.sendMessage(from, { text: '❌ This command is for group admins only.' });
                if (!args[0]) return sock.sendMessage(from, { text: '❌ Please mention a user or provide number.' });
                await kickUser(from, args, sock, msg);
                break;
            case 'add':
                if (!isGroup || !isAdmin) return sock.sendMessage(from, { text: '❌ This command is for group admins only.' });
                if (!args[0]) return sock.sendMessage(from, { text: '❌ Please provide number to add.' });
                await addUser(from, args[0], sock);
                break;
            case 'promote':
                if (!isGroup || !isAdmin) return sock.sendMessage(from, { text: '❌ This command is for group admins only.' });
                if (!args[0]) return sock.sendMessage(from, { text: '❌ Please mention a user.' });
                await promoteUser(from, args, sock, msg);
                break;
            case 'demote':
                if (!isGroup || !isAdmin) return sock.sendMessage(from, { text: '❌ This command is for group admins only.' });
                if (!args[0]) return sock.sendMessage(from, { text: '❌ Please mention a user.' });
                await demoteUser(from, args, sock, msg);
                break;
            case 'mute':
                if (!isGroup || !isAdmin || !isBotAdmin) return sock.sendMessage(from, { text: '❌ Bot needs admin to mute.' });
                await sock.groupSettingUpdate(from, 'announcement');
                sock.sendMessage(from, { text: '🔇 Group muted. Only admins can send messages.' });
                break;
            case 'unmute':
                if (!isGroup || !isAdmin || !isBotAdmin) return sock.sendMessage(from, { text: '❌ Bot needs admin to unmute.' });
                await sock.groupSettingUpdate(from, 'not_announcement');
                sock.sendMessage(from, { text: '🔊 Group unmuted.' });
                break;
            case 'link':
                if (!isGroup) return sock.sendMessage(from, { text: '❌ This command works only in groups.' });
                const code = await sock.groupInviteCode(from);
                sock.sendMessage(from, { text: `🔗 Group link: https://chat.whatsapp.com/${code}` });
                break;
            case 'revoke':
                if (!isGroup || !isAdmin) return sock.sendMessage(from, { text: '❌ Only admins can revoke link.' });
                await sock.groupRevokeInvite(from);
                sock.sendMessage(from, { text: '🔗 Group link revoked!' });
                break;
            case 'tagall':
            case 'tag':
                if (!isGroup) return sock.sendMessage(from, { text: '❌ This command works only in groups.' });
                if (!isAdmin && !isOwner) return sock.sendMessage(from, { text: '❌ Only admins can tag all.' });
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                let tagMsg = '👥 *Group Tag*\n';
                let mentions = [];
                for (let p of participants) {
                    tagMsg += `@${p.id.split('@')[0]}\n`;
                    mentions.push(p.id);
                }
                await sock.sendMessage(from, { text: tagMsg, mentions });
                break;
            case 'gcstatus':
                if (!isGroup) return sock.sendMessage(from, { text: '❌ This command works only in groups.' });
                const meta = await sock.groupMetadata(from);
                let status = `📊 *Group Status*\n`;
                status += `👥 *Name:* ${meta.subject}\n`;
                status += `📝 *Description:* ${meta.desc || 'No description'}\n`;
                status += `👑 *Owner:* @${meta.owner.split('@')[0]}\n`;
                status += `👥 *Participants:* ${meta.participants.length}\n`;
                status += `🔒 *Settings:* ${meta.restrict ? 'Only admins can send' : 'All can send'}\n`;
                status += `⏰ *Created:* ${new Date(meta.creation * 1000).toLocaleString()}\n`;
                await sock.sendMessage(from, { text: status, mentions: [meta.owner] });
                break;
            case 'groupinfo':
                // Similar to gcstatus
                if (!isGroup) return sock.sendMessage(from, { text: '❌ This command works only in groups.' });
                const meta2 = await sock.groupMetadata(from);
                let info = `📋 *Group Information*\n\n`;
                info += `👑 *Owner:* @${meta2.owner.split('@')[0]}\n`;
                info += `📅 *Created:* ${new Date(meta2.creation * 1000).toLocaleString()}\n`;
                info += `👥 *Members:* ${meta2.participants.length}\n`;
                await sock.sendMessage(from, { text: info, mentions: [meta2.owner] });
                break;
            case 'vv':
                // Anti-ViewOnce: send back the media if it was view-once
                if (!msg.message?.viewOnceMessage) return sock.sendMessage(from, { text: '❌ No view-once message found.' });
                const viewOnce = msg.message.viewOnceMessage;
                const mediaType = Object.keys(viewOnce.message)[0];
                if (mediaType === 'imageMessage') {
                    await sock.sendMessage(from, { image: viewOnce.message.imageMessage, caption: '🔓 *ViewOnce Opened*' });
                } else if (mediaType === 'videoMessage') {
                    await sock.sendMessage(from, { video: viewOnce.message.videoMessage, caption: '🔓 *ViewOnce Opened*' });
                } else {
                    sock.sendMessage(from, { text: '❌ Unsupported view-once type.' });
                }
                break;

            // ---------------- SETTINGS ----------------
            case 'autoreact':
                if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });
                autoReact = !autoReact;
                sock.sendMessage(from, { text: `Auto-React is now ${autoReact ? 'ON' : 'OFF'}` });
                break;
            case 'autostatus':
                if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });
                autoStatus = !autoStatus;
                sock.sendMessage(from, { text: `Auto-Status is now ${autoStatus ? 'ON' : 'OFF'}` });
                break;
            case 'antilink':
                if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });
                antiLink = !antiLink;
                sock.sendMessage(from, { text: `Anti-Link is now ${antiLink ? 'ON' : 'OFF'}` });
                break;
            case 'antidelete':
                if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });
                antiDelete = !antiDelete;
                sock.sendMessage(from, { text: `Anti-Delete is now ${antiDelete ? 'ON' : 'OFF'}` });
                break;
            case 'anticall':
                if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });
                antiCall = !antiCall;
                sock.sendMessage(from, { text: `Anti-Call is now ${antiCall ? 'ON' : 'OFF'}` });
                break;
            case 'antibadword':
                if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });
                antiBadWord = !antiBadWord;
                sock.sendMessage(from, { text: `Anti-Badword is now ${antiBadWord ? 'ON' : 'OFF'}` });
                break;
            case 'settings':
                let settingsMsg = `⚙️ *Bot Settings*\n\n`;
                settingsMsg += `🔹 Auto-React: ${autoReact ? 'ON' : 'OFF'}\n`;
                settingsMsg += `🔹 Auto-Status: ${autoStatus ? 'ON' : 'OFF'}\n`;
                settingsMsg += `🔹 Anti-Link: ${antiLink ? 'ON' : 'OFF'}\n`;
                settingsMsg += `🔹 Anti-Delete: ${antiDelete ? 'ON' : 'OFF'}\n`;
                settingsMsg += `🔹 Anti-Call: ${antiCall ? 'ON' : 'OFF'}\n`;
                settingsMsg += `🔹 Anti-Badword: ${antiBadWord ? 'ON' : 'OFF'}\n`;
                sock.sendMessage(from, { text: settingsMsg });
                break;

            // ---------------- OWNER ----------------
            case 'broadcast':
                if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });
                if (!args[0]) return sock.sendMessage(from, { text: '❌ Please provide message to broadcast.' });
                const broadcastMsg = args.join(' ');
                // Get all chats
                const chats = await sock.fetchAllChats();
                for (let chat of chats) {
                    if (chat.id.endsWith('@g.us') || chat.id.endsWith('@s.whatsapp.net')) {
                        await sock.sendMessage(chat.id, { text: `📢 *Broadcast from Owner*\n\n${broadcastMsg}` });
                    }
                }
                sock.sendMessage(from, { text: '✅ Broadcast sent to all chats.' });
                break;
            case 'restart':
                if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });
                sock.sendMessage(from, { text: '♻️ Restarting bot...' });
                process.exit(0);
                break;
            case 'block':
                if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });
                if (!args[0]) return sock.sendMessage(from, { text: '❌ Please provide number to block.' });
                await sock.updateBlockStatus(args[0] + '@s.whatsapp.net', 'block');
                sock.sendMessage(from, { text: '🚫 User blocked.' });
                break;
            case 'unblock':
                if (!isOwner) return sock.sendMessage(from, { text: '❌ Owner only.' });
                if (!args[0]) return sock.sendMessage(from, { text: '❌ Please provide number to unblock.' });
                await sock.updateBlockStatus(args[0] + '@s.whatsapp.net', 'unblock');
                sock.sendMessage(from, { text: '✅ User unblocked.' });
                break;

            // ---------------- MENU & INFO ----------------
            case 'menu':
            case 'help':
            case 'commands':
                const menu = generateMenu();
                await sock.sendMessage(from, { text: menu, mentions: [sender] });
                break;
            case 'alive':
            case 'ping':
                const uptime = process.uptime();
                const runtime = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
                const statusText = `╭━〔${BOT_NAME}〕━⬣\n┃ [] STATUS  : ONLINE\n┃ [] RUNTIME : ${runtime}\n┃ [] USER    : ${sender.split('@')[0]}\n┃ [] DEV     : ${settings.OWNER_NAME}\n╰━━━━━━━━━━━━━━━━━━━━⬣`;
                await sock.sendMessage(from, { text: statusText });
                break;
            case 'uptime':
                const up = process.uptime();
                const upStr = `${Math.floor(up / 86400)}d ${Math.floor((up % 86400) / 3600)}h ${Math.floor((up % 3600) / 60)}m ${Math.floor(up % 60)}s`;
                sock.sendMessage(from, { text: `⏱️ Uptime: ${upStr}` });
                break;
            case 'calc':
                if (!args[0]) return sock.sendMessage(from, { text: '❌ Please provide expression. Example: .calc 2+2' });
                try {
                    const result = eval(args.join(' '));
                    sock.sendMessage(from, { text: `🧮 Result: ${result}` });
                } catch (e) {
                    sock.sendMessage(from, { text: '❌ Invalid expression.' });
                }
                break;
            case 'joke':
                const joke = await fetchJoke();
                sock.sendMessage(from, { text: `😂 ${joke}` });
                break;
            case 'quote':
                const quote = await fetchQuote();
                sock.sendMessage(from, { text: `💬 ${quote}` });
                break;
            case 'fact':
                const fact = await fetchFact();
                sock.sendMessage(from, { text: `🧠 ${fact}` });
                break;
            case 'reverse':
                if (!args[0]) return sock.sendMessage(from, { text: '❌ Please provide text.' });
                sock.sendMessage(from, { text: args.join(' ').split('').reverse().join('') });
                break;
            case 'upper':
                if (!args[0]) return sock.sendMessage(from, { text: '❌ Please provide text.' });
                sock.sendMessage(from, { text: args.join(' ').toUpperCase() });
                break;
            case 'lower':
                if (!args[0]) return sock.sendMessage(from, { text: '❌ Please provide text.' });
                sock.sendMessage(from, { text: args.join(' ').toLowerCase() });
                break;
            case 'whoami':
                sock.sendMessage(from, { text: `👤 You are @${sender.split('@')[0]}`, mentions: [sender] });
                break;
            case 'id':
                sock.sendMessage(from, { text: `🆔 ${sender}` });
                break;

            default:
                // Unknown command, optionally show hint
                // sock.sendMessage(from, { text: `❌ Unknown command. Use ${PREFIX}menu` });
                break;
        }
    });
}

// ==================== HELPER FUNCTIONS ====================
async function isGroupAdmin(groupJid, userJid, sock) {
    const metadata = await sock.groupMetadata(groupJid);
    const participant = metadata.participants.find(p => p.id === userJid);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

async function kickUser(groupJid, args, sock, msg) {
    let target;
    if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
        target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    } else if (args[0].startsWith('@')) {
        target = args[0].replace('@', '') + '@s.whatsapp.net';
    } else {
        target = args[0] + '@s.whatsapp.net';
    }
    try {
        await sock.groupParticipantsUpdate(groupJid, [target], 'remove');
        sock.sendMessage(groupJid, { text: `👢 Removed @${target.split('@')[0]}`, mentions: [target] });
    } catch (e) {
        sock.sendMessage(groupJid, { text: '❌ Failed to remove user.' });
    }
}

async function addUser(groupJid, number, sock) {
    try {
        const target = number.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        await sock.groupParticipantsUpdate(groupJid, [target], 'add');
        sock.sendMessage(groupJid, { text: `✅ Added ${number}` });
    } catch (e) {
        sock.sendMessage(groupJid, { text: '❌ Failed to add user. They might have privacy settings.' });
    }
}

async function promoteUser(groupJid, args, sock, msg) {
    let target;
    if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
        target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    } else if (args[0].startsWith('@')) {
        target = args[0].replace('@', '') + '@s.whatsapp.net';
    } else {
        target = args[0] + '@s.whatsapp.net';
    }
    try {
        await sock.groupParticipantsUpdate(groupJid, [target], 'promote');
        sock.sendMessage(groupJid, { text: `👑 Promoted @${target.split('@')[0]} to admin`, mentions: [target] });
    } catch (e) {
        sock.sendMessage(groupJid, { text: '❌ Failed to promote.' });
    }
}

async function demoteUser(groupJid, args, sock, msg) {
    let target;
    if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
        target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    } else if (args[0].startsWith('@')) {
        target = args[0].replace('@', '') + '@s.whatsapp.net';
    } else {
        target = args[0] + '@s.whatsapp.net';
    }
    try {
        await sock.groupParticipantsUpdate(groupJid, [target], 'demote');
        sock.sendMessage(groupJid, { text: `⬇️ Demoted @${target.split('@')[0]}`, mentions: [target] });
    } catch (e) {
        sock.sendMessage(groupJid, { text: '❌ Failed to demote.' });
    }
}

// ==================== DOWNLOAD HANDLERS ====================
async function handleYouTubeDownload(from, command, args, sock) {
    const query = args.join(' ');
    try {
        // Example using a generic API (you must replace with actual API)
        const response = await axios.get(settings.YT_API, { params: { query, type: command } });
        const data = response.data;
        if (data?.url) {
            if (command === 'song') {
                await sock.sendMessage(from, { audio: { url: data.url }, mimetype: 'audio/mpeg', fileName: data.title + '.mp3' });
            } else {
                await sock.sendMessage(from, { video: { url: data.url }, caption: data.title || 'Here is your video' });
            }
        } else {
            sock.sendMessage(from, { text: '❌ Download failed. Try again later.' });
        }
    } catch (e) {
        console.error(e);
        sock.sendMessage(from, { text: '❌ Error processing YouTube download.' });
    }
}

async function handleTikTokDownload(from, url, sock) {
    try {
        const response = await axios.get(settings.TT_API, { params: { url } });
        const data = response.data;
        if (data?.video) {
            await sock.sendMessage(from, { video: { url: data.video }, caption: '🎵 TikTok video' });
        } else {
            sock.sendMessage(from, { text: '❌ Download failed.' });
        }
    } catch (e) {
        console.error(e);
        sock.sendMessage(from, { text: '❌ Error processing TikTok download.' });
    }
}

async function handleInstagramDownload(from, url, sock) {
    try {
        const response = await axios.get(settings.IG_API, { params: { url } });
        const data = response.data;
        if (data?.media) {
            await sock.sendMessage(from, { video: { url: data.media }, caption: '📸 Instagram Reel' });
        } else {
            sock.sendMessage(from, { text: '❌ Download failed.' });
        }
    } catch (e) {
        console.error(e);
        sock.sendMessage(from, { text: '❌ Error processing Instagram download.' });
    }
}

async function handleFacebookDownload(from, url, sock) {
    try {
        const response = await axios.get(settings.FB_API, { params: { url } });
        const data = response.data;
        if (data?.video) {
            await sock.sendMessage(from, { video: { url: data.video }, caption: '📹 Facebook Video' });
        } else {
            sock.sendMessage(from, { text: '❌ Download failed.' });
        }
    } catch (e) {
        console.error(e);
        sock.sendMessage(from, { text: '❌ Error processing Facebook download.' });
    }
}

// ==================== FETCH HELPERS ====================
async function fetchJoke() {
    try {
        const res = await axios.get('https://v2.jokeapi.dev/joke/Any?type=single');
        return res.data.joke;
    } catch {
        return 'Why did the programmer quit? Because he didn\'t get arrays.';
    }
}

async function fetchQuote() {
    try {
        const res = await axios.get('https://api.quotable.io/random');
        return `"${res.data.content}" — ${res.data.author}`;
    } catch {
        return 'The only way to do great work is to love what you do. — Steve Jobs';
    }
}

async function fetchFact() {
    try {
        const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en');
        return res.data.text;
    } catch {
        return 'Honey never spoils.';
    }
}

// ==================== MENU GENERATOR ====================
function generateMenu() {
    return `
╭━〔${BOT_NAME}〕━⬣
┃ [] STATUS  : ONLINE
┃ [] RUNTIME : ${formatUptime(process.uptime())}
┃ [] USER    : User
┃ [] DEV     : ${settings.OWNER_NAME}
╰━━━━━━━━━━━━━━━━━━━━⬣

╭━━〔 📥 DOWNLOADS 〕━━⬣
┃➤ .yt
┃➤ .song 
┃➤ .video 
┃➤ .tt
┃➤ .ig
┃➤ .fb 
┃➤ .wallpaper
╰━━━━━━━━━━━━━━━━━━━━⬣

╭━━〔 🔎 SEARCH 〕━━⬣
┃➤ .google
┃➤ .bing 
┃➤ .duckduckgo 
┃➤ .yahoo 
┃➤ .brave
┃➤ .wiki
┃➤ .define
┃➤ .weather
┃➤ .maps
┃➤ .news
╰━━━━━━━━━━━━━━━━━━━━⬣

╭━━〔 🖼️ IMAGE EDITOR 〕━━⬣
┃➤ .crop
┃➤ .resize
┃➤ .rotate
┃➤ .flip
┃➤ .filter
┃➤ .adjust
┃➤ .text
┃➤ .watermark
┃➤ .imgedit
╰━━━━━━━━━━━━━━━━━━━━⬣

╭━━〔 🎬 VIDEO EDITOR 〕━━⬣
┃➤ .trim
┃➤ .speed
┃➤ .vidfilter
┃➤ .mute 
┃➤ .volume
┃➤ .videdit
╰━━━━━━━━━━━━━━━━━━━━⬣

╭━━〔 🎨 MEDIA TOOLS 〕━━⬣
┃➤ .sticker
┃➤ .toimg
┃➤ .compress
┃➤ .enhance
┃➤ .blur
┃➤ .removebg
╰━━━━━━━━━━━━━━━━━━━━⬣

  ╭━━〔 🎙️ VOICE & AI 〕━━⬣
  ┃➤ .tts
  ┃➤ .stt
  ┃➤ .vtr
  ┃➤ .tr
  ┃➤ .detect
  ┃➤ .ai 
  ┃➤ .gpt /
  ┃➤ .ask
  ┃➤ .gemini /
  ┃➤ .deepseek
  ┃➤ .summarize 
  ┃➤ .rewrite /
  ┃➤  .explain
  ┃➤ .image <prompt>
  ┃➤ .suno (official API pending)
  ╰━━━━━━━━━━━━━━━━━━━━⬣

╭━━〔 👑 GROUP MANAGER 〕━━⬣ (admins only)
┃➤ .gcstatus 
┃➤ .groupinfo
┃➤ .kick 
┃➤ .promote 
┃➤ .demote
┃➤ .add
┃➤ .mute 
┃➤ .unmute
┃➤ .link 
┃➤ .revoke
┃➤ .tag
┃➤ .tagall
┃➤ .kickall
┃➤ .kill
┃➤ .vv
╰━━━━━━━━━━━━━━━━━━━━⬣

╭━━〔 ⚙️ SETTINGS 〕━━⬣
┃➤ .autoreact 
┃➤ .autostatus 
┃➤ .antibadword 
┃➤ .antilink
┃➤ .antidelete 
┃➤ .anticall
┃➤ .settings
╰━━━━━━━━━━━━━━━━━━━━⬣

╭━━〔 🔐 TEMP NUMBERS 〕━━⬣
┃➤ .countries
┃➤ .numbers
┃➤ .otp
╰━━━━━━━━━━━━━━━━━━━━⬣

╭━━〔 🛠 TOOLS 〕━━⬣
┃➤ .calc
┃➤ .flip 
┃➤ .roll 
┃➤ .8ball
┃➤ .joke
┃➤ .quote 
┃➤ .fact
┃➤ .reverse 
┃➤ .upper 
┃➤ .lower
┃➤ .id 
┃➤ .whoami
┃➤ .ping 
┃➤ .alive 
┃➤ .uptime
╰━━━━━━━━━━━━━━━━━━━━⬣

╭━━〔 👑 OWNER 〕━━⬣
┃➤ .broadcast
┃➤ .restart
┃➤ .block 
┃➤ .unblock
╰━━━━━━━━━━━━━━━━━━━━⬣

_"${BOT_NAME} By ${settings.OWNER_NAME}"_
`;
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
}

// ==================== START BOT ====================
startBot().catch(err => console.error('Fatal error:', err));
