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

'use strict';

import fs from 'fs';
import path from 'path';
import { jidNormalizedUser, toNumber, jidDecode, proto, isPnUser, isJidGroup, delay } from 'baileys';

import { telegram } from '../helper/index.js';
import { isNumber } from '../helper/text.js';
import { getRandomEmoji, getStatusEmojis } from '../helper/emoji.js';
import { getTmpPath } from '../helper/cleaner.js';

function loadConfig() {
        try {
                const configPath = path.join(process.cwd(), 'config.json');
                if (fs.existsSync(configPath)) {
                        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                }
        } catch (err) {}
        return {};
}

function getGreeting() {
        const hour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false });
        const h = parseInt(hour);
        if (h >= 5 && h < 11) return 'Pagi';
        if (h >= 11 && h < 15) return 'Siang';
        if (h >= 15 && h < 18) return 'Sore';
        return 'Malam';
}

function getMediaTypeEmoji(type) {
        const mediaTypes = {
                imageMessage: ['Gambar', '🖼️'],
                videoMessage: ['Video', '🎥'],
                audioMessage: ['Audio', '🎵'],
                stickerMessage: ['Sticker', '🎨'],
                documentMessage: ['Dokumen', '📄'],
                extendedTextMessage: ['Teks', '📝'],
                conversation: ['Teks', '📝'],
                protocolMessage: ['Protocol', '⚙️'],
                viewOnceMessageV2: ['View Once', '👁️'],
                viewOnceMessage: ['View Once', '👁️'],
                viewOnceMessageV2Extension: ['View Once', '👁️'],
                interactiveMessage: ['Interactive', '🎯'],
                listMessage: ['List', '📋'],
                buttonsMessage: ['Buttons', '🔘'],
                templateMessage: ['Template', '📃'],
                pollCreationMessage: ['Poll', '📊'],
                reactionMessage: ['Reaction', '💬'],
                liveLocationMessage: ['Live Location', '📍'],
                locationMessage: ['Location', '📍'],
                contactMessage: ['Contact', '👤'],
                contactsArrayMessage: ['Contacts', '👥'],
        };
        return mediaTypes[type] || ['Media', '📨'];
}

const storyDebounce = new Map();
const processedStories = new Set();

async function syncAllStories(hisoka) {
        const config = loadConfig();
        const storyConfig = config.autoReadStory || {};
        
        if (storyConfig.enabled === false) return;
        
        try {
                const statusList = await hisoka.fetchStatus();
                
                if (!statusList || statusList.length === 0) {
                        return;
                }
                
                const privacySettings = hisoka.settings.read('privacy') || {};
                const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self';
                const shouldReact = storyConfig.autoReaction !== false;
                
                let totalSynced = 0;
                let totalReacted = 0;
                
                for (const status of statusList) {
                        if (!status.messages || status.messages.length === 0) continue;
                        
                        const userJid = status.id;
                        const userName = hisoka.getName(userJid, true) || jidDecode(userJid)?.user || 'Unknown';
                        
                        for (const msg of status.messages) {
                                const storyKey = `${msg.key.remoteJid}_${msg.key.id}`;
                                
                                if (processedStories.has(storyKey)) continue;
                                processedStories.add(storyKey);
                                
                                try {
                                        if (!msg.key || !msg.key.id || !msg.key.remoteJid) continue;
                                        
                                        const useRandomDelay = storyConfig.randomDelay !== false;
                                        const delayMinMs = storyConfig.delayMinMs || 500;
                                        const delayMaxMs = storyConfig.delayMaxMs || 2000;
                                        const fixedDelayMs = storyConfig.fixedDelayMs || 300;
                                        
                                        const delayMs = useRandomDelay 
                                                ? Math.floor(Math.random() * (delayMaxMs - delayMinMs)) + delayMinMs
                                                : fixedDelayMs;
                                        
                                        await new Promise(resolve => setTimeout(resolve, delayMs));
                                        
                                        // Cek apakah koneksi masih terbuka sebelum lanjut
                                        if (hisoka.ws.readyState !== 1) {
                                            console.log(`\x1b[33m[AutoReadSW] Koneksi terputus, membatalkan proses.\x1b[39m`);
                                            return;
                                        }

                                        const maxRetries = 3;
                                        let readSuccess = false;
                                        
                                        for (let attempt = 1; attempt <= maxRetries && !readSuccess; attempt++) {
                                                try {
                                                        await hisoka.sendReceipts([msg.key], readType);
                                                        readSuccess = true;
                                                        totalSynced++;
                                                } catch (err) {
                                                        if (hisoka.ws.readyState !== 1) break;
                                                        if (attempt < maxRetries) {
                                                                await new Promise(resolve => setTimeout(resolve, 300 * attempt));
                                                        }
                                                }
                                        }
                                        
                                        if (shouldReact && readSuccess && hisoka.ws.readyState === 1) {
                                                const emoji = getRandomEmoji();
                                                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                                                        try {
                                                                await hisoka.sendMessage(
                                                                        'status@broadcast',
                                                                        { react: { key: msg.key, text: emoji } },
                                                                        { statusJidList: [jidNormalizedUser(hisoka.user.id), jidNormalizedUser(userJid)] }
                                                                );
                                                                totalReacted++;
                                                                break;
                                                        } catch (err) {
                                                                if (hisoka.ws.readyState !== 1) break;
                                                                if (attempt < maxRetries) {
                                                                        await new Promise(resolve => setTimeout(resolve, 300 * attempt));
                                                                }
                                                        }
                                                }
                                        }
                                } catch (err) {
                                        // Continue with next story
                                }
                        }
                        
                        console.log(`\x1b[32m[AutoReadSW] Berhasil sinkron ${status.messages.length} story dari ${userName}\x1b[39m`);
                }
                
                console.log(`\x1b[36m[AutoReadSW] Sinkronisasi selesai! Dibaca: ${totalSynced}, Reaksi: ${totalReacted}\x1b[39m`);
                
                setTimeout(() => {
                        processedStories.clear();
                }, 60000);
                
        } catch (err) {
                console.error('\x1b[31m[AutoReadSW] Gagal sinkron:\x1b[39m', err.message);
        }
}

export { syncAllStories };

function maskNumber(number) {
        if (!number) return '***';
        const clean = number.replace(/[^0-9]/g, '');
        if (clean.length <= 6) return clean;
        return clean.slice(0, 4) + '****' + clean.slice(-3);
}

function getDisplayWidth(str) {
        let width = 0;
        for (const char of str) {
                const code = char.codePointAt(0);
                if (code > 0x1F600 && code < 0x1F9FF) width += 2;
                else if (code > 0x2600 && code < 0x27BF) width += 2;
                else if (code > 0x1F300 && code < 0x1F5FF) width += 2;
                else if (code > 0x1F900 && code < 0x1F9FF) width += 2;
                else if (code > 0x2700 && code < 0x27BF) width += 2;
                else if (code > 0xFE00 && code < 0xFE0F) width += 0;
                else if (code > 0x3000 && code < 0x9FFF) width += 2;
                else if (code > 0xFF00 && code < 0xFFEF) width += 2;
                else width += 1;
        }
        return width;
}

function padEnd(str, targetWidth) {
        const currentWidth = getDisplayWidth(str);
        const padding = Math.max(0, targetWidth - currentWidth);
        return str + ' '.repeat(padding);
}

function logStoryView(data) {
        const { mediaType, greeting, dayName, date, time, name, number, success, reaction, delaySeconds, mode } = data;
        
        const cyan = '\x1b[36m';
        const yellow = '\x1b[33m';
        const green = '\x1b[32m';
        const white = '\x1b[37m';
        const magenta = '\x1b[35m';
        const reset = '\x1b[0m';
        const bold = '\x1b[1m';
        
        const boxWidth = 45;
        const labelWidth = 14;
        const contentWidth = boxWidth - labelWidth - 5;
        const title = 'AutoReadStoryWhatsApp';
        const titlePadding = Math.floor((boxWidth - title.length) / 2);
        
        const mediaStr = `${mediaType[0]} ${mediaType[1]}`;
        const successStr = success;
        const reactionStr = reaction;
        const delayStr = delaySeconds !== null ? `${delaySeconds} detik` : '-';
        const modeStr = mode || 'Baca + Reaksi';
        const modeColor = mode === 'Baca Saja' ? yellow : green;
        
        console.log(`${cyan}╭${'─'.repeat(boxWidth)}╮${reset}`);
        console.log(`${cyan}│${' '.repeat(titlePadding)}${bold}${yellow}${title}${reset}${cyan}${' '.repeat(boxWidth - titlePadding - title.length)}│${reset}`);
        console.log(`${cyan}├${'─'.repeat(boxWidth)}┤${reset}`);
        console.log(`${cyan}│${reset} ${white}» Mode        : ${modeColor}${padEnd(modeStr, contentWidth)}${reset}${cyan}│${reset}`);
        console.log(`${cyan}│${reset} ${white}» Tipe Media  : ${green}${padEnd(mediaStr, contentWidth)}${reset}${cyan}│${reset}`);
        console.log(`${cyan}│${reset} ${white}» Selamat     : ${yellow}${padEnd(greeting, contentWidth)}${reset}${cyan}│${reset}`);
        console.log(`${cyan}│${reset} ${white}» Hari        : ${yellow}${padEnd(dayName, contentWidth)}${reset}${cyan}│${reset}`);
        console.log(`${cyan}│${reset} ${white}» Tanggal     : ${yellow}${padEnd(date, contentWidth)}${reset}${cyan}│${reset}`);
        console.log(`${cyan}│${reset} ${white}» Waktu       : ${yellow}${padEnd(time, contentWidth)}${reset}${cyan}│${reset}`);
        console.log(`${cyan}│${reset} ${white}» Nama        : ${yellow}${padEnd(name.slice(0, contentWidth - 2), contentWidth)}${reset}${cyan}│${reset}`);
        console.log(`${cyan}│${reset} ${white}» Nomor       : ${yellow}${padEnd(number, contentWidth)}${reset}${cyan}│${reset}`);
        console.log(`${cyan}│${reset} ${white}» Berhasil    : ${green}${padEnd(successStr, contentWidth)}${reset}${cyan}│${reset}`);
        console.log(`${cyan}│${reset} ${white}» Reaksi      : ${padEnd(reactionStr, contentWidth)}${reset}${cyan}│${reset}`);
        console.log(`${cyan}│${reset} ${white}» Delay       : ${magenta}${padEnd(delayStr, contentWidth)}${reset}${cyan}│${reset}`);
        console.log(`${cyan}╰${'─'.repeat(boxWidth)}╯${reset}`);
}

export default async function (m, hisoka) {
        try {

                if (m.content && m.content.contextInfo && isNumber(m.content.contextInfo.expiration) && isPnUser(m.from)) {
                        const expiration = m.content.contextInfo.expiration;
                        const ephemeralSettingTimestamp = toNumber(m.content.contextInfo.ephemeralSettingTimestamp);
                        const contact = hisoka.contacts.read(m.from) || {};
                        hisoka.contacts.write(m.from, { ...contact, ephemeralSettingTimestamp, ephemeralDuration: expiration });
                }

                if (m.message.protocolMessage) {
                        const protocolMessage = m.message.protocolMessage;
                        const key = protocolMessage.key;
                        const type = protocolMessage.type;

                        switch (type) {
                                case proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING:
                                case proto.Message.ProtocolMessage.Type.EPHEMERAL_SYNC_RESPONSE: {
                                        const id = await hisoka.resolveLidToPN(key);
                                        const contact = hisoka.contacts.read(id) || {};
                                        hisoka.contacts.write(id, {
                                                ...contact,
                                                ephemeralSettingTimestamp: toNumber(
                                                        protocolMessage.ephemeralSettingTimestamp || m.message.messageTimestamp
                                                ),
                                                ephemeralDuration: protocolMessage.ephemeralExpiration,
                                        });
                                        break;
                                }
                        }
                }

                if (!m.isBot && !m.status && m.message && m.type && m.type !== 'protocolMessage' && m.type !== 'reactionMessage') {
                        const config = loadConfig();
                        const autoTyping = config.autoTyping || {};
                        const autoRecording = config.autoRecording || {};
                        
                        const isPrivate = isPnUser(m.from);
                        const isGroup = isJidGroup(m.from);
                        
                        const shouldAutoType = autoTyping.enabled && 
                                ((isPrivate && autoTyping.privateChat) || (isGroup && autoTyping.groupChat));
                        
                        const shouldAutoRecord = autoRecording.enabled && 
                                ((isPrivate && autoRecording.privateChat) || (isGroup && autoRecording.groupChat));
                        
                        if (shouldAutoType || shouldAutoRecord) {
                                (async () => {
                                        try {
                                                if (shouldAutoType && !shouldAutoRecord) {
                                                        await hisoka.sendPresenceUpdate('composing', m.from);
                                                        const delayMs = (autoTyping.delaySeconds || 5) * 1000;
                                                        await delay(delayMs);
                                                        await hisoka.sendPresenceUpdate('paused', m.from);
                                                } else if (shouldAutoRecord && !shouldAutoType) {
                                                        await hisoka.sendPresenceUpdate('recording', m.from);
                                                        const delayMs = (autoRecording.delaySeconds || 5) * 1000;
                                                        await delay(delayMs);
                                                        await hisoka.sendPresenceUpdate('paused', m.from);
                                                } else if (shouldAutoType && shouldAutoRecord) {
                                                        await hisoka.sendPresenceUpdate('composing', m.from);
                                                        const typingDelayMs = (autoTyping.delaySeconds || 5) * 1000;
                                                        await delay(typingDelayMs);
                                                        await hisoka.sendPresenceUpdate('recording', m.from);
                                                        const recordingDelayMs = (autoRecording.delaySeconds || 5) * 1000;
                                                        await delay(recordingDelayMs);
                                                        await hisoka.sendPresenceUpdate('paused', m.from);
                                                }
                                        } catch (err) {
                                                console.error('\x1b[31m[AutoTyping/Recording] Gagal:\x1b[39m', err.message);
                                        }
                                })();
                        }
                }

                if (m.status && m.message && m.type) {
                        const config = loadConfig();
                        const storyConfig = config.autoReadStory || {};
                        
                        if (storyConfig.enabled === false) return;

                        if (!m.key || !m.key.id || !m.key.remoteJid) {
                                return;
                        }

                        if (m.type === 'protocolMessage' || m.type === 'reactionMessage') {
                                return;
                        }

                        if (m.message.protocolMessage || m.message.reactionMessage) {
                                return;
                        }

                        const messageContent = m.message;
                        
                        const isValidStory = messageContent.imageMessage || 
                                             messageContent.videoMessage || 
                                             messageContent.audioMessage || 
                                             messageContent.extendedTextMessage ||
                                             messageContent.conversation || 
                                             messageContent.stickerMessage;
                        
                        if (!isValidStory) {
                                return;
                        }

                        const storyTimestamp = toNumber(m.messageTimestamp) * 1000;
                        const currentTime = Date.now();
                        const storyAge = currentTime - storyTimestamp;
                        
                        if (storyAge > 24 * 60 * 60 * 1000) {
                                return;
                        }

                        const privacySettings = hisoka.settings.read('privacy') || {};
                        const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self';
                        
                        const reactStatus = getStatusEmojis();
                        let usedReaction = reactStatus.length ? getRandomEmoji('status') : '❌';

                        const useRandomDelay = storyConfig.randomDelay !== false;
                        const delayMinMs = storyConfig.delayMinMs || 500;
                        const delayMaxMs = storyConfig.delayMaxMs || 5000;
                        const fixedDelayMs = storyConfig.fixedDelayMs || 1000;
                        
                        const delayMs = useRandomDelay 
                                ? Math.floor(Math.random() * (delayMaxMs - delayMinMs)) + delayMinMs
                                : fixedDelayMs;

                        const shouldReact = storyConfig.autoReaction !== false && reactStatus.length;

                        await new Promise(resolve => setTimeout(resolve, delayMs));
                        
                        // Cek koneksi sebelum eksekusi
                        if (!hisoka.ws || hisoka.ws.readyState !== 1) return;

                        const maxRetries = 3;
                        let readSuccess = false;
                        let reactSuccess = false;

                        for (let attempt = 1; attempt <= maxRetries && !readSuccess; attempt++) {
                                try {
                                        await hisoka.sendReceipts([m.key], readType);
                                        readSuccess = true;
                                } catch (err) {
                                        console.error(`\x1b[31m[AutoReadSW] Gagal kirim tanda baca (attempt ${attempt}/${maxRetries}):\x1b[39m`, err.message);
                                        if (attempt < maxRetries) {
                                                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                                        }
                                }
                        }

                        if (shouldReact) {
                                for (let attempt = 1; attempt <= maxRetries && !reactSuccess; attempt++) {
                                        try {
                                                await hisoka.sendMessage(
                                                        'status@broadcast',
                                                        {
                                                                react: { key: m.key, text: usedReaction },
                                                        },
                                                        {
                                                                statusJidList: [jidNormalizedUser(hisoka.user.id), jidNormalizedUser(m.sender)],
                                                        }
                                                );
                                                reactSuccess = true;
                                        } catch (err) {
                                                console.error(`\x1b[31m[AutoReadSW] Reaksi Gagal (attempt ${attempt}/${maxRetries}):\x1b[39m`, err.message);
                                                if (attempt < maxRetries) {
                                                        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                                                } else {
                                                        usedReaction = '❌ Gagal';
                                                }
                                        }
                                }
                        }

                        const from = jidNormalizedUser(m.participant || m.sender);
                        const storyName = hisoka.getName(from, true);
                        const storyNumber = jidDecode(from)?.user || '';
                        const messageDate = new Date(toNumber(m.messageTimestamp) * 1000);
                        
                        const now = Date.now();
                        const debounceKey = from;
                        const lastLog = storyDebounce.get(debounceKey);
                        const telegramConfig = loadConfig().telegram || {};
                        
                        if (lastLog) {
                                lastLog.count++;
                                storyDebounce.set(debounceKey, lastLog);
                        } else {
                                storyDebounce.set(debounceKey, { time: now, count: 1 });
                                
                                const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
                                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
                                
                                const jakartaDate = new Date(messageDate.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
                                const dayName = dayNames[jakartaDate.getDay()];
                                const dateStr = `${jakartaDate.getDate()} ${monthNames[jakartaDate.getMonth()]} ${jakartaDate.getFullYear()}`;
                                const timeStr = jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');
                                
                                let successMsg = '✅Ke Bot Tele';
                                if (!telegramConfig.enabled || !telegramConfig.chatId || !telegramConfig.token) {
                                        successMsg = '✅Dibaca';
                                }
                                
                                logStoryView({
                                        mediaType: getMediaTypeEmoji(m.type),
                                        greeting: getGreeting(),
                                        dayName: dayName,
                                        date: dateStr,
                                        time: timeStr,
                                        name: storyName,
                                        number: maskNumber(storyNumber),
                                        success: successMsg,
                                        reaction: shouldReact ? usedReaction : '❌ Mati',
                                        delaySeconds: (delayMs / 1000).toFixed(1),
                                        mode: shouldReact ? 'Baca + Reaksi' : 'Baca Saja'
                                });
                                
                                setTimeout(() => {
                                        const data = storyDebounce.get(debounceKey);
                                        if (data && data.count > 1) {
                                                console.log(`\x1b[33m   └─ +${data.count - 1} story lainnya dari ${storyName}\x1b[39m`);
                                        }
                                        storyDebounce.delete(debounceKey);
                                }, 3000);
                        }

                        if (telegramConfig.enabled && telegramConfig.chatId && telegramConfig.token) {
                                const text = `<b>From :</b> <a href="https://wa.me/${jidDecode(from).user}">@${storyName}</a>
<b>Date :</b> ${new Date(toNumber(m.messageTimestamp) * 1000).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })}
${m.text ? `<b>Caption :</b>\n\n${m.text}` : ''}`.trim();

                                if (m.isMedia) {
                                        try {
                                                const media = await m.downloadMedia();
                                                
                                                if (!media || media.length === 0) {
                                                        await telegram.send(telegramConfig.chatId, text + '\n\n<i>(Media tidak tersedia)</i>', { type: 'text', parse_mode: 'HTML' });
                                                } else {
                                                        const ext = m.type === 'imageMessage' ? 'jpg' : m.type === 'videoMessage' ? 'mp4' : m.type === 'audioMessage' ? 'mp3' : 'bin';
                                                        const tmpFile = getTmpPath(`story_${Date.now()}.${ext}`);
                                                        
                                                        try {
                                                                fs.writeFileSync(tmpFile, media);
                                                                
                                                                await telegram.send(telegramConfig.chatId, media, {
                                                                        caption: text,
                                                                        type: m.type.replace('Message', ''),
                                                                        parse_mode: 'HTML',
                                                                });
                                                                
                                                                fs.unlinkSync(tmpFile);
                                                        } catch (err) {
                                                                if (fs.existsSync(tmpFile)) {
                                                                        fs.unlinkSync(tmpFile);
                                                                }
                                                                console.error('\x1b[31m[AutoReadSW] Error sending to Telegram:\x1b[39m', err.message);
                                                        }
                                                }
                                        } catch (downloadErr) {
                                                console.error('\x1b[33m[AutoReadSW] Media unavailable:\x1b[39m', downloadErr.message);
                                                await telegram.send(telegramConfig.chatId, text + '\n\n<i>(Media tidak tersedia)</i>', { type: 'text', parse_mode: 'HTML' }).catch(() => {});
                                        }
                                } else {
                                        await telegram.send(telegramConfig.chatId, text, { type: 'text', parse_mode: 'HTML' });
                                }
                        }
                }
        } catch (e) {
                console.error(`\x1b[31mError in event handler:\x1b[39m\n`, e);
        }
}
