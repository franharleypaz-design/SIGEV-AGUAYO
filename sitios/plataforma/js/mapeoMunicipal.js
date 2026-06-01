// ==============================================================================
// DICCIONARIO MAESTRO DE MATRICES MUNICIPALES VECINALES
// ==============================================================================
export const MAPEO_MUNICIPAL = {
    "Ayuda Social": {
        oficina: "DIDECO",
        subcategorias: ["Caja mercadería", "Apoyo económico", "Medicamentos", "Pago cuentas básicas", "Subsidios", "Emergencia habitacional", "Apoyo adulto mayor", "Apoyo discapacidad"]
    },
    "Alumbrado Público": {
        oficina: "Dirección de Operaciones / Alumbrado Público",
        subcategorias: ["Poste apagado", "Luz parpadeando", "Cable expuesto", "Poste dañado", "Mantención luminarias", "Sector oscuro inseguro"]
    },
    "Aseo y Basura": {
        oficina: "Dirección de Medio Ambiente y Aseo",
        subcategorias: ["Basura acumulada", "Microbasural", "Retiro escombros", "Retiro ramas", "Contenedor dañado", "Punto sucio"]
    },
    "Áreas Verdes": {
        oficina: "Departamento de Áreas Verdes",
        subcategorias: ["Poda árboles", "Árbol peligroso", "Mantención plaza", "Riego", "Pasto largo", "Juegos dañados"]
    },
    "Seguridad": {
        oficina: "Seguridad Ciudadana",
        subcategorias: ["Ruidos molestos", "Consumo drogas", "Peleas", "Vehículos abandonados", "Patrullaje", "Cámaras seguridad", "Alarmas comunitarias"]
    },
    "Mascotas y Veterinaria": {
        oficina: "Departamento de Tenencia Responsable",
        subcategorias: ["Perro abandonado", "Esterilización", "Vacunación", "Ataque animal", "Rescate animal", "Operativo veterinario"]
    },
    "Infraestructura Vial": {
        oficina: "SECPLA / Dirección de Obras",
        subcategorias: ["Baches", "Veredas rotas", "Señalética", "Semáforos", "Demarcación vial", "Accesibilidad"]
    },
    "Vivienda": {
        oficina: "Oficina de Vivienda",
        subcategorias: ["Subsidio habitacional", "Mejoramiento vivienda", "Hacinamiento", "Emergencia habitacional", "Comité vivienda"]
    },
    "Trámites Municipales": {
        oficina: "OIRS / Atención Ciudadana",
        subcategorias: ["Patentes", "Permisos", "Certificados", "Orientación municipal", "Derivaciones"]
    },
    "Adulto Mayor": {
        oficina: "Oficina Adulto Mayor",
        subcategorias: ["Ayuda social", "Talleres", "Visitas", "Apoyo salud", "Beneficios"]
    },
    "Discapacidad": {
        oficina: "Oficina de Inclusión",
        subcategorias: ["Ayudas técnicas", "Credencial discapacidad", "Inclusión laboral", "Accesibilidad"]
    },
    "Educación": {
        oficina: "DAEM / Educación Municipal",
        subcategorias: ["Becas", "Transporte escolar", "Problemas colegio", "Matrículas", "Apoyo estudiantes"]
    },
    "Salud": {
        oficina: "Corporación de Salud / CESFAM",
        subcategorias: ["Horas médicas", "Medicamentos", "Reclamos salud", "Derivación", "Salud mental"]
    },
    "Niñez y Familia": {
        oficina: "Oficina de la Niñez",
        subcategorias: ["Vulneración derechos", "Apoyo familiar", "Mediación", "Actividades niños"]
    },
    "Operativos Territoriales": {
        oficina: "Equipo Territorial Concejal",
        subcategorias: ["Operativo limpieza", "Operativo veterinario", "Plaza activa", "Gobierno en terreno", "Feria servicios"]
    },
    "OIRS / Participación Ciudadana": {
        oficina: "OIRS Municipal",
        subcategorias: ["Reclamo", "Sugerencia", "Felicitación", "Consulta", "Denuncia"]
    }
};

// ==============================================================================
// DICCIONARIO MAESTRO DE INTELIGENCIA TERRITORIAL (LA CISTERNA)
// ==============================================================================
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