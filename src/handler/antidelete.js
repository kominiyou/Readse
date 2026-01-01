/**
 * ═══════════════════════════════════════════════════════════════
 *  Anti-Delete Message Handler
 *  Fitur untuk mendeteksi dan menyimpan pesan yang dihapus
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

import fs from 'fs';
import path from 'path';
import { jidNormalizedUser, jidDecode, isJidGroup, isPnUser, getContentType, downloadMediaMessage } from 'baileys';
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

function getMediaTypeInfo(type) {
        const mediaTypes = {
                imageMessage: ['Gambar', '🖼️', 'jpg'],
                videoMessage: ['Video', '🎥', 'mp4'],
                audioMessage: ['Audio', '🎵', 'mp3'],
                stickerMessage: ['Sticker', '🎨', 'webp'],
                documentMessage: ['Dokumen', '📄', 'bin'],
                extendedTextMessage: ['Teks', '📝', null],
                conversation: ['Teks', '📝', null],
                viewOnceMessageV2: ['View Once', '👁️', null],
                viewOnceMessage: ['View Once', '👁️', null],
                viewOnceMessageV2Extension: ['View Once', '👁️', null],
                contactMessage: ['Kontak', '👤', null],
                contactsArrayMessage: ['Kontak', '👥', null],
                locationMessage: ['Lokasi', '📍', null],
                liveLocationMessage: ['Live Lokasi', '📍', null],
                pollCreationMessage: ['Poll', '📊', null],
        };
        return mediaTypes[type] || ['Media', '📨', 'bin'];
}

function formatTimestamp(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString('id-ID', { 
                timeZone: 'Asia/Jakarta',
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
        });
}

function extractTextFromMessage(message) {
        if (!message) return '';
        
        const type = getContentType(message);
        const content = message[type];
        
        if (!content) return '';
        
        return content.text || 
               content.conversation || 
               content.caption || 
               content.selectedButtonId ||
               content.selectedId ||
               content.contentText ||
               content.selectedDisplayText ||
               content.title ||
               content.name ||
               message.conversation ||
               '';
}

function getMessageContent(cachedMsg) {
        if (!cachedMsg || !cachedMsg.message) return null;
        
        let message = cachedMsg.message;
        
        if (message.ephemeralMessage?.message) {
                message = message.ephemeralMessage.message;
        }
        
        if (message.viewOnceMessage?.message) {
                message = message.viewOnceMessage.message;
        }
        
        if (message.viewOnceMessageV2?.message) {
                message = message.viewOnceMessageV2.message;
        }
        
        if (message.viewOnceMessageV2Extension?.message) {
                message = message.viewOnceMessageV2Extension.message;
        }
        
        return message;
}

async function downloadMedia(hisoka, cachedMsg, messageContent) {
        try {
                const type = getContentType(messageContent);
                if (!type) return null;
                
                const content = messageContent[type];
                if (!content || !content.mimetype) return null;
                
                const media = await downloadMediaMessage(
                        { ...cachedMsg, message: messageContent },
                        'buffer',
                        {},
                        {
                                logger: hisoka.logger,
                                reuploadRequest: hisoka.updateMediaMessage,
                        }
                );
                
                return media;
        } catch (err) {
                console.error('\x1b[31m[AntiDelete] Error downloading media:\x1b[39m', err.message);
                return null;
        }
}

export default async function handleDeletedMessage(update, hisoka) {
        try {
                const config = loadConfig();
                const antiDeleteConfig = config.antiDelete || {};
                
                if (!antiDeleteConfig.enabled) {
                        return;
                }
                
                const { key, update: msgUpdate } = update;
                
                if (!key || !key.id) return;
                
                const isRevoked = msgUpdate?.messageStubType === 1 || 
                                  msgUpdate?.message === null ||
                                  (msgUpdate?.messageStubType === undefined && msgUpdate?.message === undefined && Object.keys(msgUpdate).length === 0);
                
                if (!isRevoked) return;
                
                const cachedMsg = hisoka.cacheMsg.get(key.id);
                if (!cachedMsg) {
                        return;
                }
                
                const from = key.remoteJid;
                const isGroup = isJidGroup(from);
                const isPrivate = isPnUser(from);
                
                if (isGroup && !antiDeleteConfig.groupChat) {
                        return;
                }
                
                if (isPrivate && !antiDeleteConfig.privateChat) {
                        return;
                }
                
                const botNumber = jidNormalizedUser(hisoka.user.id);
                
                const rawSenderJid = cachedMsg.key?.participant || cachedMsg.key?.remoteJid;
                const senderJid = await hisoka.resolveLidToPN(cachedMsg.key);
                const senderNumber = jidDecode(senderJid)?.user || 'Unknown';
                const senderName = cachedMsg.pushName || hisoka.getName(senderJid, true) || senderNumber;
                
                let groupName = '';
                if (isGroup) {
                        const groupData = hisoka.groups.read(from);
                        groupName = groupData?.subject || jidDecode(from)?.user || 'Unknown Group';
                }
                
                const messageContent = getMessageContent(cachedMsg);
                if (!messageContent) return;
                
                const type = getContentType(messageContent);
                const [typeName, typeEmoji, ext] = getMediaTypeInfo(type);
                const text = extractTextFromMessage(messageContent);
                const timestamp = cachedMsg.messageTimestamp || Math.floor(Date.now() / 1000);
                
                let headerText = `═══════════════════════════
🗑️ *PESAN DIHAPUS TERDETEKSI*
═══════════════════════════

📍 *Lokasi:* ${isGroup ? `Grup "${groupName}"` : 'Chat Pribadi'}
👤 *Pengirim:* ${senderName}
📞 *Nomor:* ${senderNumber}
📅 *Waktu:* ${formatTimestamp(timestamp)}
📦 *Tipe:* ${typeEmoji} ${typeName}`;

                if (text) {
                        headerText += `\n\n💬 *Isi Pesan:*\n${text}`;
                }
                
                headerText += '\n\n═══════════════════════════';
                
                const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
                const isMediaMessage = mediaTypes.includes(type);
                
                if (isMediaMessage) {
                        const mediaBuffer = await downloadMedia(hisoka, cachedMsg, messageContent);
                        
                        if (mediaBuffer) {
                                try {
                                        let mediaExt = ext;
                                        const content = messageContent[type];
                                        
                                        if (content?.mimetype) {
                                                if (content.mimetype.includes('webp')) mediaExt = 'webp';
                                                else if (content.mimetype.includes('mp4')) mediaExt = 'mp4';
                                                else if (content.mimetype.includes('jpeg') || content.mimetype.includes('jpg')) mediaExt = 'jpg';
                                                else if (content.mimetype.includes('png')) mediaExt = 'png';
                                                else if (content.mimetype.includes('gif')) mediaExt = 'gif';
                                                else if (content.mimetype.includes('mp3')) mediaExt = 'mp3';
                                                else if (content.mimetype.includes('ogg')) mediaExt = 'ogg';
                                                else if (content.mimetype.includes('pdf')) mediaExt = 'pdf';
                                        }
                                        
                                        if (content?.fileName) {
                                                const docExt = content.fileName.split('.').pop();
                                                if (docExt) mediaExt = docExt;
                                        }
                                        
                                        if (type === 'imageMessage') {
                                                await hisoka.sendMessage(botNumber, {
                                                        image: mediaBuffer,
                                                        caption: headerText,
                                                });
                                        } else if (type === 'videoMessage') {
                                                await hisoka.sendMessage(botNumber, {
                                                        video: mediaBuffer,
                                                        caption: headerText,
                                                });
                                        } else if (type === 'audioMessage') {
                                                await hisoka.sendMessage(botNumber, { text: headerText });
                                                await hisoka.sendMessage(botNumber, {
                                                        audio: mediaBuffer,
                                                        mimetype: content?.mimetype || 'audio/mpeg',
                                                        ptt: content?.ptt || false,
                                                });
                                        } else if (type === 'stickerMessage') {
                                                await hisoka.sendMessage(botNumber, { text: headerText });
                                                await hisoka.sendMessage(botNumber, {
                                                        sticker: mediaBuffer,
                                                });
                                        } else if (type === 'documentMessage') {
                                                await hisoka.sendMessage(botNumber, { text: headerText });
                                                await hisoka.sendMessage(botNumber, {
                                                        document: mediaBuffer,
                                                        mimetype: content?.mimetype || 'application/octet-stream',
                                                        fileName: content?.fileName || `document.${mediaExt}`,
                                                });
                                        }
                                        
                                        logAntiDelete(senderName, typeName, isGroup, groupName);
                                } catch (sendErr) {
                                        console.error('\x1b[31m[AntiDelete] Error sending media:\x1b[39m', sendErr.message);
                                        await hisoka.sendMessage(botNumber, { 
                                                text: headerText + '\n\n⚠️ _Media gagal dikirim_' 
                                        });
                                }
                        } else {
                                await hisoka.sendMessage(botNumber, { 
                                        text: headerText + '\n\n⚠️ _Media tidak dapat diunduh_' 
                                });
                                logAntiDelete(senderName, typeName, isGroup, groupName, true);
                        }
                } else {
                        await hisoka.sendMessage(botNumber, { text: headerText });
                        logAntiDelete(senderName, typeName, isGroup, groupName);
                }
                
        } catch (err) {
                console.error('\x1b[31m[AntiDelete] Error:\x1b[39m', err);
        }
}

function logAntiDelete(senderName, typeName, isGroup, groupName, failed = false) {
        const cyan = '\x1b[36m';
        const yellow = '\x1b[33m';
        const green = '\x1b[32m';
        const red = '\x1b[31m';
        const white = '\x1b[37m';
        const reset = '\x1b[0m';
        const bold = '\x1b[1m';
        
        const location = isGroup ? `Grup "${groupName}"` : 'Chat Pribadi';
        const status = failed ? `${red}⚠️ Gagal${reset}` : `${green}✅ Tersimpan${reset}`;
        
        console.log(`${cyan}[AntiDelete]${reset} ${yellow}${typeName}${reset} dari ${bold}${senderName}${reset} @ ${location} - ${status}`);
}
