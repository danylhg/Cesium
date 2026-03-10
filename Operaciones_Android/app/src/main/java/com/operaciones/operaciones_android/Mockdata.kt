package com.operaciones.operaciones_android

// MockData — solo se usa como FALLBACK mientras los endpoints del servidor
// no estén listos. Cuando /ops/personal/:id exista en server.js, esto queda inactivo.

data class Vehicle(val id: Int, val nombre: String, val tipo: String, val matricula: String, val asignadoA: Int)
data class Equipment(val id: Int, val nombre: String, val tipo: String, val serial: String, val asignadoA: Int)

object MockData {

    val users = listOf(
        User(1, "Luis",  "Hernández", "lhernandez", UserRole.CET,  "Mayor",             "personal"),
        User(2, "María", "López",     "mlopez",     UserRole.CET,  "Capitán",           "personal"),
        User(3, "José",  "Martínez",  "jmartinez",  UserRole.CELL, "Sargento Primero",  "personal"),
        User(4, "Pedro", "Sánchez",   "psanchez",   UserRole.CELL, "Sargento Segundo",  "personal")
    )

    val operations = listOf(
        Operation(1, "OP-001", "OPERACIÓN CENTINELA",
            "Patrullaje y vigilancia del perímetro costero norte.",
            "ALTA", OperationStatus.ACTIVA,
            "10/03/2026 08:00", "10/03/2026 20:00"),
        Operation(2, "OP-002", "OPERACIÓN ESCUDO",
            "Inspección de instalaciones portuarias sector sur.",
            "ALTA", OperationStatus.PLANIFICADA,
            "12/03/2026 06:00", "12/03/2026 18:00")
    )

    val vehicles = listOf(
        Vehicle(1, "Lancha Patrulla LP-07",  "Lancha",   "ARM-LP-07",  1),
        Vehicle(2, "Vehículo Táctico VT-03", "Patrulla", "ARM-VT-03",  3),
        Vehicle(3, "UAV Reconocimiento D1",  "UAV",      "ARM-UAV-01", 1)
    )

    val equipment = listOf(
        Equipment(1, "Radio VHF Harris",      "Comunicación", "SN-VHF-441", 1),
        Equipment(2, "Radio VHF Harris",      "Comunicación", "SN-VHF-442", 3),
        Equipment(3, "Binoculares NV-7x50",   "Táctico",      "SN-BN-091",  1),
        Equipment(4, "GPS Garmin Montana",    "Navegación",   "SN-GPS-213", 3)
    )

    fun getOperationForUser(userId: Int): Operation? =
        operations.firstOrNull { it.status == OperationStatus.ACTIVA }
            ?: operations.firstOrNull { it.status == OperationStatus.PLANIFICADA }

    fun getPersonalForOperation(opId: Int) = users
    fun getVehiclesForOperation(opId: Int) = vehicles
    fun getEquipmentForOperation(opId: Int) = equipment
}