// ==============================================================================
// SIGEV-AGUAYO - DICCIONARIOS MAESTROS MUNICIPALES Y ESTRUCTURA TERRITORIAL
// ==============================================================================

// ------------------------------------------------------------------------------
// 1. MAPEO DE CATEGORÍAS MUNICIPALES, SUBCATEGORÍAS Y OFICINAS DE DERIVACIÓN
// ------------------------------------------------------------------------------
// NOTA PARA FUTURAS ACTUALIZACIONES: 
// Para agregar una categoría, use la estructura -> "NOMBRE": { oficina: "X", subcategorias: ["Y"] }
export const MAPEO_MUNICIPAL = {
    "AYUDA SOCIAL": {
        oficina: "DIDESO",
        subcategorias: ["Giftcard", "Apoyo económico", "Medicamentos", "Pago cuentas básicas", "Subsidios Económicos"]
    },
    "ALUMBRADO": {
        oficina: "OBRAS",
        subcategorias: ["Robo de Cable", "Solicitud Punto Lumínico", "Solicitud de Despeje Cono Lumínico", "Mantención de Luminarias"]
    },
    "ASEO Y BASURA": {
        oficina: "DIMAO",
        subcategorias: ["Solicitud Fumigación", "Basura acumulada", "Microbasural", "Retiro escombros"]
    },
    "AREAS VERDES": {
        oficina: "DIMAO",
        subcategorias: ["Reparación/Traslado de Juegos Dañados", "Poda árboles", "Árbol peligroso", "Mantención plaza"]
    },
    "SEGURIDAD": {
        oficina: "SEGURIDAD MUNICIPAL",
        subcategorias: ["Ruidos molestos", "Consumo drogas", "Peleas", "Vehículos abandonados", "Patrullaje", "Cámaras seguridad", "Alarmas comunitarias"]
    },
    "MASCOTAS": {
        oficina: "DIMAO",
        subcategorias: ["Esterilización", "Vacunación", "Operativo veterinario"]
    },
    "TRÁNSITO Y ESTRUCTURA VIAL": {
        oficina: "TRÁNSITO",
        subcategorias: ["Señalética y Demarcación Vial", "Alumbrado Paradero", "Baches", "Veredas rotas", "Semáforos", "Accesibilidad"]
    },
    "TRAMITES MUNICIPALES SIN DERIVACION": {
        oficina: "OFICINA DEL CONCEJAL",
        subcategorias: ["Orientación municipal", "Certificados", "Permisos", "Patentes", "Derivaciones"]
    },
    "OPERATIVO TERRITORIAL": {
        oficina: "OPERATIVOS",
        subcategorias: ["Oftalmológico", "Salud", "Podología"]
    }
};

// ------------------------------------------------------------------------------
// 2. MATRIZ TERRITORIAL DE UNIDADES VECINALES Y ASOCIACIÓN DE JUNTAS DE VECINOS
// ------------------------------------------------------------------------------
// NOTA PARA FUTURAS ACTUALIZACIONES:
// Asegúrese de que las sub-UV agregadas existan como llaves dentro del objeto 'juntas'.
export const MAPEO_TERRITORIAL = {
    "Sector Territorial 1": {
        uvs: ["1-A", "1-B", "1-C", "No Sabe / Sin Información"],
        juntas: {
            "1-A": ["Lo Ovalle"],
            "1-B": ["Sin Información / No Sabe"],
            "1-C": ["Sin Información / No Sabe"],
            "No Sabe / Sin Información": ["Los Troncos", "Renacimiento", "La Blanca", "Sin Información / No Sabe"]
        }
    },
    "Sector Territorial 2": {
        uvs: ["2", "3-A", "3-B", "No Sabe / Sin Información"],
        juntas: {
            "2": ["Miguel de Cervantes", "Concepción Rioja", "Los Arcos"],
            "3-A": ["Don Bosco"],
            "3-B": ["Otto Wildner"],
            "No Sabe / Sin Información": ["Sin Información / No Sabe"]
        }
    },
    "Sector Territorial 3": {
        uvs: ["4", "5", "No Sabe / Sin Información"],
        juntas: {
            "4": ["5 de Abril"],
            "5": ["Sin Información / No Sabe"],
            "No Sabe / Sin Información": ["Sin Información / No Sabe"]
        }
    },
    "Sector Territorial 4": {
        uvs: ["14", "15", "15-A", "No Sabe / Sin Información"],
        juntas: {
            "14": ["Villa Ángel Burgueño", "Cisterna Oriente"],
            "15": ["Sin Información / No Sabe"],
            "15-A": ["Sin Información / No Sabe"],
            "No Sabe / Sin Información": ["Sin Información / No Sabe"]
        }
    },
    "Sector Territorial 5": {
        uvs: ["16", "17", "No Sabe / Sin Información"],
        juntas: {
            "16": ["Augusto Biaut", "Jardín Japonés", "Amanecer"],
            "17": ["Sin Información / No Sabe"],
            "No Sabe / Sin Información": ["Sin Información / No Sabe"]
        }
    },
    "Sector Territorial 6": {
        uvs: ["18-A", "18-B", "18-C", "No Sabe / Sin Información"],
        juntas: {
            "18-A": ["Villa Italia Venecia"],
            "18-B": ["Sin Información / No Sabe"],
            "18-C": ["Sin Información / No Sabe"],
            "No Sabe / Sin Información": ["Sin Información / No Sabe"]
        }
    },
    "No Sabe / Sin Información": {
        uvs: ["No Sabe / Sin Información"],
        juntas: {
            "No Sabe / Sin Información": ["Sin Información / No Sabe"]
        }
    }
};