// ============================================================
//  GameConfig.ts  –  Valores de balance centralizados
//  Cambia aquí sin tocar la lógica de juego.
// ============================================================

export const GAME_CONFIG = {

    // ── Pantalla ──────────────────────────────────────────────
    WIDTH:  1024,
    HEIGHT: 768,

    // ── Jugador ───────────────────────────────────────────────
    PLAYER: {
        MAX_HEALTH:        100,
        WALK_SPEED:        200,
        RUN_SPEED:         340,
        JUMP_VELOCITY:    -520,
        GRAVITY:           900,

        // Invulnerabilidad tras recibir daño (ms)
        INVUL_DURATION:    800,

        // Coyote time (ms que puede saltar tras caer del borde)
        COYOTE_TIME:        80,
        // Jump buffer (ms de tolerancia para presionar salto anticipado)
        JUMP_BUFFER:        80,
    },

    // ── Espada eléctrica ──────────────────────────────────────
    ELECTRIC_SWORD: {
        // Ataque ligero (J) – cuerpo a cuerpo
        LIGHT_DAMAGE:       12,
        LIGHT_COOLDOWN:    280,   // ms entre ataques ligeros
        LIGHT_DURATION:    150,   // ms que el hitbox permanece activo

        // Descarga eléctrica (mantener J > CHARGE_TIME ms)
        CHARGE_TIME:       700,   // ms necesarios para cargar
        CHARGE_DAMAGE:      38,
        CHARGE_STUN_DURATION: 600, // ms que el enemigo queda aturdido
        CHARGE_RADIUS:      80,    // radio del arco eléctrico

        KNOCKBACK_X:       180,
        KNOCKBACK_Y:       -80,
    },

    // ── Espada de sangre ──────────────────────────────────────
    BLOOD_SWORD: {
        // Ataque ligero (junto con eléctrica, tecla J)
        LIGHT_DAMAGE:       10,
        LIGHT_COOLDOWN:    280,

        // Ataque fuerte (K) – onda de sangre
        HEAVY_DAMAGE:       22,
        HEAVY_COOLDOWN:    600,   // ms
        HEAVY_DURATION:    200,   // ms que el hitbox de onda existe
        WAVE_SPEED:        380,   // px/s de la onda
        WAVE_RANGE:        260,   // px máximos que recorre

        KNOCKBACK_X:       220,
        KNOCKBACK_Y:      -100,
    },

    // ── Sistema elemental ─────────────────────────────────────
    ELEMENTS: {
        // Tierra
        EARTH: {
            COOLDOWN:      4000,
            DAMAGE:          35,
            SPEED:          480,
            GRAVITY:        300,
            RANGE:          500,
            KNOCKBACK_X:    260,
            KNOCKBACK_Y:   -160,
        },
        // Aire (pasivo – se controla en Player)
        AIR: {
            DOUBLE_JUMP_VELOCITY:  -420,
            GLIDE_GRAVITY:          80,   // gravedad reducida al planear
            GLIDE_MAX_DURATION:   1800,   // ms máx de planeo por salto
        },
        // Agua
        WATER: {
            COOLDOWN:            8000,
            SHIELD_DURATION:     3500,
            HEAL_PER_SECOND:        8,
            MAX_HEAL:              25,
        },
        // Fuego
        FIRE: {
            COOLDOWN:            5000,
            DAMAGE:               28,
            RADIUS:              120,
            BURN_DAMAGE_PER_SEC:   6,
            BURN_DURATION:       2500,
        },
    },

    // ── Enemigos ──────────────────────────────────────────────
    ENEMIES: {
        SOLDIER: {
            MAX_HEALTH:        60,
            SPEED:            110,
            DAMAGE:            12,
            ATTACK_RANGE:      50,
            DETECT_RANGE:     320,
            // ── Fase 3: combate del enemigo básico ──
            SIZE:              34,    // lado del cuadrado (px)
            COLOR:       0xff5500,    // naranja intenso, contrasta con el fondo
            WINDUP:           450,    // ms de aviso antes de golpear (amarillo + "!")
            ATTACK_ACTIVE:    140,    // ms que el golpe es peligroso
            RECOVER:          700,    // ms de recuperación (vulnerable)
            LUNGE:            170,    // impulso hacia delante al golpear
            HIT_STUN:         200,    // ms sin IA tras recibir un golpe (deja actuar al knockback)
            INTERRUPT_STUN:   450,    // ms aturdido si un golpe interrumpe su ataque
            PLAYER_KNOCKBACK_X: 300,  // empuje al jugador
            PLAYER_KNOCKBACK_Y: -220,
            VULNERABLE_MULT:  1.3,    // multiplicador de daño recibido en recuperación/aturdido
            ATTACK_COOLDOWN: 1200,
            KNOCKBACK_RESIST:   0,
        },
        SHOOTER: {
            MAX_HEALTH:        40,
            SPEED:             70,
            DAMAGE:            10,
            FIRE_RANGE:       380,
            DETECT_RANGE:     420,
            ATTACK_COOLDOWN: 2200,
            BULLET_SPEED:    380,
            FLEE_RANGE:       140,
        },
        HEAVY: {
            MAX_HEALTH:       180,
            SPEED:             55,
            DAMAGE:            28,
            ATTACK_RANGE:      70,
            DETECT_RANGE:     260,
            ATTACK_COOLDOWN: 2400,
            KNOCKBACK_RESIST: 0.6,  // reduce knockback recibido
        },
    },

} as const;
