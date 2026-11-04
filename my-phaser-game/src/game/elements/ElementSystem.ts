// ============================================================
//  ElementSystem.ts  –  Motor del sistema elemental
//  Gestiona los 4 elementos, el equipamiento de 2 slots,
//  cooldowns independientes y la activación de habilidades.
//  Es totalmente independiente del HUD y la UI.
// ============================================================

import * as Phaser from 'phaser';
import { GAME_CONFIG } from '../config/GameConfig';

// ── Tipos públicos ────────────────────────────────────────────

export type ElementId = 'earth' | 'air' | 'water' | 'fire' | 'none';

export interface ElementSlot {
    id: ElementId;
    cooldownUntil: number;   // timestamp ms
}

export interface ProjectileData {
    type: ElementId;
    x: number;
    y: number;
    velX: number;
    velY: number;
    damage: number;
    knockbackX: number;
    knockbackY: number;
    gravity: number;
    maxRange: number;
    startX: number;
}

/** Callbacks que la GameScene conecta para reaccionar a habilidades */
export interface ElementCallbacks {
    onEarthProjectile: (data: ProjectileData) => void;
    onFireExplosion: (x: number, y: number) => void;
    onWaterShield: (active: boolean) => void;
    /** Devuelve la lista actual de enemigos para aplicar daño de área */
    getEnemies: () => Phaser.Physics.Arcade.Sprite[];
}

// ── Clase principal ───────────────────────────────────────────

export class ElementSystem {
    private scene: Phaser.Scene;
    private callbacks: ElementCallbacks;

    // Slots de equipamiento (máx 2)
    private slots: [ElementSlot, ElementSlot] = [
        { id: 'none', cooldownUntil: 0 },
        { id: 'none', cooldownUntil: 0 },
    ];

    // Índice del slot activo (0 o 1)
    private activeSlotIndex: 0 | 1 = 0;

    // Cooldowns de elementos desequipados (para que no se recarguen al cambiar)
    private elementCooldowns = new Map<ElementId, number>();

    // Todos los 4 elementos disponibles
    private readonly ALL_ELEMENTS: ElementId[] = ['earth', 'air', 'water', 'fire'];

    // Efectos visuales persistentes
    private waterShieldVisual: Phaser.GameObjects.Arc | null = null;
    private waterShieldActive = false;
    private waterShieldUntil = 0;
    private waterHealAccum = 0;
    private waterHealedTotal = 0;   // curación total entregada por este escudo
    private waterDamageAbsorbed = false;

    // Efectos de burn en curso: Map<gameObjectId -> burnUntil>
    private burnTargets = new Map<number, number>();

    constructor(scene: Phaser.Scene, callbacks: ElementCallbacks) {
        this.scene = scene;
        this.callbacks = callbacks;

        // Equipar Air y Fire por defecto para que el jugador pueda probar desde el inicio
        this.slots[0] = { id: 'air', cooldownUntil: 0 };
        this.slots[1] = { id: 'earth', cooldownUntil: 0 };
    }

    // ── Getters ───────────────────────────────────────────────

    get activeSlot(): ElementSlot { return this.slots[this.activeSlotIndex]; }
    get slot0(): ElementSlot { return this.slots[0]; }
    get slot1(): ElementSlot { return this.slots[1]; }
    get activeIndex(): 0 | 1 { return this.activeSlotIndex; }
    get airEquipped(): boolean { return this.slots[0].id === 'air' || this.slots[1].id === 'air'; }

    /** true si el slot activo puede usar su habilidad ahora */
    canActivate(slotIndex: 0 | 1 = this.activeSlotIndex): boolean {
        const slot = this.slots[slotIndex];
        if (slot.id === 'none' || slot.id === 'air') return false; // aire es pasivo
        return this.scene.time.now >= slot.cooldownUntil;
    }

    /** Progreso de cooldown 0..1 (1 = listo) */
    cooldownProgress(slotIndex: 0 | 1): number {
        const slot = this.slots[slotIndex];
        if (slot.id === 'none') return 1;
        const now = this.scene.time.now;
        const cd = this.getCooldown(slot.id);
        const start = slot.cooldownUntil - cd;
        const elapsed = Math.min(now - start, cd);
        return cd <= 0 ? 1 : Math.max(0, elapsed / cd);
    }

    private getCooldown(id: ElementId): number {
        switch (id) {
            case 'earth': return GAME_CONFIG.ELEMENTS.EARTH.COOLDOWN;
            case 'water': return GAME_CONFIG.ELEMENTS.WATER.COOLDOWN;
            case 'fire': return GAME_CONFIG.ELEMENTS.FIRE.COOLDOWN;
            default: return 0;
        }
    }

    // ── Equipamiento ──────────────────────────────────────────

    /** Alterna entre slot 0 y slot 1 */
    toggleSlot(): void {
        this.activeSlotIndex = this.activeSlotIndex === 0 ? 1 : 0;
    }

    /** Selecciona directamente un slot por índice */
    selectSlot(index: 0 | 1): void {
        this.activeSlotIndex = index;
    }

    /**
     * Equipa un elemento en un slot (por defecto el activo).
     * - Si el elemento ya está en el otro slot, los dos slots se INTERCAMBIAN
     *   (nunca hay dos iguales ni se queda un slot vacío).
     * - El cooldown pertenece al ELEMENTO, no al slot: quitarlo y volver a
     *   equiparlo no recarga la habilidad.
     * - Las habilidades ya activas (escudo de agua, quemaduras) siguen
     *   resolviéndose aunque el elemento se desequipe.
     */
    equipElement(id: ElementId, slotIndex: 0 | 1 = this.activeSlotIndex): void {
        if (id === 'none') return;

        const target = this.slots[slotIndex];
        if (target.id === id) return; // ya está ahí

        const otherIndex: 0 | 1 = slotIndex === 0 ? 1 : 0;
        const other = this.slots[otherIndex];

        // Guardar el cooldown del elemento que sale del slot
        if (target.id !== 'none') this.elementCooldowns.set(target.id, target.cooldownUntil);

        if (other.id === id) {
            // Intercambio: cada elemento conserva su propio cooldown
            this.slots[otherIndex] = target;
            this.slots[slotIndex] = other;
        } else {
            this.slots[slotIndex] = {
                id,
                cooldownUntil: this.elementCooldowns.get(id) ?? 0,
            };
        }
    }

    // ── Activación de habilidad ───────────────────────────────

    /**
     * Activa la habilidad del slot activo.
     * @param playerX posición X del jugador
     * @param playerY posición Y del jugador
     * @param facingRight dirección
     */
    activate(playerX: number, playerY: number, facingRight: boolean): void {
        const slot = this.activeSlot;
        if (slot.id === 'none' || slot.id === 'air') return;
        if (!this.canActivate()) return;

        switch (slot.id) {
            case 'earth': this.activateEarth(playerX, playerY, facingRight); break;
            case 'water': this.activateWater(playerX, playerY); break;
            case 'fire': this.activateFire(playerX, playerY); break;
        }

        slot.cooldownUntil = this.scene.time.now + this.getCooldown(slot.id);
    }

    // ── Tierra ────────────────────────────────────────────────

    private activateEarth(x: number, y: number, facingRight: boolean): void {
        const cfg = GAME_CONFIG.ELEMENTS.EARTH;
        const dir = facingRight ? 1 : -1;

        // Animación de invocación (roca que crece)
        this.spawnEarthRockEffect(x, y, dir);

        this.callbacks.onEarthProjectile({
            type: 'earth',
            x: x + dir * 30,
            y: y - 10,
            velX: cfg.SPEED * dir,
            velY: -80,            // leve arco hacia arriba
            damage: cfg.DAMAGE,
            knockbackX: cfg.KNOCKBACK_X * dir,
            knockbackY: cfg.KNOCKBACK_Y,
            gravity: cfg.GRAVITY,
            maxRange: cfg.RANGE,
            startX: x,
        });
    }

    private spawnEarthRockEffect(x: number, y: number, dir: number): void {
        // Fragmentos de tierra alrededor del jugador al invocar
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const r = Phaser.Math.Between(10, 28);
            const frag = this.scene.add.rectangle(
                x + Math.cos(angle) * r,
                y + Math.sin(angle) * r,
                Phaser.Math.Between(5, 10),
                Phaser.Math.Between(5, 10),
                0x8B6914, 1
            );
            this.scene.tweens.add({
                targets: frag,
                x: frag.x + dir * Phaser.Math.Between(20, 50),
                y: frag.y - Phaser.Math.Between(10, 30),
                alpha: 0,
                duration: 350,
                onComplete: () => frag.destroy()
            });
        }
    }

    // ── Agua ──────────────────────────────────────────────────

    private activateWater(x: number, y: number): void {
        if (this.waterShieldActive) return; // ya activo

        const cfg = GAME_CONFIG.ELEMENTS.WATER;
        this.waterShieldActive = true;
        this.waterDamageAbsorbed = false;
        this.waterHealAccum = 0;
        this.waterHealedTotal = 0;
        this.waterShieldUntil = this.scene.time.now + cfg.SHIELD_DURATION;

        // Visual del escudo
        this.waterShieldVisual = this.scene.add.circle(x, y, 36, 0x44aaff, 0.3);
        this.waterShieldVisual.setDepth(50);
        this.waterShieldVisual.setStrokeStyle(2, 0x88ccff, 0.8);

        // Pulso de activación
        this.scene.tweens.add({
            targets: this.waterShieldVisual,
            scaleX: { from: 0.3, to: 1 },
            scaleY: { from: 0.3, to: 1 },
            alpha: { from: 0.6, to: 0.3 },
            duration: 300,
            ease: 'Back.Out'
        });

        // Aro de activación
        const ring = this.scene.add.circle(x, y, 36, 0x44aaff, 0);
        ring.setStrokeStyle(3, 0x88ccff, 1);
        this.scene.tweens.add({
            targets: ring,
            scaleX: { from: 1, to: 2.5 },
            scaleY: { from: 1, to: 2.5 },
            alpha: { from: 1, to: 0 },
            duration: 500,
            onComplete: () => ring.destroy()
        });

        this.callbacks.onWaterShield(true);
    }

    // ── Fuego ─────────────────────────────────────────────────

    private activateFire(x: number, y: number): void {
        this.spawnFireExplosion(x, y);
        this.callbacks.onFireExplosion(x, y);
    }

    private spawnFireExplosion(cx: number, cy: number): void {
        const cfg = GAME_CONFIG.ELEMENTS.FIRE;

        // Onda de fuego expansiva
        const ring = this.scene.add.circle(cx, cy, 10, 0xff6600, 0.7);
        ring.setDepth(20);
        this.scene.tweens.add({
            targets: ring,
            scaleX: { from: 0.5, to: cfg.RADIUS / 10 },
            scaleY: { from: 0.5, to: cfg.RADIUS / 10 },
            alpha: { from: 0.8, to: 0 },
            duration: 450,
            ease: 'Power2',
            onComplete: () => ring.destroy()
        });

        // Partículas de fuego
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * cfg.RADIUS;
            const ember = this.scene.add.circle(
                cx + Math.cos(angle) * dist * 0.4,
                cy + Math.sin(angle) * dist * 0.4,
                Phaser.Math.Between(4, 12),
                Phaser.Math.Between(0xff3300, 0xffaa00), 0.9
            );
            this.scene.tweens.add({
                targets: ember,
                x: cx + Math.cos(angle) * dist,
                y: cy + Math.sin(angle) * dist - 30,
                alpha: 0,
                duration: Phaser.Math.Between(400, 800),
                ease: 'Power1',
                onComplete: () => ember.destroy()
            });
        }

        // Flash central
        const flash = this.scene.add.circle(cx, cy, 20, 0xffffff, 0.9);
        this.scene.tweens.add({
            targets: flash,
            alpha: 0,
            scaleX: 2,
            scaleY: 2,
            duration: 200,
            onComplete: () => flash.destroy()
        });
    }

    // ── Update (tick del sistema elemental) ───────────────────

    update(
        playerX: number, playerY: number,
        _time: number, delta: number
    ): void {
        this.updateWaterShield(playerX, playerY, delta);
        this.updateBurnTimers();
    }

    private updateWaterShield(px: number, py: number, delta: number): void {
        if (!this.waterShieldActive) return;

        const now = this.scene.time.now;

        // Mover el escudo con el jugador
        if (this.waterShieldVisual) {
            this.waterShieldVisual.x = px;
            this.waterShieldVisual.y = py;
        }

        // Curar gradualmente
        const cfg = GAME_CONFIG.ELEMENTS.WATER;
        const healPerMs = cfg.HEAL_PER_SECOND / 1000;
        this.waterHealAccum += healPerMs * delta;

        // Comprobar expiración (por tiempo o escudo ya absorbió golpe)
        const expired = now >= this.waterShieldUntil || this.waterDamageAbsorbed;
        if (expired) {
            this.deactivateWaterShield();
        }
    }

    /** Intenta absorber un impacto enemigo con el escudo de agua */
    tryAbsorbHit(): boolean {
        if (!this.waterShieldActive || this.waterDamageAbsorbed) return false;
        this.waterDamageAbsorbed = true;

        // Flash de absorción
        if (this.waterShieldVisual) {
            this.scene.tweens.add({
                targets: this.waterShieldVisual,
                alpha: { from: 0.9, to: 0 },
                scaleX: { from: 1.5, to: 2 },
                scaleY: { from: 1.5, to: 2 },
                duration: 400,
                onComplete: () => this.deactivateWaterShield()
            });
        }

        return true; // daño absorbido
    }

    /** Curación acumulada (se llama desde fuera para aplicar al jugador) */
    drainHealAccum(): number {
        // Tope de curación total por escudo (MAX_HEAL)
        const room   = Math.max(0, GAME_CONFIG.ELEMENTS.WATER.MAX_HEAL - this.waterHealedTotal);
        const amount = Math.min(Math.floor(this.waterHealAccum), room);
        this.waterHealedTotal += amount;
        this.waterHealAccum -= amount;
        return amount;
    }

    get isWaterShieldActive(): boolean { return this.waterShieldActive; }

    private deactivateWaterShield(): void {
        this.waterShieldActive = false;
        this.waterDamageAbsorbed = false;
        this.waterHealAccum = 0;
        this.callbacks.onWaterShield(false);

        if (this.waterShieldVisual) {
            this.scene.tweens.add({
                targets: this.waterShieldVisual,
                alpha: 0,
                duration: 300,
                onComplete: () => {
                    this.waterShieldVisual?.destroy();
                    this.waterShieldVisual = null;
                }
            });
        }
    }

    // ── Burn (efecto de quemadura) ────────────────────────────

    applyBurn(target: Phaser.Physics.Arcade.Sprite): void {
        const key = Math.round(target.x * 100 + target.y);
        this.burnTargets.set(key, this.scene.time.now + GAME_CONFIG.ELEMENTS.FIRE.BURN_DURATION);

        // Efecto visual de fuego sobre el enemigo
        this.scene.time.addEvent({
            delay: 600,
            repeat: Math.ceil(GAME_CONFIG.ELEMENTS.FIRE.BURN_DURATION / 600) - 1,
            callback: () => {
                if (!target.active) return;
                const flame = this.scene.add.circle(
                    target.x + Phaser.Math.Between(-10, 10),
                    target.y - 10,
                    Phaser.Math.Between(4, 8),
                    0xff4400, 0.85
                );
                this.scene.tweens.add({
                    targets: flame,
                    y: flame.y - 25,
                    alpha: 0,
                    duration: 500,
                    onComplete: () => flame.destroy()
                });
            }
        });
    }

    /** Devuelve si un sprite está actualmente quemado (para aplicar daño tick) */
    isBurning(_target: Phaser.Physics.Arcade.Sprite): boolean {
        const key = Math.round(_target.x * 100 + _target.y);
        const until = this.burnTargets.get(key);
        return until !== undefined && this.scene.time.now < until;
    }

    private updateBurnTimers(): void {
        const now = this.scene.time.now;
        this.burnTargets.forEach((until, key) => {
            if (now >= until) this.burnTargets.delete(key);
        });
    }

    // ── Selector rápido (datos para la UI) ───────────────────

    getAllElements(): ElementId[] { return this.ALL_ELEMENTS; }

    destroy(): void {
        this.waterShieldVisual?.destroy();
    }
}
