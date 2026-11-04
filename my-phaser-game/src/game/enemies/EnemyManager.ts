// ============================================================
//  EnemyManager.ts  –  Gestiona enemigos y resuelve el combate
//    · zonas de ataque del jugador  → daño a enemigos
//    · golpe del enemigo            → callback de daño al jugador
//    · daño de área (fuego) y proyectiles (tierra)
// ============================================================

import * as Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';
import { Player } from '../player/Player';
import { AttackZone } from '../combat/AttackSystem';
import { Enemy, HitData } from './Enemy';

export type PlayerHitCallback = (
    enemy: Enemy, damage: number, knockbackX: number, knockbackY: number
) => void;

export class EnemyManager {
    private scene: Phaser.Scene;
    private enemies: Enemy[] = [];
    private onPlayerHit: PlayerHitCallback;

    /** Grupo físico (para colliders con el escenario) */
    public readonly group: Phaser.Physics.Arcade.Group;

    // Rectángulos temporales (evita crear objetos cada frame)
    private rA = new Phaser.Geom.Rectangle();
    private rB = new Phaser.Geom.Rectangle();
    private circle = new Phaser.Geom.Circle();

    constructor(scene: Phaser.Scene, onPlayerHit: PlayerHitCallback) {
        this.scene = scene;
        this.onPlayerHit = onPlayerHit;
        this.group = scene.physics.add.group();

        scene.events.on('enemy-killed', this.handleKilled, this);
        scene.events.once('shutdown', this.destroy, this);
    }

    spawn(x: number, y: number): Enemy {
        const e = new Enemy(this.scene, x, y);
        this.group.add(e);
        // El grupo puede resetear propiedades: reafirmamos lo importante
        const b = e.body as Phaser.Physics.Arcade.Body;
        b.setAllowGravity(true);
        b.setGravityY(GAME_CONFIG.PLAYER.GRAVITY);
        b.setCollideWorldBounds(true);
        this.enemies.push(e);
        return e;
    }

    /** Enemigos vivos */
    get alive(): Enemy[] { return this.enemies.filter(e => !e.isDead && e.active); }

    private handleKilled(e: Enemy): void {
        this.enemies = this.enemies.filter(x => x !== e);
    }

    // ── Update ────────────────────────────────────────────────

    update(now: number, player: Player, zones: AttackZone[]): void {
        const pb = player.body as Phaser.Physics.Arcade.Body;
        const playerAlive = !player.isDead;

        // 1. IA
        for (const e of this.enemies) {
            if (!e.active) continue;
            e.tick(now, player.x, player.y, playerAlive);

            // Matar enemigos que caen al abismo
            if (e.y > 900) e.takeHit({ damage: 9999, knockbackX: 0, knockbackY: 0, source: 'burn' }, now);
        }

        // 2. Zonas de ataque del jugador → enemigos
        for (const z of zones) {
            if (z.dead) continue;
            for (const e of this.enemies) {
                if (!e.active || e.isDead || z.hits.has(e)) continue;
                if (!this.zoneHits(z, e)) continue;

                z.hits.add(e);
                const dir = z.dir !== 0 ? z.dir : (e.x >= z.x ? 1 : -1);
                e.takeHit({
                    damage: z.damage,
                    knockbackX: z.knockbackX * dir,
                    knockbackY: z.knockbackY,
                    stun: z.stun,
                    interrupt: z.interrupt,
                    source: z.kind,
                }, now);

                if (z.consumeOnHit) { z.dead = true; break; }
            }
        }

        // 3. Golpes de enemigos → jugador
        if (playerAlive) {
            this.rB.setTo(pb.x, pb.y, pb.width, pb.height);
            for (const e of this.enemies) {
                if (!e.active || e.isDead || e.swingConnected) continue;
                const ar = e.getAttackRect(this.rA);
                if (!ar) continue;
                if (Phaser.Geom.Intersects.RectangleToRectangle(ar, this.rB)) {
                    e.swingConnected = true;
                    const dir = player.x >= e.x ? 1 : -1;
                    const S = GAME_CONFIG.ENEMIES.SOLDIER;
                    this.onPlayerHit(e, S.DAMAGE, dir * S.PLAYER_KNOCKBACK_X, S.PLAYER_KNOCKBACK_Y);
                }
            }
        }
    }

    private zoneHits(z: AttackZone, e: Enemy): boolean {
        e.getBounds2(this.rA);
        if (z.shape === 'circle') {
            this.circle.setTo(z.x, z.y, z.r);
            return Phaser.Geom.Intersects.CircleToRectangle(this.circle, this.rA);
        }
        this.rB.setTo(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
        return Phaser.Geom.Intersects.RectangleToRectangle(this.rB, this.rA);
    }

    // ── Habilidades elementales ───────────────────────────────

    /** Daño directo a un enemigo (p. ej. roca de tierra) */
    hit(e: Enemy, data: HitData): void {
        if (!e.active || e.isDead) return;
        e.takeHit(data, this.scene.time.now);
    }

    /** Explosión circular: solo daña a enemigos dentro del radio */
    explode(cx: number, cy: number, radius: number, base: Omit<HitData, 'knockbackX'> & { knockbackX: number }): number {
        let count = 0;
        this.circle.setTo(cx, cy, radius);
        for (const e of this.enemies) {
            if (!e.active || e.isDead) continue;
            e.getBounds2(this.rA);
            if (!Phaser.Geom.Intersects.CircleToRectangle(this.circle, this.rA)) continue;
            const dir = e.x >= cx ? 1 : -1;
            e.takeHit({ ...base, knockbackX: base.knockbackX * dir }, this.scene.time.now);
            count++;
        }
        return count;
    }

    destroy(): void {
        this.scene.events.off('enemy-killed', this.handleKilled, this);
        this.enemies = [];
    }
}

