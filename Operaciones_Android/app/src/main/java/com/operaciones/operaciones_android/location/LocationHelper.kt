package com.operaciones.operaciones_android.location

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class LocationHelper(
    private val activity: Activity,
    private val onLocationUpdate: (latitude: Double, longitude: Double) -> Unit,
    private val onEmitLocation: ((
        latitude: Double,
        longitude: Double,
        speedKmh: Double?,
        headingDegrees: Double?,
        accuracyMeters: Float?
    ) -> Unit)? = null
) {

    companion object {
        const val LOCATION_PERM = 101
    }

    private var locationManager: LocationManager? = null
    private var locationListener: LocationListener? = null

    @SuppressLint("MissingPermission")
    private fun emitLastKnownLocation() {
        val manager = locationManager ?: return
        val providers = listOf(
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER,
            LocationManager.PASSIVE_PROVIDER
        )

        val bestLocation = providers
            .mapNotNull { provider ->
                try {
                    manager.getLastKnownLocation(provider)
                } catch (_: Exception) {
                    null
                }
            }
            .maxByOrNull { it.time }

        bestLocation?.let { loc ->
            Log.d("TrackingPersonal", "lastKnown lat=${loc.latitude} lon=${loc.longitude}")
            onLocationUpdate(loc.latitude, loc.longitude)
            emitLocation(loc)
        } ?: Log.w("TrackingPersonal", "Sin lastKnownLocation disponible")
    }

    fun requestLocationPermissionOrStart() {
        val fineOk = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val coarseOk = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        if (fineOk || coarseOk) {
            Log.d("TrackingPersonal", "Permiso de ubicacion OK. Iniciando updates")
            startLocationUpdates()
        } else {
            Log.w("TrackingPersonal", "Pidiendo permiso de ubicacion")
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ),
                LOCATION_PERM
            )
        }
    }

    fun handlePermissionsResult(
        requestCode: Int,
        grantResults: IntArray
    ) {
        if (requestCode == LOCATION_PERM &&
            grantResults.isNotEmpty() &&
            grantResults.any { it == PackageManager.PERMISSION_GRANTED }
        ) {
            Log.d("TrackingPersonal", "Permiso concedido. Iniciando updates")
            startLocationUpdates()
        } else if (requestCode == LOCATION_PERM) {
            Log.w("TrackingPersonal", "Permiso de ubicacion denegado")
        }
    }

    @SuppressLint("MissingPermission")
    private fun startLocationUpdates() {
        locationManager = activity.getSystemService(Context.LOCATION_SERVICE) as LocationManager

        locationListener = LocationListener { loc ->
            Log.d("TrackingPersonal", "location update lat=${loc.latitude} lon=${loc.longitude}")
            onLocationUpdate(loc.latitude, loc.longitude)
            emitLocation(loc)
        }

        try {
            locationManager?.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                5000L,
                0f,
                locationListener!!
            )
        } catch (_: Exception) {
        }

        try {
            locationManager?.requestLocationUpdates(
                LocationManager.NETWORK_PROVIDER,
                5000L,
                0f,
                locationListener!!
            )
        } catch (_: Exception) {
        }

        emitLastKnownLocation()
    }

    private fun emitLocation(loc: Location) {
        val speedKmh = if (loc.hasSpeed()) loc.speed.toDouble() * 3.6 else null
        val headingDegrees = if (loc.hasBearing()) loc.bearing.toDouble() else null
        val accuracyMeters = if (loc.hasAccuracy()) loc.accuracy else null
        onEmitLocation?.invoke(
            loc.latitude,
            loc.longitude,
            speedKmh,
            headingDegrees,
            accuracyMeters
        )
    }

    fun stopLocationUpdates() {
        locationListener?.let {
            try {
                locationManager?.removeUpdates(it)
            } catch (_: Exception) {
            }
        }
        locationListener = null
    }
}
