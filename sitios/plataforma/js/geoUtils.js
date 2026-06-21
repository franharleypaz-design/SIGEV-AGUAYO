// ==============================================================================
// SIGEV-AGUAYO - MOTOR GEOMÉTRICO CENTRALIZADO DE DETECCIÓN TERRITORIAL
// ==============================================================================

export function autoDetectarSector(lat, lng) {
    // Definición exacta basada en tus 12 puntos de intersección reales (P1 a P12)
    const poligonos = [
        { 
            id: "Sector Territorial 1", // Morado (Noreste)
            coords: [
                [-33.514685, -70.658115], // P5: Lo Ovalle × Gran Avenida
                [-33.517251, -70.644833], // P1: Lo Ovalle × San Francisco
                [-33.528565, -70.647510], // P2: El Parrón × San Francisco
                [-33.526514, -70.661431]  // P6: El Parrón × Gran Avenida
            ] 
        },
        { 
            id: "Sector Territorial 2", // Amarillo (Centro-Este)
            coords: [
                [-33.526514, -70.661431], // P6: El Parrón × Gran Avenida
                [-33.528565, -70.647510], // P2: El Parrón × San Francisco
                [-33.539865, -70.651231], // P3: Américo Vespucio Sur × San Francisco
                [-33.537272, -70.664437]  // P7: Américo Vespucio Sur × Gran Avenida
            ] 
        },
        { 
            id: "Sector Territorial 3", // Celeste (Sureste)
            coords: [
                [-33.537272, -70.664437], // P7: Américo Vespucio Sur × Gran Avenida
                [-33.539865, -70.651231], // P3: Américo Vespucio Sur × San Francisco
                [-33.548759, -70.652888], // P4: Lo Espejo × San Francisco
                [-33.545409, -70.668255], // P8: Lo Espejo × Gran Avenida
                [-33.543457, -70.666568]  // Punto de quiebre Gran Avenida antes de Lo Espejo
            ] 
        },
        { 
            id: "Sector Territorial 4", // Azul (Noroeste)
            coords: [
                [-33.510680, -70.671022], // P9: Lo Ovalle × Autopista Central
                [-33.514685, -70.658115], // P5: Lo Ovalle × Gran Avenida
                [-33.526514, -70.661431], // P6: El Parrón × Gran Avenida
                [-33.521247, -70.676092]  // P10: El Parrón × Autopista Central
            ] 
        },
        { 
            id: "Sector Territorial 5", // Verde (Centro-Oeste)
            coords: [
                [-33.521247, -70.676092], // P10: El Parrón × Autopista Central
                [-33.526514, -70.661431], // P6: El Parrón × Gran Avenida
                [-33.537272, -70.664437], // P7: Américo Vespucio Sur × Gran Avenida
                [-33.531880, -70.681551]  // P11: Américo Vespucio Sur × Autopista Central
            ] 
        },
        { 
            id: "Sector Territorial 6", // Rojo (Suroeste)
            coords: [
                [-33.531880, -70.681551], // P11: Américo Vespucio Sur × Autopista Central
                [-33.537272, -70.664437], // P7: Américo Vespucio Sur × Gran Avenida
                [-33.543457, -70.666568], // Punto de quiebre Gran Avenida
                [-33.545409, -70.668255], // P8: Lo Espejo × Gran Avenida
                [-33.539123, -70.685379]  // P12: Lo Espejo × Autopista Central
            ] 
        }
    ];

    let x = Number(lat), y = Number(lng);
    for (let p of poligonos) {
        let inside = false;
        for (let i = 0, j = p.coords.length - 1; i < p.coords.length; j = i++) {
            let xi = p.coords[i][0], yi = p.coords[i][1];
            let xj = p.coords[j][0], yj = p.coords[j][1];
            let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        if (inside) return p.id;
    }
    return "Sin Información";
}