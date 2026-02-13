window.SANARE_DATA = {
  years: [
    // Márgenes más conservadores (más "reales"):
    // - Margen bruto: 36% → 40% (según mix/medicamentos/aseguradoras)
    // - OPEX más alto (talento clínico, coordinación, calidad, cadena de suministro, admón.)
    { year: 2026, sales: 86.8e6, grossProfit: 31.248e6, grossMargin: 0.36, daPct: 0.04, opex: 32.0e6, opProfit: -0.752e6, opMargin: -0.00866 },
    { year: 2027, sales: 340.8e6, grossProfit: 129.504e6, grossMargin: 0.38, daPct: 0.03, opex: 105.0e6, opProfit: 24.504e6, opMargin: 0.0719 },
    { year: 2028, sales: 646.5e6, grossProfit: 258.6e6, grossMargin: 0.40, daPct: 0.025, opex: 185.0e6, opProfit: 73.6e6, opMargin: 0.1138 }
  ],
  opexMix: [
    // Mix OPEX (solo 3 rubros visibles). Ajustado para que no quede dominado por marketing.
    { year: 2026, marketing: 0.25, payroll: 0.45, rent: 0.30 },
    { year: 2027, marketing: 0.35, payroll: 0.45, rent: 0.20 },
    { year: 2028, marketing: 0.40, payroll: 0.40, rent: 0.20 }
  ],
  breakEven: { base: "Agosto 2026", minus20: "Noviembre 2026" },
  sitesDefaults: {
    siteCount: 3,
    capexPerSite: 6000000,
    wcPerSite: 1500000,
    salesPerSiteM: 2500000,
    grossMargin: 0.38,
    opexPerSiteM: 1200000,
    corpOpexM: 500000,
    daPct: 0.03
  },
  checklist: {
    market: [
      "¿Cuál es el TAM/SAM/SOM por ciudad y por servicio?",
      "¿Cuántos pacientes/procedimientos por mes por sede se requieren para cumplir 2026–2028?",
      "¿Cuál es la capacidad máxima por sede (sillas, turnos, personal, horarios)?",
      "¿Qué porcentaje es pago privado vs aseguradoras vs convenios? ¿Cómo cambia el margen por mix?",
      "¿Existe estacionalidad histórica (meses altos/bajos) y el plan la contempla?"
    ],
    unit: [
      "¿Cuál es el ticket promedio neto (después de descuentos y notas de crédito)?",
      "¿Cuál es el COGS real por tratamiento/servicio (insumos, medicamento, logística, mermas)?",
      "¿Margen bruto por línea (no solo global) y su variación por volumen?",
      "¿Punto de equilibrio por sede (ventas y/o pacientes)?",
      "¿Qué pasa con el margen cuando sube el volumen (economías de escala vs saturación)?"
    ],
    mkt: [
      "¿CAC por canal? (Meta/Google/Referidos/Alianzas/Médicos)",
      "¿Conversión lead → cita → procedimiento? y tiempos promedio (rezagos/lags)",
      "¿Qué % del crecimiento proviene de marketing vs alianzas vs referidos?",
      "¿Qué pasa si marketing baja de 10% a 6–7% sin perder volumen? (pruebas controladas)",
      "¿Qué indicadores tempranos predicen ventas (leads calificados, citas, show rate)?"
    ],
    ops: [
      "¿La nómina y plantilla soporta el volumen proyectado sin bajar calidad/tiempos?",
      "¿Cuáles roles son cuello de botella (médicos, enfermería, coordinación, farmacia)?",
      "¿Tiempo y costo de contratación/reemplazo (rotación) y plan de retención?",
      "¿Protocolos de calidad clínica y seguridad del paciente + continuidad operativa?",
      "¿Riesgos operativos críticos y mitigación (proveedores, inventario, cadena de frío, etc.)"
    ],
    reg: [
      "¿Permisos/licencias por sede (vigencia, tiempos de trámite, responsables)?",
      "¿Coberturas de seguros y responsabilidad civil profesional/instalación?",
      "¿Manejo de datos de salud: consentimiento, resguardo, trazabilidad y acceso?",
      "¿Auditorías previstas y evidencia disponible (procedimientos, bitácoras, controles)?",
      "¿Dependencias regulatorias o contractuales que puedan frenar aperturas?"
    ],
    fin: [
      "¿Cuánto capital se requiere y en qué se usa (capex, inventario, capital de trabajo)?",
      "¿Qué parte del gasto es fijo vs variable realmente? (por sede y corporativo)",
      "¿Valuación pre/post, cap table, derechos del inversionista (preferencias, anti-dilución)?",
      "¿Plan de salida: dividendos, recompra, venta estratégica; horizonte y gatillos?",
      "¿3 escenarios (conservador/base/agresivo) con supuestos explícitos y métricas de control?"
    ]
  }
};