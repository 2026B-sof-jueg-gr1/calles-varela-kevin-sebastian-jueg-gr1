// ============================================================
//  ElementSelector.ts  –  Selector rápido de elementos (tecla F)
//  Muestra los 4 elementos y permite cambiar la combinación
//  sin pausar el juego.
//
//  · Pestañas "SLOT 1 / SLOT 2" (clic, o teclas 1 / 2 / Q):
//    eligen qué slot se va a modificar.
//  · Clic en un elemento: se equipa en ese slot y el menú se cierra.
//  · F (o ESC / clic fuera del panel): cierra el menú.
//
//  Todos los objetos creados se guardan en `items` y se destruyen
//  uno a uno al cerrar, así nunca quedan capas oscuras huérfanas.
// ============================================================

import Phaser from 'phaser';
import { ElementSystem, ElementId } from '../elements/ElementSystem';

interface ElementVisual {
    id:      ElementId;
    color:   number;
    icon:    string;
    label:   string;
}

const ELEMENT_VISUALS: Record<ElementId, ElementVisual> = {
    earth: { id: 'earth', color: 0x8B6914, icon: '⛰',  label: 'TIERRA' },
    air:   { id: 'air',   color: 0xaaddff, icon: '💨',  label: 'AIRE'   },
    water: { id: 'water', color: 0x2277cc, icon: '💧',  label: 'AGUA'   },
    fire:  { id: 'fire',  color: 0xff4400, icon: '🔥',  label: 'FUEGO'  },
    none:  { id: 'none',  color: 0x333333, icon: '—',   label: '—'      },
};

const DEPTH = 300; // por encima del HUD (100) y de la pausa (200)

export class ElementSelector {
    private scene:   Phaser.Scene;
    private system:  ElementSystem;
    private visible  = false;

    /** Todos los objetos del menú actualmente en pantalla */
    private items: Phaser.GameObjects.GameObject[] = [];

    /** Slot que se está editando (sigue al slot activo del ElementSystem) */
    private editingSlot: 0 | 1 = 0;

    constructor(scene: Phaser.Scene, system: ElementSystem) {
        this.scene  = scene;
        this.system = system;
    }

    get isOpen(): boolean { return this.visible; }

    toggle(editSlot?: 0 | 1): void {
        if (this.visible) this.close();
        else this.open(editSlot ?? this.system.activeIndex);
    }

    open(editSlot: 0 | 1): void {
        if (this.visible) return;
        this.visible = true;
        this.editingSlot = editSlot;
        this.system.selectSlot(editSlot);
        this.rebuild();
    }

    close(): void {
        this.visible = false;
        this.clear();
    }

    /**
     * Llamar cada frame desde la escena. Si el jugador cambia de slot con
     * 1 / 2 / Q mientras el menú está abierto, el menú se actualiza.
     */
    update(): void {
        if (!this.visible) return;
        if (this.system.activeIndex !== this.editingSlot) {
            this.editingSlot = this.system.activeIndex;
            this.rebuild();
        }
    }

    // ── Construcción ──────────────────────────────────────────

    private clear(): void {
        this.items.forEach(o => o.destroy());
        this.items = [];
    }

    /** Destruye lo anterior y vuelve a dibujar (nunca se apilan capas) */
    private rebuild(): void {
        this.clear();
        if (!this.visible) return;

        const s  = this.scene;
        const W  = s.scale.width;
        const H  = s.scale.height;
        const cx = W / 2;
        const cy = H / 2;

        const elements = this.system.getAllElements();
        const cols = 2;
        const cardW = 140, cardH = 90, gap = 16;
        const rows = Math.ceil(elements.length / cols);
        const totalW = cols * cardW + (cols - 1) * gap;
        const totalH = rows * cardH + (rows - 1) * gap;

        const panelW = totalW + 60;
        const panelH = totalH + 150;
        const top    = cy - panelH / 2;

        const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
            (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
            this.items.push(o);
            return o;
        };

        // Fondo: clic fuera del panel cierra
        const overlay = add(s.add.rectangle(cx, cy, W, H, 0x000000, 0.55).setDepth(DEPTH));
        overlay.setInteractive();
        overlay.on('pointerdown', () => this.close());

        // Panel (interactivo para que el clic no atraviese hacia el fondo)
        const panel = add(s.add.rectangle(cx, cy, panelW, panelH, 0x0d0d22, 0.97)
            .setStrokeStyle(1, 0x5533aa).setDepth(DEPTH + 1));
        panel.setInteractive();

        add(s.add.text(cx, top + 22, 'CAMBIAR ELEMENTOS', {
            fontSize: '16px', color: '#cc99ff', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(DEPTH + 2));

        // ── Pestañas de slot ──────────────────────────────────
        const tabY = top + 56;
        ([0, 1] as const).forEach(si => {
            const sx     = cx - 62 + si * 124;
            const slot   = si === 0 ? this.system.slot0 : this.system.slot1;
            const vis    = ELEMENT_VISUALS[slot.id];
            const active = si === this.editingSlot;

            const tab = add(s.add.rectangle(sx, tabY, 116, 36, active ? 0x3311aa : 0x1a1a33)
                .setStrokeStyle(active ? 2 : 1, active ? 0xaa88ff : 0x444466)
                .setDepth(DEPTH + 2));

            add(s.add.text(sx, tabY - 8, `SLOT ${si + 1}`, {
                fontSize: '10px', color: active ? '#ddccff' : '#666688', fontFamily: 'monospace',
            }).setOrigin(0.5).setDepth(DEPTH + 3));

            add(s.add.text(sx, tabY + 8, `${vis.icon} ${vis.label}`, {
                fontSize: '12px', color: active ? '#ffffff' : '#888899', fontFamily: 'monospace',
            }).setOrigin(0.5).setDepth(DEPTH + 3));

            tab.setInteractive({ useHandCursor: true });
            tab.on('pointerdown', () => {
                this.editingSlot = si;
                this.system.selectSlot(si);
                this.rebuild();
            });
        });

        // ── Tarjetas de elementos ─────────────────────────────
        const startX = cx - totalW / 2 + cardW / 2;
        const startY = tabY + 40 + cardH / 2;
        const editingId = this.editingSlot === 0 ? this.system.slot0.id : this.system.slot1.id;
        const otherId   = this.editingSlot === 0 ? this.system.slot1.id : this.system.slot0.id;

        elements.forEach((eid, idx) => {
            const ex = startX + (idx % cols) * (cardW + gap);
            const ey = startY + Math.floor(idx / cols) * (cardH + gap);

            const vis      = ELEMENT_VISUALS[eid];
            const inThis   = eid === editingId;
            const inOther  = eid === otherId;
            const baseFill = inThis ? vis.color : 0x1a1230;
            const baseA    = inThis ? 0.8 : 0.6;

            const card = add(s.add.rectangle(ex, ey, cardW, cardH, baseFill, baseA)
                .setStrokeStyle(2, inThis || inOther ? vis.color : 0x444455)
                .setDepth(DEPTH + 2));

            add(s.add.text(ex, ey - 16, vis.icon, { fontSize: '28px' })
                .setOrigin(0.5).setDepth(DEPTH + 3));

            add(s.add.text(ex, ey + 16, vis.label, {
                fontSize: '13px', color: inThis ? '#ffffff' : '#aaaacc', fontFamily: 'monospace',
            }).setOrigin(0.5).setDepth(DEPTH + 3));

            const hint = inThis ? '✓ En este slot' : inOther ? '⇄ Intercambiar' : '';
            add(s.add.text(ex, ey + 33, hint, {
                fontSize: '10px', color: inThis ? '#aaff88' : '#ffcc66', fontFamily: 'monospace',
            }).setOrigin(0.5).setDepth(DEPTH + 3));

            card.setInteractive({ useHandCursor: true });
            card.on('pointerover', () => card.setFillStyle(vis.color, 0.9));
            card.on('pointerout',  () => card.setFillStyle(baseFill, baseA));
            card.on('pointerdown', () => this.selectElement(eid));
        });

        add(s.add.text(cx, top + panelH - 18,
            'Clic: equipar   1/2: elegir slot   F: cerrar', {
                fontSize: '11px', color: '#666688', fontFamily: 'monospace',
            }).setOrigin(0.5).setDepth(DEPTH + 2));
    }

    private selectElement(id: ElementId): void {
        this.system.equipElement(id, this.editingSlot);
        this.close();
    }

    destroy(): void {
        this.close();
    }
}
