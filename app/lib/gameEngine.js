/* ============================================
   FOOTBALL TOWN — GAME ENGINE
   Canvas rendering, agents, ball, gameplay
   ============================================ */

// ===== CONFIG =====
export const CONFIG = {
    GRID_SIZE: 50,
    TILE_WIDTH: 44,
    TILE_HEIGHT: 22,
    AGENTS_PER_TEAM: 11,
    FEED_MAX_ITEMS: 80,
    EVENT_INTERVAL: 1600,
    MATCH_DURATION: 5 * 60 * 1000, // 5 minutes in ms
    INTERMISSION_DURATION: 30 * 1000, // 30 seconds lobby between matches
    PITCH: { startRow: 12, endRow: 38, startCol: 12, endCol: 38 },
    STADIUM: { startRow: 8, endRow: 42, startCol: 8, endCol: 42 },
    TEAMS: {
        home: { name: 'Red Claws', colors: ['#ef4444', '#dc2626', '#b91c1c'] },
        away: { name: 'Blue Tide', colors: ['#3b82f6', '#2563eb', '#1d4ed8'] }
    },
    TEAM_POOL: [
        { name: 'Red Claws', colors: ['#ef4444', '#dc2626', '#b91c1c'] },
        { name: 'Blue Tide', colors: ['#3b82f6', '#2563eb', '#1d4ed8'] },
        { name: 'Gold Storm', colors: ['#f59e0b', '#d97706', '#b45309'] },
        { name: 'Emerald FC', colors: ['#10b981', '#059669', '#047857'] },
        { name: 'Purple Reign', colors: ['#8b5cf6', '#7c3aed', '#6d28d9'] },
        { name: 'Pink Phoenix', colors: ['#ec4899', '#db2777', '#be185d'] },
        { name: 'Cyan Sharks', colors: ['#06b6d4', '#0891b2', '#0e7490'] },
        { name: 'Orange Blaze', colors: ['#f97316', '#ea580c', '#c2410c'] },
        { name: 'Lime United', colors: ['#84cc16', '#65a30d', '#4d7c0f'] },
        { name: 'Rose City', colors: ['#f43f5e', '#e11d48', '#be123c'] },
    ],
};

const NAMES_HOME = ['Alpha', 'Bolt', 'Cipher', 'Drift', 'Echo', 'Flare', 'Ghost', 'Hawk', 'Ion', 'Jet', 'Knox'];
const NAMES_AWAY = ['Lynx', 'Maverick', 'Nova', 'Onyx', 'Pulse', 'Quake', 'Razor', 'Storm', 'Titan', 'Ultra', 'Venom'];
const POSITIONS = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'];
const SPEC_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
    '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
    '#d946ef', '#ec4899', '#22c55e', '#0ea5e9', '#a855f7'
];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function toIso(col, row) {
    return { x: (col - row) * (CONFIG.TILE_WIDTH / 2), y: (col + row) * (CONFIG.TILE_HEIGHT / 2) };
}
function lerp(a, b, t) { return a + (b - a) * t; }
function distBetween(a, b) { return Math.sqrt((a.col - b.col) ** 2 + (a.row - b.row) ** 2); }
function formatTime() {
    const n = new Date();
    const h = n.getHours() % 12 || 12;
    return `${h}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')} ${n.getHours() >= 12 ? 'PM' : 'AM'}`;
}

// ===== AGENT =====
class Agent {
    constructor(id, team, namePool, posIndex) {
        this.id = id;
        this.team = team;
        this.name = `${namePool[posIndex]}-${posIndex + 1}`;
        this.position = POSITIONS[posIndex];
        const tc = CONFIG.TEAMS[team];
        this.color = tc.colors[0];
        this.colorDark = tc.colors[2];
        const P = CONFIG.PITCH;
        const midCol = (P.startCol + P.endCol) / 2;
        const midRow = (P.startRow + P.endRow) / 2;
        const pitchW = P.endCol - P.startCol;
        const pitchH = P.endRow - P.startRow;

        // ===== FORMATION SYSTEM (4-4-2) =====
        // Positions: GK, LB, CB, CB, RB, LM, CM, CM, RM, ST, ST
        // Define home positions as fraction of pitch (0-1 range)
        const formations = {
            GK: { x: 0.04, y: 0.5 },
            LB: { x: 0.18, y: 0.2 },
            CB: { x: 0.15, y: 0.4 },
            'CB2': { x: 0.15, y: 0.6 },
            RB: { x: 0.18, y: 0.8 },
            LM: { x: 0.38, y: 0.15 },
            CM: { x: 0.35, y: 0.4 },
            'CM2': { x: 0.35, y: 0.6 },
            RM: { x: 0.38, y: 0.85 },
            ST: { x: 0.55, y: 0.35 },
            'ST2': { x: 0.55, y: 0.65 },
        };

        // Disambiguate duplicate position names
        let formKey = this.position;
        if (this.position === 'CB' && posIndex === 3) formKey = 'CB2';
        if (this.position === 'CM' && posIndex === 7) formKey = 'CM2';
        if (this.position === 'ST' && posIndex === 10) formKey = 'ST2';
        this.formationKey = formKey;

        const f = formations[formKey] || { x: 0.5, y: 0.5 };

        if (team === 'home') {
            this.homeCol = P.startCol + f.x * pitchW;
            this.homeRow = P.startRow + f.y * pitchH;
        } else {
            // Mirror for away team
            this.homeCol = P.endCol - f.x * pitchW;
            this.homeRow = P.startRow + (1 - f.y) * pitchH;
        }

        this.col = this.homeCol;
        this.row = this.homeRow;
        this.targetCol = this.col; this.targetRow = this.row;
        this.drawX = 0; this.drawY = 0;
        this.prevCol = this.col; this.prevRow = this.row;
        this.moveProgress = 1; this.bobOffset = Math.random() * Math.PI * 2;
        this.size = 5.5; this.hasBall = false;
        this.state = 'idle'; this.stateTimer = rand(30, 100); this.actionCooldown = 0;
        this.formationOffset = { col: 0, row: 0 }; // dynamic offset from formation
        const iso = toIso(this.col, this.row);
        this.drawX = iso.x; this.drawY = iso.y;
    }
    clamp(c, r) {
        const P = CONFIG.PITCH;
        return { col: Math.max(P.startCol + 0.5, Math.min(P.endCol - 0.5, c)), row: Math.max(P.startRow + 0.5, Math.min(P.endRow - 0.5, r)) };
    }
    // Apply server-authoritative state
    applyServerState(serverAgent) {
        this.col = serverAgent.col;
        this.row = serverAgent.row;
        this.targetCol = serverAgent.targetCol;
        this.targetRow = serverAgent.targetRow;
        this.prevCol = serverAgent.prevCol;
        this.prevRow = serverAgent.prevRow;
        this.moveProgress = serverAgent.moveProgress;
        this.hasBall = serverAgent.hasBall;
        this.state = serverAgent.state;
        this.color = serverAgent.color;
        this.colorDark = serverAgent.colorDark;
        this.isExternal = serverAgent.isExternal;
        this.externalId = serverAgent.externalId;
    }
    update() {
        // Client-side: just smoothly interpolate draw position toward server-provided col/row
        const iso = toIso(this.col, this.row);
        this.drawX = lerp(this.drawX, iso.x, 0.15);
        this.drawY = lerp(this.drawY, iso.y, 0.15);
    }
    draw(ctx, ox, oy) {
        const x = this.drawX + ox, y = this.drawY + oy;
        const t = Date.now();
        const bob = Math.sin(t * 0.004 + this.bobOffset) * 2;
        const s = this.size * 1.3, cy = y - s * 1.5 + bob;
        ctx.save();

        // === GROUND GLOW (team-colored radial gradient) ===
        const grd = ctx.createRadialGradient(x, y + 3, 0, x, y + 3, s * 2.5);
        grd.addColorStop(0, this.color + '30');
        grd.addColorStop(0.6, this.color + '08');
        grd.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.ellipse(x, y + 3, s * 2.5, s * 0.8, 0, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();

        // === AURA RING (pulsing when has ball) ===
        if (this.hasBall) {
            const pulse = 0.7 + Math.sin(t * 0.008) * 0.3;
            ctx.beginPath(); ctx.arc(x, cy, s * 2.8, 0, Math.PI * 2);
            ctx.strokeStyle = this.color + Math.round(pulse * 80).toString(16).padStart(2, '0');
            ctx.lineWidth = 1.5; ctx.stroke();
            ctx.beginPath(); ctx.arc(x, cy, s * 2.6, 0, Math.PI * 2);
            ctx.fillStyle = this.color + '12'; ctx.fill();
        }

        // === BODY (gradient-filled ellipse with top-lit highlight) ===
        const bodyGrad = ctx.createLinearGradient(x, cy - s * 1.4, x, cy + s * 1.4);
        bodyGrad.addColorStop(0, this.color);
        bodyGrad.addColorStop(0.5, this.color);
        bodyGrad.addColorStop(1, this.colorDark);
        ctx.beginPath(); ctx.ellipse(x, cy, s, s * 1.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = bodyGrad; ctx.fill();
        ctx.strokeStyle = this.colorDark; ctx.lineWidth = 1; ctx.stroke();
        // Body highlight shine
        ctx.beginPath(); ctx.ellipse(x - s * 0.15, cy - s * 0.5, s * 0.45, s * 0.65, -0.15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();

        // === SENSOR EYES (glowing cyan) ===
        const eyeGlow = ctx.createRadialGradient(x, cy - s * 0.3, 0, x, cy - s * 0.3, s * 0.55);
        eyeGlow.addColorStop(0, 'rgba(6,182,212,0.6)');
        eyeGlow.addColorStop(0.6, 'rgba(6,182,212,0.15)');
        eyeGlow.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(x, cy - s * 0.3, s * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = eyeGlow; ctx.fill();
        // Eye dots with blink
        const eyeBlink = Math.sin(t * 0.002 + this.bobOffset) > 0.92 ? 0 : 1;
        ctx.globalAlpha = eyeBlink;
        ctx.beginPath(); ctx.arc(x - s * 0.2, cy - s * 0.35, s * 0.09, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4'; ctx.fill();
        ctx.beginPath(); ctx.arc(x + s * 0.2, cy - s * 0.35, s * 0.09, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4'; ctx.fill();
        ctx.beginPath(); ctx.arc(x - s * 0.17, cy - s * 0.38, s * 0.035, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(x + s * 0.23, cy - s * 0.38, s * 0.035, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.globalAlpha = 1;

        // === CLAWS (gradient with pincer highlights) ===
        const ca = Math.sin(t * 0.003 + this.bobOffset) * (this.hasBall ? 0.3 : 0.12);
        ctx.save(); ctx.translate(x - s * 1.05, cy - s * 0.2); ctx.rotate(-0.5 + ca);
        ctx.beginPath(); ctx.ellipse(0, -s * 0.3, s * 0.75, s * 0.28, -0.3, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.strokeStyle = this.colorDark; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, s * 0.15, s * 0.65, s * 0.22, 0.2, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(-s * 0.3, -s * 0.2, s * 0.07, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
        ctx.restore();
        ctx.save(); ctx.translate(x + s * 1.05, cy - s * 0.2); ctx.rotate(0.5 - ca);
        ctx.beginPath(); ctx.ellipse(0, -s * 0.3, s * 0.75, s * 0.28, 0.3, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.strokeStyle = this.colorDark; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, s * 0.15, s * 0.65, s * 0.22, -0.2, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.2, s * 0.07, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
        ctx.restore();

        // === LEGS (articulated with joint dots) ===
        ctx.strokeStyle = this.color; ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const ly = cy + s * (0.15 + i * 0.38);
            const w = Math.sin(t * 0.006 + this.bobOffset + i) * 2.5;
            ctx.beginPath(); ctx.moveTo(x - s * 0.5, ly); ctx.lineTo(x - s * 1.1 + w, ly + s * 0.15);
            ctx.lineTo(x - s * 1.4 + w, ly + s * 0.35); ctx.stroke();
            ctx.beginPath(); ctx.arc(x - s * 1.4 + w, ly + s * 0.35, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = this.color; ctx.fill();
            ctx.beginPath(); ctx.moveTo(x + s * 0.5, ly); ctx.lineTo(x + s * 1.1 - w, ly + s * 0.15);
            ctx.lineTo(x + s * 1.4 - w, ly + s * 0.35); ctx.stroke();
            ctx.beginPath(); ctx.arc(x + s * 1.4 - w, ly + s * 0.35, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = this.color; ctx.fill();
        }

        // === ANTENNAE (curved with glowing tips) ===
        ctx.strokeStyle = this.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - s * 0.25, cy - s * 1.05);
        ctx.quadraticCurveTo(x - s * 0.5, cy - s * 1.8, x - s * 0.55, cy - s * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + s * 0.25, cy - s * 1.05);
        ctx.quadraticCurveTo(x + s * 0.5, cy - s * 1.8, x + s * 0.55, cy - s * 2); ctx.stroke();
        // antenna tip glows
        [[-0.55], [0.55]].forEach(([dx]) => {
            const tx = x + s * dx, ty = cy - s * 2;
            const tg = ctx.createRadialGradient(tx, ty, 0, tx, ty, s * 0.2);
            tg.addColorStop(0, '#06b6d4'); tg.addColorStop(1, 'transparent');
            ctx.beginPath(); ctx.arc(tx, ty, s * 0.18, 0, Math.PI * 2);
            ctx.fillStyle = tg; ctx.fill();
            ctx.beginPath(); ctx.arc(tx, ty, s * 0.06, 0, Math.PI * 2);
            ctx.fillStyle = '#06b6d4'; ctx.fill();
        });

        // === STATUS ICON ===
        const icon = this.hasBall ? '⚽' : this.state === 'dribbling' ? '⚡' : null;
        if (icon) {
            const iy = cy - s * 2.8 + Math.sin(t * 0.005) * 2;
            ctx.font = `${Math.round(s * 0.65)}px serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(icon, x, iy);
        }

        ctx.restore();

        // === NAME LABEL (pill background + position badge) ===
        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const labelY = cy - s * 2.3;
        const tw = ctx.measureText(this.name).width + 12;
        const pos = this.position || '';
        const pw = pos ? ctx.measureText(pos).width + 8 : 0;
        const fullW = tw + pw;
        // pill bg
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.roundRect(x - fullW / 2, labelY - 11, fullW, 14, 4); ctx.fill();
        // name
        ctx.fillStyle = this.team === 'home' ? 'rgba(255,140,140,0.95)' : 'rgba(140,170,255,0.95)';
        ctx.fillText(this.name, pos ? x - pw / 2 : x, labelY);
        // position
        if (pos) {
            ctx.font = "bold 7px 'JetBrains Mono', monospace";
            ctx.fillStyle = 'rgba(6,182,212,0.85)';
            ctx.fillText(pos, x + tw / 2 - 2, labelY);
        }
    }
}

// ===== BALL =====
class Ball {
    constructor() {
        const P = CONFIG.PITCH;
        this.col = (P.startCol + P.endCol) / 2; this.row = (P.startRow + P.endRow) / 2;
        this.targetCol = this.col; this.targetRow = this.row;
        this.drawX = 0; this.drawY = 0; this.holder = null; this.free = true;
        this.bouncePhase = 0; this.speed = 0.08;
        const iso = toIso(this.col, this.row); this.drawX = iso.x; this.drawY = iso.y;
    }
    // Apply server-authoritative state
    applyServerState(serverBall, agents) {
        this.col = serverBall.col;
        this.row = serverBall.row;
        this.targetCol = serverBall.targetCol;
        this.targetRow = serverBall.targetRow;
        this.free = serverBall.free;
        // Resolve holder reference
        if (serverBall.holderId != null) {
            this.holder = agents.find(a => a.id === serverBall.holderId) || null;
        } else {
            this.holder = null;
        }
    }
    update() {
        // Client-side: just interpolate draw position + animate bounce
        this.bouncePhase += this.free ? 0.04 : 0.1;
        const iso = toIso(this.col, this.row);
        this.drawX = lerp(this.drawX, iso.x, 0.15);
        this.drawY = lerp(this.drawY, iso.y, 0.15);
    }
    passBall(target) {
        if (this.holder) this.holder.hasBall = false;
        this.holder = null; this.free = false;
        this.targetCol = target.col + rand(-1, 1) * 0.5; this.targetRow = target.row + rand(-1, 1) * 0.5;
        this.speed = 0.12;
        setTimeout(() => { this.holder = target; target.hasBall = true; this.free = false; }, 600);
    }
    shoot(gc, gr) {
        if (this.holder) this.holder.hasBall = false;
        this.holder = null; this.free = true; this.targetCol = gc; this.targetRow = gr; this.speed = 0.15;
    }
    loose(c, r) {
        if (this.holder) this.holder.hasBall = false;
        this.holder = null; this.free = true;
        this.targetCol = c + rand(-2, 2); this.targetRow = r + rand(-2, 2); this.speed = 0.08;
    }
    resetToCenter() {
        const P = CONFIG.PITCH;
        this.col = (P.startCol + P.endCol) / 2; this.row = (P.startRow + P.endRow) / 2;
        this.targetCol = this.col; this.targetRow = this.row; this.free = true; this.holder = null;
        const iso = toIso(this.col, this.row); this.drawX = iso.x; this.drawY = iso.y;
    }
    draw(ctx, ox, oy) {
        const x = this.drawX + ox, y = this.drawY + oy;
        const bounce = Math.abs(Math.sin(this.bouncePhase)) * 8 + 3, r = 4.5;
        ctx.beginPath(); ctx.ellipse(x, y + 2, r * 1.5, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${0.25 - bounce * 0.008})`; ctx.fill();
        const bx = x, by = y - bounce;
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = 0.6; ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + this.bouncePhase * 0.3;
            const px = bx + Math.cos(a) * r * 0.45, py = by + Math.sin(a) * r * 0.45;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fillStyle = '#444'; ctx.fill();
        ctx.beginPath(); ctx.arc(bx - r * 0.25, by - r * 0.3, r * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
    }
}

// ===== SPECTATOR =====
class Spectator {
    constructor(id, col, row, color, isUser = false, userName = '') {
        this.id = id; this.col = col; this.row = row;
        this.color = color || pick(SPEC_COLORS);
        this.cheerPhase = Math.random() * Math.PI * 2;
        this.size = 2.5 + Math.random() * 1.5;
        this.isUser = isUser; this.userName = userName;
    }
    draw(ctx, ox, oy, h) {
        const iso = toIso(this.col, this.row);
        const x = iso.x + ox, y = iso.y + oy - h;
        const bob = Math.sin(Date.now() * 0.003 + this.cheerPhase) * 1.2;
        const s = this.size, cy = y - s + bob;
        ctx.beginPath(); ctx.ellipse(x, cy, s * 0.6, s * 0.85, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill();
        const cw = Math.sin(Date.now() * 0.005 + this.cheerPhase) * 0.25;
        ctx.beginPath(); ctx.ellipse(x - s * 0.7, cy - s * 0.2 + bob * 0.4, s * 0.35, s * 0.12, -0.3 + cw, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + s * 0.7, cy - s * 0.2 + bob * 0.4, s * 0.35, s * 0.12, 0.3 - cw, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x - s * 0.15, cy - s * 0.65, s * 0.09, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(x + s * 0.15, cy - s * 0.65, s * 0.09, 0, Math.PI * 2); ctx.fill();
        if (this.isUser) {
            ctx.beginPath(); ctx.arc(x, cy, s * 1.8, 0, Math.PI * 2);
            ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1; ctx.stroke();
            ctx.font = "bold 7px 'JetBrains Mono', monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillStyle = '#10b981'; ctx.fillText(this.userName, x, cy - s * 1.5);
        }
    }
}

// ===== ENVIRONMENT ENTITIES =====
class EnvTree {
    constructor(col, row) {
        this.col = col; this.row = row;
        this.height = 18 + Math.random() * 22;
        this.trunkW = 1.5 + Math.random() * 1;
        this.canopyR = 6 + Math.random() * 5;
        this.swayPhase = Math.random() * Math.PI * 2;
        this.type = Math.random() < 0.3 ? 'pine' : 'round';
        this.greenShade = Math.floor(Math.random() * 40);
    }
    draw(ctx, ox, oy) {
        const iso = toIso(this.col, this.row);
        const x = iso.x + ox, y = iso.y + oy;
        const sway = Math.sin(Date.now() * 0.001 + this.swayPhase) * 1.5;
        // Shadow
        ctx.beginPath(); ctx.ellipse(x + 3, y + 3, this.canopyR * 0.8, this.canopyR * 0.3, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fill();
        // Trunk
        ctx.beginPath(); ctx.moveTo(x - this.trunkW, y);
        ctx.lineTo(x - this.trunkW * 0.5, y - this.height); ctx.lineTo(x + this.trunkW * 0.5, y - this.height);
        ctx.lineTo(x + this.trunkW, y); ctx.closePath();
        ctx.fillStyle = '#5d4037'; ctx.fill();
        ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 0.5; ctx.stroke();
        if (this.type === 'pine') {
            for (let i = 0; i < 3; i++) {
                const ly = y - this.height * (0.35 + i * 0.22);
                const w = this.canopyR * (1 - i * 0.25);
                ctx.beginPath();
                ctx.moveTo(x + sway * (1 + i * 0.2), ly - this.height * 0.15);
                ctx.lineTo(x + w + sway, ly); ctx.lineTo(x - w + sway, ly);
                ctx.closePath();
                ctx.fillStyle = `rgb(${30 + this.greenShade},${90 + this.greenShade},${40 + this.greenShade})`;
                ctx.fill();
            }
        } else {
            const cx2 = x + sway, cy2 = y - this.height - this.canopyR * 0.3;
            ctx.beginPath(); ctx.ellipse(cx2, cy2, this.canopyR, this.canopyR * 0.8, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgb(${35 + this.greenShade},${105 + this.greenShade},${45 + this.greenShade})`;
            ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx2 - this.canopyR * 0.2, cy2 - this.canopyR * 0.2, this.canopyR * 0.5, this.canopyR * 0.4, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,0.06)`; ctx.fill();
        }
    }
}

class EnvCar {
    constructor(col, row) {
        this.col = col; this.row = row;
        this.color = pick(['#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#6b7280', '#1f2937', '#f8fafc', '#059669', '#ec4899']);
        this.facing = Math.random() < 0.5 ? 1 : -1;
    }
    draw(ctx, ox, oy) {
        const iso = toIso(this.col, this.row);
        const x = iso.x + ox, y = iso.y + oy;
        // Shadow
        ctx.beginPath(); ctx.ellipse(x, y + 3, 14, 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill();
        // Body bottom
        ctx.beginPath();
        ctx.moveTo(x - 12 * this.facing, y - 2); ctx.lineTo(x + 12 * this.facing, y - 2);
        ctx.lineTo(x + 10 * this.facing, y - 8); ctx.lineTo(x - 10 * this.facing, y - 8); ctx.closePath();
        ctx.fillStyle = this.color; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5; ctx.stroke();
        // Cabin
        ctx.beginPath();
        ctx.moveTo(x - 6 * this.facing, y - 8); ctx.lineTo(x + 6 * this.facing, y - 8);
        ctx.lineTo(x + 4 * this.facing, y - 14); ctx.lineTo(x - 4 * this.facing, y - 14); ctx.closePath();
        ctx.fillStyle = 'rgba(150,200,255,0.6)'; ctx.fill();
        ctx.strokeStyle = 'rgba(200,230,255,0.3)'; ctx.lineWidth = 0.5; ctx.stroke();
        // Wheels
        ctx.beginPath(); ctx.ellipse(x - 7 * this.facing, y - 1, 2.5, 1.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#1a1a1a'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 7 * this.facing, y - 1, 2.5, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Headlights
        ctx.beginPath(); ctx.arc(x + 11 * this.facing, y - 5, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,200,0.7)'; ctx.fill();
    }
}

class WalkingClaw {
    constructor(id, startCol, startRow, targetCol, targetRow) {
        this.id = id;
        this.col = startCol; this.row = startRow;
        this.targetCol = targetCol; this.targetRow = targetRow;
        this.progress = Math.random() * 0.3;
        this.speed = 0.0005 + Math.random() * 0.0008;
        this.color = pick(SPEC_COLORS);
        this.size = 3 + Math.random() * 1.5;
        this.bobPhase = Math.random() * Math.PI * 2;
    }
    update() {
        this.progress += this.speed;
        if (this.progress >= 1) this.progress = 1;
    }
    draw(ctx, ox, oy) {
        const cc = lerp(this.col, this.targetCol, this.progress);
        const cr = lerp(this.row, this.targetRow, this.progress);
        const iso = toIso(cc, cr);
        const x = iso.x + ox, y = iso.y + oy;
        const bob = Math.sin(Date.now() * 0.005 + this.bobPhase) * 1.5;
        const s = this.size, cy = y - s + bob;
        // Shadow
        ctx.beginPath(); ctx.ellipse(x, y + 2, s * 1, s * 0.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fill();
        // Body
        ctx.beginPath(); ctx.ellipse(x, cy, s * 0.55, s * 0.8, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill();
        // Claws
        const cw = Math.sin(Date.now() * 0.004 + this.bobPhase) * 0.2;
        ctx.beginPath(); ctx.ellipse(x - s * 0.6, cy - s * 0.1, s * 0.28, s * 0.1, -0.3 + cw, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + s * 0.6, cy - s * 0.1, s * 0.28, s * 0.1, 0.3 - cw, 0, Math.PI * 2); ctx.fill();
        // Eyes
        ctx.beginPath(); ctx.arc(x - s * 0.12, cy - s * 0.55, s * 0.07, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(x + s * 0.12, cy - s * 0.55, s * 0.07, 0, Math.PI * 2); ctx.fill();
    }
}

class Lamppost {
    constructor(col, row) {
        this.col = col; this.row = row;
    }
    draw(ctx, ox, oy) {
        const iso = toIso(this.col, this.row);
        const x = iso.x + ox, y = iso.y + oy;
        ctx.strokeStyle = 'rgba(140,140,150,0.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + 4, y - 30); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + 4, y - 31, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,180,0.6)'; ctx.fill();
        ctx.beginPath(); ctx.arc(x + 4, y - 31, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,180,0.04)'; ctx.fill();
    }
}

// ===== PITCH DRAWING =====
function getDistFromPitch(row, col) {
    const P = CONFIG.PITCH; let d = 0;
    if (row < P.startRow) d = Math.max(d, P.startRow - row);
    if (row > P.endRow) d = Math.max(d, row - P.endRow);
    if (col < P.startCol) d = Math.max(d, P.startCol - col);
    if (col > P.endCol) d = Math.max(d, col - P.endCol);
    return d;
}

function isStadium(row, col) {
    const S = CONFIG.STADIUM;
    return row >= S.startRow && row <= S.endRow && col >= S.startCol && col <= S.endCol;
}

function isRoad(row, col) {
    const S = CONFIG.STADIUM;
    // Ring road around stadium
    return (row === S.startRow - 2 || row === S.endRow + 2 || col === S.startCol - 2 || col === S.endCol + 2) &&
        row >= S.startRow - 3 && row <= S.endRow + 3 && col >= S.startCol - 3 && col <= S.endCol + 3;
}

function isParking(row, col) {
    const S = CONFIG.STADIUM, G = CONFIG.GRID_SIZE;
    // Parking lots in corners
    return (row < S.startRow - 3 && col < S.startCol - 3 && row > 2 && col > 2) ||
        (row < S.startRow - 3 && col > S.endCol + 3 && row > 2 && col < G - 3) ||
        (row > S.endRow + 3 && col < S.startCol - 3 && row < G - 3 && col > 2) ||
        (row > S.endRow + 3 && col > S.endCol + 3 && row < G - 3 && col < G - 3);
}

function drawGrid(ctx, ox, oy, spectators) {
    const { GRID_SIZE, TILE_WIDTH, TILE_HEIGHT, PITCH } = CONFIG;
    const tw = TILE_WIDTH / 2, th = TILE_HEIGHT / 2;
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            const iso = toIso(col, row), x = iso.x + ox, y = iso.y + oy;
            const isPitch = row >= PITCH.startRow && row <= PITCH.endRow && col >= PITCH.startCol && col <= PITCH.endCol;
            const isStad = isStadium(row, col) && !isPitch;
            ctx.beginPath(); ctx.moveTo(x, y - th); ctx.lineTo(x + tw, y); ctx.lineTo(x, y + th); ctx.lineTo(x - tw, y); ctx.closePath();

            if (isPitch) {
                ctx.fillStyle = (row + col) % 2 === 0 ? '#2d8a4e' : '#247a3f'; ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.5; ctx.stroke();
            } else if (isStad) {
                // Stadium stands with elevation
                const dp = getDistFromPitch(row, col), h = 10 + dp * 6, sh = Math.min(dp * 10, 50);
                // Right face
                ctx.beginPath(); ctx.moveTo(x + tw, y); ctx.lineTo(x + tw, y + h); ctx.lineTo(x, y + th + h); ctx.lineTo(x, y + th); ctx.closePath();
                ctx.fillStyle = `rgb(${35 + sh},${38 + sh},${50 + sh})`; ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.5; ctx.stroke();
                // Left face
                ctx.beginPath(); ctx.moveTo(x - tw, y); ctx.lineTo(x - tw, y + h); ctx.lineTo(x, y + th + h); ctx.lineTo(x, y + th); ctx.closePath();
                ctx.fillStyle = `rgb(${28 + sh},${30 + sh},${40 + sh})`; ctx.fill(); ctx.stroke();
                // Top face (seat)
                ctx.beginPath(); ctx.moveTo(x, y - th - h); ctx.lineTo(x + tw, y - h); ctx.lineTo(x, y + th - h); ctx.lineTo(x - tw, y - h); ctx.closePath();
                const sp = (row + col) % 3;
                ctx.fillStyle = sp === 0 ? `rgb(${55 + sh},${58 + sh},${72 + sh})` : sp === 1 ? `rgb(${50 + sh},${55 + sh},${68 + sh})` : `rgb(${60 + sh},${62 + sh},${75 + sh})`;
                ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.3; ctx.stroke();
                // Colored seat
                if (dp <= 4) {
                    const sc = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'][(row * 7 + col * 3) % 5];
                    ctx.beginPath(); ctx.moveTo(x, y - th - h + 1); ctx.lineTo(x + tw * 0.6, y - h + 0.5); ctx.lineTo(x, y + th - h - 0.5); ctx.lineTo(x - tw * 0.6, y - h + 0.5); ctx.closePath();
                    ctx.fillStyle = sc + '35'; ctx.fill();
                }
            } else if (isRoad(row, col)) {
                ctx.fillStyle = (row + col) % 2 === 0 ? '#2a2d3a' : '#282b37'; ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 0.5; ctx.stroke();
                // Road markings
                if ((row + col) % 6 === 0) {
                    ctx.beginPath(); ctx.moveTo(x - tw * 0.3, y); ctx.lineTo(x + tw * 0.3, y);
                    ctx.strokeStyle = 'rgba(255,255,200,0.15)'; ctx.lineWidth = 0.8; ctx.stroke();
                }
            } else if (isParking(row, col)) {
                ctx.fillStyle = (row + col) % 2 === 0 ? '#222530' : '#20232d'; ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.02)'; ctx.lineWidth = 0.3; ctx.stroke();
                // Parking lines
                if (col % 3 === 0) {
                    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
                    ctx.beginPath(); ctx.moveTo(x - tw, y); ctx.lineTo(x + tw, y); ctx.stroke();
                }
            } else {
                // Exterior grass / sidewalk
                const edgeDist = Math.min(row, col, GRID_SIZE - 1 - row, GRID_SIZE - 1 - col);
                if (edgeDist < 2) {
                    // Dark edge
                    ctx.fillStyle = '#0e1018'; ctx.fill();
                } else {
                    const g1 = 20 + ((row * 3 + col * 7) % 15);
                    const g2 = 45 + ((row * 5 + col * 11) % 25);
                    ctx.fillStyle = `rgb(${g1},${g2},${g1 + 5})`; ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.02)'; ctx.lineWidth = 0.3; ctx.stroke();
                }
            }
        }
    }
    // Spectators
    const sorted = [...spectators].sort((a, b) => (a.row + a.col) - (b.row + b.col));
    for (const s of sorted) {
        if (isStadium(s.row, s.col)) {
            s.draw(ctx, ox, oy, 10 + getDistFromPitch(s.row, s.col) * 6);
        }
    }
    drawPitchMarkings(ctx, ox, oy);
    drawGoalPost(ctx, ox, oy, PITCH.startCol, PITCH.startRow, PITCH.endRow);
    drawGoalPost(ctx, ox, oy, PITCH.endCol, PITCH.startRow, PITCH.endRow);
    drawFloodlight(ctx, ox, oy, PITCH.startCol - 1, PITCH.startRow - 1);
    drawFloodlight(ctx, ox, oy, PITCH.endCol + 1, PITCH.startRow - 1);
    drawFloodlight(ctx, ox, oy, PITCH.startCol - 1, PITCH.endRow + 1);
    drawFloodlight(ctx, ox, oy, PITCH.endCol + 1, PITCH.endRow + 1);
}

function drawFloodlight(ctx, ox, oy, col, row) {
    const iso = toIso(col, row), x = iso.x + ox, y = iso.y + oy;
    const ph = 60, sh = 10 + getDistFromPitch(row, col) * 6;
    ctx.strokeStyle = 'rgba(200,200,210,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - sh); ctx.lineTo(x, y - sh - ph); ctx.stroke();
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x - 6, y - sh - ph - 4, 12, 4);
    ctx.beginPath(); ctx.arc(x, y - sh - ph, 15, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,200,0.08)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - sh - ph, 6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,220,0.3)'; ctx.fill();
}

function drawEnvironment(ctx, ox, oy, trees, cars, walkers, lampposts) {
    // Sort all env objects by iso depth
    const all = [
        ...trees.map(t => ({ obj: t, depth: t.row + t.col, type: 'tree' })),
        ...cars.map(c => ({ obj: c, depth: c.row + c.col, type: 'car' })),
        ...walkers.map(w => {
            const cc = lerp(w.col, w.targetCol, w.progress);
            const cr = lerp(w.row, w.targetRow, w.progress);
            return { obj: w, depth: cr + cc, type: 'walker' };
        }),
        ...lampposts.map(l => ({ obj: l, depth: l.row + l.col, type: 'lamp' })),
    ];
    all.sort((a, b) => a.depth - b.depth);
    for (const item of all) item.obj.draw(ctx, ox, oy);
}

function drawGoalPost(ctx, ox, oy, bc, sr, er) {
    const mr = (sr + er) / 2, ph = 2;
    const tp = toIso(bc, mr - ph), bp = toIso(bc, mr + ph), h = 22;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(tp.x + ox, tp.y + oy); ctx.lineTo(tp.x + ox, tp.y + oy - h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bp.x + ox, bp.y + oy); ctx.lineTo(bp.x + ox, bp.y + oy - h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tp.x + ox, tp.y + oy - h); ctx.lineTo(bp.x + ox, bp.y + oy - h); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.5;
    for (let i = 1; i < 8; i++) {
        const t = i / 8, nx = tp.x + (bp.x - tp.x) * t + ox, ny = tp.y + (bp.y - tp.y) * t + oy;
        ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx, ny - h); ctx.stroke();
    }
    for (let i = 1; i < 5; i++) { const hh = h * (i / 5); ctx.beginPath(); ctx.moveTo(tp.x + ox, tp.y + oy - hh); ctx.lineTo(bp.x + ox, bp.y + oy - hh); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(tp.x + ox, tp.y + oy - h, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bp.x + ox, bp.y + oy - h, 2.5, 0, Math.PI * 2); ctx.fill();
}

function drawPitchMarkings(ctx, ox, oy) {
    const P = CONFIG.PITCH;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
    const c = [toIso(P.startCol, P.startRow), toIso(P.endCol, P.startRow), toIso(P.endCol, P.endRow), toIso(P.startCol, P.endRow)];
    ctx.beginPath(); ctx.moveTo(c[0].x + ox, c[0].y + oy);
    for (let i = 1; i < 4; i++) ctx.lineTo(c[i].x + ox, c[i].y + oy);
    ctx.closePath(); ctx.stroke();
    const mr = (P.startRow + P.endRow) / 2;
    const cl1 = toIso(P.startCol, mr), cl2 = toIso(P.endCol, mr);
    ctx.beginPath(); ctx.moveTo(cl1.x + ox, cl1.y + oy); ctx.lineTo(cl2.x + ox, cl2.y + oy); ctx.stroke();
    const mc = (P.startCol + P.endCol) / 2, ci = toIso(mc, mr);
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2; a += 0.08) {
        const iso = toIso(mc + Math.cos(a) * 3, mr + Math.sin(a) * 3);
        a === 0 ? ctx.moveTo(iso.x + ox, iso.y + oy) : ctx.lineTo(iso.x + ox, iso.y + oy);
    }
    ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(ci.x + ox, ci.y + oy, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
    drawPBox(ctx, ox, oy, P.startCol, P.startRow, P.endRow, -1);
    drawPBox(ctx, ox, oy, P.endCol, P.startRow, P.endRow, 1);
}

function drawPBox(ctx, ox, oy, bc, sr, er, dir) {
    const mr = (sr + er) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
    const p = [toIso(bc, mr - 4.5), toIso(bc + 4 * dir, mr - 4.5), toIso(bc + 4 * dir, mr + 4.5), toIso(bc, mr + 4.5)];
    ctx.beginPath(); ctx.moveTo(p[0].x + ox, p[0].y + oy); for (let i = 1; i < 4; i++) ctx.lineTo(p[i].x + ox, p[i].y + oy); ctx.stroke();
    const s = [toIso(bc, mr - 2.2), toIso(bc + 1.5 * dir, mr - 2.2), toIso(bc + 1.5 * dir, mr + 2.2), toIso(bc, mr + 2.2)];
    ctx.beginPath(); ctx.moveTo(s[0].x + ox, s[0].y + oy); for (let i = 1; i < 4; i++) ctx.lineTo(s[i].x + ox, s[i].y + oy); ctx.stroke();
    const sp = toIso(bc + 3 * dir, mr);
    ctx.beginPath(); ctx.arc(sp.x + ox, sp.y + oy, 1.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
}

// ===== GAME ENGINE CLASS =====
export class GameEngine {
    constructor(onFeedUpdate, onStatsUpdate) {
        this.agents = [];
        this.spectators = [];
        this.trees = [];
        this.cars = [];
        this.walkers = [];
        this.lampposts = [];
        this.ball = null;
        this.camera = { x: 0, y: 0, targetX: 0, targetY: 0, zoom: 1.0 };
        this.autoCamera = true;
        this.tick = 0;
        this.matchScore = { home: 0, away: 0 };
        this.stats = { online: 22, spectators: 0, totalAI: 22, goals: 0, fouls: 0, passes: 0 };
        this.feedItems = [];
        this.onFeedUpdate = onFeedUpdate;
        this.onStatsUpdate = onStatsUpdate;
        this.onMatchUpdate = null;
        this.onExternalAgentUpdate = null;
        this.canvas = null;
        this.ctx = null;
        this.animFrame = null;
        this.running = false;
        this.externalAgentCount = 0;
        // SSE connection
        this.eventSource = null;
        this.lastServerState = null;
    }

    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        // Create initial placeholder agents (will be replaced by server state)
        for (let i = 0; i < CONFIG.AGENTS_PER_TEAM; i++) this.agents.push(new Agent(i, 'home', NAMES_HOME, i));
        for (let i = 0; i < CONFIG.AGENTS_PER_TEAM; i++) this.agents.push(new Agent(CONFIG.AGENTS_PER_TEAM + i, 'away', NAMES_AWAY, i));
        this.ball = new Ball();
        this.generateSpectators();
        this.generateEnvironment();
        const ci = toIso(CONFIG.GRID_SIZE / 2, CONFIG.GRID_SIZE / 2);
        this.camera.x = -ci.x + window.innerWidth / 2;
        this.camera.y = -ci.y + window.innerHeight / 2;
        this.camera.targetX = this.camera.x; this.camera.targetY = this.camera.y;
        this.stats.spectators = this.spectators.length;
        this.running = true;
        this.connectToStream();
        this.loop();
    }

    // Find agent at screen coordinates (for click-to-inspect)
    getAgentAt(screenX, screenY) {
        const z = this.camera.zoom;
        const ox = this.camera.x, oy = this.camera.y;
        let closest = null, closestDist = 30 / z;
        for (const a of this.agents) {
            const iso = toIso(a.col, a.row);
            const ax = iso.x * z + ox * z + (this.canvas.width * (1 - z)) / 2;
            const ay = (iso.y - a.size * 1.5) * z + oy * z + (this.canvas.height * (1 - z)) / 2;
            const dist = Math.sqrt((screenX - ax) ** 2 + (screenY - ay) ** 2);
            if (dist < closestDist * z) {
                closestDist = dist / z;
                closest = a;
            }
        }
        if (!closest) return null;
        return {
            name: closest.name,
            team: closest.team === 'home' ? CONFIG.TEAMS.home.name : CONFIG.TEAMS.away.name,
            teamKey: closest.team,
            position: closest.position,
            color: closest.color,
            state: closest.state,
            hasBall: closest.hasBall,
            isExternal: !!closest.isExternal,
            id: closest.id,
        };
    }

    destroy() {
        this.running = false;
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        if (this.eventSource) { this.eventSource.close(); this.eventSource = null; }
    }

    // ===== SSE CONNECTION TO SERVER =====

    connectToStream() {
        if (this.eventSource) this.eventSource.close();
        this.eventSource = new EventSource('/api/openclaw/stream');
        this.eventSource.onmessage = (event) => {
            try {
                const state = JSON.parse(event.data);
                this.applyServerState(state);
            } catch { /* ignore parse errors */ }
        };
        this.eventSource.onerror = () => {
            // Auto-reconnect after 2s
            if (this.eventSource) this.eventSource.close();
            this.eventSource = null;
            setTimeout(() => { if (this.running) this.connectToStream(); }, 2000);
        };
    }

    applyServerState(state) {
        this.lastServerState = state;

        // Sync agents: rebuild if count changed, otherwise update in place
        const serverAgents = state.agents || [];
        if (this.agents.length !== serverAgents.length) {
            this.agents = serverAgents.map(sa => {
                const namePool = sa.team === 'home' ? NAMES_HOME : NAMES_AWAY;
                const posIndex = POSITIONS.indexOf(sa.position);
                const a = new Agent(sa.id, sa.team, namePool, posIndex >= 0 ? posIndex : 0);
                a.name = sa.name;
                a.applyServerState(sa);
                // Initialize draw position
                const iso = toIso(sa.col, sa.row);
                a.drawX = iso.x; a.drawY = iso.y;
                // External agent glow
                if (sa.isExternal) {
                    a.glowPhase = 0;
                    const originalDraw = a.draw.bind(a);
                    a.draw = function (ctx, ox, oy) {
                        const x = this.drawX + ox, y = this.drawY + oy;
                        const s = this.size * 1.1;
                        const cy = y - s * 1.5 + Math.sin(Date.now() * 0.004 + this.bobOffset) * 2;
                        this.glowPhase = (this.glowPhase || 0) + 0.03;
                        const ga = 0.3 + Math.sin(this.glowPhase) * 0.15;
                        const gr = s * 3.5 + Math.sin(this.glowPhase * 1.5) * 2;
                        ctx.save();
                        ctx.beginPath(); ctx.arc(x, cy, gr, 0, Math.PI * 2);
                        ctx.strokeStyle = `rgba(16,185,129,${ga})`; ctx.lineWidth = 2; ctx.stroke();
                        ctx.beginPath(); ctx.arc(x, cy, gr * 0.85, 0, Math.PI * 2);
                        ctx.strokeStyle = `rgba(16,185,129,${ga * 0.5})`; ctx.lineWidth = 1; ctx.stroke();
                        ctx.restore();
                        originalDraw(ctx, ox, oy);
                        ctx.font = "10px sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                        ctx.fillText('🤖', x, cy - s * 2.8);
                    };
                }
                return a;
            });
        } else {
            for (let i = 0; i < serverAgents.length; i++) {
                this.agents[i].applyServerState(serverAgents[i]);
                this.agents[i].name = serverAgents[i].name;
            }
        }

        // Sync ball
        if (state.ball && this.ball) {
            this.ball.applyServerState(state.ball, this.agents);
        }

        // Sync score, stats, feed
        this.matchScore = state.matchScore || this.matchScore;
        this.stats = state.stats || this.stats;
        this.externalAgentCount = state.externalAgentCount || 0;

        // Sync feed items from server
        if (state.feedItems) {
            this.feedItems = state.feedItems;
            this.onFeedUpdate?.(this.feedItems);
        }

        // Sync match info
        if (state.matchInfo) {
            const mi = state.matchInfo;
            CONFIG.TEAMS.home = { name: mi.homeName, colors: [mi.homeColor, mi.homeColor, mi.homeColor] };
            CONFIG.TEAMS.away = { name: mi.awayName, colors: [mi.awayColor, mi.awayColor, mi.awayColor] };
            this.onMatchUpdate?.({
                matchNumber: mi.matchNumber,
                homeName: mi.homeName,
                homeColor: mi.homeColor,
                awayName: mi.awayName,
                awayColor: mi.awayColor,
                minutes: mi.minutes,
                seconds: mi.seconds,
                phase: mi.phase,
            });
        }

        this.onStatsUpdate?.(this.stats, this.matchScore);
        this.onExternalAgentUpdate?.(this.externalAgentCount);
    }

    // Kept for backward compat but no longer used for simulation
    startSyncLoop() { /* no-op — SSE handles sync now */ }

    generateSpectators() {
        const { PITCH } = CONFIG; const S = CONFIG.STADIUM; let id = 0;
        for (let r = S.startRow; r <= S.endRow; r++) for (let c = S.startCol; c <= S.endCol; c++) {
            const ip = r >= PITCH.startRow && r <= PITCH.endRow && c >= PITCH.startCol && c <= PITCH.endCol;
            if (!ip && Math.random() < 0.55) this.spectators.push(new Spectator(id++, c, r));
        }
    }

    generateEnvironment() {
        const G = CONFIG.GRID_SIZE, S = CONFIG.STADIUM;
        // Trees — scatter around exterior
        for (let i = 0; i < 80; i++) {
            let r, c;
            do {
                r = rand(2, G - 3); c = rand(2, G - 3);
            } while (isStadium(r, c) || isRoad(r, c) || isParking(r, c));
            this.trees.push(new EnvTree(c, r));
        }
        // Cars — in parking areas
        for (let i = 0; i < 40; i++) {
            let r, c;
            do {
                r = rand(2, G - 3); c = rand(2, G - 3);
            } while (!isParking(r, c));
            this.cars.push(new EnvCar(c, r));
        }
        // Lampposts — along roads
        for (let r = S.startRow - 3; r <= S.endRow + 3; r += 4) {
            this.lampposts.push(new Lamppost(S.startCol - 2, r));
            this.lampposts.push(new Lamppost(S.endCol + 2, r));
        }
        for (let c = S.startCol - 3; c <= S.endCol + 3; c += 4) {
            this.lampposts.push(new Lamppost(c, S.startRow - 2));
            this.lampposts.push(new Lamppost(c, S.endRow + 2));
        }
        // Walking claws — walk along roads/parking OUTSIDE the stadium, never on pitch
        const roadRing = S.startRow - 2; // road row/col boundary
        for (let i = 0; i < 30; i++) {
            let startC, startR, targetC, targetR;
            // Pick start and target on the exterior road ring or parking areas
            const side = rand(0, 3);
            if (side === 0) { // Top road
                startC = rand(S.startCol - 4, S.endCol + 4);
                startR = S.startRow - rand(3, 8);
                targetC = rand(S.startCol - 2, S.endCol + 2);
                targetR = S.startRow - 2;
            } else if (side === 1) { // Bottom road
                startC = rand(S.startCol - 4, S.endCol + 4);
                startR = S.endRow + rand(3, 8);
                targetC = rand(S.startCol - 2, S.endCol + 2);
                targetR = S.endRow + 2;
            } else if (side === 2) { // Left road
                startC = S.startCol - rand(3, 8);
                startR = rand(S.startRow - 4, S.endRow + 4);
                targetC = S.startCol - 2;
                targetR = rand(S.startRow - 2, S.endRow + 2);
            } else { // Right road
                startC = S.endCol + rand(3, 8);
                startR = rand(S.startRow - 4, S.endRow + 4);
                targetC = S.endCol + 2;
                targetR = rand(S.startRow - 2, S.endRow + 2);
            }
            // Clamp to grid bounds
            startC = Math.max(2, Math.min(G - 3, startC));
            startR = Math.max(2, Math.min(G - 3, startR));
            targetC = Math.max(2, Math.min(G - 3, targetC));
            targetR = Math.max(2, Math.min(G - 3, targetR));
            this.walkers.push(new WalkingClaw(i, startC, startR, targetC, targetR));
        }
    }

    addUserSpectator(name, color) {
        const P = CONFIG.PITCH;
        const sides = [
            { row: rand(0, P.startRow - 1), col: rand(0, CONFIG.GRID_SIZE - 1) },
            { row: rand(P.endRow + 1, CONFIG.GRID_SIZE - 1), col: rand(0, CONFIG.GRID_SIZE - 1) },
            { row: rand(P.startRow, P.endRow), col: rand(0, P.startCol - 1) },
            { row: rand(P.startRow, P.endRow), col: rand(P.endCol + 1, CONFIG.GRID_SIZE - 1) },
        ];
        const pos = pick(sides);
        const spec = new Spectator(this.spectators.length, pos.col, pos.row, color, true, name);
        this.spectators.push(spec);
        this.stats.spectators = this.spectators.length;
        return spec;
    }

    updateCamera() {
        if (!this.autoCamera || !this.canvas) return;
        if (this.ball?.holder) {
            const iso = toIso(this.ball.holder.col, this.ball.holder.row);
            this.camera.targetX = -iso.x + this.canvas.width / 2;
            this.camera.targetY = -iso.y + this.canvas.height / 2;
        }
        this.camera.x = lerp(this.camera.x, this.camera.targetX, 0.015);
        this.camera.y = lerp(this.camera.y, this.camera.targetY, 0.015);
    }

    render() {
        const cv = this.canvas, cx = this.ctx;
        if (!cv || !cx) return;
        cv.width = cv.parentElement.clientWidth; cv.height = cv.parentElement.clientHeight;
        cx.clearRect(0, 0, cv.width, cv.height);
        cx.fillStyle = '#080a10'; cx.fillRect(0, 0, cv.width, cv.height);
        const g = cx.createRadialGradient(cv.width / 2, cv.height / 2, 100, cv.width / 2, cv.height / 2, cv.width * 0.8);
        g.addColorStop(0, 'rgba(16,185,129,0.04)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = g; cx.fillRect(0, 0, cv.width, cv.height);
        // Apply zoom transform
        const z = this.camera.zoom;
        cx.save();
        cx.translate(cv.width * (1 - z) / 2, cv.height * (1 - z) / 2);
        cx.scale(z, z);
        const ox = this.camera.x, oy = this.camera.y;
        drawGrid(cx, ox, oy, this.spectators);
        drawEnvironment(cx, ox, oy, this.trees, this.cars, this.walkers, this.lampposts);
        const sorted = [...this.agents].sort((a, b) => (a.row + a.col) - (b.row + b.col));
        for (const a of sorted) a.draw(cx, ox, oy);
        if (this.ball) this.ball.draw(cx, ox, oy);
        cx.restore();
        // Vignette (applied after zoom, in screen space)
        const v = cx.createRadialGradient(cv.width / 2, cv.height / 2, cv.width * 0.3, cv.width / 2, cv.height / 2, cv.width * 0.75);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,10,16,0.5)');
        cx.fillStyle = v; cx.fillRect(0, 0, cv.width, cv.height);
    }

    loop() {
        if (!this.running) return;
        this.tick++;
        // Smoothly interpolate agent and ball draw positions toward server-provided state
        for (const a of this.agents) a.update();
        if (this.ball) this.ball.update();
        // Animate walkers (cosmetic only)
        for (const w of this.walkers) w.update();
        if (this.tick % 200 === 0) {
            for (const w of this.walkers) {
                if (w.progress >= 1) {
                    const S = CONFIG.STADIUM;
                    const G = CONFIG.GRID_SIZE;
                    const side = rand(0, 3);
                    if (side === 0) {
                        w.col = rand(S.startCol - 4, S.endCol + 4);
                        w.row = S.startRow - rand(3, 8);
                        w.targetCol = rand(S.startCol - 2, S.endCol + 2);
                        w.targetRow = S.startRow - 2;
                    } else if (side === 1) {
                        w.col = rand(S.startCol - 4, S.endCol + 4);
                        w.row = S.endRow + rand(3, 8);
                        w.targetCol = rand(S.startCol - 2, S.endCol + 2);
                        w.targetRow = S.endRow + 2;
                    } else if (side === 2) {
                        w.col = S.startCol - rand(3, 8);
                        w.row = rand(S.startRow - 4, S.endRow + 4);
                        w.targetCol = S.startCol - 2;
                        w.targetRow = rand(S.startRow - 2, S.endRow + 2);
                    } else {
                        w.col = S.endCol + rand(3, 8);
                        w.row = rand(S.startRow - 4, S.endRow + 4);
                        w.targetCol = S.endCol + 2;
                        w.targetRow = rand(S.startRow - 2, S.endRow + 2);
                    }
                    w.col = Math.max(2, Math.min(G - 3, w.col));
                    w.row = Math.max(2, Math.min(G - 3, w.row));
                    w.targetCol = Math.max(2, Math.min(G - 3, w.targetCol));
                    w.targetRow = Math.max(2, Math.min(G - 3, w.targetRow));
                    w.progress = 0; w.color = pick(SPEC_COLORS);
                }
            }
        }
        this.updateCamera();
        this.render();
        this.animFrame = requestAnimationFrame(() => this.loop());
    }
}
