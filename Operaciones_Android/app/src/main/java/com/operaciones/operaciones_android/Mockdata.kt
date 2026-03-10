package com.operaciones.operaciones_android

data class Vehicle(val id: Int, val nombre: String, val tipo: String, val matricula: String, val asignadoA: Int)
data class Equipment(val id: Int, val nombre: String, val tipo: String, val serial: String, val asignadoA: Int)

object MockData {
    val users = listOf(
        User(1, "Carlos",    "Mendoza Ríos",   "CET-001",  "sedam2025", UserRole.CET,    "Teniente de Navío"),
        User(2, "Alejandro", "Torres Vega",    "CET-002",  "sedam2025", UserRole.CET,    "Teniente de Fragata"),
        User(3, "Laura",     "Ramírez Cruz",   "CELL-001", "sedam2025", UserRole.CELULA, "Cabo de Mar"),
        User(4, "Miguel",    "Santos Herrera", "CELL-002", "sedam2025", UserRole.CELULA, "Marinero")
    )
    val operations = listOf(
        Operation(1,"OPERACIÓN CENTINELA","Patrullaje y vigilancia del perímetro costero norte.","Zona Costera Norte — Antón Lizardo","10/03/2026 08:00","10/03/2026 20:00","Alta","Mantener comunicación cada 30 min. Reportar embarcaciones no identificadas.",OperationStatus.EN_REALIZACION,listOf(1,3)),
        Operation(2,"OPERACIÓN ESCUDO","Inspección de instalaciones portuarias sector sur.","Puerto Industrial — Sector Sur","12/03/2026 06:00","12/03/2026 18:00","Alta","Presentarse con equipo completo. Briefing previo a las 05:30 hrs.",OperationStatus.INACTIVA,listOf(2)),
        Operation(3,"OPERACIÓN FARO","Apoyo logístico a unidades de reconocimiento en zona insular.","Zona Insular — Isla Sacrificios","15/03/2026 07:30","15/03/2026 17:00","Media","Verificar estado del equipo de comunicación antes de zarpar.",OperationStatus.INACTIVA,listOf(4)),
        Operation(4,"OPERACIÓN ALBA","Ejercicio de respuesta ante incidente marítimo.","Aguas Territoriales — Sector Este","05/03/2026 05:00","05/03/2026 14:00","Alta","Operación concluida satisfactoriamente.",OperationStatus.REALIZADA,listOf(1,2,3,4))
    )
    val vehicles = listOf(
        Vehicle(1,"Lancha Patrulla LP-07","Lancha","ARM-LP-07",1),
        Vehicle(2,"Vehículo Táctico VT-03","Patrulla","ARM-VT-03",3),
        Vehicle(3,"UAV Reconocimiento D1","UAV","ARM-UAV-01",1)
    )
    val equipment = listOf(
        Equipment(1,"Radio VHF Harris","Comunicación","SN-VHF-441",1),
        Equipment(2,"Radio VHF Harris","Comunicación","SN-VHF-442",3),
        Equipment(3,"Binoculares NV-7x50","Táctico","SN-BN-091",1),
        Equipment(4,"GPS Garmin Montana","Navegación","SN-GPS-213",3),
        Equipment(5,"Chaleco antibalas N3","Táctico","SN-CB-017",1),
        Equipment(6,"Kit primeros auxilios","Médico","SN-MED-033",3)
    )
    fun findUser(n: String, p: String) = users.find { it.numeroControl==n && it.password==p }
    fun getOperationForUser(userId: Int): Operation? {
        val a = operations.filter { userId in it.asignadoA && it.status != OperationStatus.REALIZADA }
        return a.firstOrNull { it.status == OperationStatus.EN_REALIZACION } ?: a.firstOrNull { it.status == OperationStatus.INACTIVA }
    }
    fun getPersonalForOperation(opId: Int) = operations.find { it.id==opId }?.let { op -> users.filter { it.id in op.asignadoA } } ?: emptyList()
    fun getVehiclesForOperation(opId: Int) = operations.find { it.id==opId }?.let { op -> vehicles.filter { it.asignadoA in op.asignadoA } } ?: emptyList()
    fun getEquipmentForOperation(opId: Int) = operations.find { it.id==opId }?.let { op -> equipment.filter { it.asignadoA in op.asignadoA } } ?: emptyList()
}