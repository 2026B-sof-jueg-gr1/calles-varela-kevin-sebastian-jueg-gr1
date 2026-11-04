// ============================================================
//  Enemy.ts  –  Enemigo básico cuerpo a cuerpo (cuadrado naranja)
//
//  Ciclo de combate:
//    idle → chase → WINDUP (amarillo + "!") → ATTACK → RECOVER (vulnerable)
//  Un golpe con "interrupt" (tierra, descarga) cancela el windup.
//  Los golpes normales NO lo interrumpen: atacar sin pensar cuesta vida.
//  Durante RECOVER / aturdido recibe más daño (VULNERABLE_MULT).
// ============================================================

import * as Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';
import { spawnDamageText, spawnHitSparks } from '../combat/CombatFX';

export type EnemyState =
    | 'idle' | 'chase' | 'windup' | 'attack' | 'recover' | 'stunned' | 'dead';

export type HitSource = 'light' | 'wave' | 'charge' | 'earth' | 'fire' | 'burn';

/** Datos de un golpe recibido por el enemigo */
export interface HitData {
    damage: number;
    knockbackX: number;      // ya con signo (dirección de empuje)
    knockbackY: number;
    stun?: number;           // ms de aturdimiento
    interrupt?: boolean;     // cancela el ataque en preparación
    ignite?: boolean;        // aplica quemadura
    source: HitSource;
}

const SOURCE_COLOR: Record<HitSource, string> = {
    light: '#ffffff',
    wave: '#ff4466',
    charge: '#ffee44',
    earth: '#d9a441',
    fire: '#ff8833',
    burn: '#ff6600',
};

const SOURCE_SPARK: Record<HitSource, number> = {
    light: 0xffdd44,
    wave: 0xcc1111,
    charge: 0xffffaa,
    earth: 0x8b6914,
    fire: 0xff6600,
    burn: 0xff4400,
};

export class Enemy extends Phaser.GameObjects.Rectangle {
    private cfg = GAME_CONFIG.ENEMIES.SOLDIER;

    // ── Estado ────────────────────────────────────────────────
    public state: EnemyState = 'idle';
    public hp: number;
    public readonly maxHp: number;
    private dir = -1;                 // 1 derecha / -1 izquierda
    private stateUntil = 0;
    private attackReadyAt = 0;
    private knockUntil = 0;
    private flashUntil = 0;

    // Golpe del enemigo
    public swingConnected = false;

    // Quemadura
    private burnUntil = 0;
    private nextBurnTick = 0;

    // ── Extras visuales ───────────────────────────────────────
    private eye: Phaser.GameObjects.Rectangle;
    private hpBar: Phaser.GameObjects.Graphics;
    private warn: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        const size = GAME_CONFIG.ENEMIES.SOLDIER.SIZE;
        super(scene, x, y, size, size, GAME_CONFIG.ENEMIES.SOLDIER.COLOR);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.maxHp = this.cfg.MAX_HEALTH;
        this.hp = this.maxHp;
        this.setDepth(30);
        this.setStrokeStyle(2, 0x000000);

        const b = this.b;
        b.setGravityY(GAME_CONFIG.PLAYER.GRAVITY);
        b.setCollideWorldBounds(true);

        this.eye = scene.add.rectangle(x, y, 8, 8, 0x000000).setDepth(31);
        this.hpBar = scene.add.graphics().setDepth(32);
        this.warn = scene.add.text(x, y - 40, '!', {
            fontSize: '28px', color: '#ffee00', fontFamily: 'monospace',
            fontStyle: 'bold', stroke: '#000000', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(33).setVisible(false);
    }

    private get b(): Phaser.Physics.Arcade.Body {
        return this.body as Phaser.Physics.Arcade.Body;
    }

    get isDead(): boolean { return this.state === 'dead'; }

    /** Rectángulo físico (para colisiones lógicas) */
    getBounds2(out: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle {
        const b = this.b;
        return out.setTo(b.x, b.y, b.width, b.height);
    }

    /** Zona de golpe del enemigo; solo existe durante la fase ATTACK */
    getAttackRect(out: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle | null {
        if (this.state !== 'attack') return null;
        const w = 46;
        const h = this.cfg.SIZE + 12;
        const cx = this.x + this.dir * (this.cfg.SIZE / 2 + w / 2 - 4);
        return out.setTo(cx - w / 2, this.y - h / 2, w, h);
    }

    get facing(): number { return this.dir; }

    // ──────────────────────────────────────────────────────────
    //  IA
    // ──────────────────────────────────────────────────────────

    tick(now: number, targetX: number, targetY: number, targetAlive: boolean): void {
        if (this.state === 'dead') return;
        const b = this.b;

        this.updateBurn(now);
        // updateBurn puede matar al enemigo (el tipo ya fue estrechado arriba)
        if ((this.state as EnemyState) === 'dead') return;

        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const inKnock = now < this.knockUntil;

        // Fricción manual durante el empuje
        if (inKnock) b.setVelocityX(b.velocity.x * 0.92);

        switch (this.state) {
            case 'idle':
                if (!inKnock) b.setVelocityX(0);
                if (targetAlive && Math.abs(dx) < this.cfg.DETECT_RANGE && Math.abs(dy) < 200) {
                    this.state = 'chase';
                }
                break;

            case 'chase': {
                if (!targetAlive || Math.abs(dx) > this.cfg.DETECT_RANGE * 1.6) {
                    this.state = 'idle';
                    break;
                }
                this.dir = dx >= 0 ? 1 : -1;
                const inReach = Math.abs(dx) < this.cfg.ATTACK_RANGE && Math.abs(dy) < 60;
                if (inReach && now >= this.attackReadyAt && !inKnock) {
                    this.beginWindup(now);
                    break;
                }
                if (!inKnock) {
                    // Se frena justo fuera del rango para no apilarse sobre el jugador
                    const stop = Math.abs(dx) < this.cfg.ATTACK_RANGE * 0.6;
                    b.setVelocityX(stop ? 0 : this.dir * this.cfg.SPEED);
                }
                break;
            }

            case 'windup':
                if (!inKnock) b.setVelocityX(0);
                if (now >= this.stateUntil) this.beginAttack(now);
                break;

            case 'attack':
                if (now >= this.stateUntil) this.beginRecover(now);
                break;

            case 'recover':
                if (!inKnock) b.setVelocityX(0);
                if (now >= this.stateUntil) this.state = 'chase';
                break;

            case 'stunned':
                if (!inKnock) b.setVelocityX(0);
                if (now >= this.stateUntil) this.state = 'chase';
                break;
        }

        this.syncVisuals(now);
    }

    private beginWindup(now: number): void {
        this.state = 'windup';
        this.stateUntil = now + this.cfg.WINDUP;
        this.swingConnected = false;
    }

    private beginAttack(now: number): void {
        this.state = 'attack';
        this.stateUntil = now + this.cfg.ATTACK_ACTIVE;
        this.swingConnected = false;
        this.b.setVelocityX(this.dir * this.cfg.LUNGE);

        // Destello del tajo
        const slash = this.scene.add.rectangle(
            this.x + this.dir * (this.cfg.SIZE / 2 + 20), this.y,
            46, this.cfg.SIZE + 12, 0xff2200, 0.55
        ).setDepth(34);
        this.scene.tweens.add({
            targets: slash, alpha: 0, duration: this.cfg.ATTACK_ACTIVE + 80,
            onComplete: () => slash.destroy(),
        });
    }

    private beginRecover(now: number): void {
        this.state = 'recover';
        this.stateUntil = now + this.cfg.RECOVER;
        this.attackReadyAt = now + this.cfg.ATTACK_COOLDOWN;
        this.b.setVelocityX(0);
    }

    // ──────────────────────────────────────────────────────────
    //  Recibir daño
    // ──────────────────────────────────────────────────────────

    takeHit(hit: HitData, now: number): void {
        if (this.state === 'dead') return;

        const vulnerable = this.state === 'recover' || this.state === 'stunned';
        const damage = Math.max(1, Math.round(
            hit.damage * (vulnerable && hit.source !== 'burn' ? this.cfg.VULNERABLE_MULT : 1)
        ));
        this.hp -= damage;

        // Feedback
        const big = vulnerable && hit.source !== 'burn';
        spawnDamageText(
            this.scene, this.x, this.y - 26,
            big ? `${damage}!` : `${damage}`,
            SOURCE_COLOR[hit.source], big ? 24 : hit.source === 'burn' ? 14 : 18
        );
        if (hit.source !== 'burn') {
            spawnHitSparks(this.scene, this.x, this.y, SOURCE_SPARK[hit.source], big ? 12 : 8);
            this.scene.cameras.main.shake(70, hit.damage >= 30 ? 0.006 : 0.003);
            this.flashUntil = now + 100;

            // Empuje
            const b = this.b;
            b.setVelocity(hit.knockbackX, hit.knockbackY);
            this.knockUntil = now + this.cfg.HIT_STUN;
        }

        if (hit.ignite) this.ignite(now);

        // Aturdimiento / interrupción
        if (hit.stun && hit.stun > 0) {
            this.enterStun(now, hit.stun);
        } else if (hit.interrupt && this.state === 'windup') {
            this.enterStun(now, this.cfg.INTERRUPT_STUN);
            spawnDamageText(this.scene, this.x, this.y - 52, 'INTERRUMPIDO', '#66ddff', 12);
        }

        if (this.hp <= 0) this.die();
    }

    private enterStun(now: number, ms: number): void {
        this.state = 'stunned';
        this.stateUntil = now + ms;
        this.attackReadyAt = Math.max(this.attackReadyAt, now + 300);
    }

    // ──────────────────────────────────────────────────────────
    //  Quemadura
    // ──────────────────────────────────────────────────────────

    ignite(now: number): void {
        const F = GAME_CONFIG.ELEMENTS.FIRE;
        this.burnUntil = now + F.BURN_DURATION;
        this.nextBurnTick = Math.min(this.nextBurnTick || Infinity, now + 500);
        if (this.nextBurnTick < now) this.nextBurnTick = now + 500;
    }

    get isBurning(): boolean { return this.scene.time.now < this.burnUntil; }

    private updateBurn(now: number): void {
        if (now >= this.burnUntil) { this.nextBurnTick = 0; return; }
        if (now < this.nextBurnTick) return;

        this.nextBurnTick = now + 500;
        const dmg = Math.max(1, Math.round(GAME_CONFIG.ELEMENTS.FIRE.BURN_DAMAGE_PER_SEC * 0.5));
        this.takeHit({ damage: dmg, knockbackX: 0, knockbackY: 0, source: 'burn' }, now);

        const flame = this.scene.add.circle(
            this.x + Phaser.Math.Between(-10, 10), this.y - 10,
            Phaser.Math.Between(4, 8), 0xff4400, 0.9
        ).setDepth(35);
        this.scene.tweens.add({
            targets: flame, y: flame.y - 26, alpha: 0, duration: 450,
            onComplete: () => flame.destroy(),
        });
    }

    // ──────────────────────────────────────────────────────────
    //  Muerte
    // ──────────────────────────────────────────────────────────

    private die(): void {
        this.state = 'dead';
        this.b.setEnable(false);
        this.eye.setVisible(false);
        this.hpBar.clear();
        this.warn.setVisible(false);

        spawnHitSparks(this.scene, this.x, this.y, GAME_CONFIG.ENEMIES.SOLDIER.COLOR, 18);
        this.scene.events.emit('enemy-killed', this);

        this.scene.tweens.add({
            targets: this,
            scaleX: 1.5, scaleY: 0.1, alpha: 0,
            duration: 280,
            onComplete: () => this.destroy(),
        });
    }

    // ──────────────────────────────────────────────────────────
    //  Visuales
    // ──────────────────────────────────────────────────────────

    private syncVisuals(now: number): void {
        // Color por estado
        let color: number = this.cfg.COLOR;
        if (now < this.flashUntil) color = 0xffffff;
        else if (this.state === 'windup') color = (Math.floor(now / 70) % 2 === 0) ? 0xffee00 : 0xffffff;
        else if (this.state === 'attack') color = 0xff0000;
        else if (this.state === 'recover') color = 0x8a3300;
        else if (this.state === 'stunned') color = (Math.floor(now / 90) % 2 === 0) ? 0x66ddff : 0xaaf0ff;
        this.setFillStyle(color);

        // Contorno de quemadura
        this.setStrokeStyle(2, this.isBurning ? 0xff3300 : 0x000000);

        // Ojo indica hacia dónde mira
        this.eye.setPosition(this.x + this.dir * 8, this.y - 6);

        // Aviso del ataque
        this.warn.setVisible(this.state === 'windup');
        this.warn.setPosition(this.x, this.y - 44 - Math.sin(now * 0.03) * 3);

        // Barra de vida
        this.hpBar.clear();
        if (this.hp < this.maxHp) {
            const w = 36;
            const x = this.x - w / 2;
            const y = this.y - this.cfg.SIZE / 2 - 12;
            this.hpBar.fillStyle(0x000000, 0.8).fillRect(x - 1, y - 1, w + 2, 7);
            this.hpBar.fillStyle(0x550000, 1).fillRect(x, y, w, 5);
            this.hpBar.fillStyle(0xdd2222, 1).fillRect(x, y, w * Math.max(0, this.hp / this.maxHp), 5);
        }
    }

    destroy(fromScene?: boolean): void {
        this.eye?.destroy();
        this.hpBar?.destroy();
        this.warn?.destroy();
        super.destroy(fromScene);
    }
}

