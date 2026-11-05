// ============================================================
//  MainMenu.ts  –  Menú principal con estética oscura gótica
// ============================================================

import { Scene } from 'phaser';

export class MainMenu extends Scene {

    constructor() {
        super('MainMenu');
    }

    create(): void {
        const W = this.scale.width;
        const H = this.scale.height;

        // ── Fondo oscuro con gradiente ────────────────────────
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x04040f, 0x04040f, 0x0a0520, 0x0a0520, 1);
        bg.fillRect(0, 0, W, H);

        // ── Luna ─────────────────────────────────────────────
        const moon = this.add.graphics();
        moon.fillStyle(0xc8bfb0, 0.12);
        moon.fillCircle(W - 150, 120, 80);
        moon.fillStyle(0xffffff, 0.06);
        moon.fillCircle(W - 150, 120, 90);

        // ── Silueta de ciudad en ruinas ───────────────────────
        const ruins = this.add.graphics();
        ruins.fillStyle(0x080818, 1);
        const buildings = [
            [0, 280, 80, 488], [80, 360, 60, 408], [140, 300, 90, 468],
            [230, 400, 50, 368], [280, 320, 70, 448], [350, 440, 40, 328],
            [390, 350, 80, 418], [470, 420, 60, 348], [530, 380, 50, 388],
            [580, 440, 90, 328], [670, 360, 70, 408], [740, 420, 60, 348],
            [800, 340, 80, 428], [880, 400, 50, 368], [930, 360, 94, 408],
        ];
        buildings.forEach(([x, y, w, h]) => ruins.fillRect(x, y, w, h));

        // Columnas decorativas
        ruins.fillStyle(0x0c0c1c, 1);
        [100, 300, 500, 700, 900].forEach(cx => {
            ruins.fillRect(cx, 460, 16, 308);
            ruins.fillRect(cx - 6, 456, 28, 10);
        });

        // ── Título ────────────────────────────────────────────
        const title = this.add.text(W / 2, 180, 'BEDER', {
            fontSize: '88px',
            color: '#cc88ff',
            fontFamily: 'Georgia, serif',
            stroke: '#000000',
            strokeThickness: 10,
            shadow: {
                offsetX: 0, offsetY: 0,
                color: '#9933ff',
                blur: 30,
                fill: true,
            }
        }).setOrigin(0.5);

        // Subtítulo
        this.add.text(W / 2, 276, 'FILO Y ELEMENTO', {
            fontSize: '22px',
            color: '#8866aa',
            fontFamily: 'Georgia, serif',
            letterSpacing: 8,
        }).setOrigin(0.5);

        // ── Separador decorativo ──────────────────────────────
        const sep = this.add.graphics();
        sep.lineStyle(1, 0x6633aa, 0.6);
        sep.strokeRect(W / 2 - 200, 300, 400, 1);
        sep.fillStyle(0x9933ff, 0.8);
        sep.fillCircle(W / 2, 300, 4);
        sep.fillCircle(W / 2 - 200, 300, 3);
        sep.fillCircle(W / 2 + 200, 300, 3);

        // ── Botón de inicio ───────────────────────────────────
        const btnBg = this.add.rectangle(W / 2, 400, 260, 52, 0x2a1450);
        btnBg.setStrokeStyle(1, 0x9966ff);

        const btnText = this.add.text(W / 2, 400, '▶  COMENZAR', {
            fontSize: '22px',
            color: '#ddaaff',
            fontFamily: 'Georgia, serif',
        }).setOrigin(0.5);

        // Hover effect
        btnBg.setInteractive({ useHandCursor: true });
        btnBg.on('pointerover', () => {
            btnBg.setFillStyle(0x3d1e6e);
            btnText.setColor('#ffffff');
        });
        btnBg.on('pointerout', () => {
            btnBg.setFillStyle(0x2a1450);
            btnText.setColor('#ddaaff');
        });
        btnBg.on('pointerdown', () => this.startGame());

        // También con tecla Enter o Space
        this.input.keyboard!.once('keydown-ENTER', () => this.startGame());
        this.input.keyboard!.once('keydown-SPACE', () => this.startGame());

        // ── Controles hint ────────────────────────────────────
        this.add.text(W / 2, 480, 'A/D: Mover   SPACE: Saltar   J: Atacar   K: Onda de Sangre', {
            fontSize: '13px',
            color: '#6655aa',
            fontFamily: 'monospace',
        }).setOrigin(0.5);

        this.add.text(W / 2, 504, 'E: Habilidad elemental   F: Cambiar elementos   ESC: Pausa', {
            fontSize: '13px',
            color: '#6655aa',
            fontFamily: 'monospace',
        }).setOrigin(0.5);

        // ── Versión ───────────────────────────────────────────
        this.add.text(W - 14, H - 14, 'Fase 1 – Prototipo', {
            fontSize: '11px', color: '#443366', fontFamily: 'monospace'
        }).setOrigin(1, 1);

        // ── Animación pulsante del título ─────────────────────
        this.tweens.add({
            targets: title,
            scaleX: { from: 1, to: 1.02 },
            scaleY: { from: 1, to: 1.02 },
            duration: 2200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
        });
    }

    private startGame(): void {
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('GameScene');
        });
    }
}
