// ============================================================
//  GameScene.ts  –  Escena principal de juego (Fase 1 + Fase 2)
//  Nivel de prueba con plataformas, sistema elemental completo,
//  proyectiles de tierra, explosión de fuego, escudo de agua.
// ============================================================

import * as Phaser from 'phaser';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { HUD } from '../ui/HUD';
import { ElementSystem, ProjectileData } from '../elements/ElementSystem';
import { ElementSelector } from '../ui/ElementSelector';
import { EnemyManager } from '../enemies/EnemyManager';
import { Enemy } from '../enemies/Enemy';
import { spawnDamageText, spawnHitSparks } from '../combat/CombatFX';
import { GAME_CONFIG } from '../config/GameConfig';

export class GameScene extends Phaser.Scene {

    // ── Entidades principales ─────────────────────────────────
    private player!: Player;
    private controller!: PlayerController;
    private elements!: ElementSystem;
    private selector!: ElementSelector;
    private hud!: HUD;
    private enemyMgr!: EnemyManager;
    private enemyCountText!: Phaser.GameObjects.Text;

    // ── Física ────────────────────────────────────────────────
    private platforms!: Phaser.Physics.Arcade.StaticGroup;
    private hazards!: Phaser.Physics.Arcade.StaticGroup;

    // ── Proyectiles de tierra ─────────────────────────────────
    private earthProjectiles!: Phaser.Physics.Arcade.Group;

    // ── Mundo ─────────────────────────────────────────────────
    private readonly WORLD_W = 3200;
    private readonly WORLD_H = 768;

    // ── Pausa ─────────────────────────────────────────────────
    private isPaused = false;
    private pauseOverlay?: Phaser.GameObjects.Container;

    constructor() {
        super('GameScene');
    }

    // ──────────────────────────────────────────────────────────
    //  CREATE
    // ──────────────────────────────────────────────────────────

    create(): void {
        this.physics.world.setBounds(0, 0, this.WORLD_W, this.WORLD_H);
        this.cameras.main.setBounds(0, 0, this.WORLD_W, this.WORLD_H);
        this.physics.world.gravity.y = 0;

        // Reinicio limpio (la instancia de la escena se reutiliza al reiniciar)
        this.isPaused = false;
        this.events.once('shutdown', () => this.shutdown());

        this.buildBackground();
        this.buildLevel();
        this.buildElementSystem();   // antes de buildPlayer para que controller tenga ref
        this.buildPlayer();
        this.buildHazards();
        this.buildEnemies();
        this.buildCamera();
        this.buildCollisions();
        this.buildEventListeners();
    }

    // ──────────────────────────────────────────────────────────
    //  FONDO – parallax de ruinas
    // ──────────────────────────────────────────────────────────

    private buildBackground(): void {
        const H = this.WORLD_H;

        const sky = this.add.graphics().setScrollFactor(0).setDepth(-10);
        sky.fillGradientStyle(0x04040f, 0x04040f, 0x0a0520, 0x0a0520, 1);
        sky.fillRect(0, 0, 1024, 768);

        const moon = this.add.graphics().setScrollFactor(0.05).setDepth(-9);
        moon.fillStyle(0xc8bfb0, 0.15);
        moon.fillCircle(820, 120, 70);
        moon.fillStyle(0xffffff, 0.08);
        moon.fillCircle(820, 120, 75);

        const mountains = this.add.graphics().setScrollFactor(0.15).setDepth(-8);
        mountains.fillStyle(0x080818, 1);
        for (let i = 0; i < 12; i++) {
            const mx = i * 300 - 100;
            const mh = 180 + Math.sin(i * 1.7) * 80;
            mountains.fillTriangle(mx, H, mx + 200, H - mh, mx + 400, H);
        }

        const ruins = this.add.graphics().setScrollFactor(0.3).setDepth(-7);
        ruins.fillStyle(0x0c0c1e, 1);
        for (let i = 0; i < 20; i++) {
            const rx = i * 180 + 40;
            const rh = 100 + Math.sin(i * 2.3) * 60;
            ruins.fillRect(rx, H - rh, 18, rh);
            ruins.fillRect(rx - 6, H - rh - 10, 30, 12);
        }

        const fog = this.add.graphics().setScrollFactor(0.5).setDepth(-6);
        fog.fillStyle(0x080820, 0.4);
        for (let i = 0; i < 8; i++) {
            fog.fillEllipse(i * 450, H - 40, 500, 120);
        }
    }

    // ──────────────────────────────────────────────────────────
    //  NIVEL
    // ──────────────────────────────────────────────────────────

    private buildLevel(): void {
        this.platforms = this.physics.add.staticGroup();

        const levelData: Array<{ x: number; y: number; w: number; h: number; type?: string }> = [
            { x: 0, y: 700, w: 800, h: 68, type: 'ground' },
            { x: 800, y: 700, w: 400, h: 68, type: 'ground' },
            { x: 1200, y: 700, w: 600, h: 68, type: 'ground' },
            { x: 1800, y: 700, w: 500, h: 68, type: 'ground' },
            { x: 2300, y: 700, w: 900, h: 68, type: 'ground' },

            { x: 200, y: 560, w: 140, h: 20, type: 'platform' },
            { x: 440, y: 490, w: 120, h: 20, type: 'platform' },
            { x: 640, y: 420, w: 100, h: 20, type: 'platform' },

            { x: 900, y: 580, w: 160, h: 20, type: 'platform' },
            { x: 1060, y: 500, w: 100, h: 20, type: 'platform' },
            { x: 1100, y: 420, w: 120, h: 20, type: 'platform' },

            { x: 1280, y: 620, w: 80, h: 20, type: 'platform' },
            { x: 1380, y: 540, w: 80, h: 20, type: 'platform' },
            { x: 1480, y: 460, w: 80, h: 20, type: 'platform' },
            { x: 1580, y: 540, w: 80, h: 20, type: 'platform' },
            { x: 1680, y: 620, w: 80, h: 20, type: 'platform' },

            { x: 1900, y: 560, w: 200, h: 20, type: 'platform' },
            { x: 2100, y: 480, w: 150, h: 20, type: 'platform' },
            { x: 2000, y: 400, w: 100, h: 20, type: 'platform' },
            { x: 2250, y: 560, w: 180, h: 20, type: 'platform' },
            { x: 2450, y: 480, w: 200, h: 20, type: 'platform' },
            { x: 2680, y: 400, w: 160, h: 20, type: 'platform' },

            { x: 2900, y: 700, w: 300, h: 68, type: 'ground' },
            { x: 2950, y: 580, w: 120, h: 20, type: 'platform' },
            { x: 3050, y: 500, w: 100, h: 20, type: 'platform' },
        ];

        levelData.forEach(({ x, y, w, h, type }) => {
            this.platforms.add(this.createPlatform(x, y, w, h, type ?? 'platform'));
        });

        this.buildLevelDecoration();
    }

    private createPlatform(x: number, y: number, w: number, h: number, type: string): Phaser.GameObjects.Rectangle {
        const isGround = type === 'ground';
        const topColor = isGround ? 0x2c1f4a : 0x3d2255;
        const bodyColor = 0x1a1030;

        const g = this.add.graphics();
        g.fillStyle(bodyColor, 1);
        g.fillRect(x, y, w, h);
        g.fillStyle(topColor, 1);
        g.fillRect(x, y, w, isGround ? 8 : 6);
        g.fillStyle(0x000000, 0.3);
        for (let bx = x + 20; bx < x + w - 10; bx += 40) {
            g.fillRect(bx, y + 2, 2, isGround ? 6 : 4);
        }
        g.fillStyle(0x9966cc, 0.12);
        g.fillRect(x, y, w, 2);

        const rect = this.add.rectangle(x + w / 2, y + h / 2, w, h);
        rect.setAlpha(0);
        return rect;
    }

    private buildLevelDecoration(): void {
        const dec = this.add.graphics().setDepth(-1);
        [300, 600, 1000, 1900, 2400, 2700, 2900].forEach(cx => {
            dec.fillStyle(0x1e1630, 1);
            dec.fillRect(cx, 560, 22, 140);
            dec.fillStyle(0x2c2048, 1);
            dec.fillRect(cx - 8, 556, 38, 12);
            dec.fillRect(cx - 4, 548, 30, 10);
            dec.fillStyle(0x9966cc, 0.15);
            dec.fillRect(cx + 2, 560, 4, 140);
        });
        dec.fillStyle(0x000000, 0.8);
        [500, 1100, 2100].forEach(cx => {
            dec.fillRect(cx, 698, 30, 4);
            dec.fillRect(cx + 5, 696, 15, 4);
        });
    }

    // ──────────────────────────────────────────────────────────
    //  SISTEMA ELEMENTAL
    // ──────────────────────────────────────────────────────────

    private buildElementSystem(): void {
        this.elements = new ElementSystem(this, {
            onEarthProjectile: (data) => this.spawnEarthProjectile(data),
            onFireExplosion: (x, y) => this.applyFireExplosion(x, y),
            onWaterShield: (_active) => { /* visual manejado en ElementSystem */ },
            getEnemies: () => [],  // Fase 3: retornará los enemigos reales
        });

        this.selector = new ElementSelector(this, this.elements);

        // Grupo de proyectiles de tierra
        this.earthProjectiles = this.physics.add.group();
    }

    // ── Proyectil de tierra ───────────────────────────────────

    private spawnEarthProjectile(data: ProjectileData): void {
        // Roca como objeto físico
        const rock = this.add.rectangle(data.x, data.y, 20, 18, 0x7a5520);
        rock.setStrokeStyle(1, 0x4a3310);
        this.physics.add.existing(rock);

        const body = (rock.body as Phaser.Physics.Arcade.Body);
        body.setVelocity(data.velX, data.velY);
        body.setGravityY(data.gravity);
        body.setAllowGravity(true);


        rock.setData('proj', data);
        this.earthProjectiles.add(rock);

        // Destruir si supera el rango máximo
        const ticker = this.time.addEvent({
            delay: 16,
            loop: true,
            callback: () => {
                if (!rock.active) { ticker.destroy(); return; }
                const dist = Math.abs(rock.x - data.startX);
                if (dist >= data.maxRange) {
                    this.destroyRock(rock);
                    ticker.destroy();
                }
            }
        });

        // Partículas de polvo de roca
        this.time.addEvent({
            delay: 80, loop: true,
            callback: () => {
                if (!rock.active) return;
                const frag = this.add.rectangle(rock.x, rock.y,
                    Phaser.Math.Between(3, 6), Phaser.Math.Between(3, 6), 0x8B6914, 0.7);
                this.tweens.add({
                    targets: frag,
                    y: frag.y + 10, alpha: 0,
                    duration: 250,
                    onComplete: () => frag.destroy()
                });
            }
        });

        // Timeout de seguridad
        this.time.delayedCall(3000, () => {
            if (rock.active) this.destroyRock(rock);
        });
    }

    private destroyRock(rock: Phaser.GameObjects.Rectangle): void {
        // Fragmentos al impactar
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const frag = this.add.rectangle(
                rock.x + Math.cos(angle) * 8,
                rock.y + Math.sin(angle) * 8,
                Phaser.Math.Between(4, 8), Phaser.Math.Between(4, 8),
                0x8B6914, 0.8
            );
            this.tweens.add({
                targets: frag,
                x: frag.x + Math.cos(angle) * 30,
                y: frag.y + Math.sin(angle) * 30 + 20,
                alpha: 0, duration: 350,
                onComplete: () => frag.destroy()
            });
        }
        this.earthProjectiles.remove(rock, true, true);
    }

    // ── Explosión de fuego ────────────────────────────────────

    private applyFireExplosion(cx: number, cy: number): void {
        // La explosión visual ya la genera ElementSystem.
        // Aquí se aplica el daño de área: solo los enemigos dentro del radio
        // reciben daño, empuje, interrupción y quemadura.
        const F = GAME_CONFIG.ELEMENTS.FIRE;
        const n = this.enemyMgr.explode(cx, cy, F.RADIUS, {
            damage: F.DAMAGE,
            knockbackX: 240,
            knockbackY: -180,
            interrupt: true,
            ignite: true,
            source: 'fire',
        });
        if (n > 0) this.cameras.main.shake(120, 0.006);
    }

    // ──────────────────────────────────────────────────────────
    //  JUGADOR
    // ──────────────────────────────────────────────────────────

    // ──────────────────────────────────────────────────────────
    //  ENEMIGOS Y DAÑO AL JUGADOR
    // ──────────────────────────────────────────────────────────

    private buildEnemies(): void {
        this.enemyMgr = new EnemyManager(this, (enemy, dmg, kx, ky) =>
            this.damagePlayer(enemy, dmg, kx, ky)
        );

        // Puntos de aparición (x) sobre el suelo principal (y = 700)
        const spawnXs = [650, 980, 1350, 1650, 2050, 2450, 3000, 3100];
        spawnXs.forEach(x => this.enemyMgr.spawn(x, 640));

        this.enemyCountText = this.add.text(this.scale.width / 2, 14, '', {
            fontSize: '14px', color: '#ff9955', fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);
    }

    /**
     * Punto único por el que el jugador recibe daño de enemigos.
     * Orden: invulnerabilidad → escudo de agua → daño real.
     */
    private damagePlayer(_enemy: Enemy, damage: number, kx: number, ky: number): void {
        const p = this.player;
        if (p.isDead || p.isInvulnerable) return;

        // El escudo de agua absorbe el golpe completo y se rompe
        if (this.elements.tryAbsorbHit()) {
            p.grantInvulnerability(500);
            spawnDamageText(this, p.x, p.y - 40, 'BLOQUEADO', '#66ccff', 18);
            spawnHitSparks(this, p.x, p.y, 0x66ccff, 12);
            this.cameras.main.shake(70, 0.003);
            return;
        }

        p.takeDamage(damage, kx, ky);
        spawnDamageText(this, p.x, p.y - 40, `-${damage}`, '#ff4466', 24);
        this.cameras.main.shake(150, 0.008);
        this.cameras.main.flash(120, 140, 0, 0);
    }

    private buildPlayer(): void {
        this.player = new Player(this, 120, 620);

        // Controller ahora recibe ElementSystem
        this.controller = new PlayerController(this, this.player, this.elements);

        // Callback para abrir el selector
        this.controller.onOpenSelector = (slot) => {
            if (this.selector.isOpen) {
                this.selector.close();
            } else {
                this.selector.open(slot);
            }
        };

        this.hud = new HUD(this, this.player, this.elements);
    }

    // ──────────────────────────────────────────────────────────
    //  HAZARDS (abismos)
    // ──────────────────────────────────────────────────────────

    private buildHazards(): void {
        this.hazards = this.physics.add.staticGroup();

        const pit = this.add.rectangle(1500, 780, 600, 80);
        pit.setAlpha(0);
        this.hazards.add(pit);

        const bottom = this.add.rectangle(this.WORLD_W / 2, 820, this.WORLD_W, 80);
        bottom.setAlpha(0);
        this.hazards.add(bottom);
    }

    // ──────────────────────────────────────────────────────────
    //  CÁMARA
    // ──────────────────────────────────────────────────────────

    private buildCamera(): void {
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(1);
    }

    // ──────────────────────────────────────────────────────────
    //  COLISIONES
    // ──────────────────────────────────────────────────────────

    private buildCollisions(): void {
        // Jugador ↔ plataformas
        this.physics.add.collider(this.player, this.platforms);

        // Proyectiles de tierra ↔ plataformas (rebotan o destruyen)
        this.physics.add.collider(
            this.earthProjectiles,
            this.platforms,
            (projObj) => {
                const rock = projObj as Phaser.GameObjects.Rectangle;
                if (rock.active) this.destroyRock(rock);
            }
        );

        // Enemigos ↔ escenario y entre sí
        this.physics.add.collider(this.enemyMgr.group, this.platforms);
        this.physics.add.collider(this.enemyMgr.group, this.enemyMgr.group);

        // Roca de tierra ↔ enemigos: daño alto, empuje e interrupción
        this.physics.add.overlap(
            this.earthProjectiles,
            this.enemyMgr.group,
            (rockObj, enemyObj) => {
                const rock = rockObj as unknown as Phaser.GameObjects.Rectangle;
                const enemy = enemyObj as unknown as Enemy;
                if (!rock.active || enemy.isDead) return;

                const data = rock.getData('proj') as ProjectileData;
                this.enemyMgr.hit(enemy, {
                    damage: data.damage,
                    knockbackX: data.knockbackX,   // ya trae el signo de la dirección
                    knockbackY: data.knockbackY,
                    interrupt: true,
                    source: 'earth',
                });
                this.destroyRock(rock);
            }
        );

        // Abismos
        this.physics.add.overlap(this.player, this.hazards, () => {
            this.player.takeDamage(999);
        });
    }

    // ──────────────────────────────────────────────────────────
    //  EVENTOS
    // ──────────────────────────────────────────────────────────

    private buildEventListeners(): void {
        this.events.on('player-dead', () => {
            this.time.delayedCall(1500, () => this.scene.start('GameOver'));
        });

        this.input.keyboard!
            .addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
            .on('down', () => this.togglePause());
    }

    private togglePause(): void {
        // ESC con el selector abierto: solo lo cierra
        if (!this.isPaused && this.selector?.isOpen) {
            this.selector.close();
            return;
        }
        if (this.isPaused) {
            this.isPaused = false;
            this.pauseOverlay?.destroy();
            this.physics.resume();
        } else {
            this.isPaused = true;
            this.physics.pause();
            this.showPauseMenu();
        }
    }

    private showPauseMenu(): void {
        const W = this.scale.width;
        const H = this.scale.height;

        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7)
            .setScrollFactor(0).setDepth(200);
        const title = this.add.text(W / 2, H / 2 - 70, 'PAUSADO', {
            fontSize: '46px', color: '#cc88ff',
            fontFamily: 'Georgia, serif', stroke: '#000000', strokeThickness: 6
        }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

        const controls = [
            '── CONTROLES ──',
            'A / D  :  Mover',
            'SPACE  :  Saltar  (2× con AIRE)',
            'SPACE (aire)  :  Planear',
            'J  :  Atacar   (mantener = carga ⚡)',
            'K  :  Onda de sangre',
            '──',
            '1 / 2  :  Seleccionar slot elemental',
            'Q  :  Alternar slot activo',
            'E  :  Activar habilidad elemental',
            'F  :  Cambiar elementos equipados',
            '──',
            'ESC  :  Pausar / Reanudar',
            'R  :  Reiniciar',
        ].join('\n');

        const ctrlText = this.add.text(W / 2, H / 2 - 10, controls, {
            fontSize: '14px', color: '#aaaacc',
            fontFamily: 'monospace', align: 'center',
            lineSpacing: 4
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(201);

        this.pauseOverlay = this.add.container(0, 0, [overlay, title, ctrlText])
            .setScrollFactor(0).setDepth(200);

        this.input.keyboard!.once('keydown-R', () => {
            this.isPaused = false;
            this.physics.resume();
            this.pauseOverlay?.destroy();
            this.scene.restart();
        });
    }

    // ──────────────────────────────────────────────────────────
    //  UPDATE
    // ──────────────────────────────────────────────────────────

    update(time: number, delta: number): void {
        if (this.isPaused) return;

        this.controller.update(time, delta);
        this.selector.update();
        this.player.update(time, delta);

        // Actualizar sistema elemental
        this.elements.update(this.player.x, this.player.y, time, delta);

        // Aplicar curación del escudo de agua
        const healAmount = this.elements.drainHealAccum();
        if (healAmount > 0) {
            this.player.heal(healAmount);
        }

        // Combate: enemigos, zonas de ataque del jugador y daño recibido
        this.enemyMgr.update(time, this.player, this.player.attackSystem.zones);
        this.enemyCountText.setText(`Enemigos: ${this.enemyMgr.alive.length}`);

        this.hud.update();

        // Caída fuera del mundo
        if (this.player.y > this.WORLD_H + 100 && !this.player.isDead) {
            this.player.takeDamage(999);
        }
    }

    // ──────────────────────────────────────────────────────────
    //  SHUTDOWN
    // ──────────────────────────────────────────────────────────

    shutdown(): void {
        this.hud?.destroy();
        this.selector?.destroy();
        this.elements?.destroy();
        this.enemyMgr?.destroy();
        this.events.off('player-dead');
    }
}
