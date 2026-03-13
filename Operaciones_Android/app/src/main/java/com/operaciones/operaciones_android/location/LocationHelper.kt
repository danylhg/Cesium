package com.operaciones.operaciones_android.location

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationListener
import android.location.LocationManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class LocationHelper(
    private val activity: Activity,
    private val onLocationUpdate: (latitude: Double, longitude: Double) -> Unit
) {

    companion object {
        const val LOCATION_PERM = 101
    }

    private var locationManager: LocationManager? = null
    private var locationListener: LocationListener? = null

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
            startLocationUpdates()
        } else {
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
            startLocationUpdates()
        }
    }

    @SuppressLint("MissingPermission")
    private fun startLocationUpdates() {
        locationManager = activity.getSystemService(Context.LOCATION_SERVICE) as LocationManager

        locationListener = LocationListener { loc ->
            onLocationUpdate(loc.latitude, loc.longitude)
        }

        try {
            locationManager?.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                5000L,
                5f,
                locationListener!!
            )
        } catch (_: Exception) {
        }

        try {
            locationManager?.requestLocationUpdates(
                LocationManager.NETWORK_PROVIDER,
                5000L,
                5f,
                locationListener!!
            )
        } catch (_: Exception) {
        }
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
