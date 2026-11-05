// ============================================================
//  Preloader.ts  –  Carga de assets mínima (Fase 1)
//  No depende de imágenes externas. Todo se dibuja programáticamente.
// ============================================================

import { Scene } from 'phaser';

export class Preloader extends Scene {

    constructor() {
        super('Preloader');
    }

    init(): void {
        const W = this.scale.width;
        const H = this.scale.height;

        // Fondo oscuro
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x04040f, 0x04040f, 0x0a0520, 0x0a0520, 1);
        bg.fillRect(0, 0, W, H);

        // Título
        this.add.text(W / 2, H / 2 - 80, 'BEDER', {
            fontSize: '48px',
            color: '#9944ff',
            fontFamily: 'Georgia, serif',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5);

        // Barra de carga
        const barW = 400;
        const barX = W / 2 - barW / 2;
        const barY = H / 2;

        this.add.graphics()
            .lineStyle(1, 0x442266, 1)
            .strokeRect(barX - 1, barY - 1, barW + 2, 22);

        const bar = this.add.rectangle(barX, barY, 0, 20, 0x7722cc).setOrigin(0, 0);

        // Texto de carga
        const loadText = this.add.text(W / 2, barY + 36, 'Cargando...', {
            fontSize: '14px', color: '#7755aa', fontFamily: 'monospace'
        }).setOrigin(0.5);

        this.load.on('progress', (progress: number) => {
            bar.width = barW * progress;
            loadText.setText(`Cargando... ${Math.round(progress * 100)}%`);
        });
    }

    preload(): void {
        // Fase 1: No hay assets de imagen externos.
        // Todo se genera proceduralmente con Graphics de Phaser.
        // En fases posteriores se cargarán spritesheets y audio aquí.

        // Simulamos una pequeña carga para que la barra se vea
        this.load.setPath('assets');
        // Si tienes assets, cárgalos aquí. Por ahora nada.
    }

    create(): void {
        this.scene.start('MainMenu');
    }
}
