// ============================================================
//  AttackSystem.ts  –  Ataques de las espadas del jugador
//
//  Cada ataque crea una "zona de ataque" lógica (rectángulo o
//  círculo) que el EnemyManager compara contra los enemigos en
//  cada frame. Esto es más fiable que hitboxes físicos estáticos:
//  la onda de sangre se mueve, la descarga no depende de escala
//  de cuerpos físicos y cada zona golpea a cada enemigo una vez.
// ============================================================

import * as Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';

/** Tipos de ataque disponibles */
export type AttackType = 'light' | 'heavy' | 'charge';

export interface HitInfo {
    damage: number;
    knockbackX: number;
    knockbackY: number;
    stunDuration?: number;
}

/** Zona de daño activa del jugador (consultada por EnemyManager) */
export interface AttackZone {
    kind: 'light' | 'wave' | 'charge';
    shape: 'rect' | 'circle';
    x: number;
    y: number;
    w: number;          // solo rect
    h: number;          // solo rect
    r: number;          // solo circle
    vx: number;         // velocidad (ondas)
    originX: number;
    range: number;      // distancia máxima (ondas)
    dir: number;        // 1 / -1 dirección de empuje; 0 = radial desde el centro
    damage: number;
    knockbackX: number; // magnitud (positiva)
    knockbackY: number; // negativa = hacia arriba
    stun: number;       // ms de aturdimiento (0 = ninguno)
    interrupt: boolean; // interrumpe el ataque enemigo en curso
    consumeOnHit: boolean;
    expiresAt: number;
    dead: boolean;
    hits: Set<object>;
    visual?: Phaser.GameObjects.Shape;
}

export class AttackSystem {
    private scene: Phaser.Scene;

    /** Zonas de ataque activas */
    public zones: AttackZone[] = [];

    // Cooldowns (timestamps en ms)
    private lightCooldownUntil = 0;
    private heavyCooldownUntil = 0;

    // Estado de carga eléctrica
    private chargeStartTime = -1;
    private isCharging = false;

    private destroyed = false;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        scene.events.on('update', this.tick, this);
        scene.events.once('shutdown', this.destroy, this);
    }

    // ── Getters de estado ─────────────────────────────────────

    get canLightAttack(): boolean {
        return this.scene.time.now >= this.lightCooldownUntil;
    }

    get canHeavyAttack(): boolean {
        return this.scene.time.now >= this.heavyCooldownUntil;
    }

    get charging(): boolean { return this.isCharging; }

    get chargeProgress(): number {
        if (!this.isCharging || this.chargeStartTime < 0) return 0;
        const elapsed = this.scene.time.now - this.chargeStartTime;
        return Math.min(elapsed / GAME_CONFIG.ELECTRIC_SWORD.CHARGE_TIME, 1);
    }

    get chargeReady(): boolean {
        return this.isCharging &&
            this.scene.time.now - this.chargeStartTime >= GAME_CONFIG.ELECTRIC_SWORD.CHARGE_TIME;
    }

    // ── Ataque ligero (J) – ambas espadas, daño normal ───────

    lightAttack(x: number, y: number, facingRight: boolean): HitInfo | null {
        if (!this.canLightAttack) return null;

        const E = GAME_CONFIG.ELECTRIC_SWORD;
        const B = GAME_CONFIG.BLOOD_SWORD;
        this.lightCooldownUntil = this.scene.time.now + E.LIGHT_COOLDOWN;

        const dir = facingRight ? 1 : -1;
        const damage = E.LIGHT_DAMAGE + B.LIGHT_DAMAGE;

        const visual = this.scene.add.rectangle(x + dir * 40, y, 60, 44, 0xffdd00, 0.35)
            .setDepth(60);

        this.zones.push(this.makeZone({
            kind: 'light', shape: 'rect',
            x: x + dir * 40, y, w: 60, h: 44,
            dir, damage,
            knockbackX: E.KNOCKBACK_X, knockbackY: E.KNOCKBACK_Y,
            expiresAt: this.scene.time.now + E.LIGHT_DURATION,
            visual,
        }));

        this.createSlashEffect(x, y, facingRight, 0xffdd44);

        return { damage, knockbackX: E.KNOCKBACK_X, knockbackY: E.KNOCKBACK_Y };
    }

    // ── Ataque fuerte (K) – onda de sangre ───────────────────

    heavyAttack(x: number, y: number, facingRight: boolean): HitInfo | null {
        if (!this.canHeavyAttack) return null;

        const B = GAME_CONFIG.BLOOD_SWORD;
        this.heavyCooldownUntil = this.scene.time.now + B.HEAVY_COOLDOWN;

        this.spawnBloodWave(x, y, facingRight);

        return {
            damage: B.HEAVY_DAMAGE,
            knockbackX: B.KNOCKBACK_X,
            knockbackY: B.KNOCKBACK_Y,
        };
    }

    // ── Carga eléctrica ──────────────────────────────────────

    beginCharge(): void {
        if (!this.isCharging) {
            this.isCharging = true;
            this.chargeStartTime = this.scene.time.now;
        }
    }

    /** Cancela la carga sin disparar (si el tiempo no fue suficiente) */
    cancelCharge(): void {
        this.isCharging = false;
        this.chargeStartTime = -1;
    }

    releaseCharge(x: number, y: number, _facingRight: boolean): HitInfo | null {
        if (!this.isCharging) return null;

        const wasReady = this.chargeReady;
        this.isCharging = false;
        this.chargeStartTime = -1;

        if (!wasReady) return null; // No estaba cargado: no dispara

        const E = GAME_CONFIG.ELECTRIC_SWORD;
        this.lightCooldownUntil = this.scene.time.now + E.LIGHT_COOLDOWN;

        this.spawnElectricBurst(x, y);

        return {
            damage: E.CHARGE_DAMAGE,
            knockbackX: E.KNOCKBACK_X * 1.5,
            knockbackY: E.KNOCKBACK_Y * 2,
            stunDuration: E.CHARGE_STUN_DURATION,
        };
    }

    // ── Zonas ─────────────────────────────────────────────────

    private makeZone(p: Partial<AttackZone> & Pick<AttackZone,
        'kind' | 'shape' | 'x' | 'y' | 'damage' | 'knockbackX' | 'knockbackY' | 'expiresAt'
    >): AttackZone {
        return {
            w: 0, h: 0, r: 0, vx: 0, originX: p.x, range: 0, dir: 0,
            stun: 0, interrupt: false, consumeOnHit: false,
            dead: false, hits: new Set<object>(),
            ...p,
        };
    }

    /** Avanza ondas, expira zonas y limpia visuales */
    private tick(_time: number, delta: number): void {
        if (this.destroyed) return;
        const now = this.scene.time.now;

        for (const z of this.zones) {
            if (z.dead) continue;

            if (z.vx !== 0) {
                z.x += z.vx * (delta / 1000);
                if (z.visual) z.visual.x = z.x;
                if (Math.abs(z.x - z.originX) >= z.range) z.dead = true;
            }
            if (now >= z.expiresAt) z.dead = true;
        }

        this.zones = this.zones.filter(z => {
            if (z.dead) {
                z.visual?.destroy();
                return false;
            }
            return true;
        });
    }

    // ── Onda de sangre ────────────────────────────────────────

    private spawnBloodWave(startX: number, startY: number, facingRight: boolean): void {
        const cfg = GAME_CONFIG.BLOOD_SWORD;
        const dir = facingRight ? 1 : -1;
        const sx = startX + dir * 30;

        const visual = this.scene.add.rectangle(sx, startY, 40, 24, 0xcc1111, 0.9)
            .setStrokeStyle(2, 0xff5566)
            .setDepth(60);

        const zone = this.makeZone({
            kind: 'wave', shape: 'rect',
            x: sx, y: startY, w: 40, h: 24,
            vx: cfg.WAVE_SPEED * dir,
            originX: sx,
            range: cfg.WAVE_RANGE,
            dir,
            damage: cfg.HEAVY_DAMAGE,
            knockbackX: cfg.KNOCKBACK_X, knockbackY: cfg.KNOCKBACK_Y,
            consumeOnHit: true,
            expiresAt: this.scene.time.now + (cfg.WAVE_RANGE / cfg.WAVE_SPEED) * 1000 + 400,
            visual,
        });
        this.zones.push(zone);

        this.createBloodTrail(zone, dir);
    }

    // ── Descarga eléctrica ────────────────────────────────────

    private spawnElectricBurst(cx: number, cy: number): void {
        const E = GAME_CONFIG.ELECTRIC_SWORD;
        const r = E.CHARGE_RADIUS;

        this.zones.push(this.makeZone({
            kind: 'charge', shape: 'circle',
            x: cx, y: cy, r,
            dir: 0,
            damage: E.CHARGE_DAMAGE,
            knockbackX: E.KNOCKBACK_X * 1.5, knockbackY: E.KNOCKBACK_Y * 2,
            stun: E.CHARGE_STUN_DURATION,
            interrupt: true,
            expiresAt: this.scene.time.now + 120,
        }));

        const burst = this.scene.add.circle(cx, cy, r, 0xffffaa, 0.5).setDepth(60);
        this.scene.tweens.add({
            targets: burst,
            alpha: { from: 0.7, to: 0 },
            scaleX: { from: 1, to: 1.5 },
            scaleY: { from: 1, to: 1.5 },
            duration: 350,
            ease: 'Power2',
            onComplete: () => burst.destroy(),
        });

        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const spark = this.scene.add.circle(
                cx + Math.cos(angle) * r * 0.7,
                cy + Math.sin(angle) * r * 0.7,
                6, 0xffffff, 0.9
            ).setDepth(61);
            this.scene.tweens.add({
                targets: spark,
                x: cx + Math.cos(angle) * r * 1.2,
                y: cy + Math.sin(angle) * r * 1.2,
                alpha: 0,
                duration: 280,
                ease: 'Power1',
                onComplete: () => spark.destroy(),
            });
        }
    }

    // ── Efectos ───────────────────────────────────────────────

    private createSlashEffect(x: number, y: number, facingRight: boolean, color: number): void {
        const dir = facingRight ? 1 : -1;
        for (let i = 0; i < 6; i++) {
            const spark = this.scene.add.rectangle(
                x + dir * (20 + i * 8),
                y + Phaser.Math.Between(-14, 14),
                Phaser.Math.Between(6, 16), 4,
                color, 0.85
            ).setDepth(61);
            this.scene.tweens.add({
                targets: spark,
                x: spark.x + dir * Phaser.Math.Between(20, 50),
                y: spark.y + Phaser.Math.Between(-20, 20),
                alpha: 0,
                duration: Phaser.Math.Between(120, 240),
                ease: 'Power1',
                onComplete: () => spark.destroy(),
            });
        }
    }

    private createBloodTrail(zone: AttackZone, dir: number): void {
        const ticker = this.scene.time.addEvent({
            delay: 40,
            loop: true,
            callback: () => {
                if (zone.dead || this.destroyed) { ticker.destroy(); return; }
                const drop = this.scene.add.circle(
                    zone.x - dir * 14,
                    zone.y + Phaser.Math.Between(-8, 8),
                    Phaser.Math.Between(3, 7),
                    0xaa0000, 0.8
                ).setDepth(59);
                this.scene.tweens.add({
                    targets: drop,
                    y: drop.y + 20,
                    alpha: 0,
                    duration: 280,
                    onComplete: () => drop.destroy(),
                });
            },
        });
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.scene.events.off('update', this.tick, this);
        this.zones.forEach(z => z.visual?.destroy());
        this.zones = [];
    }
}
