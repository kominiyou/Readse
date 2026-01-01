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

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATS_FILE = path.join(DATA_DIR, 'bot_stats.json');
const HEARTBEAT_FILE = path.join(DATA_DIR, 'heartbeat.json');

const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;
const DEAD_THRESHOLD_MS = 2 * 60 * 60 * 1000;

if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaultStats = {
        startTime: null,
        totalRestarts: 0,
        lastHeartbeat: null
};

function loadStats() {
        try {
                if (!fs.existsSync(STATS_FILE)) {
                        return { ...defaultStats };
                }
                const data = fs.readFileSync(STATS_FILE, 'utf-8');
                return JSON.parse(data);
        } catch (err) {
                return { ...defaultStats };
        }
}

function saveStats(stats) {
        try {
                fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
        } catch (err) {
                console.error('Failed to save bot stats:', err.message);
        }
}

function updateHeartbeat() {
        try {
                fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify({ time: Date.now() }), 'utf-8');
        } catch (err) {}
}

function getLastHeartbeat() {
        try {
                if (!fs.existsSync(HEARTBEAT_FILE)) return null;
                const data = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf-8'));
                return data.time;
        } catch (err) {
                return null;
        }
}

let heartbeatInterval = null;

export function initBotStats() {
        const stats = loadStats();
        const now = Date.now();
        const lastHB = getLastHeartbeat();
        
        const timeSinceLastHB = lastHB ? (now - lastHB) : Infinity;
        const botWasDead = timeSinceLastHB > DEAD_THRESHOLD_MS;
        
        if (!stats.startTime || botWasDead) {
                stats.startTime = now;
                stats.totalRestarts = 0;
                console.log(`\x1b[33m[BotStats]\x1b[39m Fresh start - Uptime reset`);
        } else {
                stats.totalRestarts = (stats.totalRestarts || 0) + 1;
                console.log(`\x1b[32m[BotStats]\x1b[39m Auto-restart detected - Uptime preserved`);
        }
        
        stats.lastHeartbeat = now;
        saveStats(stats);
        updateHeartbeat();
        
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
                updateHeartbeat();
        }, HEARTBEAT_INTERVAL_MS);
        
        return stats;
}

export function getUptime() {
        const stats = loadStats();
        if (!stats.startTime) {
                return 0;
        }
        return Date.now() - stats.startTime;
}

export function getUptimeFormatted() {
        const uptimeMs = getUptime();
        const seconds = Math.floor(uptimeMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        return {
                days,
                hours: hours % 24,
                minutes: minutes % 60,
                seconds: seconds % 60,
                formatted: `${days} days, ${hours % 24} hours, ${minutes % 60} minutes, ${seconds % 60} seconds`
        };
}

export function getBotStats() {
        const stats = loadStats();
        const uptime = getUptimeFormatted();
        
        return {
                ...stats,
                uptime,
                currentUptime: getUptime()
        };
}

export function resetUptime() {
        const stats = loadStats();
        stats.startTime = Date.now();
        stats.totalRestarts = 0;
        stats.lastHeartbeat = Date.now();
        saveStats(stats);
        updateHeartbeat();
        return stats;
}

export function stopHeartbeat() {
        if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
        }
}
