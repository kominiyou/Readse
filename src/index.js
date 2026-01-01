/**
 * ═══════════════════════════════════════════════════════════════
 *  Base Script    : Bang Dika Ardnt
 *  Recode By      : Bang Wilykun
 *  WhatsApp       : 6289688206739
 *  Telegram       : @Wilykun1994
 * ═══════════════════════════════════════════════════════════════
 *  Script ini GRATIS, tidak untuk diperjualbelikan!
 *  Jika ketahuan menjual script ini = NO UPDATE / NO FIX
 *  Hargai kerja keras developer, gunakan dengan bijak!
 * ═══════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import makeWASocket, {
        delay,
        useMultiFileAuthState,
        DisconnectReason,
        Browsers,
        makeCacheableSignalKeyStore,
        areJidsSameUser,
        isLidUser,
        fetchLatestBaileysVersion,
        jidNormalizedUser,
        jidDecode,
} from 'baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';

import JSONDB from './db/json.js';
import { initBotStats } from './db/botStats.js';
import { injectClient } from './helper/inject.js';
import { getCaseName, loadConfig } from './helper/utils.js';
import { MemoryMonitor } from './helper/memoryMonitor.js';
import { getPhoneRegion, formatPhoneWithRegion } from './helper/phoneRegion.js';
import { ensureTmpDir } from './helper/cleaner.js';

if (!process.env.BOT_SESSION_NAME) process.env.BOT_SESSION_NAME = 'default';
if (!process.env.BOT_NUMBER_OWNER) process.env.BOT_NUMBER_OWNER = '1';

const botStats = initBotStats();

const sessionDir = (global.sessionDir = path.join(process.cwd(), 'sessions', process.env.BOT_SESSION_NAME));

if (process.env.BOT_MAX_RETRIES && isNaN(Number(process.env.BOT_MAX_RETRIES))) {
        console.warn('\x1b[33mWarning: BOT_MAX_RETRIES is not a valid number. Disabling max retry limit.\x1b[39m');
        delete process.env.BOT_MAX_RETRIES;
}

const logger = pino({ 
        level: process.env.BOT_LOGGER_LEVEL || 'silent',
        hooks: {
                logMethod(inputArgs, method) {
                        const msg = inputArgs[0];
                        if (typeof msg === 'string' && (msg.includes('Closing session') || msg.includes('SessionEntry'))) {
                                return;
                        }
                        return method.apply(this, inputArgs);
                }
        }
}).child({ class: 'Aja Sendiri' });

const silentLogger = pino({ level: 'silent' });

const filterLogs = (message) => {
        if (typeof message !== 'string') return false;
        const blockedPatterns = [
                'Closing stale open session',
                'Closing session:',
                'Closing session',
                'SessionEntry',
                'prekey bundle',
                'Closing open session',
                '_chains',
                'registrationId',
                'currentRatchet',
                'pendingPreKey',
                'baseKey:',
                'ephemeralKeyPair',
                'lastRemoteEphemeralKey',
                'indexInfo',
                'baseKeyType',
                'Failed to decrypt message',
                'Decrypted message with closed session',
                'Session error',
                'Bad MAC',
                'libsignal/src/crypto.js',
                'libsignal/src/session_cipher.js',
                'verifyMAC',
                'doDecryptWhisperMessage',
                'decryptWithSessions',
                'Message absent from node',
                'chainKey',
                'chainType',
                'messageKeys',
                'previousCounter',
                'rootKey',
                'pubKey',
                'privKey',
                'remoteIdentityKey',
                '<Buffer',
                'Buffer ',
                'signedKeyId',
                'preKeyId',
                'closed:',
                'used:',
                'created:'
        ];
        return blockedPatterns.some(pattern => message.includes(pattern));
};

const isSessionObject = (obj) => {
        if (!obj || typeof obj !== 'object') return false;
        return obj._chains || obj.registrationId || obj.currentRatchet || 
                   obj.indexInfo || obj.pendingPreKey || obj.ephemeralKeyPair ||
                   obj.chainKey || obj.pubKey || obj.privKey || obj.rootKey ||
                   obj.baseKey || obj.signedKeyId || obj.preKeyId;
};

const originalConsoleLog = console.log;
console.log = (...args) => {
        for (const arg of args) {
                if (typeof arg === 'string' && filterLogs(arg)) return;
                if (isSessionObject(arg)) return;
        }
        
        try {
                const fullMessage = args.map(a => {
                        if (typeof a === 'string') return a;
                        if (typeof a === 'object' && a !== null) {
                                const str = JSON.stringify(a);
                                if (str && filterLogs(str)) return '__BLOCKED__';
                                return str;
                        }
                        return String(a);
                }).join(' ');
                
                if (fullMessage.includes('__BLOCKED__') || filterLogs(fullMessage)) return;
        } catch (e) {
                // If stringify fails, check object properties directly
                for (const arg of args) {
                        if (isSessionObject(arg)) return;
                }
        }
        
        originalConsoleLog.apply(console, args);
};

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
        const msg = args[0];
        if (typeof msg === 'string' && filterLogs(msg)) return;
        originalConsoleWarn.apply(console, args);
};

const originalConsoleError = console.error;
console.error = (...args) => {
        const msg = args[0];
        if (typeof msg === 'string' && filterLogs(msg)) return;
        originalConsoleError.apply(console, args);
};

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, callback) => {
        if (typeof chunk === 'string') {
                if (filterLogs(chunk)) return true;
                if (chunk.includes('SessionEntry {') || chunk.includes('_chains:') || 
                    chunk.includes('registrationId:') || chunk.includes('currentRatchet:') ||
                    chunk.includes('ephemeralKeyPair:') || chunk.includes('indexInfo:') ||
                    chunk.includes('<Buffer')) return true;
        }
        return originalStdoutWrite(chunk, encoding, callback);
};

const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, encoding, callback) => {
        if (typeof chunk === 'string') {
                if (filterLogs(chunk)) return true;
                if (chunk.includes('SessionEntry {') || chunk.includes('_chains:') || 
                    chunk.includes('registrationId:') || chunk.includes('currentRatchet:') ||
                    chunk.includes('ephemeralKeyPair:') || chunk.includes('indexInfo:') ||
                    chunk.includes('<Buffer')) return true;
        }
        return originalStderrWrite(chunk, encoding, callback);
};

let reconnectCount = 0;
let memoryMonitor = null;
let botConnectedAt = 0;

async function main() {
        console.log(`\x1b[36mStarting with session directory: ${sessionDir}\x1b[39m`);

        if (memoryMonitor) {
                memoryMonitor.stop();
        }
        memoryMonitor = new MemoryMonitor({
                onLimitReached: () => {
                        console.log('\x1b[33mMemory limit reached. Restarting process...\x1b[39m');
                        process.exit(1);
                }
        });
        memoryMonitor.start();
        global.memoryMonitor = memoryMonitor;

        if (reconnectCount > 0) {
                console.warn(`\x1b[33mReconnecting... Attempt ${reconnectCount}\x1b[39m`);
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();

        console.info(
                `\x1b[32mUsing WhatsApp version: ${version.join('.')}${
                        isLatest ? '' : ' (latest version is recommended)'
                }\x1b[39m`
        );

        const cacheMsg = new Map();
        const groups = new JSONDB('groups', sessionDir);
        const contacts = new JSONDB('contacts', sessionDir);
        const settings = new JSONDB('settings', sessionDir);

        const config = loadConfig();
        const autoOnlineConfig = config.autoOnline || {};
        
        const hisoka = injectClient(
                makeWASocket({
                        version,
                        logger,
                        auth: {
                                creds: state.creds,
                                keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
                        },
                        browser: ['Mac OS', 'Safari', '26.0'],
                        generateHighQualityLinkPreview: false,
                        syncFullHistory: true,
                        markOnlineOnConnect: autoOnlineConfig.enabled !== false,
                        fireInitQueries: false,
                        shouldSyncHistoryMessage: () => true,
                        shouldIgnoreJid: jid => jid?.endsWith('@newsletter'),
                        connectTimeoutMs: 60000,
                        retryRequestDelayMs: 250,
                        transactionOpts: {
                                maxCommitRetries: 5,
                                delayBetweenTriesMs: 500
                        },
                        cachedGroupMetadata: async jid => {
                                const group = groups.read(jid);
                                if (!group || !group.participants.length) {
                                        const metadata = await hisoka.groupMetadata(jid);
                                        groups.write(jid, metadata);
                                        return metadata;
                                }
                                return group;
                        },
                        getMessage: async key => {
                                const msg = cacheMsg.get(key.id);
                                return msg?.message || '';
                        },
                }),
                cacheMsg,
                contacts,
                groups,
                settings
        );

        const pairingNumber = process.env.BOT_NUMBER_PAIR || false;
        if (pairingNumber && !hisoka.authState.creds?.registered) {
                try {
                        let phoneNumber = pairingNumber.replace(/[^0-9]/g, '');
                        await delay(3000);
                        let code = await hisoka.requestPairingCode(phoneNumber);
                        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

                        const phoneInfo = formatPhoneWithRegion(phoneNumber);

                        const cyan = '\x1b[36m';
                        const yellow = '\x1b[33m';
                        const green = '\x1b[32m';
                        const white = '\x1b[37m';
                        const magenta = '\x1b[35m';
                        const bold = '\x1b[1m';
                        const dim = '\x1b[2m';
                        const reset = '\x1b[0m';
                        
                        console.log('');
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${bold}${green}🤖 WHATSAPP BOT PAIRING 2025${reset}`);
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log('');
                        console.log(`${white}📌 Kode Pairing: ${bold}${green}${formattedCode}${reset}`);
                        console.log('');
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${bold}${magenta}📱 INFO NOMOR${reset}`);
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${phoneInfo.flag} ${white}Negara : ${bold}${green}${phoneInfo.region}${reset}`);
                        console.log(`${yellow}📞${reset} ${white}Kode   : ${bold}${yellow}${phoneInfo.countryCode}${reset}`);
                        console.log(`${cyan}📱${reset} ${white}Nomor  : ${bold}${cyan}${phoneInfo.formatted}${reset}`);
                        console.log('');
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${bold}${yellow}📋 CARA PAIRING${reset}`);
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log('');
                        console.log(`${green}1.${reset} Buka ${bold}${green}WhatsApp${reset} di HP`);
                        console.log(`${green}2.${reset} Ketuk ${bold}${yellow}⋮${reset} (titik 3) kanan atas`);
                        console.log(`${green}3.${reset} Pilih ${bold}${yellow}Perangkat Tertaut${reset}`);
                        console.log(`${green}4.${reset} Ketuk ${bold}${yellow}Tautkan Perangkat${reset}`);
                        console.log(`${green}5.${reset} Ketuk ${bold}${cyan}Tautkan dgn nomor telepon${reset}`);
                        console.log(`${green}6.${reset} Masukkan: ${bold}${green}${formattedCode.replace(/-/g, '')}${reset}`);
                        console.log('');
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${bold}${magenta}💡 TIPS${reset}`);
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${dim}•${reset} Pastikan HP online`);
                        console.log(`${dim}•${reset} Kode berlaku ${yellow}60 detik${reset}`);
                        console.log(`${dim}•${reset} Restart bot jika expired`);
                        console.log('');
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log(`${bold}${green}✅ KODE BERHASIL DIBUAT!${reset}`);
                        console.log(`${yellow}⏳ Menunggu konfirmasi WA...${reset}`);
                        console.log(`${cyan}────────────────────────────────${reset}`);
                        console.log('');
                } catch {
                        console.error('\x1b[31mFailed to request pairing code. Please check your pairing number.\x1b[39m');
                        process.exit(1);
                }
        }

        hisoka.ev.on('creds.update', saveCreds);

        hisoka.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
                if (qr && !pairingNumber) {
                        qrcode.generate(qr, { small: true }, code => {
                                console.log('\x1b[36mScan this QR code to connect:\x1b[39m\n');
                                console.log(code);
                        });
                }

                if (connection === 'open') {
                        lastDisconnect = 0;
                        botConnectedAt = Math.floor(Date.now() / 1000);
                        console.log(`\x1b[32mConnected successfully! ${JSON.stringify(hisoka.user, null, 2)}\x1b[39m`);

                        console.info('\x1b[36mFetching privacy settings...\x1b[39m');
                        const privacySettings = await hisoka.fetchPrivacySettings();
                        settings.write('privacy', privacySettings);

                        console.info('\x1b[36mLoading command handlers...\x1b[39m');
                        const commands = await getCaseName(path.join(process.cwd(), 'src', 'handler', 'message.js'));
                        hisoka.loadedCommands = commands;
                        console.info(`\x1b[32mLoaded ${commands.length} command handlers.\x1b[39m`);

                        const startAutoOnline = () => {
                                const config = loadConfig();
                                const autoOnline = config.autoOnline || {};

                                if (global.autoOnlineInterval) {
                                        clearInterval(global.autoOnlineInterval);
                                        global.autoOnlineInterval = null;
                                }

                                const intervalMs = (autoOnline.intervalSeconds || 30) * 1000;

                                if (autoOnline.enabled) {
                                        hisoka.sendPresenceUpdate('available');
                                        global.autoOnlineInterval = setInterval(() => {
                                                hisoka.sendPresenceUpdate('available');
                                        }, intervalMs);
                                        console.log(`\x1b[32m[AutoOnline]\x1b[39m Started - Mode: ONLINE - Interval: ${autoOnline.intervalSeconds || 30}s`);
                                } else {
                                        hisoka.sendPresenceUpdate('unavailable');
                                        global.autoOnlineInterval = setInterval(() => {
                                                hisoka.sendPresenceUpdate('unavailable');
                                        }, intervalMs);
                                        console.log(`\x1b[33m[AutoOffline]\x1b[39m Started - Mode: OFFLINE - Interval: ${autoOnline.intervalSeconds || 30}s`);
                                }
                        };

                        startAutoOnline();
                        global.startAutoOnline = startAutoOnline;
                        global.hisokaClient = hisoka;

                        ensureTmpDir();
                }

                if (connection === 'close') {
                        if (global.autoOnlineInterval) {
                                clearInterval(global.autoOnlineInterval);
                                global.autoOnlineInterval = null;
                                console.log(`\x1b[33m[AutoOnline]\x1b[39m Cleared on disconnect`);
                        }

                        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode || 0;

                        switch (statusCode) {
                                case DisconnectReason.loggedOut:
                                case DisconnectReason.forbidden:
                                        console.error('\x1b[31mSession expired or logged out. Please re-authenticate.\x1b[39m');
                                        const dirContents = await fs.promises.readdir(sessionDir);
                                        for (const file of dirContents) {
                                                if (file.startsWith('.env')) continue;
                                                await fs.promises.rm(path.join(sessionDir, file), { recursive: true, force: true });
                                        }
                                        process.exit(1);
                                        break;

                                case DisconnectReason.restartRequired:
                                        console.info('\x1b[33mRestart required. Reconnecting...\x1b[39m');
                                        await main();
                                        break;

                                case 408:
                                        if (hisoka.authState.creds?.registered) {
                                                console.info('\x1b[33mConnection timeout. Reconnecting...\x1b[39m');
                                                await delay(3000);
                                                main();
                                        } else {
                                                if (Number(process.env.BOT_MAX_RETRIES) && reconnectCount >= Number(process.env.BOT_MAX_RETRIES)) {
                                                        console.info(`\x1b[33mPairing timeout. Max retries reached. Exiting...\x1b[39m`);
                                                        process.exit(1);
                                                }
                                                reconnectCount++;
                                                console.info(`\x1b[33mPairing timeout. Reconnecting... Attempt ${reconnectCount}\x1b[39m`);
                                                await delay(Math.min(5 * reconnectCount, 30) * 1000);
                                                main();
                                        }
                                        break;

                                default:
                                        if (Number(process.env.BOT_MAX_RETRIES) && reconnectCount >= Number(process.env.BOT_MAX_RETRIES)) {
                                                console.error(`\x1b[31mMax retries reached (${process.env.BOT_MAX_RETRIES}). Exiting...\x1b[39m`);
                                                process.exit(1);
                                        }

                                        reconnectCount++;
                                        console.error(
                                                `\x1b[31mConnection closed unexpectedly. Reconnecting in ${Math.min(
                                                        5 * reconnectCount,
                                                        30
                                                )} seconds... (Attempt ${reconnectCount})\x1b[39m`
                                        );

                                        await delay(Math.min(5 * reconnectCount, 30) * 1000);
                                        main();
                                        break;
                        }
                }
        });

        hisoka.ev.on('contacts.upsert', async contactsData => {
                await Promise.all(
                        contactsData.map(async contact => {
                                const jid = await hisoka.resolveLidToPN({ remoteJid: contact.id, remoteJidAlt: contact.phoneNumber });
                                const existingContact = (await contacts.read(jid)) || {};
                                contacts.write(
                                        jid,
                                        Object.assign(
                                                isLidUser(contact.id) ? { id: jid, lid: contact.id } : {},
                                                { isContact: true },
                                                existingContact,
                                                contact
                                        )
                                );
                        })
                );
        });

        hisoka.ev.on('contacts.update', async contactsData => {
                await Promise.all(
                        contactsData.map(async contact => {
                                const jid = await hisoka.resolveLidToPN({ remoteJid: contact.id, remoteJidAlt: contact.phoneNumber });
                                const existingContact = (await contacts.read(jid)) || {};
                                contacts.write(
                                        jid,
                                        Object.assign(isLidUser(contact.id) ? { id: jid, lid: contact.id } : {}, existingContact, contact)
                                );
                        })
                );
        });

        hisoka.ev.on('groups.upsert', async groupsData => {
                await Promise.all(
                        groupsData.map(async group => {
                                const groupId = group.id;
                                const existingGroup = groups.read(groupId) || {};
                                groups.write(groupId, { ...existingGroup, ...group });

                                if (process.env.BOT_AUTO_UPSWGC === 'true') {
                                        try {
                                                await delay(2000);
                                                const groupMetadata = await hisoka.groupMetadata(groupId);
                                                const allMembers = groupMetadata.participants.map(p => p.id);
                                                const groupName = groupMetadata.subject;
                                                
                                                const storyText = `🎉 Bot telah bergabung ke grup:\n\n*${groupName}*\n\nKetik .menu untuk melihat fitur!`;
                                                
                                                await hisoka.sendMessage('status@broadcast', 
                                                        { text: storyText },
                                                        {
                                                                statusJidList: allMembers,
                                                                broadcast: true,
                                                                backgroundColor: '#128C7E',
                                                                font: 2
                                                        }
                                                );

                                                console.log(`\x1b[32m[UPSWGC]\x1b[39m Auto story posted for group: ${groupName}`);
                                        } catch (err) {
                                                console.error(`\x1b[31m[UPSWGC] Error:\x1b[39m`, err.message);
                                        }
                                }
                        })
                );
        });

        hisoka.ev.on('groups.update', async groupsData => {
                await Promise.all(
                        groupsData.map(group => {
                                const groupId = group.id;
                                const existingGroup = groups.read(groupId) || {};
                                return groups.write(groupId, { ...existingGroup, ...group });
                        })
                );
        });

        hisoka.ev.on('group-participants.update', ({ id, author, participants, action }) => {
                const existingGroup = groups.read(id) || {};

                switch (action) {
                        case 'add':
                                existingGroup.participants = [...(existingGroup.participants || []), ...participants];
                                break;
                        case 'remove':
                        case 'modify':
                                existingGroup.participants = (existingGroup.participants || []).filter(p => {
                                        const existId = p.phoneNumber || p.id;
                                        return !participants.some(removed => areJidsSameUser(existId, removed.phoneNumber || removed.id));
                                });
                                break;
                        case 'promote':
                        case 'demote':
                                existingGroup.participants = (existingGroup.participants || []).map(p => {
                                        const existId = p.phoneNumber || p.id;
                                        if (participants.some(modified => areJidsSameUser(existId, modified.phoneNumber || modified.id))) {
                                                return { ...p, admin: action === 'promote' ? 'admin' : null };
                                        }
                                        return p;
                                });
                                break;
                        default:
                                console.warn(`\x1b[33mUnknown group action: ${action}\x1b[39m`);
                                return;
                }

                groups.write(id, existingGroup);
        });

        hisoka.ev.on('messages.upsert', async messagesUpsert => {
                for (const message of messagesUpsert.messages) {
                        if (message.key && message.message) {
                                if (!hisoka.cacheMsg.has(message.key.id)) {
                                        hisoka.cacheMsg.set(message.key.id, message);
                                }
                        }

                        const msgTimestamp = message.messageTimestamp || 0;
                        const msgTime = typeof msgTimestamp === 'number' ? msgTimestamp : parseInt(msgTimestamp) || 0;
                        
                        if (botConnectedAt > 0 && msgTime > 0 && msgTime < (botConnectedAt - 60)) {
                                continue;
                        }


                        const messageHandler = await import('./handler/message.js?v=' + Date.now());
                        await messageHandler.default({ ...messagesUpsert, message }, hisoka);
                }
        });

        hisoka.ev.on('messages.update', async updates => {
                for (const update of updates) {
                        try {
                                const { default: handleDeletedMessage } = await import('./handler/antidelete.js?v=' + Date.now());
                                await handleDeletedMessage(update, hisoka);
                        } catch (err) {
                                console.error('\x1b[31m[AntiDelete] Error processing update:\x1b[39m', err.message);
                        }
                }
        });

        hisoka.ev.on('call', async calls => {
                for (const call of calls) {
                        try {
                                const config = loadConfig();
                                const antiCall = config.antiCall || { enabled: false, message: '', whitelist: [] };
                                const antiCallVideo = config.antiCallVideo || { enabled: false, message: '', whitelist: [] };
                                
                                const isVideoCall = call.isVideo === true;
                                const currentConfig = isVideoCall ? antiCallVideo : antiCall;
                                const featureName = isVideoCall ? 'AntiCallVideo' : 'AntiCall';
                                
                                if (!currentConfig.enabled) continue;
                                
                                let callerJid = call.from;
                                let callerNumber = '';
                                let callerName = '';
                                
                                try {
                                        let contactData = null;
                                        
                                        if (isLidUser(call.from)) {
                                                const pnJid = await hisoka.signalRepository.lidMapping.getPNForLID(call.from);
                                                if (pnJid) {
                                                        callerJid = jidNormalizedUser(pnJid);
                                                } else {
                                                        const normalizedLid = jidNormalizedUser(call.from);
                                                        contactData = contacts.find(c => 
                                                                areJidsSameUser(c.lid, normalizedLid) || areJidsSameUser(c.lid, call.from)
                                                        );
                                                        if (contactData && contactData.id) {
                                                                callerJid = jidNormalizedUser(contactData.id);
                                                        } else {
                                                                callerJid = normalizedLid;
                                                        }
                                                }
                                        } else {
                                                callerJid = jidNormalizedUser(call.from);
                                        }
                                        
                                        callerNumber = jidDecode(callerJid)?.user || '';
                                        
                                        if (!contactData) {
                                                contactData = contacts.read(callerJid);
                                        }
                                        
                                        if (!contactData) {
                                                contactData = contacts.find(c => 
                                                        areJidsSameUser(c.phoneNumber || c.id, callerJid) ||
                                                        areJidsSameUser(c.lid, call.from)
                                                );
                                        }
                                        
                                        if (contactData) {
                                                callerName = contactData.name || contactData.verifiedName || contactData.notify || callerNumber;
                                        } else {
                                                callerName = hisoka.getName(callerJid, true);
                                                if (callerName === callerNumber) {
                                                        callerName = callerNumber;
                                                }
                                        }
                                } catch (resolveErr) {
                                        callerNumber = jidDecode(call.from)?.user || call.from.replace(/[^0-9]/g, '');
                                        callerName = callerNumber;
                                }
                                
                                const whitelist = currentConfig.whitelist || [];
                                const isWhitelisted = whitelist.some(num => {
                                        const cleanNum = num.replace(/[^0-9]/g, '');
                                        return callerNumber.includes(cleanNum) || cleanNum.includes(callerNumber);
                                });
                                
                                if (isWhitelisted) {
                                        console.log(`\x1b[33m[${featureName}]\x1b[39m Call from ${callerName} (${callerNumber}) - WHITELISTED, skipping reject`);
                                        continue;
                                }
                                
                                if (call.status === 'offer') {
                                        await hisoka.rejectCall(call.id, call.from);
                                        console.log(`\x1b[32m[${featureName}]\x1b[39m Rejected ${isVideoCall ? 'video' : 'voice'} call from ${callerName} (${callerNumber})`);
                                        
                                        if (currentConfig.message) {
                                                await delay(1000);
                                                await hisoka.sendMessage(call.from, { text: currentConfig.message });
                                                console.log(`\x1b[32m[${featureName}]\x1b[39m Sent rejection message to ${callerName} (${callerNumber})`);
                                        }
                                }
                        } catch (err) {
                                console.error('\x1b[31m[AntiCall] Error:\x1b[39m', err.message);
                        }
                }
        });
}

process.on('uncaughtException', (err) => {
        console.error('\x1b[31m[CRITICAL] Uncaught Exception:\x1b[39m', err.message);
        console.error(err.stack);
        console.error('\x1b[33m[SYSTEM] Process will restart in 3 seconds...\x1b[39m');
        setTimeout(() => process.exit(1), 3000);
});

process.on('unhandledRejection', (reason, promise) => {
        console.error('\x1b[31m[CRITICAL] Unhandled Rejection at:\x1b[39m', promise);
        console.error('\x1b[31mReason:\x1b[39m', reason);
        console.error('\x1b[33m[SYSTEM] Process will restart in 3 seconds...\x1b[39m');
        setTimeout(() => process.exit(1), 3000);
});

process.on('SIGTERM', () => {
        console.log('\x1b[33m[SYSTEM] Received SIGTERM, graceful shutdown...\x1b[39m');
        if (memoryMonitor) memoryMonitor.stop();
        if (global.autoOnlineInterval) clearInterval(global.autoOnlineInterval);
        process.exit(0);
});

process.on('SIGINT', () => {
        console.log('\x1b[33m[SYSTEM] Received SIGINT, graceful shutdown...\x1b[39m');
        if (memoryMonitor) memoryMonitor.stop();
        if (global.autoOnlineInterval) clearInterval(global.autoOnlineInterval);
        process.exit(0);
});

main().catch(err => {
        console.error('\x1b[31mAn error occurred:\x1b[39m');
        console.error(err);
        console.error('\x1b[33m[SYSTEM] Process will restart in 3 seconds...\x1b[39m');
        setTimeout(() => process.exit(1), 3000);
});
