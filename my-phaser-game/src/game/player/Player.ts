// ============================================================
//  Player.ts  –  Entidad del jugador
//  Gestiona física, animaciones procedurales, salud,
//  invulnerabilidad y estados de movimiento/combate.
// ============================================================

import * as Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';
import { AttackSystem, HitInfo } from '../combat/AttackSystem';

export type PlayerState =
    | 'idle'
    | 'run'
    | 'jump'
    | 'fall'
    | 'attack_light'
    | 'attack_heavy'
    | 'charge'
    | 'hurt'
    | 'dead';

// Tipo para los game objects gráficos del personaje (tienen x, y, alpha)
type VisualGO = Phaser.GameObjects.Rectangle
    | Phaser.GameObjects.Triangle
    | Phaser.GameObjects.Arc
    | Phaser.GameObjects.Graphics;

export class Player extends Phaser.Physics.Arcade.Sprite {

    // ── Estado ────────────────────────────────────────────────
    private _state: PlayerState = 'idle';
    private _health: number;
    private _maxHealth: number;
    private _facingRight = true;
    private _dead = false;

    // ── Invulnerabilidad ──────────────────────────────────────
    private invulUntil = 0;
    get isInvulnerable(): boolean { return this.scene.time.now < this.invulUntil; }

    // ── Salto / coyote / buffer ───────────────────────────────
    private lastGroundedTime = 0;
    private _onGround = false;
    private canDoubleJump = false;   // habilitado por Aire

    // ── Combat system ─────────────────────────────────────────
    public attackSystem: AttackSystem;
    private attackStateCooldown = 0;       // ms hasta que sale del estado 'attack_*'

    // ── Sprites del personaje (dibujados programáticamente) ──
    private bodyParts: VisualGO[] = [];
    private chargeAura: Phaser.GameObjects.Arc | null = null;



    constructor(scene: Phaser.Scene, x: number, y: number) {
        // Usamos un pixel transparente como textura base; dibujamos encima
        super(scene, x, y, '__DEFAULT');

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this._health = GAME_CONFIG.PLAYER.MAX_HEALTH;
        this._maxHealth = GAME_CONFIG.PLAYER.MAX_HEALTH;

        // Cuerpo físico
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setSize(26, 52);
        body.setOffset(0, 0);
        body.setMaxVelocityX(GAME_CONFIG.PLAYER.RUN_SPEED);
        body.setGravityY(GAME_CONFIG.PLAYER.GRAVITY);

        this.setAlpha(0); // La textura base es invisible; dibujamos formas

        // Sistema de combate
        this.attackSystem = new AttackSystem(scene);

        // Dibujar personaje inicial
        this.buildCharacterGraphics();

        // Partículas de polvo al correr/aterrizar
        this.initDustParticles();
    }

    // ── Propiedades públicas ──────────────────────────────────

    get health(): number { return this._health; }
    get maxHealth(): number { return this._maxHealth; }
    get playerState(): PlayerState { return this._state; }
    get facingRight(): boolean { return this._facingRight; }
    get isDead(): boolean { return this._dead; }
    get onGround(): boolean { return this._onGround; }

    // ── Construcción gráfica del personaje ───────────────────

    /**
     * Construye el sprite del protagonista con gráficos procedurales:
     * - Encapuchado con capa oscura
     * - Detalles eléctricos y de sangre en las espadas
     */
    private buildCharacterGraphics(): void {
        // Destruir partes previas
        this.bodyParts.forEach(p => (p as Phaser.GameObjects.GameObject).destroy());
        this.bodyParts = [];

        const s = this.scene;

        // ── Capa (geometría triangular detrás del cuerpo) ────
        const cape = s.add.graphics();
        cape.setDepth(this.depth - 1);
        this.bodyParts.push(cape);

        // ── Cuerpo principal ─────────────────────────────────
        const body = s.add.rectangle(0, 0, 22, 34, 0x1a1a2e);
        body.setDepth(this.depth);
        this.bodyParts.push(body);

        // ── Capucha ──────────────────────────────────────────
        const hood = s.add.triangle(
            0, -28,
            -14, 0,
            14, 0,
            0, -28,
            0x0d0d1a
        );
        hood.setDepth(this.depth + 1);
        this.bodyParts.push(hood);

        // ── Ojos brillantes bajo la capucha ──────────────────
        const eyeL = s.add.circle(-5, -18, 2.5, 0x4fc3f7, 1);
        const eyeR = s.add.circle(5, -18, 2.5, 0x4fc3f7, 1);
        eyeL.setDepth(this.depth + 2);
        eyeR.setDepth(this.depth + 2);
        this.bodyParts.push(eyeL, eyeR);

        // ── Espada eléctrica (izquierda del cuerpo) ──────────
        const eSword = s.add.rectangle(-14, 4, 5, 28, 0xffd700);
        eSword.setDepth(this.depth + 1);
        const eSwordGlow = s.add.rectangle(-14, 4, 7, 30, 0xffff88, 0.3);
        eSwordGlow.setDepth(this.depth);
        this.bodyParts.push(eSword, eSwordGlow);

        // ── Espada de sangre (derecha del cuerpo) ────────────
        const bSword = s.add.rectangle(14, 4, 5, 28, 0xcc2244);
        bSword.setDepth(this.depth + 1);
        const bSwordGlow = s.add.rectangle(14, 4, 7, 30, 0xff6688, 0.3);
        bSwordGlow.setDepth(this.depth);
        this.bodyParts.push(bSword, bSwordGlow);

        // ── Actualizar posiciones en cada frame ──────────────
        // Se hace en updateGraphics() llamado desde update()
    }

    /** Actualiza la posición y estado visual de los gráficos */
    private updateGraphics(): void {
        if (this.bodyParts.length === 0) return;

        const px = this.x;
        const py = this.y;
        const dir = this._facingRight ? 1 : -1;

        // Índices según buildCharacterGraphics:
        // 0=cape, 1=body, 2=hood, 3=eyeL, 4=eyeR,
        // 5=eSword, 6=eSwordGlow, 7=bSword, 8=bSwordGlow

        const offsets: [number, number][] = [
            [0, 8],     // cape
            [0, 4],     // body
            [13, -5],    // hood
            [-5 * dir, -18],    // eyeL
            [5 * dir, -18],    // eyeR
            [-14 * dir, 4],    // eSword
            [-14 * dir, 4],    // eSwordGlow
            [14 * dir, 4],    // bSword
            [14 * dir, 4],    // bSwordGlow
        ];

        this.bodyParts.forEach((part, i) => {
            const [ox, oy] = offsets[i] ?? [0, 0];
            part.x = px + ox;
            part.y = py + oy;
        });

        // Aura de carga eléctrica
        if (this.chargeAura) {
            this.chargeAura.x = px;
            this.chargeAura.y = py;
            const prog = this.attackSystem.chargeProgress;
            this.chargeAura.setAlpha(prog * 0.6);
            this.chargeAura.setRadius(30 + prog * 20);
        }

        // Efecto de parpadeo durante invulnerabilidad
        if (this.isInvulnerable) {
            const blink = Math.sin(this.scene.time.now * 0.03) > 0;
            const a = blink ? 0.4 : 1;
            this.bodyParts.forEach(p => { p.alpha = a; });
        } else {
            this.bodyParts.forEach(p => { p.alpha = 1; });
        }
    }

    private initDustParticles(): void {
        // Las partículas se emiten desde emitDust() con Graphics simples.
        // No se necesitan assets de textura.
    }

    public emitDust(): void {
        for (let i = 0; i < 4; i++) {
            const d = this.scene.add.circle(
                this.x + Phaser.Math.Between(-10, 10),
                this.y + 24,
                Phaser.Math.Between(3, 6),
                0x8b7355, 0.6
            );
            this.scene.tweens.add({
                targets: d,
                y: d.y + Phaser.Math.Between(-20, -40),
                x: d.x + Phaser.Math.Between(-20, 20),
                alpha: 0,
                duration: Phaser.Math.Between(300, 600),
                onComplete: () => d.destroy()
            });
        }
    }

    // ── API pública: movimiento ───────────────────────────────

    moveLeft(running: boolean): void {
        if (this._dead || this._state === 'hurt') return;
        const spd = running ? GAME_CONFIG.PLAYER.RUN_SPEED : GAME_CONFIG.PLAYER.WALK_SPEED;
        (this.body as Phaser.Physics.Arcade.Body).setVelocityX(-spd);
        this._facingRight = false;
        if (this._onGround && this._state !== 'attack_light' && this._state !== 'attack_heavy') {
            this._state = 'run';
        }
    }

    moveRight(running: boolean): void {
        if (this._dead || this._state === 'hurt') return;
        const spd = running ? GAME_CONFIG.PLAYER.RUN_SPEED : GAME_CONFIG.PLAYER.WALK_SPEED;
        (this.body as Phaser.Physics.Arcade.Body).setVelocityX(spd);
        this._facingRight = true;
        if (this._onGround && this._state !== 'attack_light' && this._state !== 'attack_heavy') {
            this._state = 'run';
        }
    }

    stopHorizontal(): void {
        // No cancelar el empuje recibido al ser golpeado
        if (this._state === 'hurt') return;
        (this.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
        if (this._onGround && this._state === 'run') {
            this._state = 'idle';
        }
    }

    /** Intenta saltar; respeta coyote time y double jump (Aire) */
    tryJump(airEquipped: boolean): boolean {
        if (this._dead) return false;

        const now = this.scene.time.now;
        const body = this.body as Phaser.Physics.Arcade.Body;

        // Coyote time
        const onGroundRecently = this._onGround || (now - this.lastGroundedTime < GAME_CONFIG.PLAYER.COYOTE_TIME);

        if (onGroundRecently) {
            body.setVelocityY(GAME_CONFIG.PLAYER.JUMP_VELOCITY);
            this.canDoubleJump = airEquipped;
            this._state = 'jump';
            this.emitDust();
            return true;
        }

        // Double jump (Aire)
        if (airEquipped && this.canDoubleJump) {
            body.setVelocityY(GAME_CONFIG.ELEMENTS.AIR.DOUBLE_JUMP_VELOCITY);
            this.canDoubleJump = false;
            this._state = 'jump';
            // Efecto visual de rafaga de aire
            this.emitAirBurst();
            return true;
        }

        return false;
    }

    /** Planeo (mantener espacio en el aire, Aire equipado) */
    applyGlide(): void {
        if (this._dead || this._onGround) return;
        const body = this.body as Phaser.Physics.Arcade.Body;
        // Reduce la velocidad de caída si está cayendo
        if (body.velocity.y > 0) {
            body.setVelocityY(
                Math.max(body.velocity.y - 18, GAME_CONFIG.ELEMENTS.AIR.GLIDE_GRAVITY * 2)
            );
        }
    }

    private emitAirBurst(): void {
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 30 + 10;
            const p = this.scene.add.circle(
                this.x + Math.cos(angle) * r,
                this.y + Math.sin(angle) * r,
                Phaser.Math.Between(3, 8),
                0xaaddff, 0.75
            );
            this.scene.tweens.add({
                targets: p,
                x: p.x + Math.cos(angle) * 40,
                y: p.y + Math.sin(angle) * 40,
                alpha: 0,
                duration: 300,
                onComplete: () => p.destroy()
            });
        }
    }

    // ── API pública: combate ──────────────────────────────────

    lightAttack(): HitInfo | null {
        if (this._dead || this._state === 'hurt') return null;
        const result = this.attackSystem.lightAttack(this.x, this.y, this._facingRight);
        if (result) {
            this._state = 'attack_light';
            this.attackStateCooldown = this.scene.time.now + 200;
        }
        return result;
    }

    heavyAttack(): HitInfo | null {
        if (this._dead || this._state === 'hurt') return null;
        const result = this.attackSystem.heavyAttack(this.x, this.y, this._facingRight);
        if (result) {
            this._state = 'attack_heavy';
            this.attackStateCooldown = this.scene.time.now + 350;
        }
        return result;
    }

    beginCharge(): void {
        if (this._dead || this._state === 'hurt') return;
        this.attackSystem.beginCharge();
        this._state = 'charge';

        // Crear aura de carga
        if (!this.chargeAura) {
            this.chargeAura = this.scene.add.circle(this.x, this.y, 30, 0xffee00, 0);
            this.chargeAura.setDepth(this.depth + 3);
        }
    }

    releaseCharge(): HitInfo | null {
        const result = this.attackSystem.releaseCharge(this.x, this.y, this._facingRight);
        if (this.chargeAura) {
            this.chargeAura.destroy();
            this.chargeAura = null;
        }
        this._state = 'idle';
        return result;
    }

    // ── Daño e invulnerabilidad ───────────────────────────────

    takeDamage(amount: number, knockbackX = 0, knockbackY = 0): void {
        if (this._dead || this.isInvulnerable) return;

        this._health = Math.max(0, this._health - amount);
        this.invulUntil = this.scene.time.now + GAME_CONFIG.PLAYER.INVUL_DURATION;
        this._state = 'hurt';

        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocityX(knockbackX);
        body.setVelocityY(knockbackY);

        // Efecto de daño: flash rojo
        this.flashDamage();

        this.scene.time.delayedCall(300, () => {
            if (this._state === 'hurt') this._state = 'idle';
        });

        if (this._health <= 0) this.die();
    }

    /** Concede invulnerabilidad temporal (p. ej. tras absorber un golpe con el escudo) */
    grantInvulnerability(ms: number): void {
        this.invulUntil = Math.max(this.invulUntil, this.scene.time.now + ms);
    }

    heal(amount: number): void {
        this._health = Math.min(this._maxHealth, this._health + amount);
    }

    private flashDamage(): void {
        for (let i = 0; i < 8; i++) {
            const blood = this.scene.add.circle(
                this.x + Phaser.Math.Between(-20, 20),
                this.y + Phaser.Math.Between(-20, 20),
                Phaser.Math.Between(3, 8),
                0xff2244, 0.9
            );
            this.scene.tweens.add({
                targets: blood,
                y: blood.y - Phaser.Math.Between(20, 50),
                alpha: 0,
                duration: Phaser.Math.Between(300, 600),
                onComplete: () => blood.destroy()
            });
        }
    }

    private die(): void {
        this._dead = true;
        this._state = 'dead';
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        body.setEnable(false);

        // Animación de muerte
        this.scene.tweens.add({
            targets: this.bodyParts,
            alpha: 0,
            y: (t: Phaser.GameObjects.Components.Transform) => t.y + 60,
            duration: 800,
            ease: 'Power2'
        });

        // Señal a la escena
        this.scene.time.delayedCall(1200, () => {
            this.scene.events.emit('player-dead');
        });
    }

    // ── Setters de estado ─────────────────────────────────────

    setGrounded(grounded: boolean): void {
        if (grounded && !this._onGround) {
            // Recién aterrizó
            this.emitDust();
        }
        if (grounded) {
            this.lastGroundedTime = this.scene.time.now;
            this.canDoubleJump = false; // se reasigna en tryJump
        }
        this._onGround = grounded;
    }

    // ── Update ────────────────────────────────────────────────

    update(_time: number, _delta: number): void {
        if (this._dead) {
            this.updateGraphics();
            return;
        }

        const body = this.body as Phaser.Physics.Arcade.Body;

        // Actualizar estado de suelo
        const grounded = body.blocked.down;
        this.setGrounded(grounded);

        // Salir de estado de ataque automáticamente
        if (
            (this._state === 'attack_light' || this._state === 'attack_heavy') &&
            this.scene.time.now >= this.attackStateCooldown
        ) {
            this._state = this._onGround ? 'idle' : (body.velocity.y < 0 ? 'jump' : 'fall');
        }

        // Estado de aire
        if (!this._onGround && this._state !== 'attack_light' && this._state !== 'attack_heavy' && this._state !== 'hurt') {
            this._state = body.velocity.y <= 0 ? 'jump' : 'fall';
        }

        if (this._onGround && this._state === 'jump') {
            this._state = 'idle';
        }

        // Animación de carga eléctrica visual
        if (this._state === 'charge' && !this.attackSystem.charging) {
            this._state = 'idle';
        }

        // Actualizar gráficos
        this.updateGraphics();
    }

    destroy(fromScene?: boolean): void {
        this.bodyParts.forEach(p => p.destroy());
        this.chargeAura?.destroy();
        this.attackSystem.destroy();
        super.destroy(fromScene);
    }
}
