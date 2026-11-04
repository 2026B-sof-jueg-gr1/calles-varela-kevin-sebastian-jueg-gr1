// ============================================================
//  CombatFX.ts  –  Efectos visuales reutilizables de combate
//  Números de daño flotantes y chispas de impacto.
// ============================================================

import * as Phaser from 'phaser';

/** Número flotante de daño/curación */
export function spawnDamageText(
    scene: Phaser.Scene,
    x: number, y: number,
    text: string,
    color = '#ffffff',
    size = 18
): void {
    const t = scene.add.text(x, y, text, {
        fontSize: `${size}px`,
        color,
        fontFamily: 'monospace',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
    }).setOrigin(0.5).setDepth(120);

    scene.tweens.add({
        targets: t,
        y: y - 44,
        x: x + Phaser.Math.Between(-14, 14),
        alpha: 0,
        duration: 750,
        ease: 'Cubic.Out',
        onComplete: () => t.destroy(),
    });
}

/** Chispas radiales al impactar */
export function spawnHitSparks(
    scene: Phaser.Scene,
    x: number, y: number,
    color: number,
    count = 8
): void {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Phaser.Math.Between(18, 46);
        const spark = scene.add.rectangle(
            x, y,
            Phaser.Math.Between(3, 8), Phaser.Math.Between(3, 8),
            color, 1
        ).setDepth(110);

        scene.tweens.add({
            targets: spark,
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            alpha: 0,
            duration: Phaser.Math.Between(180, 340),
            ease: 'Power2',
            onComplete: () => spark.destroy(),
        });
    }
}

